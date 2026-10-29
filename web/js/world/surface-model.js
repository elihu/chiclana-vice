import { anchoredArea, validateSurfaceDesign } from './surface-validate.js';
export { validateSurfaceDesign } from './surface-validate.js';
import { gridX, gridZ } from '../core/math.js';
// Diseño de superficies: perfiles de autor sobre un MDT inmutable, sin física.
import { pInside, boundaryDistance } from '../core/math.js';
import { gridHeightAt } from './terrain.js';
import { dividerFaces } from './road-space.js';

const key = (x, z) => Math.floor(x / 25) * 65536 + Math.floor(z / 25);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

export function createSurfaceModel(city, terrain, design, vegetation = [], tram = null) {
  const errors = validateSurfaceDesign(design, city);
  if (errors.length) throw Error('Diseño vertical incompatible: ' + errors.join('; '));
  if (terrain.kind === 'flat') return null;
  if (!design)
    throw Error('Terreno real requiere terrainSurfaces: no hay perfil alternativo de puentes');
  // Soportes de rasante internos: el tranvía participa en rampas y uniones, sin
  // añadir calles al grafo ni modificar los ejes OSM publicados.
  const tramRoads = (tram?.tracks ?? []).map((track) => ({
      ...track,
      id: 'tram:' + track.id,
      type: 'tram',
      w: tram.width,
      oneway: false,
    })),
    surfaceRoads = [...city.roads, ...tramRoads],
    raw = terrain.heightAt,
    roadMap = new Map(surfaceRoads.map((r) => [r.id, r])),
    grid = new Map(),
    bridgeSegments = new Map(),
    ordinarySegments = new Map(),
    profiles = new Map(),
    roadPoints = new Map(),
    platforms = [],
    water = [],
    waterGrid = new Map(),
    platformGrid = new Map(),
    supportRoads = new Map(),
    cfg = design.roads;
  const empty = [];
  const { waterShapes, waterShape, average, roadPolygon } = createSurfaceHelpers({
    design,
    raw,
    roadMap,
    empty,
    indexBounds,
  });
  const { atPlatform } = buildSurfacePlatforms({
    city,
    design,
    tramRoads,
    roadMap,
    platforms,
    platformGrid,
    cfg,
    empty,
    indexBounds,
    average,
    roadPolygon,
  });
  const { basins, waterHeightAt } = buildSurfaceWater({
    city,
    terrain,
    design,
    raw,
    water,
    waterGrid,
    empty,
    indexBounds,
    waterShapes,
    waterShape,
  });
  const { platformIntervals, add } = createProfileHelpers({
    terrain,
    grid,
    bridgeSegments,
    ordinarySegments,
    cfg,
  });
  buildSurfaceProfiles({
    surfaceRoads,
    raw,
    profiles,
    roadPoints,
    platforms,
    supportRoads,
    cfg,
    average,
    platformIntervals,
    add,
  });
  reconcileSurfaceProfiles({ roadPoints, platforms, cfg });
  const { roadAt } = createRoadQuery({ grid, bridgeSegments, ordinarySegments, cfg, empty });
  const { dividers, dividerHeightAt, constructedHeightAt } = createConstructedQuery({
    city,
    design,
    vegetation,
    raw,
    roadMap,
    grid,
    profiles,
    waterGrid,
    platformGrid,
    cfg,
    empty,
    indexBounds,
    waterShapes,
    atPlatform,
    basins,
    waterHeightAt,
    roadAt,
  });
  const { meshTerrain, groundHeightAt } = buildSurfaceTerrain({
    terrain,
    grid,
    cfg,
    empty,
    constructedHeightAt,
  });
  const { surfaceHeightAt, actorHeightAt, affectedAt, ceilingAt, drySurfaceAt } =
    createActorQueries({
      grid,
      waterGrid,
      supportRoads,
      cfg,
      empty,
      waterShapes,
      atPlatform,
      waterHeightAt,
      roadAt,
      dividerHeightAt,
      groundHeightAt,
    });
  return {
    meshSubdivisions: cfg.meshSubdivisions,
    dividers,
    dividerHeightAt,
    meshTerrain,
    groundHeightAt,
    surfaceHeightAt,
    actorHeightAt,
    waterHeightAt,
    profiles,
    platforms,
    water,
    basins,
    rawHeightAt: raw,
    roadAt,
    affectedAt,
    ceilingAt,
    drySurfaceAt,
  };
}

