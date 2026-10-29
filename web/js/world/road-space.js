// Huella horizontal de las calzadas: consultas y recorte sin modificar sus ejes ni el grafo.
// Las piezas son rectángulos de tramo; una referencia de altura separa pasos inferiores.
const CELL = 32;
const key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
const area = (p) =>
  p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length];
    return s + a[0] * b[2] - b[0] * a[2];
  }, 0);
const hasSurface = (p) => {
  const a = p[0];
  for (let i = 1; i < p.length - 1; i++) {
    const b = p[i].map((v, k) => v - a[k]),
      c = p[i + 1].map((v, k) => v - a[k]);
    if (
      Math.hypot(b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]) >
      1e-7
    )
      return true;
  }
  return false;
};

// Caras pequeñas entre ramales: recorrer semiaristas evita confundir un hueco de
// pavimentación con el interior completo de una glorieta. El llamador descarta usos reales.
export function dividerFaces(roads, bounds = []) {
  const nodes = new Map(),
    edges = [],
    excluded = ['pedestrian', 'footway', 'path', 'cycleway'];
  const node = (p) => {
    const id = p.join(',');
    if (!nodes.has(id)) nodes.set(id, { p, edges: [] });
    return nodes.get(id);
  };
  for (const road of roads) {
    if (excluded.includes(road.type) || road.bridge || road.tunnel) continue;
    for (let i = 1; i < road.p.length; i++) {
      const a = node(road.p[i - 1]),
        b = node(road.p[i]);
      if (a === b) continue;
      const forward = { a, b, road },
        reverse = { a: b, b: a, road };
      forward.reverse = reverse;
      reverse.reverse = forward;
      a.edges.push(forward);
      b.edges.push(reverse);
      edges.push(forward, reverse);
    }
  }
  // Cierre de dos ramales cortados por el mismo borde del mapa. Solo cierra la
  // huella de pavimento: no añade una calle ni una conexión al grafo de tráfico.
  const ends = [...nodes.values()].filter((n) => n.edges.length === 1 && n.edges[0].road.oneway),
    capped = new Set(),
    onEdge = (a, b) =>
      bounds.some(
        ([x0, x1, z0, z1]) =>
          (((Math.abs(a[0] - x0) < 0.03 && Math.abs(b[0] - x0) < 0.03) ||
            (Math.abs(a[0] - x1) < 0.03 && Math.abs(b[0] - x1) < 0.03)) &&
            Math.min(a[1], b[1]) >= z0 - 0.03 &&
            Math.max(a[1], b[1]) <= z1 + 0.03) ||
          (((Math.abs(a[1] - z0) < 0.03 && Math.abs(b[1] - z0) < 0.03) ||
            (Math.abs(a[1] - z1) < 0.03 && Math.abs(b[1] - z1) < 0.03)) &&
            Math.min(a[0], b[0]) >= x0 - 0.03 &&
            Math.max(a[0], b[0]) <= x1 + 0.03),
      );
  for (const a of ends) {
    if (capped.has(a)) continue;
    const b = ends.find(
      (b) =>
        b !== a &&
        !capped.has(b) &&
        a.edges[0].road.id !== b.edges[0].road.id &&
        (a.p.join(',') === a.edges[0].road.p[0].join(',')) !==
          (b.p.join(',') === b.edges[0].road.p[0].join(',')) &&
        Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < 24 &&
        onEdge(a.p, b.p),
    );
    if (!b) continue;
    const road = { id: 'cap:' + a.p.join(',') + ':' + b.p.join(','), virtual: true },
      forward = { a, b, road },
      reverse = { a: b, b: a, road };
    forward.reverse = reverse;
    reverse.reverse = forward;
    a.edges.push(forward);
    b.edges.push(reverse);
    edges.push(forward, reverse);
    capped.add(a);
    capped.add(b);
  }
  for (const n of nodes.values())
    n.edges.sort(
      (a, b) =>
        Math.atan2(a.b.p[1] - n.p[1], a.b.p[0] - n.p[0]) -
        Math.atan2(b.b.p[1] - n.p[1], b.b.p[0] - n.p[0]),
    );
  const seen = new Set(),
    result = [];
  for (const first of edges) {
    if (seen.has(first)) continue;
    const ring = [],
      boundary = [];
    let edge = first;
    while (!seen.has(edge)) {
      seen.add(edge);
      ring.push(edge.a.p);
      boundary.push(edge.road);
      const next = edge.b.edges,
        i = next.indexOf(edge.reverse);
      edge = next[(i + next.length - 1) % next.length];
    }
    const signed = area(ring.map(([x, z]) => [x, 0, z])) / 2,
      ids = new Set(boundary.map((r) => r.id));
    if (
      edge !== first ||
      signed < 12 ||
      signed > 1200 ||
      ids.size < 3 ||
      boundary.every((r) => r.virtual || r.junction === 'roundabout') ||
      new Set(boundary.filter((r) => r.oneway).map((r) => r.id)).size < 2 ||
      new Set(ring.map((p) => p.join(','))).size !== ring.length
    )
      continue;
    result.push({ polygon: ring, roads: [...ids], area: signed });
  }
  return result;
}

