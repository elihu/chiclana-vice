import * as THREE from '../../vendor/three.webgpu.min.js';
import { flatGeometry, mat } from '../engine/materials.js';
import { createGrid } from '../core/grid.js';
import { gfx, world } from '../core/state.js';
import { surfaceHeightAt } from '../engine/terrain-sampling.js';
import { inBuilding, nearestRoad } from './spatial.js';

// Vías del tranvía (capa web/tram.json, OSM): franja con dos raíles, postes y catenaria.
// Todo es visual: no cambia cotas ni transitabilidad. Parámetros en web/city-design.json
// (sección `tram`); ver docs/DESARROLLO.md («Tranvía»).
const CELL = 16;

// Disposición de cada vía dibujada (se calcula una vez; la capa es estática y pequeña):
// puntos remuestreados y, por punto, su tipo de franja:
//   lane: eje dentro de una calzada (carril exclusivo del tranvía, empotrado en ella);
//   paved: puentes, cruces a nivel y mediana pegada a las calzadas (empotrada);
//   grass: franja de césped separada de la calzada.
// Los puntos de `lane` se desplazan hacia el eje de la calle lo justo para que el carril
// quepa en la calzada y no pise la acera de ese lado.
let memo = null;
function layout() {
  const layer = world.tram;
  if (!layer) return null;
  if (memo?.layer === layer) return memo;
  const cfg = world.cityDesign.tram,
    half = cfg.stripWidth / 2,
    level = layer.crossings.filter((c) => c.kind === 'level'),
    tracks = [],
    grid = createGrid(CELL);
  for (const track of layer.tracks) {
    const original = resample(track.p, cfg.sampleStep),
      kinds = [],
      shifts = [];
    for (const [x, z] of original) {
      let kind = 'grass',
        shift = 0,
        direction = [0, 0];
      const near = track.bridge ? null : nearestRoad(x, z, true);
      if (
        track.bridge ||
        level.some((c) => Math.hypot(c.x - x, c.z - z) < half + cfg.pavedDistance + 2)
      )
        kind = 'paved';
      else if (near && near.d <= near.s.width / 2) {
        kind = 'lane';
        const room = near.s.width / 2 - cfg.laneMargin;
        shift = Math.min(near.d, Math.max(0, near.d + half - room));
        direction = near.d > 1e-6 ? [(near.x - x) / near.d, (near.z - z) / near.d] : [0, 0];
      } else if (near && near.d - near.s.width / 2 <= half + cfg.pavedDistance) kind = 'paved';
      kinds.push(kind);
      shifts.push([direction[0] * shift, direction[1] * shift]);
    }
    // Un tramo de césped corto entre dos tramos empotrados (rotondas, cruces) no se dibuja:
    // se pavimenta para no dejar parches.
    for (let i = 0; i < kinds.length;) {
      if (kinds[i] !== 'grass') {
        i++;
        continue;
      }
      let end = i;
      while (end < kinds.length && kinds[end] === 'grass') end++;
      if (i > 0 && end < kinds.length && (end - i) * cfg.sampleStep < cfg.minimumGrassRun)
        kinds.fill('paved', i, end);
      i = end;
    }
    // Suaviza el desplazamiento entre muestras vecinas para no quebrar la vía.
    const points = original.map((p, i) => {
      let dx = 0,
        dz = 0,
        n = 0;
      for (let k = Math.max(0, i - 1); k <= Math.min(original.length - 1, i + 1); k++) {
        dx += shifts[k][0];
        dz += shifts[k][1];
        n++;
      }
      return kinds[i] === 'lane' ? [p[0] + dx / n, p[1] + dz / n] : p;
    });
    tracks.push({ track, points, kinds });
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        segment = {
          a,
          b,
          length: Math.hypot(b[0] - a[0], b[1] - a[1]),
          lane: kinds[i - 1] === 'lane' && kinds[i] === 'lane',
        },
        n = Math.max(1, Math.ceil(segment.length / (CELL / 2)));
      for (let k = 0; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n,
          z = a[1] + ((b[1] - a[1]) * k) / n;
        grid.insert(segment, x, x, z, z);
      }
    }
  }
  memo = { layer, tracks, grid };
  return memo;
}