function createSurfaceHelpers({ design, raw, roadMap, empty, indexBounds }) {
  const waterShapes = new Map();
  const waterShape = (area) => {
    const polygon = area.p,
      rows = new Map(),
      shores = new Map();
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + polygon.length - 1) % polygon.length],
        edge = [a, b];
      for (
        let row = Math.floor(Math.min(a[1], b[1]) / 25);
        row <= Math.floor(Math.max(a[1], b[1]) / 25);
        row++
      ) {
        if (!rows.has(row)) rows.set(row, []);
        rows.get(row).push(edge);
      }
      indexBounds(
        shores,
        edge,
        Math.min(a[0], b[0]),
        Math.max(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[1], b[1]),
        design.water.shoreWidth,
      );
    }
    const contains = (x, z) => {
      let inside = false;
      for (const [a, b] of rows.get(Math.floor(z / 25)) ?? empty)
        if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0])
          inside = !inside;
      return inside;
    };
    const shoreDistance = (x, z) => {
      let distance = design.water.shoreWidth;
      for (const edge of shores.get(key(x, z)) ?? empty)
        distance = Math.min(distance, boundaryDistance(x, z, edge));
      return distance;
    };
    return { contains, shoreDistance };
  };
  const average = (x, z, radius) => {
    let sum = 0;
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) sum += raw(x + i * radius, z + j * radius);
    return sum / 9;
  };
  const roadPolygon = (anchor) => {
    const points = roadMap.get(anchor.roadId).p.map((p) => [...p]),
      normals = [];
    // Un número prolonga ambos extremos; un par [inicio, fin], cada uno por separado.
    const extensions = Array.isArray(anchor.endExtension)
      ? anchor.endExtension
      : [anchor.endExtension ?? 0, anchor.endExtension ?? 0];
    for (const [i, j, extension] of [
      [0, 1, extensions[0]],
      [points.length - 1, points.length - 2, extensions[1]],
    ])
      if (extension) {
        const dx = points[i][0] - points[j][0],
          dz = points[i][1] - points[j][1],
          len = Math.hypot(dx, dz);
        points[i][0] += (dx / len) * extension;
        points[i][1] += (dz / len) * extension;
      }
    for (let i = 1; i < points.length; i++) {
      const dx = points[i][0] - points[i - 1][0],
        dz = points[i][1] - points[i - 1][1],
        length = Math.hypot(dx, dz);
      normals.push([-dz / length, dx / length]);
    }
    const side = (offset) =>
      points.map((point, i) => {
        const before = normals[Math.max(0, i - 1)],
          after = normals[Math.min(i, normals.length - 1)],
          nx = before[0] + after[0],
          nz = before[1] + after[1],
          denominator = nx * after[0] + nz * after[1];
        return [point[0] + (nx * offset) / denominator, point[1] + (nz * offset) / denominator];
      });
    return [
      ...side((anchor.lateralOffset ?? 0) + anchor.width / 2),
      ...side((anchor.lateralOffset ?? 0) - anchor.width / 2).reverse(),
    ];
  };
  return { waterShapes, waterShape, average, roadPolygon };
}

function buildSurfacePlatforms({
  city,
  design,
  tramRoads,
  roadMap,
  platforms,
  platformGrid,
  cfg,
  empty,
  indexBounds,
  average,
  roadPolygon,
}) {
  for (const p of design.platforms) {
    const area = p.areaAnchor ? city.areas.find(anchoredArea(p.areaAnchor)) : null,
      heights = p.heightAnchors.map((a) => {
        const q = roadMap.get(a.roadId).p[a.vertex];
        return average(...q, cfg.bridgeAnchorRadius) + a.offset;
      });
    let polygon = area?.p;
    if (p.roadAnchor) polygon = roadPolygon(p.roadAnchor);
    const level = heights.reduce((a, b) => a + b, 0) / heights.length;
    // Perfil lineal: plano inclinado por las cotas del primer y el último acceso, medido
    // sobre la recta que los une (sin recortar, para que el tablero siga siendo un plano).
    // Las plataformas de área y las de perfil "flat" son horizontales.
    let heightAt = () => level;
    if (p.profile === 'linear') {
      const first = roadMap.get(p.heightAnchors[0].roadId).p[p.heightAnchors[0].vertex],
        last = roadMap.get(p.heightAnchors.at(-1).roadId).p[p.heightAnchors.at(-1).vertex],
        dx = last[0] - first[0],
        dz = last[1] - first[1],
        length2 = dx * dx + dz * dz,
        h0 = heights[0],
        h1 = heights.at(-1);
      if (length2 > 1e-6)
        heightAt = (x, z) =>
          h0 + ((h1 - h0) * ((x - first[0]) * dx + (z - first[1]) * dz)) / length2;
    }
    platforms.push({
      ...p,
      deckRoads: [
        ...p.deckRoads,
        ...tramRoads
          .filter((r) =>
            r.p.some((q) => pInside(...q, polygon) || boundaryDistance(...q, polygon) < 1e-6),
          )
          .map((r) => r.id),
      ],
      polygon,
      area,
      thickness: p.thickness ?? 0.12,
      bands: (p.bands ?? []).map((b) => ({ ...b, polygon: roadPolygon(b.roadAnchor) })),
      supportId: `platform:${p.id}`,
      y: level,
      heightAt,
      minX: Math.min(...polygon.map((v) => v[0])),
      maxX: Math.max(...polygon.map((v) => v[0])),
      minZ: Math.min(...polygon.map((v) => v[1])),
      maxZ: Math.max(...polygon.map((v) => v[1])),
    });
  }
  for (const platform of platforms)
    indexBounds(
      platformGrid,
      platform,
      platform.minX,
      platform.maxX,
      platform.minZ,
      platform.maxZ,
      cfg.shoulder,
    );
  const atPlatform = (x, z) =>
    (platformGrid.get(key(x, z)) ?? empty).find(
      (p) =>
        x >= p.minX - 1e-6 &&
        x <= p.maxX + 1e-6 &&
        z >= p.minZ - 1e-6 &&
        z <= p.maxZ + 1e-6 &&
        (pInside(x, z, p.polygon) || boundaryDistance(x, z, p.polygon) < 1e-6),
    );
  return { atPlatform };
}