// Rayas en coordenadas de mundo: continuas entre triángulos y sin textura de baldosa.
export function hatchPavement(position, spacing = 1.5, width = 0.45) {
  const result = [],
    project = (p) => (p[0] + p[2]) / Math.SQRT2;
  for (let i = 0; i < position.length; i += 9) {
    const triangle = [0, 1, 2].map((k) => position.slice(i + k * 3, i + k * 3 + 3)),
      values = triangle.map(project);
    for (
      let band = Math.floor(Math.min(...values) / spacing);
      band <= Math.floor(Math.max(...values) / spacing);
      band++
    ) {
      let polygon = split(triangle, (p) => project(p) - band * spacing).inside;
      polygon = split(polygon, (p) => band * spacing + width - project(p)).inside;
      for (let k = 1; k < polygon.length - 1; k++)
        for (const p of [polygon[0], polygon[k], polygon[k + 1]]) result.push(...p);
    }
  }
  return result;
}

function split(polygon, distance) {
  const inside = [],
    outside = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      da = distance(a),
      db = distance(b);
    (da >= 0 ? inside : outside).push(a);
    if (da < 0 !== db < 0) {
      const t = da / (da - db),
        q = a.map((v, k) => v + (b[k] - v) * t);
      inside.push(q);
      outside.push(q);
    }
  }
  return { inside, outside };
}

