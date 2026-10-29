import { createGrid } from '../core/grid.js';
import { insideBounds } from './bounds.js';
import {
  base,
  buildingGrid,
  segments,
  streetEnvironment,
  waterAreas,
  world,
} from '../core/state.js';
import { clamp, pInside, pointSeg, polygonBounds } from '../core/math.js';

// Rejilla que sigue a una lista de core/state.js, que se muta en lugar de reasignarse: al
// consultarla indexa lo añadido al final y se rehace si la lista menguó o cambió su primer
// elemento. No detecta cambios en mitad de la lista.
function syncedGrid(list, cell, add, reset = () => {}) {
  let grid = null,
    count = 0,
    head;
  return () => {
    if (!grid || list.length < count || list[0] !== head) {
      grid = createGrid(cell);
      count = 0;
      head = list[0];
      reset();
    }
    for (; count < list.length; count++) add(grid, list[count], count);
    return grid;
  };
}

let colliderReach = 0;
const colliderIndex = syncedGrid(
  streetEnvironment.colliders,
  16,
  (grid, p) => {
    colliderReach = Math.max(colliderReach, p.r);
    grid.insert(p, p.x, p.x, p.z, p.z);
  },
  () => (colliderReach = 0),
);

export function someCollider(x, z, radius, test) {
  const grid = colliderIndex(),
    reach = radius + colliderReach;
  return grid.queryBox(x - reach, x + reach, z - reach, z + reach, test);
}

export function inBuilding(x, z, pad = 0.3) {
  const seen = new Set();
  for (let gx = Math.floor((x - pad) / 25); gx <= Math.floor((x + pad) / 25); gx++)
    for (let gz = Math.floor((z - pad) / 25); gz <= Math.floor((z + pad) / 25); gz++)
      for (const b of buildingGrid.get(gx + ',' + gz) || []) {
        if (seen.has(b)) continue;
        seen.add(b);
        if (x < b.minX - pad || x > b.maxX + pad || z < b.minZ - pad || z > b.maxZ + pad) continue;
        let inside = pInside(x, z, b.p) && !b.holes.some((h) => pInside(x, z, h));
        if (inside) return true;
        // El margen vale también para los muros de los patios.
        if (pad > 0)
          for (const r of [b.p, ...b.holes])
            for (let i = 0; i < r.length; i++)
              if (pointSeg(x, z, r[i], r[(i + 1) % r.length]).d < pad) return true;
      }
  return false;
}

const side = (a, b, x, z) => (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);

// ¿Corta el segmento (x0, z0)–(x1, z1) algún muro (contorno o patio) de un edificio?
export function crossesWall(x0, z0, x1, z1) {
  const seen = new Set(),
    p = [x0, z0],
    q = [x1, z1];
  for (let gx = Math.floor(Math.min(x0, x1) / 25); gx <= Math.floor(Math.max(x0, x1) / 25); gx++)
    for (let gz = Math.floor(Math.min(z0, z1) / 25); gz <= Math.floor(Math.max(z0, z1) / 25); gz++)
      for (const b of buildingGrid.get(gx + ',' + gz) || []) {
        if (seen.has(b)) continue;
        seen.add(b);
        if (
          Math.max(x0, x1) < b.minX ||
          Math.min(x0, x1) > b.maxX ||
          Math.max(z0, z1) < b.minZ ||
          Math.min(z0, z1) > b.maxZ
        )
          continue;
        for (const r of [b.p, ...b.holes])
          for (let i = 0; i < r.length; i++) {
            const a = r[i],
              c = r[(i + 1) % r.length];
            if (
              side(a, c, x0, z0) * side(a, c, x1, z1) <= 0 &&
              side(p, q, a[0], a[1]) * side(p, q, c[0], c[1]) <= 0
            )
              return true;
          }
      }
  return false;
}

// Los empates conservan el índice original del tramo, como el recorrido lineal.
const roadOrder = new Map(),
  roadStamps = new Map();
let roadStamp = 0,
  roadMinX,
  roadMaxX,
  roadMinZ,
  roadMaxZ;