function buildSurfaceWater({
  city,
  terrain,
  design,
  raw,
  water,
  waterGrid,
  empty,
  indexBounds,
  waterShapes,
  waterShape,
}) {
  for (const a of city.areas) {
    if (a.kind !== 'water') continue;
    // El cauce sigue su MDT local, no el mínimo de un polígono de kilómetros.
    water.push(a);
    waterShapes.set(a, waterShape(a));
    indexBounds(
      waterGrid,
      a,
      Math.min(...a.p.map((p) => p[0])),
      Math.max(...a.p.map((p) => p[0])),
      Math.min(...a.p.map((p) => p[1])),
      Math.max(...a.p.map((p) => p[1])),
    );
  }
  const basins = (design.water.features ?? []).map((f) => {
    const area = city.areas.find(anchoredArea(f.areaAnchor));
    return { ...f, area, polygon: area.p, y: Math.max(...area.p.map((q) => raw(...q))) + 0.04 };
  });
  const waterLevels = new Map(),
    wm = terrain.manifest,
    axis = design.water.axis === 'x' ? 0 : 1,
    sliceLength = design.water.sliceLength;
  for (const area of water) {
    if (basins.some((b) => b.area === area)) continue;
    const slices = new Map(),
      levels = new Map();
    for (let j = 0; j < wm.rows; j++)
      for (let i = 0; i < wm.columns; i++) {
        const x = gridX(wm, i),
          z = gridZ(wm, j);
        if (!waterShapes.get(area).contains(x, z)) continue;
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
    waterLevels.set(area, levels);
  }
  const waterHeightAt = (x, z, area = null) => {
    if (!area)
      area = (waterGrid.get(key(x, z)) ?? empty).find(
        (a) => waterShapes.get(a).contains(x, z) || waterShapes.get(a).shoreDistance(x, z) < 1e-6,
      );
    const basin = basins.find((b) => b.area === area);
    if (basin) return basin.y;
    const levels = waterLevels.get(area);
    if (!levels) return raw(x, z);
    const along = (axis === 0 ? x : z) / sliceLength - 0.5,
      k = Math.floor(along),
      a = levels.get(k),
      b = levels.get(k + 1);
    return a !== undefined && b !== undefined ? mix(a, b, along - k) : (a ?? b ?? raw(x, z));
  };
  return { basins, waterHeightAt };
}

function createProfileHelpers({ terrain, grid, bridgeSegments, ordinarySegments, cfg }) {
  // Intersecciones longitudinales exactas de la polilínea con cada plataforma.
  const platformIntervals = (road, lengths, platform) => {
    const intervals = [];
    for (let i = 1; i < road.p.length; i++) {
      const a = road.p[i - 1],
        b = road.p[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        cuts = [0, 1];
      for (let j = 0; j < platform.polygon.length; j++) {
        const c = platform.polygon[j],
          d = platform.polygon[(j + 1) % platform.polygon.length],
          ex = d[0] - c[0],
          ez = d[1] - c[1],
          denominator = dx * ez - dz * ex;
        if (Math.abs(denominator) < 1e-12) continue;
        const t = ((c[0] - a[0]) * ez - (c[1] - a[1]) * ex) / denominator,
          u = ((c[0] - a[0]) * dz - (c[1] - a[1]) * dx) / denominator;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
      }
      cuts.sort((a, b) => a - b);
      for (let j = 1; j < cuts.length; j++) {
        const mid = (cuts[j - 1] + cuts[j]) / 2,
          x = a[0] + dx * mid,
          z = a[1] + dz * mid;
        if (!pInside(x, z, platform.polygon) && boundaryDistance(x, z, platform.polygon) > 1e-6)
          continue;
        const start = lengths[i - 1] + cuts[j - 1] * (lengths[i] - lengths[i - 1]),
          end = lengths[i - 1] + cuts[j] * (lengths[i] - lengths[i - 1]),
          previous = intervals.at(-1);
        if (previous && Math.abs(previous.end - start) < 1e-8) previous.end = end;
        else intervals.push({ start, end, platform });
      }
    }
    return intervals;
  };
  const add = (s) => {
    const padding = Math.max(
      cfg.shoulder,
      Math.hypot(...terrain.manifest.step.map((v) => v / cfg.meshSubdivisions)),
    );
    for (
      let i = Math.floor((Math.min(s.a[0], s.b[0]) - s.width / 2 - padding) / 25);
      i <= Math.floor((Math.max(s.a[0], s.b[0]) + s.width / 2 + padding) / 25);
      i++
    )
      for (
        let j = Math.floor((Math.min(s.a[1], s.b[1]) - s.width / 2 - padding) / 25);
        j <= Math.floor((Math.max(s.a[1], s.b[1]) + s.width / 2 + padding) / 25);
        j++
      ) {
        const k = i * 65536 + j;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(s);
        const index = s.bridge ? bridgeSegments : ordinarySegments;
        if (!index.has(k)) index.set(k, []);
        index.get(k).push(s);
      }
  };
  return { platformIntervals, add };
}

function buildSurfaceProfiles({
  surfaceRoads,
  raw,
  profiles,
  roadPoints,
  platforms,
  supportRoads,
  cfg,
  average,
  platformIntervals,
  add,
}) {
  for (const r of surfaceRoads) {
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
      decks = platforms.filter((p) => p.deckRoads.includes(r.id)),
      lowers = platforms.filter((p) => p.lowerRoads.includes(r.id)),
      deckIntervals = decks
        .flatMap((p) => platformIntervals(r, lengths, p))
        .sort((a, b) => a.start - b.start),
      lowerIntervals = lowers.flatMap((p) => platformIntervals(r, lengths, p));
    const count = Math.max(1, Math.ceil(total / cfg.sampleStep)),
      stations = [
        ...new Set([
          ...lengths,
          ...[...deckIntervals, ...lowerIntervals].flatMap((s) => [s.start, s.end]),
          ...Array.from({ length: count + 1 }, (_, i) => (total * i) / count),
        ]),
      ].sort((a, b) => a - b);
    for (const distance of stations) {
      const p = sample(distance);
      let y;
      if (r.bridge) y = mix(start, end, distance / total);
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
      if (deckIntervals.length) {
        const inside = deckIntervals.find(
          (s) => distance >= s.start - 1e-8 && distance <= s.end + 1e-8,
        );
        if (inside) y = inside.platform.heightAt(...p);
        else {
          const left = deckIntervals.findLast((s) => s.end < distance),
            right = deckIntervals.find((s) => s.start > distance);
          if (left && right && right.start - left.end < 2 * cfg.smoothingRadius)
            y = mix(
              left.platform.heightAt(...sample(left.end)),
              right.platform.heightAt(...sample(right.start)),
              smooth((distance - left.end) / (right.start - left.end)),
            );
          else {
            // La rampa mide siempre smoothingRadius aunque la vía sea más corta: su extremo
            // queda cerca de la plataforma y la resolución de uniones la continúa por las
            // vías vecinas, en lugar de comprimirla en un escalón.
            if (left)
              y = mix(
                y,
                left.platform.heightAt(...sample(left.end)),
                1 - smooth(Math.min(1, (distance - left.end) / cfg.smoothingRadius)),
              );
            if (right)
              y = mix(
                y,
                right.platform.heightAt(...sample(right.start)),
                1 - smooth(Math.min(1, (right.start - distance) / cfg.smoothingRadius)),
              );
          }
        }
      }
      // Cada paso inferior tiene su propia altura libre y transición.
      for (const lower of lowers) {
        const distance = pInside(...p, lower.polygon) ? 0 : boundaryDistance(...p, lower.polygon),
          blend = 1 - smooth(Math.min(1, distance / cfg.smoothingRadius));
        y = mix(y, Math.min(y, lower.heightAt(...p) - lower.thickness - lower.clearance), blend);
      }
      points.push({ p, y, distance });
    }
    const list = [],
      supportId = `road:${r.id}`;
    supportRoads.set(supportId, r.id);
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
        supportId,
        accessStart: r.p[0],
        accessEnd: r.p.at(-1),
        bridge: !!r.bridge || !!decks.length,
        lower: !!lowers.length,
      };
      list.push(s);
      add(s);
    }
    roadPoints.set(r, { points, lengths, list });
    profiles.set(r.id, [...(profiles.get(r.id) ?? []), ...list]);
  }
}