// Distancia del punto al eje de vía dibujado más cercano (Infinity sin tranvía). Con
// `skipLane` se ignoran los tramos empotrados en una calzada (el tranvía ocupa su carril y la
// acera de ese lado se mantiene).
export function tramDistance(x, z, skipLane = false) {
  const m = layout();
  if (!m) return Infinity;
  let best = Infinity;
  const cx = Math.floor(x / CELL),
    cz = Math.floor(z / CELL);
  for (let i = cx - 1; i <= cx + 1; i++)
    for (let j = cz - 1; j <= cz + 1; j++)
      for (const s of m.grid.queryPoint(i * CELL, j * CELL)) {
        if (skipLane && s.lane) continue;
        const ex = s.b[0] - s.a[0],
          ez = s.b[1] - s.a[1],
          u = Math.max(
            0,
            Math.min(1, ((x - s.a[0]) * ex + (z - s.a[1]) * ez) / (s.length * s.length || 1)),
          );
        best = Math.min(best, Math.hypot(x - s.a[0] - ex * u, z - s.a[1] - ez * u));
      }
  return best;
}

// ¿Queda el punto sobre la franja del tranvía (más `margin`) o en un cruce a nivel? Los tramos
// empotrados en una calzada no cuentan: la acera de ese lado se mantiene.
export function tramBlocks(x, z, margin = 0) {
  const m = layout();
  if (!m) return false;
  const cfg = world.cityDesign.tram;
  if (tramDistance(x, z, true) < cfg.stripWidth / 2 + margin) return true;
  return m.layer.crossings.some(
    (c) => Math.hypot(c.x - x, c.z - z) < cfg.crossingClearance + margin,
  );
}

// Puntos de la polilínea con una separación máxima `step`, conservando los vértices.
function resample(points, step) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++)
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

// Conserva el primer y el último punto y los que distan al menos `step` del anterior.
function thin(points, step) {
  const out = [points[0]];
  for (const p of points.slice(1, -1))
    if (Math.hypot(p[0] - out.at(-1)[0], p[1] - out.at(-1)[1]) >= step) out.push(p);
  out.push(points.at(-1));
  return out;
}

// Normal horizontal (hacia la derecha del sentido de la vía) en cada punto.
function normals(points) {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  });
}

const quad = (out, a, b, c, d) => {
  for (const v of [a, b, c, a, c, d]) out.push(...v);
};

// Viga de sección rectangular a lo largo de `points`: cara superior y dos laterales.
// `base[i]` y `top[i]` son las cotas inferior y superior en cada punto.
function beam(out, points, normal, half, base, top) {
  const at = (i, side, y) => [
    points[i][0] + normal[i][0] * half * side,
    y,
    points[i][1] + normal[i][1] * half * side,
  ];
  for (let i = 1; i < points.length; i++) {
    const j = i - 1;
    quad(out, at(j, -1, top[j]), at(i, -1, top[i]), at(i, 1, top[i]), at(j, 1, top[j]));
    quad(out, at(j, -1, base[j]), at(i, -1, base[i]), at(i, -1, top[i]), at(j, -1, top[j]));
    quad(out, at(j, 1, top[j]), at(i, 1, top[i]), at(i, 1, base[i]), at(j, 1, base[j]));
  }
}

function addMesh(name, positions, material, receive = true) {
  if (!positions.length) return 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.receiveShadow = receive;
  gfx.scene.add(mesh);
  return positions.length / 9;
}

// Eje de vía más cercano a un punto: tangente (sentido de la vía) y punto del eje.
function nearestAxis(x, z) {
  let best = null;
  for (const track of world.tram.tracks)
    for (let i = 1; i < track.p.length; i++) {
      const a = track.p[i - 1],
        b = track.p[i],
        ex = b[0] - a[0],
        ez = b[1] - a[1],
        length = Math.hypot(ex, ez) || 1,
        u = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (length * length))),
        d = Math.hypot(x - a[0] - ex * u, z - a[1] - ez * u);
      if (!best || d < best.d) best = { d, t: [ex / length, ez / length] };
    }
  return best;
}

