import {
  base,
  buildingGrid,
  segments,
  streetEnvironment,
  waterAreas,
  world,
} from '../core/state.js';
import { clamp, pInside, pointSeg } from '../core/math.js';

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

// Misma aritmética que pointSeg, en línea para no crear un objeto por tramo; solo se crea
// el resultado (quien llama puede conservarlo).
export function nearestRoad(x, z, driveOnly = false) {
  let best = null,
    md = Infinity,
    bx = 0,
    bz = 0,
    bu = 0;
  for (const s of segments) {
    if (driveOnly && !s.drive) continue;
    const a = s.a,
      b = s.b,
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      u = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1),
      d = Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u);
    if (d < md) {
      md = d;
      best = s;
      bx = a[0] + dx * u;
      bz = a[1] + dz * u;
      bu = u;
    }
  }
  return best && { x: bx, z: bz, d: md, u: bu, s: best };
}

export function blocked(x, z, r = 0.3) {
  if (Math.abs(x) > world.worldW / 2 - 5 || Math.abs(z) > world.worldH / 2 - 5) return true;
  if (inBuilding(x, z, r)) return true;
  if (streetEnvironment.colliders.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + r)) return true;
  if (waterAreas.some((a) => pInside(x, z, a.p))) {
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