function reconcileSurfaceProfiles({ roadPoints, platforms, cfg }) {
  // Resuelve el grafo completo antes de corregir perfiles: independiente del orden,
  // sin relajaciones iterativas ni propagación de un solo salto.
  const nodes = new Map();
  for (const [road, { points, lengths }] of roadPoints) {
    for (let i = 0; i < road.p.length; i++) {
      const coordinate = road.p[i].join(',');
      if (!nodes.has(coordinate)) nodes.set(coordinate, { entries: [], neighbours: new Map() });
      const node = nodes.get(coordinate),
        point = points.find((p) => p.distance === lengths[i]);
      node.entries.push({
        road,
        point,
        end: i === 0 || i === road.p.length - 1,
        priority: platforms.some((p) => p.deckRoads.includes(road.id))
          ? 3
          : platforms.some((p) => p.lowerRoads.includes(road.id))
            ? 2
            : road.bridge
              ? 1
              : 0,
      });
      if (i) {
        const previous = nodes.get(road.p[i - 1].join(',')),
          distance = lengths[i] - lengths[i - 1];
        node.neighbours.set(
          previous,
          Math.min(node.neighbours.get(previous) ?? Infinity, distance),
        );
        previous.neighbours.set(
          node,
          Math.min(previous.neighbours.get(node) ?? Infinity, distance),
        );
      }
    }
  }
  const mean = (entries) => {
    const values = entries.map((e) => e.point.y).sort((a, b) => a - b);
    return values.reduce((sum, y) => sum + y, 0) / values.length;
  };
  for (const node of nodes.values()) {
    node.priority = Math.max(...node.entries.map((e) => e.priority));
    const selected = node.entries.filter((e) => e.priority === node.priority);
    // Dos pasos inferiores comparten la cota menor: promediar podría reducir el gálibo.
    node.y = node.priority === 2 ? Math.min(...selected.map((e) => e.point.y)) : mean(selected);
    const ordinary = node.entries.filter((e) => e.priority === 0);
    node.delta = ordinary.length ? node.y - mean(ordinary) : 0;
    node.influence = 0;
    node.weight = 0;
  }
  // Un acceso estructural alcanza también cadenas de vías cortas, limitado por el
  // radio longitudinal. Cada origen se recorre una vez; nunca retroalimenta su cota.
  for (const seed of nodes.values()) {
    if (!seed.priority || !seed.delta) continue;
    const distances = new Map([[seed, 0]]),
      pending = [{ node: seed, distance: 0 }];
    while (pending.length) {
      pending.sort((a, b) => b.distance - a.distance);
      const { node, distance } = pending.pop();
      if (distance !== distances.get(node)) continue;
      if (!node.priority) {
        const weight = 1 - smooth(distance / cfg.smoothingRadius);
        node.influence += seed.delta * weight;
        node.weight += weight;
      }
      for (const [next, length] of node.neighbours) {
        const candidate = distance + length;
        if (candidate >= cfg.smoothingRadius || candidate >= (distances.get(next) ?? Infinity))
          continue;
        distances.set(next, candidate);
        pending.push({ node: next, distance: candidate });
      }
    }
  }
  for (const node of nodes.values())
    if (node.weight) node.y += node.influence / Math.max(1, node.weight);
  for (const [road, { points, lengths, list }] of roadPoints) {
    const deltas = road.p.map(
      (p, i) => nodes.get(p.join(',')).y - points.find((q) => q.distance === lengths[i]).y,
    );
    let interval = 1;
    for (const point of points) {
      while (interval < lengths.length - 1 && point.distance > lengths[interval]) interval++;
      const start = lengths[interval - 1],
        end = lengths[interval],
        span = end - start;
      const from = point.distance - start,
        to = end - point.distance;
      point.y +=
        span < 2 * cfg.smoothingRadius
          ? mix(deltas[interval - 1], deltas[interval], smooth(from / (span || 1)))
          : deltas[interval - 1] * (1 - smooth(Math.min(1, from / cfg.smoothingRadius))) +
            deltas[interval] * (1 - smooth(Math.min(1, to / cfg.smoothingRadius)));
    }
    for (let i = 0; i < list.length; i++) {
      list[i].y0 = points[i].y;
      list[i].y1 = points[i + 1].y;
    }
  }
}

