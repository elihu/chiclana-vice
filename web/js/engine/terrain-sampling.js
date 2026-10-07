// Referencia vertical compartida; sin DOM, geometrías ni asignaciones por actor.
import { world } from '../core/state.js';

const tilt = (value) => Math.max(-Math.PI / 12, Math.min(Math.PI / 12, value));

export function surfaceCeilingAt(x, z, reference) {
  return world.surfaces?.ceilingAt(x, z, reference) ?? Infinity;
}

export function groundHeightAt(x, z) {
  if (world.surfaces) return world.surfaces.groundHeightAt(x, z);
  return world.terrain ? world.terrain.heightAt(x, z) : 0;
}

export function surfaceHeightAt(x, z, reference = null, roadId = null) {
  if (world.surfaces) return world.surfaces.surfaceHeightAt(x, z, reference, roadId);
  let y = groundHeightAt(x, z);
  const cell = world.bridgeGrid?.get(Math.floor(x / 25) * 65536 + Math.floor(z / 25));
  if (!cell) return y;
  for (const s of cell) {
    const u = ((x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz) / (s.length * s.length);
    if (u < 0 || u > 1) continue;
    const distance = Math.abs((x - s.a[0]) * s.dz - (z - s.a[1]) * s.dx) / s.length;
    if (distance <= s.width / 2) y = Math.max(y, s.y0 + u * (s.y1 - s.y0));
  }
  return y;
}

// Euler YXZ mantiene rumbo; inclinación visual limitada a 15° (sin física nueva).
export function placeVehicle(c) {
  const y = surfaceHeightAt(c.x, c.z, c.surfaceY ?? null, c.surfaceRoad ?? null),
    sin = Math.sin(c.a),
    cos = Math.cos(c.a);
  c.surfaceY = y;
  const front = surfaceHeightAt(c.x + sin * 1.4, c.z + cos * 1.4, y),
    rear = surfaceHeightAt(c.x - sin * 1.4, c.z - cos * 1.4, y),
    right = surfaceHeightAt(c.x + cos * 0.7, c.z - sin * 0.7, y),
    left = surfaceHeightAt(c.x - cos * 0.7, c.z + sin * 0.7, y);
  c.mesh.position.set(c.x, y, c.z);
  c.mesh.rotation.set(
    tilt(-Math.atan2(front - rear, 2.8)),
    c.a,
    tilt(Math.atan2(right - left, 1.4) + (c.bank ?? 0)),
    'YXZ',
  );
}