// Caras con color por vértice (una sola malla) y cristal aparte (transparente).
function solid() {
  return { position: [], color: [] };
}
function paint(group, hex, vertices) {
  const c = new THREE.Color(hex);
  for (const v of vertices) {
    group.position.push(...v);
    group.color.push(c.r, c.g, c.b);
  }
}
const faceOf = (a, b, c, d) => [a, b, c, a, c, d];

// Andenes, marquesinas y postes con nombre de las paradas (solo visual).
function buildStops(layer, cfg, stats) {
  const stop = cfg.stop,
    shelter = stop.shelter,
    sign = stop.sign,
    body = solid(),
    glass = [],
    plates = { position: [], uv: [], index: [] },
    names = [];
  for (const entry of layer.stops) {
    const platform = layer.platforms.find((p) => p.id === entry.platform);
    if (!platform) continue;
    const axis = nearestAxis(entry.x, entry.z),
      t = axis.t,
      n = [-t[1], t[0]],
      polygon = platform.p,
      ground = (x, z) => surfaceHeightAt(x, z),
      top = (x, z) => ground(x, z) + stop.platformHeight,
      // Coordenadas en el marco de la vía: u a lo largo, v lateral (hacia n) desde la parada.
      frame = (p) => [
        (p[0] - entry.x) * t[0] + (p[1] - entry.z) * t[1],
        (p[0] - entry.x) * n[0] + (p[1] - entry.z) * n[1],
      ],
      local = polygon.map(frame),
      lateral = local.reduce((sum, p) => sum + p[1], 0) / local.length,
      away = Math.sign(lateral) || 1,
      outer = away > 0 ? Math.max(...local.map((p) => p[1])) : Math.min(...local.map((p) => p[1])),
      at = (u, v, y) => [entry.x + t[0] * u + n[0] * v, y, entry.z + t[1] * u + n[1] * v];

    // Cara superior triangulada y canto vertical bajo cada lado hasta la cota del suelo.
    const geo = flatGeometry(polygon),
      index = geo.index,
      pos = geo.getAttribute('position');
    for (let i = 0; i < index.count; i += 3)
      paint(
        body,
        stop.platformColor,
        [0, 1, 2].map((k) => {
          const x = pos.getX(index.getX(i + k)),
            z = pos.getZ(index.getX(i + k));
          return [x, top(x, z), z];
        }),
      );
    geo.dispose();
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      paint(
        body,
        stop.edgeColor,
        faceOf(
          [a[0], top(...a), a[1]],
          [b[0], top(...b), b[1]],
          [b[0], ground(...b) - 0.1, b[1]],
          [a[0], ground(...a) - 0.1, a[1]],
        ),
      );
    }
    // Banda táctil: el lado largo del andén que queda más cerca del eje de la vía.
    let edge = null;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]),
        d = Math.min(
          ...[0.25, 0.5, 0.75].map((f) =>
            tramDistance(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f),
          ),
        );
      if (length > 5 && (!edge || d < edge.d)) edge = { a, b, d };
    }
    if (edge) {
      const length = Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]),
        dx = (edge.b[0] - edge.a[0]) / length,
        dz = (edge.b[1] - edge.a[1]) / length,
        mid = [(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2],
        perp = [-dz, dx],
        toward = (entry.x - mid[0]) * perp[0] + (entry.z - mid[1]) * perp[1],
        into = toward > 0 ? -1 : 1,
        off = [perp[0] * stop.tactileWidth * into, perp[1] * stop.tactileWidth * into],
        lift = 0.004;
      const p = [
        edge.a,
        edge.b,
        [edge.b[0] + off[0], edge.b[1] + off[1]],
        [edge.a[0] + off[0], edge.a[1] + off[1]],
      ].map((q) => [q[0], top(q[0], q[1]) + lift, q[1]]);
      paint(body, stop.tactileColor, faceOf(...p));
    }

    // Marquesina: cristal trasero y laterales, cuatro postes y tejado, junto al borde exterior.
    const v1 = outer - away * shelter.backMargin,
      v0 = v1 - away * shelter.depth,
      u0 = -shelter.length / 2,
      u1 = shelter.length / 2,
      yb = (u, v) => top(...[at(u, v, 0)[0], at(u, v, 0)[2]]),
      post = (u, v) => {
        const w = shelter.postWidth / 2,
          y0 = yb(u, v),
          c = [
            at(u - w, v - w, 0),
            at(u + w, v - w, 0),
            at(u + w, v + w, 0),
            at(u - w, v + w, 0),
          ].map((q) => [q[0], q[2]]);
        for (let k = 0; k < 4; k++) {
          const a = c[k],
            b = c[(k + 1) % 4];
          paint(
            body,
            shelter.frameColor,
            faceOf(
              [a[0], y0, a[1]],
              [b[0], y0, b[1]],
              [b[0], y0 + shelter.height, b[1]],
              [a[0], y0 + shelter.height, a[1]],
            ),
          );
        }
      };
    for (const u of [u0 + 0.2, u1 - 0.2]) for (const v of [v0, v1]) post(u, v);
    const roof = (y) => [at(u0, v0, y), at(u1, v0, y), at(u1, v1, y), at(u0, v1, y)],
      y0 = yb(0, (v0 + v1) / 2),
      high = roof(y0 + shelter.height + shelter.roofThickness),
      low = roof(y0 + shelter.height);
    paint(body, shelter.frameColor, faceOf(...high));
    paint(body, shelter.frameColor, faceOf(low[3], low[2], low[1], low[0]));
    for (let k = 0; k < 4; k++)
      paint(body, shelter.frameColor, faceOf(low[k], low[(k + 1) % 4], high[(k + 1) % 4], high[k]));
    // Cristal: pared trasera y los dos laterales hasta la cota del tejado.
    const g = (ua, va, ub, vb) =>
      glass.push(
        ...faceOf(
          at(ua, va, y0 + 0.15),
          at(ub, vb, y0 + 0.15),
          at(ub, vb, y0 + shelter.height),
          at(ua, va, y0 + shelter.height),
        ).flat(),
      );
    g(u0 + 0.2, v1, u1 - 0.2, v1);
    g(u0 + 0.2, v0, u0 + 0.2, v1);
    g(u1 - 0.2, v0, u1 - 0.2, v1);

    // Poste con el nombre: placa perpendicular a la vía, visible a lo largo del andén.
    const su = sign.alongOffset,
      sv = outer - away * sign.backMargin,
      sy = yb(su, sv),
      pw = sign.poleWidth / 2,
      pc = [
        at(su - pw, sv - pw, 0),
        at(su + pw, sv - pw, 0),
        at(su + pw, sv + pw, 0),
        at(su - pw, sv + pw, 0),
      ];
    for (let k = 0; k < 4; k++) {
      const a = pc[k],
        b = pc[(k + 1) % 4];
      paint(
        body,
        sign.poleColor,
        faceOf(
          [a[0], sy, a[2]],
          [b[0], sy, b[2]],
          [b[0], sy + sign.poleHeight, b[2]],
          [a[0], sy + sign.poleHeight, a[2]],
        ),
      );
    }
    const slot = names.length,
      base = plates.position.length / 3;
    names.push(entry.name);
    for (const [u, v] of [
      [0, 1],
      [1, 1],
      [0, 0],
      [1, 0],
    ]) {
      const q = at(
        su,
        sv + (u - 0.5) * sign.plateWidth,
        sy + sign.plateBase + v * sign.plateHeight,
      );
      plates.position.push(...q);
      plates.uv.push(u, slot + v);
    }
    plates.index.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
  }
  let triangles = 0;
  if (body.position.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(body.position, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(body.color, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geo,
      mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }),
    );
    mesh.name = 'tram-stops';
    mesh.receiveShadow = mesh.castShadow = true;
    gfx.scene.add(mesh);
    triangles += body.position.length / 9;
  }
  triangles += addMesh(
    'tram-stop-glass',
    glass,
    mat(shelter.glassColor, {
      side: THREE.DoubleSide,
      transparent: true,
      opacity: shelter.glassOpacity,
      roughness: 0.2,
      depthWrite: false,
    }),
    false,
  );
  if (names.length) {
    // Una celda por parada, apiladas en vertical; la UV de la placa solo usa su celda.
    const cellW = 512,
      cellH = 96,
      canvas = document.createElement('canvas');
    canvas.width = cellW;
    canvas.height = cellH * names.length;
    const c = canvas.getContext('2d');
    c.fillStyle = sign.background;
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.strokeStyle = sign.foreground;
    c.fillStyle = sign.foreground;
    c.lineWidth = 5;
    c.font = 'bold 36px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    names.forEach((name, i) => {
      const y = (names.length - 1 - i) * cellH;
      c.strokeRect(8, y + 8, cellW - 16, cellH - 16);
      c.fillText(name.toUpperCase(), cellW / 2, y + cellH / 2 + 2, cellW - 40);
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    // v: celda `slot` ocupa [slot, slot + 1] / names.length desde abajo.
    const uv = plates.uv.map((v, i) => (i % 2 ? v / names.length : v));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(plates.position, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(plates.index);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
    );
    mesh.name = 'tram-stop-signs';
    gfx.scene.add(mesh);
    triangles += plates.index.length / 3;
  }
  stats.stops = names.length;
  stats.triangles += triangles;
}