function createRoadQuery({ grid, bridgeSegments, ordinarySegments, cfg, empty }) {
  const roadAt = (x, z, id = null, includeDeck = true, bridgesOnly = false, result = null) => {
    let segment = null,
      distance2 = Infinity,
      y = 0;
    const index = bridgesOnly ? bridgeSegments : includeDeck ? grid : ordinarySegments;
    for (const s of index.get(key(x, z)) ?? empty) {
      if ((id && s.roadId !== id) || (!includeDeck && s.bridge)) continue;
      if (bridgesOnly && !s.bridge) continue;
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
    if (!segment) return null;
    const hit = result ?? {};
    hit.s = segment;
    hit.d = Math.sqrt(distance2);
    hit.y = y;
    return hit;
  };
  return { roadAt };
}

function createConstructedQuery({
  city,
  design,
  vegetation,
  raw,
  roadMap,
  grid,
  profiles,
  waterGrid,
  platformGrid,
  cfg,
  empty,
  indexBounds,
  waterShapes,
  atPlatform,
  basins,
  waterHeightAt,
  roadAt,
}) {
  const constructedRoad = {},
    constructedDeck = {};
  const dividers = dividerFaces(city.roads, city.bounds),
    dividerGrid = new Map(),
    blockerGrid = new Map();
  for (const face of dividers) {
    const xs = face.polygon.map((p) => p[0]),
      zs = face.polygon.map((p) => p[1]);
    indexBounds(
      dividerGrid,
      face,
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...zs),
      Math.max(...zs),
    );
  }
  for (const building of city.buildings ?? []) {
    const xs = building.p.map((p) => p[0]),
      zs = building.p.map((p) => p[1]);
    indexBounds(
      blockerGrid,
      building,
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...zs),
      Math.max(...zs),
    );
  }
  const greenGrid = new Map(),
    treeGrid = new Map();
  for (const a of (city.areas ?? []).filter((a) => ['park', 'water'].includes(a.kind))) {
    const xs = a.p.map((p) => p[0]),
      zs = a.p.map((p) => p[1]);
    indexBounds(greenGrid, a, Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs));
  }
  for (const p of [...(city.trees ?? []), ...vegetation]) {
    const r = Math.max(1.5, p[2] ?? 0);
    indexBounds(treeGrid, { p, r }, p[0] - r, p[0] + r, p[1] - r, p[1] + r);
  }
  const dividerHeightAt = (x, z) => {
    const faces = dividerGrid.get(key(x, z));
    if (!faces || atPlatform(x, z)) return null;
    const face = faces.find((f) => pInside(x, z, f.polygon));
    if (
      !face ||
      (blockerGrid.get(key(x, z)) ?? empty).some(
        (b) => pInside(x, z, b.p) && !(b.holes ?? []).some((h) => pInside(x, z, h)),
      ) ||
      (greenGrid.get(key(x, z)) ?? empty).some((a) => pInside(x, z, a.p)) ||
      (treeGrid.get(key(x, z)) ?? empty).some(({ p, r }) => Math.hypot(x - p[0], z - p[1]) < r)
    )
      return null;
    let first = null,
      second = null;
    for (const id of face.roads) {
      let distance = Infinity,
        height = 0;
      for (const s of profiles.get(id) ?? empty) {
        const t = Math.max(
            0,
            Math.min(1, ((x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz) / (s.length * s.length)),
          ),
          d = Math.hypot(x - s.a[0] - t * s.dx, z - s.a[1] - t * s.dz);
        if (d < distance) {
          distance = d;
          height = mix(s.y0, s.y1, t);
        }
      }
      if (!Number.isFinite(distance)) continue;
      const hit = { gap: Math.max(0.05, distance - roadMap.get(id).w / 2), height };
      if (!first || hit.gap < first.gap) {
        second = first;
        first = hit;
      } else if (!second || hit.gap < second.gap) second = hit;
    }
    // Solo las dos calzadas próximas delimitan la rasante local. Incluir el cierre
    // lejano de un separador largo lo hundía o descartaba por una cota ajena.
    if (!first || !second || first.gap > 8 || Math.abs(first.height - second.height) >= 1.5)
      return null;
    return (first.height * second.gap + second.height * first.gap) / (first.gap + second.gap);
  };
  const constructedHeightAt = (x, z) => {
    let y = raw(x, z);
    const cell = key(x, z);
    if (!grid.has(cell) && !platformGrid.has(cell) && !waterGrid.has(cell)) return y;
    const p = atPlatform(x, z);
    if (p) y = Math.min(y, p.heightAt(x, z) - p.thickness - p.clearance);
    else
      for (const platform of platformGrid.get(cell) ?? empty) {
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
            Math.min(y, platform.heightAt(x, z) - platform.thickness - platform.clearance),
            1 - smooth(distance / cfg.shoulder),
          );
      }
    for (const a of waterGrid.get(cell) ?? empty)
      if (!basins.some((b) => b.area === a) && waterShapes.get(a).contains(x, z)) {
        const depth =
          design.water.bedDepth *
          Math.min(1, waterShapes.get(a).shoreDistance(x, z) / design.water.shoreWidth);
        y = Math.min(y, waterHeightAt(x, z, a) - depth);
      }
    const r = roadAt(x, z, null, false, false, constructedRoad);
    if (r) {
      const blend = 1 - smooth(Math.max(0, Math.min(1, (r.d - r.s.width / 2) / cfg.shoulder)));
      y = mix(y, r.y, blend);
    }
    if (!r || r.d > r.s.width / 2) y = dividerHeightAt(x, z) ?? y;
    // La malla del MDT representa el nivel inferior; el tablero se dibuja aparte.
    if (p) y = Math.min(y, p.heightAt(x, z) - p.thickness - p.clearance);
    const deck = roadAt(x, z, null, true, false, constructedDeck);
    if (deck?.s.bridge) {
      const blend =
        1 - smooth(Math.max(0, Math.min(1, (deck.d - deck.s.width / 2) / cfg.shoulder)));
      y = mix(y, Math.min(y, deck.y - 0.12), blend);
    }
    return y;
  };
  return { dividers, dividerHeightAt, constructedHeightAt };
}

