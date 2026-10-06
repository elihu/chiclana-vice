import {
  base,
  buildingGrid,
  segments,
  streetEnvironment,
  waterAreas,
  world,
} from '../core/state.js';
import { pInside, pointSeg } from '../core/math.js';

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
        if (pad > 0) {
          for (let i = 0; i < b.p.length; i++)
            if (pointSeg(x, z, b.p[i], b.p[(i + 1) % b.p.length]).d < pad) return true;
        }
      }
  return false;
}

export function nearestRoad(x, z, driveOnly = false) {
  let best = null,
    md = Infinity;
  for (const s of segments) {
    if (driveOnly && !s.drive) continue;
    let p = pointSeg(x, z, s.a, s.b);
    if (p.d < md) {
      md = p.d;
      best = { ...p, s };
    }
  }
  return best;
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
