// Resuelve la variación al preparar los datos; el navegador solo recibe paletteIndex.
import { createHash } from 'node:crypto';

// Identidad geométrica: independiente de orden, orientación, plantas y diseño de fachada.
export function buildingIdentity(b) {
  const canonicalRing = (ring) => {
    const points = ring.slice();
    if (points.length > 1 && JSON.stringify(points[0]) === JSON.stringify(points.at(-1)))
      points.pop();
    // Solo un vértice mínimo puede iniciar el anillo canónico; evita crear n rotaciones.
    const labels = points.map((point) => JSON.stringify(point));
    const minimum = labels.reduce((a, b) => (a < b ? a : b));
    const rotations = [];
    for (const direction of [points, [...points].reverse()])
      for (let i = 0; i < direction.length; i++)
        if (JSON.stringify(direction[i]) === minimum)
          rotations.push(JSON.stringify([...direction.slice(i), ...direction.slice(0, i)]));
    return rotations.sort()[0];
  };
  return createHash('sha256')
    .update(JSON.stringify([canonicalRing(b.p), b.holes.map(canonicalRing).sort()]))
    .digest('hex');
}

export function buildingPaletteIndex(b, rules, paletteAssignments) {
  const key = buildingIdentity(b);
  return (
    paletteAssignments[key] ??
    Math.floor(randomForKey(key, rules.variation.seed) * rules.palette.length)
  );
}

export function randomForKey(key, seed) {
  let hash = seed >>> 0;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

export function resolveBuildingVariation(buildings, rules, catalogue) {
  if (
    catalogue?.version !== 1 ||
    !catalogue.paletteAssignments ||
    typeof catalogue.paletteAssignments !== 'object' ||
    Array.isArray(catalogue.paletteAssignments) ||
    !Number.isInteger(rules.variation.seed) ||
    rules.variation.seed < 0 ||
    rules.variation.seed > 0xffffffff
  )
    throw Error('Catálogo o semilla de variación incompatible');
  for (const [key, index] of Object.entries(catalogue.paletteAssignments))
    if (
      !/^[0-9a-f]{64}$/.test(key) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= rules.palette.length
    )
      throw Error('Asignación de paleta incompatible: ' + key);
  return buildings.map((b) => ({
    ...b,
    paletteIndex: buildingPaletteIndex(b, rules, catalogue.paletteAssignments),
  }));
}