function buildSurfaceTerrain({ terrain, grid, cfg, empty, constructedHeightAt }) {
  // La consulta y el dibujo comparten una rejilla derivada; el MDT original no cambia.
  const original = terrain.manifest,
    sub = cfg.meshSubdivisions;
  const meshManifest = {
    ...original,
    columns: (original.columns - 1) * sub + 1,
    rows: (original.rows - 1) * sub + 1,
    step: original.step.map((v) => v / sub),
  };
  const meshData = new Float32Array(meshManifest.columns * meshManifest.rows);
  for (let j = 0; j < meshManifest.rows; j++)
    for (let i = 0; i < meshManifest.columns; i++) {
      const x = gridX(meshManifest, i),
        z = gridZ(meshManifest, j);
      let y = constructedHeightAt(x, z);
      const margin = Math.hypot(...meshManifest.step);
      for (const s of grid.get(key(x, z)) ?? empty) {
        if (s.bridge) continue;
        const along = ((x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz) / (s.length * s.length),
          t = Math.max(0, Math.min(1, along));
        const d = Math.hypot(x - s.a[0] - s.dx * t, z - s.a[1] - s.dz * t);
        // Rasante del tramo prolongada hasta la proyección del vértice: terreno y pavimento
        // son planos en cada triángulo, así que basta con que cada vértice quede por debajo.
        // Con la cota mínima del tramo, en cuesta el vértice bajaba pendiente × margen; esa
        // cota sigue siendo el suelo del techo más allá del extremo bajo del tramo.
        if (d <= s.width / 2 + margin)
          y = Math.min(
            y,
            Math.max(mix(s.y0, s.y1, along), Math.min(s.y0, s.y1)) - (cfg.coverageGap ?? 0.15),
          );
      }
      meshData[j * meshManifest.columns + i] = y;
    }
  const meshTerrain = {
    kind: 'grid',
    manifest: meshManifest,
    data: meshData,
    heightAt: (x, z) => gridHeightAt(meshManifest, meshData, x, z),
  };
  const groundHeightAt = meshTerrain.heightAt;
  return { meshTerrain, groundHeightAt };
}

function createActorQueries({
  grid,
  waterGrid,
  supportRoads,
  cfg,
  empty,
  waterShapes,
  atPlatform,
  waterHeightAt,
  roadAt,
  dividerHeightAt,
  groundHeightAt,
}) {
  // Resultados privados reutilizados: roadAt público sigue devolviendo un objeto propio.
  const surfaceRoad = {},
    surfaceLower = {},
    actorRoad = {},
    actorBridge = {},
    ceilingRoad = {},
    dryRoad = {};
  const surfaceHeightAt = (x, z, reference = null, roadId = null) => {
    const r = roadAt(x, z, roadId, true, false, surfaceRoad),
      divider = dividerHeightAt(x, z);
    if (roadId && r && (r.d <= r.s.width / 2 || divider === null)) return r.y;
    const p = atPlatform(x, z),
      lower = r?.s.bridge ? roadAt(x, z, null, false, false, surfaceLower) : r,
      ground = lower && lower.d <= lower.s.width / 2 ? lower.y : (divider ?? groundHeightAt(x, z));
    let upper = p ? p.heightAt(x, z) : null;
    if (r?.s.bridge && r.d <= r.s.width / 2) upper = r.y;
    if (upper === null) return r && r.d <= r.s.width / 2 ? r.y : ground;
    return reference === null || Math.abs(upper - reference) <= Math.abs(ground - reference)
      ? upper
      : ground;
  };
  const actorHeightAt = (actor, x, z, roadId = null) => {
    const previous = actor.surfaceY ?? null;
    const retained = supportRoads.get(actor.surfaceSupport) ?? null;
    const requested = roadId ?? retained;
    const road = requested ? roadAt(x, z, requested, true, false, actorRoad) : null;
    const platform = atPlatform(x, z);
    if (!platform && (!road || road.d > road.s.width / 2) && dividerHeightAt(x, z) !== null) {
      actor.surfaceSupport = null;
      return surfaceHeightAt(x, z);
    }
    if (roadId && road) {
      actor.surfaceSupport = road.s.supportId;
      return road.y;
    }
    if (retained && road && road.d <= road.s.width / 2 + 0.3) return road.y;
    if (platform && actor.surfaceSupport === platform.supportId) return platform.heightAt(x, z);
    actor.surfaceSupport = null;
    const bridge = roadAt(x, z, null, true, true, actorBridge);
    if (bridge?.s.bridge && bridge.d <= bridge.s.width / 2 + 0.3) {
      const start = bridge.s.accessStart,
        end = bridge.s.accessEnd,
        radius = cfg.accessRadius ?? 6,
        nearAccess =
          (x - start[0]) ** 2 + (z - start[1]) ** 2 <= radius * radius ||
          (x - end[0]) ** 2 + (z - end[1]) ** 2 <= radius * radius;
      if (
        previous === null ||
        (nearAccess && Math.abs(previous - bridge.y) <= (cfg.maximumAccessStep ?? 0.75))
      ) {
        actor.surfaceSupport = bridge.s.supportId;
        return bridge.y;
      }
    }
    const y = surfaceHeightAt(x, z, previous);
    if (platform && Math.abs(y - platform.heightAt(x, z)) < 0.1)
      actor.surfaceSupport = platform.supportId;
    return y;
  };
  const affectedAt = (x, z) =>
    grid.has(key(x, z)) ||
    !!atPlatform(x, z) ||
    (waterGrid.get(key(x, z)) ?? empty).some((a) => waterShapes.get(a).contains(x, z));
  const ceilingAt = (x, z, reference) => {
    if (reference === null) return Infinity;
    const p = atPlatform(x, z),
      r = roadAt(x, z, null, true, false, ceilingRoad);
    const upper = p?.heightAt(x, z) ?? (r?.s.bridge && r.d <= r.s.width / 2 ? r.y : Infinity);
    return Number.isFinite(upper) && reference < upper - 0.5
      ? upper - (p?.thickness ?? 0.12)
      : Infinity;
  };
  const drySurfaceAt = (x, z, reference = null) => {
    const p = atPlatform(x, z),
      r = roadAt(x, z, null, true, false, dryRoad),
      y = surfaceHeightAt(x, z, reference);
    if (p && Math.abs(y - p.heightAt(x, z)) < 0.1) return true;
    if (r && r.d <= r.s.width / 2 + 0.3)
      return (
        ((r.s.bridge || r.s.lower) && Math.abs(y - r.y) < 0.1) || y > waterHeightAt(x, z) + 0.15
      );
    return false;
  };
  return { surfaceHeightAt, actorHeightAt, affectedAt, ceilingAt, drySurfaceAt };
}

function indexBounds(index, value, minX, maxX, minZ, maxZ, padding = 0) {
  for (let i = Math.floor((minX - padding) / 25); i <= Math.floor((maxX + padding) / 25); i++)
    for (let j = Math.floor((minZ - padding) / 25); j <= Math.floor((maxZ + padding) / 25); j++) {
      const cell = i * 65536 + j;
      if (!index.has(cell)) index.set(cell, []);
      index.get(cell).push(value);
    }
}