export function buildTram() {
  const layer = world.tram,
    cfg = world.cityDesign.tram;
  if (!layer?.tracks.length) return null;
  const half = cfg.stripWidth / 2,
    cat = cfg.catenary,
    paved = [],
    grass = [],
    lane = solid(),
    rails = [],
    wires = [],
    stats = { meters: 0, tracks: layer.tracks.length, poles: 0, triangles: 0 };

  for (const { track, points, kinds } of layout().tracks) {
    const normal = normals(points),
      side = (i, offset) => [
        points[i][0] + normal[i][0] * offset,
        points[i][1] + normal[i][1] * offset,
      ],
      support = world.surfaces?.profiles.has('tram:' + track.id) ? 'tram:' + track.id : null,
      level = (p) => surfaceHeightAt(p[0], p[1], null, support),
      floor = (p) => level(p) + cfg.bedHeight;

    // Franja: un cuadrilátero por muestra. Empotrada (lane, paved): cota del eje en ambos lados
    // (sigue a la calzada, plana en sentido transversal); de césped: cota de cada esquina.
    for (let i = 1; i < points.length; i++) {
      const centre = [i - 1, i].map((k) => level(points[k])),
        kind = kinds[i - 1],
        flat = kind !== 'grass',
        corner = (k, s, w = half, lift = 0) => {
          const p = side(k, w * s);
          return [
            p[0],
            flat
              ? centre[k - (i - 1)] + cfg.bedHeight + lift
              : Math.max(floor(p), centre[k - (i - 1)]),
            p[1],
          ];
        };
      if (kind === 'lane') {
        // Carril exclusivo: hormigón claro con una línea blanca continua en cada borde.
        paint(
          lane,
          cfg.laneColor,
          faceOf(corner(i - 1, -1), corner(i, -1), corner(i, 1), corner(i - 1, 1)),
        );
        for (const s of [-1, 1]) {
          const outer = half - cfg.laneMargin / 2,
            inner = outer - cfg.laneLineWidth;
          paint(
            lane,
            cfg.laneLineColor,
            faceOf(
              corner(i - 1, s, outer, 0.004),
              corner(i, s, outer, 0.004),
              corner(i, s, inner, 0.004),
              corner(i - 1, s, inner, 0.004),
            ),
          );
        }
      } else
        quad(
          flat ? paved : grass,
          corner(i - 1, -1),
          corner(i, -1),
          corner(i, 1),
          corner(i - 1, 1),
        );
      stats.meters += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    }

    // Raíles: separación igual al ancho de vía de OSM.
    for (const s of [-1, 1]) {
      const line = points.map((_, i) => side(i, (track.gauge / 2) * s)),
        base = line.map(floor);
      beam(
        rails,
        line,
        normal,
        cfg.rails.width / 2,
        base,
        base.map((y) => y + cfg.rails.height),
      );
    }

    // Hilo de contacto: tramos rectos de `wireStep` sobre el eje.
    const wire = thin(points, cat.wireStep),
      wireNormal = normals(wire),
      wireY = wire.map((p) => floor(p) + cat.wireHeight);
    beam(
      wires,
      wire,
      wireNormal,
      cat.wireWidth / 2,
      wireY.map((y) => y - cat.wireWidth),
      wireY,
    );

    // Postes cada `poleSpacing` metros, por el lado con más sitio libre y fuera de edificios.
    let distance = cat.poleSpacing / 2,
      walked = 0;
    for (let i = 1; i < points.length; i++) {
      const segment = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      while (distance <= walked + segment) {
        const t = (distance - walked) / (segment || 1),
          x = points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
          z = points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
          n = [(normal[i - 1][0] + normal[i][0]) / 2, (normal[i - 1][1] + normal[i][1]) / 2],
          offset = half + cat.poleOffset,
          choices = [1, -1]
            .map((s) => {
              const p = [x + n[0] * offset * s, z + n[1] * offset * s],
                road = nearestRoad(p[0], p[1], true);
              return {
                p,
                clear: road ? road.d - road.s.width / 2 : 99,
                blocked: inBuilding(p[0], p[1], cat.buildingClearance),
              };
            })
            .filter((c) => !c.blocked)
            .sort((a, b) => b.clear - a.clear);
        distance += cat.poleSpacing;
        if (!choices.length) continue;
        const [px, pz] = choices[0].p,
          y0 = surfaceHeightAt(px, pz),
          w = cat.poleWidth / 2;
        // Poste: cuatro caras y tapa; brazo horizontal hasta el eje de la vía.
        const corners = [
          [px - w, pz - w],
          [px + w, pz - w],
          [px + w, pz + w],
          [px - w, pz + w],
        ].map(([cx, cz]) => [
          [cx, y0, cz],
          [cx, y0 + cat.poleHeight, cz],
        ]);
        for (let k = 0; k < 4; k++) {
          const a = corners[k],
            b = corners[(k + 1) % 4];
          quad(wires, a[0], b[0], b[1], a[1]);
        }
        quad(wires, corners[0][1], corners[1][1], corners[2][1], corners[3][1]);
        const arm = [
            [px, pz],
            [x, z],
          ],
          dx = x - px,
          dz = z - pz,
          length = Math.hypot(dx, dz) || 1,
          an = [
            [-dz / length, dx / length],
            [-dz / length, dx / length],
          ],
          armEnd = floor([x, z]) + cat.armHeight;
        beam(
          wires,
          arm,
          an,
          cat.armWidth / 2,
          [y0 + cat.armHeight - cat.armWidth, armEnd - cat.armWidth],
          [y0 + cat.armHeight, armEnd],
        );
        stats.poles++;
      }
      walked += segment;
    }
  }

  stats.triangles +=
    addMesh(
      'tram-bed-paved',
      paved,
      mat(cfg.pavedColor, { side: THREE.DoubleSide, roughness: 0.95 }),
    ) +
    addMesh(
      'tram-bed-grass',
      grass,
      mat(cfg.grassColor, { side: THREE.DoubleSide, roughness: 1 }),
    ) +
    addMesh(
      'tram-rails',
      rails,
      mat(cfg.rails.color, { side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 }),
    ) +
    addMesh(
      'tram-catenary',
      wires,
      mat(cat.color, { side: THREE.DoubleSide, roughness: 0.7 }),
      false,
    );
  if (lane.position.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lane.position, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(lane.color, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geo,
      mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 }),
    );
    mesh.name = 'tram-lane';
    mesh.receiveShadow = true;
    gfx.scene.add(mesh);
    stats.triangles += lane.position.length / 9;
  }
  buildStops(layer, cfg, stats);
  world.tramStats = stats;
  return stats;
}
