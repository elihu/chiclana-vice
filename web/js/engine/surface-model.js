// Diseño de superficies: perfiles de autor sobre un MDT inmutable, sin física.
import { pInside } from '../core/math.js';

const key = (x, z) => Math.floor(x / 25) * 65536 + Math.floor(z / 25);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

function boundaryDistance(x, z, polygon) {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return best;
}

export function validateSurfaceDesign(design, city = null) {
  if (design === undefined) return [];
  const errors = [],
    fail = (p, text) => errors.push(`terrainSurfaces.${p}: ${text}`),
    positive = (v) => Number.isFinite(v) && v > 0,
    roads = city ? new Map(city.roads.map((r) => [r.id, r])) : null;
  if (!design || design.version !== 1) return ['terrainSurfaces.version: se esperaba 1'];
  const keys = (object, allowed, path) => {
    if (!object || typeof object !== 'object' || Array.isArray(object))
      return fail(path, 'se esperaba un objeto');
    for (const k of Object.keys(object))
      if (!allowed.includes(k)) fail(path + '.' + k, 'clave desconocida');
  };
  keys(design, ['version', 'roads', 'water', 'platforms'], '$');
  keys(
    design.roads,
    [
      'sampleStep',
      'pavementStep',
      'meshSubdivisions',
      'smoothingRadius',
      'shoulder',
      'bridgeAnchorRadius',
    ],
    'roads',
  );
  keys(
    design.water,
    ['percentile', 'bedDepth', 'shoreWidth', 'axis', 'sliceLength', 'maximumSlope'],
    'water',
  );
  for (const p of [
    'sampleStep',
    'pavementStep',
    'smoothingRadius',
    'shoulder',
    'bridgeAnchorRadius',
  ])
    if (!positive(design.roads?.[p])) fail(`roads.${p}`, 'se esperaba un número positivo');
  if (![1, 2, 4].includes(design.roads?.meshSubdivisions))
    fail('roads.meshSubdivisions', 'se esperaba 1, 2 o 4');
  if (
    design.roads?.sampleStep < 0.5 ||
    design.roads?.smoothingRadius > 100 ||
    design.roads?.pavementStep < 1 ||
    design.roads?.shoulder > 10
  )
    fail('roads', 'resolución o radio fuera del presupuesto permitido');
  for (const p of ['bedDepth', 'shoreWidth'])
    if (!positive(design.water?.[p])) fail(`water.${p}`, 'se esperaba un número positivo');
  if (!(design.water?.percentile >= 0 && design.water.percentile <= 1))
    fail('water.percentile', 'se esperaba un percentil entre 0 y 1');
  if (
    !positive(design.water?.sliceLength) ||
    !positive(design.water?.maximumSlope) ||
    !['x', 'z'].includes(design.water?.axis)
  )
    fail('water', 'eje, longitud de tramo y pendiente positiva obligatorios');
  if (!Array.isArray(design.platforms)) fail('platforms', 'se esperaba una lista');
  const ids = new Set();
  for (const [i, p] of (Array.isArray(design.platforms) ? design.platforms : []).entries()) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      fail(`platforms.${i}`, 'se esperaba un objeto');
      continue;
    }
    keys(
      p,
      [
        'id',
        'areaAnchor',
        'roadAnchor',
        'heightAnchors',
        'deckRoads',
        'lowerRoads',
        'clearance',
        'evidence',
      ],
      `platforms.${i}`,
    );
    const references = [
      p.roadAnchor?.roadId,
      ...(Array.isArray(p.heightAnchors) ? p.heightAnchors.map((a) => a?.roadId) : []),
      ...(Array.isArray(p.deckRoads) ? p.deckRoads : []),
      ...(Array.isArray(p.lowerRoads) ? p.lowerRoads : []),
    ].filter(Boolean);
    if (city && references.some((id) => city.roads.filter((r) => r.id === id).length !== 1))
      fail(`platforms.${i}`, 'anclaje de vía inexistente o ambiguo');
    if (typeof p.id !== 'string' || !p.id || ids.has(p.id))
      fail(`platforms.${i}.id`, 'identificador único obligatorio');
    ids.add(p.id);
    if (!positive(p.clearance))
      fail(`platforms.${i}.clearance`, 'se esperaba altura libre positiva');
    if (
      !Array.isArray(p.evidence) ||
      !p.evidence.every((s) => typeof s === 'string' && s.length > 8) ||
      !p.evidence.length
    )
      fail(`platforms.${i}.evidence`, 'fuentes o justificación obligatorias');
    if (p.roadAnchor) {
      if (
        typeof p.roadAnchor.roadId !== 'string' ||
        !positive(p.roadAnchor.width) ||
        (roads && !roads.has(p.roadAnchor.roadId))
      )
        fail(`platforms.${i}.roadAnchor`, 'vía existente y anchura positiva obligatorias');
      if (p.areaAnchor) fail(`platforms.${i}`, 'solo un tipo de anclaje');
    } else if (
      !Array.isArray(p.areaAnchor?.vertex) ||
      p.areaAnchor.vertex.length !== 2 ||
      !p.areaAnchor.vertex.every(Number.isFinite)
    )
      fail(`platforms.${i}.areaAnchor`, 'se esperaba vértice de área existente');
    else if (
      city &&
      city.areas.filter(
        (a) =>
          a.kind === p.areaAnchor.kind &&
          a.p.length === p.areaAnchor.vertexCount &&
          a.p.some((v) => v[0] === p.areaAnchor.vertex[0] && v[1] === p.areaAnchor.vertex[1]),
      ).length !== 1
    )
      fail(`platforms.${i}.areaAnchor`, 'anclaje ambiguo o área modificada');
    if (!Array.isArray(p.heightAnchors) || p.heightAnchors.length < 2)
      fail(`platforms.${i}.heightAnchors`, 'mínimo dos accesos');
    for (const a of Array.isArray(p.heightAnchors) ? p.heightAnchors : []) {
      if (!a || typeof a !== 'object') {
        fail(`platforms.${i}.heightAnchors`, 'se esperaba un objeto');
        continue;
      }
      keys(a, ['roadId', 'vertex', 'offset'], `platforms.${i}.heightAnchors`);
      if (
        typeof a.roadId !== 'string' ||
        !Number.isInteger(a.vertex) ||
        a.vertex < 0 ||
        !Number.isFinite(a.offset)
      )
        fail(`platforms.${i}.heightAnchors`, 'anclaje de vía inválido');
      else if (roads && !roads.get(a.roadId)?.p[a.vertex])
        fail(`platforms.${i}.heightAnchors`, 'vía o vértice inexistente');
    }
    for (const field of ['deckRoads', 'lowerRoads']) {
      if (
        !Array.isArray(p[field]) ||
        p[field].some((s) => typeof s !== 'string') ||
        new Set(p[field]).size !== p[field]?.length
      )
        fail(`platforms.${i}.${field}`, 'lista de vías únicas obligatoria');
      else if (roads && p[field].some((id) => !roads.has(id)))
        fail(`platforms.${i}.${field}`, 'vía inexistente');
    }
    if (
      Array.isArray(p.deckRoads) &&
      Array.isArray(p.lowerRoads) &&
      p.deckRoads.some((id) => p.lowerRoads.includes(id))
    )
      fail(`platforms.${i}`, 'una vía no puede ocupar ambos niveles');
  }
  return errors;
}

