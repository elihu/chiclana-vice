import { createHash } from 'node:crypto';

// Proyección explícita: conserva geografía y circulación, excluye créditos/checksums.
export function geographicHash(world) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        origin: world.origin,
        size: world.size,
        buildings: world.buildings.map((b) => [b.p, b.holes, b.floors]),
        roads: world.roads.map((r) => [r.p, r.name, r.type, r.w, !!r.bridge, !!r.oneway]),
        areas: world.areas,
        landmarks: world.landmarks,
        trees: world.trees,
      }),
    )
    .digest('hex');
}
