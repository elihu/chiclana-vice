import { boundsBox } from '../web/js/world/bounds.js';
import { createHash } from 'node:crypto';

// Proyección explícita: conserva geografía y circulación, excluye créditos/checksums.
export function geographicHash(world) {
  const box = boundsBox(world.bounds);
  // Conserva la referencia histórica de un único rectángulo centrado sin renovarla.
  // Cualquier desplazamiento, hueco o rectángulo adicional entra en la huella.
  const limits =
    world.bounds.length === 1 && box[0] === -box[1] && box[2] === -box[3]
      ? { size: [box[1] - box[0], box[3] - box[2]] }
      : { bounds: world.bounds };
  return createHash('sha256')
    .update(
      JSON.stringify({
        origin: world.origin,
        ...limits,
        buildings: world.buildings.map((b) => [b.p, b.holes, b.floors]),
        roads: world.roads.map((r) => [r.p, r.name, r.type, r.w, !!r.bridge, !!r.oneway]),
        areas: world.areas,
        landmarks: world.landmarks,
        trees: world.trees,
      }),
    )
    .digest('hex');
}