const roadIndex = syncedGrid(
  segments,
  25,
  (grid, s, i) => {
    const minX = Math.min(s.a[0], s.b[0]),
      maxX = Math.max(s.a[0], s.b[0]),
      minZ = Math.min(s.a[1], s.b[1]),
      maxZ = Math.max(s.a[1], s.b[1]);
    roadOrder.set(s, i);
    grid.insert(s, minX, maxX, minZ, maxZ);
    roadMinX = Math.min(roadMinX, Math.floor(minX / 25));
    roadMaxX = Math.max(roadMaxX, Math.floor(maxX / 25));
    roadMinZ = Math.min(roadMinZ, Math.floor(minZ / 25));
    roadMaxZ = Math.max(roadMaxZ, Math.floor(maxZ / 25));
  },
  () => {
    roadOrder.clear();
    roadMinX = roadMinZ = Infinity;
    roadMaxX = roadMaxZ = -Infinity;
  },
);
export function nearestRoad(x, z, driveOnly = false) {
  const roadGrid = roadIndex();
  let best = null,
    md = Infinity,
    bx = 0,
    bz = 0,
    bu = 0;
  const stamp = ++roadStamp;
  const visit = (s) => {
    if (roadStamps.get(s) === stamp || (driveOnly && !s.drive)) return;
    roadStamps.set(s, stamp);
    const a = s.a,
      b = s.b,
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      u = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1),
      d = Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u);
    if (d < md || (best && d === md && roadOrder.get(s) < roadOrder.get(best))) {
      md = d;
      best = s;
      bx = a[0] + dx * u;
      bz = a[1] + dz * u;
      bu = u;
    }
  };
  const cx = Math.floor(x / 25),
    cz = Math.floor(z / 25),
    limit = Math.max(
      Math.abs(cx - roadMinX),
      Math.abs(cx - roadMaxX),
      Math.abs(cz - roadMinZ),
      Math.abs(cz - roadMaxZ),
    );
  if (segments.length)
    for (let ring = 0; ring <= limit; ring++) {
      for (let gx = cx - ring; gx <= cx + ring; gx++) {
        for (const s of roadGrid.queryPoint(gx * 25, (cz - ring) * 25)) visit(s);
        if (ring) for (const s of roadGrid.queryPoint(gx * 25, (cz + ring) * 25)) visit(s);
      }
      for (let gz = cz - ring + 1; gz < cz + ring; gz++) {
        for (const s of roadGrid.queryPoint((cx - ring) * 25, gz * 25)) visit(s);
        for (const s of roadGrid.queryPoint((cx + ring) * 25, gz * 25)) visit(s);
      }
      const distance = Math.min(
        x - (cx - ring) * 25,
        (cx + ring + 1) * 25 - x,
        z - (cz - ring) * 25,
        (cz + ring + 1) * 25 - z,
      );
      if (distance > md) break;
    }
  if (!best) for (const s of segments) visit(s);
  return best && { x: bx, z: bz, d: md, u: bu, s: best };
}

const waterIndex = syncedGrid(waterAreas, 25, (grid, a) => {
  const b = polygonBounds(a.p);
  grid.insert(a, b.minX, b.maxX, b.minZ, b.maxZ);
});
export function inWater(x, z) {
  return waterIndex()
    .queryPoint(x, z)
    .some((a) => pInside(x, z, a.p));
}

export function blocked(x, z, r = 0.3, reference = null) {
  if (!insideBounds(x, z, 5)) return true;
  if (inBuilding(x, z, r)) return true;
  if (
    someCollider(
      x,
      z,
      r,
      (p) =>
        Math.hypot(x - p.x, z - p.z) < p.r + r &&
        (reference === null || p.y === undefined || Math.abs(p.y - reference) < 2),
    )
  )
    return true;
  if (inWater(x, z)) {
    if (world.surfaces?.drySurfaceAt(x, z, reference)) return false;
    let n = nearestRoad(x, z);
    if (!n || !n.s.bridge || n.d > n.s.width * 0.55) return true;
  }
  return false;
}

export function safePoint(x, z, drive = false) {
  let best = null,
    md = Infinity;
  for (const s of segments) {
    if (drive && !s.drive) continue;
    let p = pointSeg(x, z, s.a, s.b),
      di = p.d;
    if (di < md && !blocked(p.x, p.z, 1.1)) {
      best = { x: p.x, z: p.z, a: Math.atan2(s.b[0] - s.a[0], s.b[1] - s.a[1]) };
      md = di;
    }
  }
  return best || { x: base.x, z: base.z, a: 0 };
}

export function indexBuildings() {
  for (const b of world.city.buildings) {
    b.minX = Math.min(...b.p.map((p) => p[0]));
    b.maxX = Math.max(...b.p.map((p) => p[0]));
    b.minZ = Math.min(...b.p.map((p) => p[1]));
    b.maxZ = Math.max(...b.p.map((p) => p[1]));
    for (let x = Math.floor(b.minX / 25); x <= Math.floor(b.maxX / 25); x++)
      for (let z = Math.floor(b.minZ / 25); z <= Math.floor(b.maxZ / 25); z++) {
        let k = x + ',' + z;
        if (!buildingGrid.has(k)) buildingGrid.set(k, []);
        buildingGrid.get(k).push(b);
      }
  }
  waterAreas.push(...world.city.areas.filter((a) => a.kind === 'water'));
}