export function createSurfaceModel(city, terrain, design) {
  const errors = validateSurfaceDesign(design, city);
  if (errors.length) throw Error('Diseño vertical incompatible: ' + errors.join('; '));
  if (!design || terrain.kind === 'flat') return null;
  const raw = terrain.heightAt,
    roadMap = new Map(city.roads.map((r) => [r.id, r])),
    grid = new Map(),
    profiles = new Map(),
    platforms = [],
    water = [],
    cfg = design.roads;
  const average = (x, z, radius) => {
    let sum = 0;
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) sum += raw(x + i * radius, z + j * radius);
    return sum / 9;
  };
  for (const p of design.platforms) {
    const area = p.areaAnchor
        ? city.areas.find(
            (a) =>
              a.kind === p.areaAnchor.kind &&
              a.p.length === p.areaAnchor.vertexCount &&
              a.p.some((v) => v[0] === p.areaAnchor.vertex[0] && v[1] === p.areaAnchor.vertex[1]),
          )
        : null,
      heights = p.heightAnchors.map((a) => {
        const q = roadMap.get(a.roadId).p[a.vertex];
        return average(...q, cfg.bridgeAnchorRadius) + a.offset;
      });
    let polygon = area?.p;
    if (p.roadAnchor) {
      const r = roadMap.get(p.roadAnchor.roadId),
        a = r.p[0],
        b = r.p.at(-1),
        length = Math.hypot(b[0] - a[0], b[1] - a[1]),
        nx = ((-(b[1] - a[1]) / length) * p.roadAnchor.width) / 2,
        nz = (((b[0] - a[0]) / length) * p.roadAnchor.width) / 2;
      polygon = [
        [a[0] + nx, a[1] + nz],
        [a[0] - nx, a[1] - nz],
        [b[0] - nx, b[1] - nz],
        [b[0] + nx, b[1] + nz],
      ];
    }
    platforms.push({
      ...p,
      polygon,
      area,
      y: heights.reduce((a, b) => a + b, 0) / heights.length,
      minX: Math.min(...polygon.map((v) => v[0])),
      maxX: Math.max(...polygon.map((v) => v[0])),
      minZ: Math.min(...polygon.map((v) => v[1])),
      maxZ: Math.max(...polygon.map((v) => v[1])),
    });
  }
  const atPlatform = (x, z) =>
    platforms.find(
      (p) =>
        x >= p.minX - 1e-6 &&
        x <= p.maxX + 1e-6 &&
        z >= p.minZ - 1e-6 &&
        z <= p.maxZ + 1e-6 &&
        (pInside(x, z, p.polygon) || boundaryDistance(x, z, p.polygon) < 1e-6),
    );
  for (const a of city.areas) {
    if (a.kind !== 'water') continue;
    // El cauce sigue su MDT local, no el mínimo de un polígono de kilómetros.
    water.push(a);
  }
  const slices = new Map(),
    levels = new Map(),
    wm = terrain.manifest,
    axis = design.water.axis === 'x' ? 0 : 1,
    sliceLength = design.water.sliceLength;
  for (let j = 0; j < wm.rows; j++)
    for (let i = 0; i < wm.columns; i++) {
      const x = -wm.size[0] / 2 + i * wm.step[0],
        z = -wm.size[1] / 2 + j * wm.step[1];
      if (!water.some((a) => pInside(x, z, a.p))) continue;
      const k = Math.floor((axis === 0 ? x : z) / sliceLength);
      if (!slices.has(k)) slices.set(k, []);
      slices.get(k).push(raw(x, z));
    }
  let previous = null;
  for (const k of [...slices.keys()].sort((a, b) => a - b)) {
    const values = slices.get(k).sort((a, b) => a - b);
    let y = values[Math.floor((values.length - 1) * design.water.percentile)] + 0.04;
    if (previous) {
      const limit = (k - previous.k) * sliceLength * design.water.maximumSlope;
      y = Math.max(previous.y - limit, Math.min(previous.y + limit, y));
    }
    levels.set(k, y);
    previous = { k, y };
  }
  const waterHeightAt = (x, z) => {
    const along = (axis === 0 ? x : z) / sliceLength - 0.5,
      k = Math.floor(along),
      a = levels.get(k),
      b = levels.get(k + 1);
    return a !== undefined && b !== undefined ? mix(a, b, along - k) : (a ?? b ?? raw(x, z));
  };
  const add = (s) => {
    for (
      let i = Math.floor((Math.min(s.a[0], s.b[0]) - s.width / 2 - cfg.shoulder) / 25);
      i <= Math.floor((Math.max(s.a[0], s.b[0]) + s.width / 2 + cfg.shoulder) / 25);
      i++
    )
      for (
        let j = Math.floor((Math.min(s.a[1], s.b[1]) - s.width / 2 - cfg.shoulder) / 25);
        j <= Math.floor((Math.max(s.a[1], s.b[1]) + s.width / 2 + cfg.shoulder) / 25);
        j++
      ) {
        const k = i * 65536 + j;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(s);
      }
  };
  for (const r of city.roads) {
    const points = [],
      lengths = [0];
    for (let i = 1; i < r.p.length; i++)
      lengths.push(
        lengths.at(-1) + Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]),
      );
    const total = lengths.at(-1);
    if (!total) continue;
    const sample = (distance) => {
      let i = 1;
      while (i < lengths.length - 1 && lengths[i] < distance) i++;
      const t = (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
      return [mix(r.p[i - 1][0], r.p[i][0], t), mix(r.p[i - 1][1], r.p[i][1], t)];
    };
    const start = average(...r.p[0], cfg.bridgeAnchorRadius),
      end = average(...r.p.at(-1), cfg.bridgeAnchorRadius),
      deck = platforms.find((p) => p.deckRoads.includes(r.id)),
      lower = platforms.find((p) => p.lowerRoads.includes(r.id));
    const count = Math.max(1, Math.ceil(total / cfg.sampleStep)),
      stations = [
        ...new Set([
          ...lengths,
          ...Array.from({ length: count + 1 }, (_, i) => (total * i) / count),
        ]),
      ].sort((a, b) => a - b);
    for (const distance of stations) {
      const p = sample(distance);
      let y;
      if (deck) y = deck.y;
      else if (r.bridge) y = mix(start, end, distance / total);
      else {
        let sum = 0,
          weight = 0;
        for (
          let offset = -cfg.smoothingRadius;
          offset <= cfg.smoothingRadius;
          offset += cfg.sampleStep
        ) {
          const q = sample(Math.max(0, Math.min(total, distance + offset))),
            w = 1 - Math.abs(offset) / (cfg.smoothingRadius + cfg.sampleStep);
          sum += raw(...q) * w;
          weight += w;
        }
        const filtered = sum / weight,
          blend = Math.min(
            1,
            distance / cfg.smoothingRadius,
            (total - distance) / cfg.smoothingRadius,
          );
        y = mix(mix(start, end, distance / total), filtered, smooth(blend));
      }
      // Paso inferior de autor: altura libre declarada, accesos suaves fuera del tablero.
      if (lower) {
        const distance = pInside(...p, lower.polygon) ? 0 : boundaryDistance(...p, lower.polygon),
          blend = 1 - smooth(Math.min(1, distance / cfg.smoothingRadius));
        y = mix(y, Math.min(y, lower.y - lower.clearance), blend);
      }
      points.push({ p, y });
    }
    const list = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b.p[0] - a.p[0],
        dz = b.p[1] - a.p[1],
        length = Math.hypot(dx, dz);
      if (!length) continue;
      const s = {
        a: a.p,
        b: b.p,
        dx,
        dz,
        length,
        width: r.w,
        y0: a.y,
        y1: b.y,
        roadId: r.id,
        bridge: !!r.bridge || !!deck,
        lower: !!lower,
      };
      list.push(s);
      add(s);
    }
    profiles.set(r.id, list);
  }
  // Un cruce real comparte cota: propaga extremos del acceso inferior a vías conectadas.
  const controls = new Map();
  for (const [id, list] of profiles)
    if (list[0]?.lower) {
      const r = roadMap.get(id);
      controls.set(r.p[0].join(','), list[0].y0);
      controls.set(r.p.at(-1).join(','), list.at(-1).y1);
    }
  for (const [id, list] of profiles)
    if (list[0]?.bridge) {
      const r = roadMap.get(id);
      controls.set(r.p[0].join(','), list[0].y0);
      controls.set(r.p.at(-1).join(','), list.at(-1).y1);
    }
  for (const [id, list] of profiles) {
    if (!list.length || list[0].bridge || list[0].lower) continue;
    const r = roadMap.get(id),
      d0 = (controls.get(r.p[0].join(',')) ?? list[0].y0) - list[0].y0,
      d1 = (controls.get(r.p.at(-1).join(',')) ?? list.at(-1).y1) - list.at(-1).y1,
      total = list.reduce((n, s) => n + s.length, 0);
    if (!d0 && !d1) continue;
    const correction = (distance) =>
      total < 2 * cfg.smoothingRadius
        ? mix(d0, d1, distance / total)
        : d0 * (1 - smooth(Math.min(1, distance / cfg.smoothingRadius))) +
          d1 * (1 - smooth(Math.min(1, (total - distance) / cfg.smoothingRadius)));
    let distance = 0;
    for (const s of list) {
      s.y0 += correction(distance);
      distance += s.length;
      s.y1 += correction(distance);
    }
  }
  const roadAt = (x, z, id = null, includeDeck = true) => {
    let segment = null,
      distance2 = Infinity,
      y = 0;
    for (const s of grid.get(key(x, z)) || []) {
      if ((id && s.roadId !== id) || (!includeDeck && s.bridge)) continue;
      const t = Math.max(
          0,
          Math.min(1, ((x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz) / (s.length * s.length)),
        ),
        rx = x - s.a[0] - t * s.dx,
        rz = z - s.a[1] - t * s.dz,
        d2 = rx * rx + rz * rz,
        limit = s.width / 2 + cfg.shoulder;
      if (d2 <= limit * limit && d2 < distance2) {
        segment = s;
        distance2 = d2;
        y = mix(s.y0, s.y1, t);
      }
    }
    return segment ? { s: segment, d: Math.sqrt(distance2), y } : null;
  };
  const groundHeightAt = (x, z) => {
    let y = raw(x, z);
    const p = atPlatform(x, z);
    if (p) y = Math.min(y, p.y - p.clearance);
    else
      for (const platform of platforms) {
        if (
          x < platform.minX - cfg.shoulder ||
          x > platform.maxX + cfg.shoulder ||
          z < platform.minZ - cfg.shoulder ||
          z > platform.maxZ + cfg.shoulder
        )
          continue;
        const distance = boundaryDistance(x, z, platform.polygon);
        if (distance < cfg.shoulder)
          y = mix(
            y,
            Math.min(y, platform.y - platform.clearance),
            1 - smooth(distance / cfg.shoulder),
          );
      }
    for (const a of water)
      if (pInside(x, z, a.p)) {
        const depth =
          design.water.bedDepth *
          Math.min(1, boundaryDistance(x, z, a.p) / design.water.shoreWidth);
        y = Math.min(y, waterHeightAt(x, z) - depth);
      }
    const r = roadAt(x, z, null, false);
    if (r) {
      const blend = 1 - smooth(Math.max(0, Math.min(1, (r.d - r.s.width / 2) / cfg.shoulder)));
      y = mix(y, r.y, blend);
    }
    // La malla del MDT representa el nivel inferior; el tablero se dibuja aparte.
    if (p) y = Math.min(y, p.y - p.clearance);
    const deck = roadAt(x, z);
    if (deck?.s.bridge) {
      const blend =
        1 - smooth(Math.max(0, Math.min(1, (deck.d - deck.s.width / 2) / cfg.shoulder)));
      y = mix(y, Math.min(y, deck.y - 0.12), blend);
    }
    return y;
  };
  const surfaceHeightAt = (x, z, reference = null, roadId = null) => {
    const r = roadAt(x, z, roadId),
      p = atPlatform(x, z),
      ground = groundHeightAt(x, z);
    if (roadId && r) return r.y;
    let upper = p ? p.y : null;
    if (r?.s.bridge && r.d <= r.s.width / 2) upper = r.y;
    if (upper === null) return ground;
    return reference === null || Math.abs(upper - reference) <= Math.abs(ground - reference)
      ? upper
      : ground;
  };
  const affectedAt = (x, z) =>
    grid.has(key(x, z)) || !!atPlatform(x, z) || water.some((a) => pInside(x, z, a.p));
  const ceilingAt = (x, z, reference) => {
    if (reference === null) return Infinity;
    const p = atPlatform(x, z),
      r = roadAt(x, z);
    const upper = p?.y ?? (r?.s.bridge && r.d <= r.s.width / 2 ? r.y : Infinity);
    return Number.isFinite(upper) && reference < upper - 0.5 ? upper - 0.12 : Infinity;
  };
  const drySurfaceAt = (x, z, reference = null) => {
    const p = atPlatform(x, z),
      r = roadAt(x, z),
      y = surfaceHeightAt(x, z, reference);
    if (p && Math.abs(y - p.y) < 0.1) return true;
    if (r && r.d <= r.s.width / 2 + 0.3)
      return (r.s.bridge && Math.abs(y - r.y) < 0.1) || y > waterHeightAt(x, z) + 0.15;
    return false;
  };
  return {
    meshSubdivisions: cfg.meshSubdivisions,
    groundHeightAt,
    surfaceHeightAt,
    waterHeightAt,
    profiles,
    platforms,
    water,
    rawHeightAt: raw,
    roadAt,
    affectedAt,
    ceilingAt,
    drySurfaceAt,
  };
}