export function createRoadSpace(roads, nonDrivableTypes, heightAt = null, joins = false) {
  const grid = new Map();
  for (const road of roads) {
    if (nonDrivableTypes.includes(road.type)) continue;
    for (let i = 1; i < road.p.length; i++) {
      const a = road.p[i - 1],
        b = road.p[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz);
      if (length < 0.1) continue;
      const s = { a, b, dx: dx / length, dz: dz / length, length, half: road.w / 2, road };
      for (
        let x = Math.floor((Math.min(a[0], b[0]) - s.half - 1) / CELL);
        x <= Math.floor((Math.max(a[0], b[0]) + s.half + 1) / CELL);
        x++
      )
        for (
          let z = Math.floor((Math.min(a[1], b[1]) - s.half - 1) / CELL);
          z <= Math.floor((Math.max(a[1], b[1]) + s.half + 1) / CELL);
          z++
        ) {
          const k = x + ',' + z;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(s);
        }
    }
    if (joins)
      for (let i = 1; i < road.p.length - 1; i++) {
        const a = road.p[i - 1],
          b = road.p[i],
          c = road.p[i + 1],
          px = b[0] - a[0],
          pz = b[1] - a[1],
          nx = c[0] - b[0],
          nz = c[1] - b[1],
          pl = Math.hypot(px, pz),
          nl = Math.hypot(nx, nz),
          half = road.w / 2;
        if (pl < 0.1 || nl < 0.1) continue;
        for (const side of [1, -1]) {
          const q = [b[0] - (pz / pl) * half * side, b[1] + (px / pl) * half * side],
            r = [b[0] - (nz / nl) * half * side, b[1] + (nx / nl) * half * side];
          if (((r[0] - q[0]) * px + (r[1] - q[1]) * pz) / pl < 0.01) continue;
          const polygon = [b, q, r],
            sign = Math.sign((q[0] - b[0]) * (r[1] - b[1]) - (q[1] - b[1]) * (r[0] - b[0])),
            planes = polygon.map((p, k) => {
              const next = polygon[(k + 1) % 3];
              return (v) =>
                sign * ((next[0] - p[0]) * (v[2] - p[1]) - (next[1] - p[1]) * (v[0] - p[0]));
            }),
            s = { planes, road };
          for (let x = Math.floor((b[0] - half) / CELL); x <= Math.floor((b[0] + half) / CELL); x++)
            for (
              let z = Math.floor((b[1] - half) / CELL);
              z <= Math.floor((b[1] + half) / CELL);
              z++
            ) {
              const k = x + ',' + z;
              if (!grid.has(k)) grid.set(k, []);
              grid.get(k).push(s);
            }
        }
      }
  }
  const sameLevel = (s, x, z, reference) =>
    reference === null || !heightAt || Math.abs(heightAt(x, z, s.road.id) - reference) < 1.5;
  function covers(x, z, margin = 0, reference = null) {
    for (const s of grid.get(key(x, z)) ?? []) {
      if (s.planes) {
        if (s.planes.every((p) => p([x, 0, z]) >= -margin) && sameLevel(s, x, z, reference))
          return true;
        continue;
      }
      const along = (x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz,
        across = (z - s.a[1]) * s.dx - (x - s.a[0]) * s.dz;
      if (
        along >= -margin &&
        along <= s.length + margin &&
        Math.abs(across) < s.half + margin &&
        sameLevel(s, x, z, reference)
      )
        return true;
    }
    return false;
  }
  function subtract(polygon, reference = null) {
    const xs = polygon.map((p) => p[0]),
      zs = polygon.map((p) => p[2]),
      candidates = new Set(),
      cx = xs.reduce((a, b) => a + b, 0) / xs.length,
      cz = zs.reduce((a, b) => a + b, 0) / zs.length;
    for (let x = Math.floor(Math.min(...xs) / CELL); x <= Math.floor(Math.max(...xs) / CELL); x++)
      for (let z = Math.floor(Math.min(...zs) / CELL); z <= Math.floor(Math.max(...zs) / CELL); z++)
        for (const s of grid.get(x + ',' + z) ?? [])
          if (sameLevel(s, cx, cz, reference)) candidates.add(s);
    let pieces = [polygon];
    for (const s of candidates) {
      const planes = s.planes ?? [
        (p) => (p[0] - s.a[0]) * s.dx + (p[2] - s.a[1]) * s.dz,
        (p) => s.length - (p[0] - s.a[0]) * s.dx - (p[2] - s.a[1]) * s.dz,
        (p) => s.half + (p[2] - s.a[1]) * s.dx - (p[0] - s.a[0]) * s.dz,
        (p) => s.half - (p[2] - s.a[1]) * s.dx + (p[0] - s.a[0]) * s.dz,
      ];
      const next = [];
      for (const piece of pieces) {
        let remaining = piece;
        for (const plane of planes) {
          if (remaining.length < 3) break;
          const result = split(remaining, plane);
          if (result.outside.length >= 3 && hasSurface(result.outside)) next.push(result.outside);
          remaining = result.inside;
        }
      }
      pieces = next;
      if (!pieces.length) break;
    }
    return pieces;
  }
  return { covers, subtract };
}

// Conserva todos los atributos de cada vértice (incluidas UV) al recortar.
export function carvePavement(positions, uv, space, heightAt) {
  const p = [],
    texture = [];
  for (let i = 0; i < positions.length; i += 9) {
    const triangle = [0, 1, 2].map((k) => [
        ...positions.slice(i + k * 3, i + k * 3 + 3),
        ...uv.slice((i / 3 + k) * 2, (i / 3 + k) * 2 + 2),
      ]),
      x = (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3,
      z = (triangle[0][2] + triangle[1][2] + triangle[2][2]) / 3;
    for (const polygon of space.subtract(triangle, heightAt(x, z)))
      for (let k = 1; k < polygon.length - 1; k++)
        for (const v of [polygon[0], polygon[k], polygon[k + 1]]) {
          p.push(...v.slice(0, 3));
          texture.push(...v.slice(3, 5));
        }
  }
  return { position: p, uv: texture };
}

// OSM suele dividir una glorieta en varias vías. Unir solo cadenas cerradas y conservar
// el hueco interior, desplazado medio ancho de calzada; no inventar círculos ni radios.
export function roundaboutIslands(roads) {
  const remaining = new Set(roads.filter((r) => r.junction === 'roundabout')),
    result = [];
  const equal = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.03;
  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const ring = first.p.map((p) => [...p]);
    let half = first.w / 2;
    while (!equal(ring[0], ring.at(-1))) {
      const next = [...remaining].find(
        (r) => equal(r.p[0], ring.at(-1)) || equal(r.p.at(-1), ring.at(-1)),
      );
      if (!next) break;
      remaining.delete(next);
      half = Math.max(half, next.w / 2);
      const points = equal(next.p[0], ring.at(-1)) ? next.p : [...next.p].reverse();
      ring.push(...points.slice(1));
    }
    if (ring.length < 4 || !equal(ring[0], ring.at(-1))) continue;
    ring.pop();
    const signed = ring.reduce((s, p, i) => {
        const q = ring[(i + 1) % ring.length];
        return s + p[0] * q[1] - q[0] * p[1];
      }, 0),
      sign = Math.sign(signed),
      polygon = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length],
        b = ring[i],
        c = ring[(i + 1) % ring.length],
        la = Math.hypot(b[0] - a[0], b[1] - a[1]),
        lb = Math.hypot(c[0] - b[0], c[1] - b[1]);
      if (la < 0.01 || lb < 0.01) continue;
      const n0 = [(-(b[1] - a[1]) / la) * sign, ((b[0] - a[0]) / la) * sign],
        n1 = [(-(c[1] - b[1]) / lb) * sign, ((c[0] - b[0]) / lb) * sign],
        nx = n0[0] + n1[0],
        nz = n0[1] + n1[1],
        den = nx * n1[0] + nz * n1[1];
      if (den < 0.2) {
        polygon.length = 0;
        break;
      }
      polygon.push([b[0] + (nx * (half + 0.12)) / den, b[1] + (nz * (half + 0.12)) / den]);
    }
    // En anillos muy pequeños, el desplazamiento de un vértice cae sobre un tramo vecino.
    const clear = (p) =>
      ring.every((a, i) => {
        const b = ring[(i + 1) % ring.length],
          dx = b[0] - a[0],
          dz = b[1] - a[1],
          t = Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)),
          );
        return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) > half;
      });
    polygon.splice(0, polygon.length, ...polygon.filter(clear));
    if (polygon.length < 3) continue;
    const surface = Math.abs(area(polygon.map(([x, z]) => [x, 0, z]))) / 2;
    if (surface > 3 && surface < Math.abs(signed) / 2)
      result.push({ polygon, ring, area: surface });
  }
  return result;
}
