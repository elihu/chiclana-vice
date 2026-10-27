// Capa de usos de los bajos: formato, índices válidos y huellas de contorno coincidentes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const layer = JSON.parse(fs.readFileSync('web/ground-floors.json'));
const city = JSON.parse(fs.readFileSync('web/buildings.json'));
const world = JSON.parse(fs.readFileSync('web/world.json'));
assert.equal(layer.version, 1);
assert(layer.source && layer.license && layer.attribution);
assert.deepEqual(layer.origin, world.origin);
assert.equal(
  layer.buildingsSha256,
  createHash('sha256').update(fs.readFileSync('web/buildings.json')).digest('hex'),
  'ground-floors.json se regenera con buildings.json',
);
assert(Array.isArray(layer.uses) && layer.uses.every((u) => typeof u === 'string'));
assert.equal(layer.parts.length, city.buildings.length, 'una entrada por parte, en su orden');
for (const [k, part] of layer.parts.entries()) {
  if (part === null) continue;
  assert(Array.isArray(part) && part.length === 3, `parte ${k}`);
  const [use, units, dwellings] = part;
  assert(Number.isInteger(use) && use >= 0 && use < layer.uses.length, `uso de la parte ${k}`);
  assert(Number.isInteger(units) && units >= 0 && Number.isInteger(dwellings) && dwellings >= 0);
}
assert(layer.parts.some(Boolean));
const inside = (x, z) =>
  world.bounds.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
assert(layer.shops.length > 0);
for (const [x, z, kind] of layer.shops) {
  assert(
    Number.isFinite(x) && Number.isFinite(z) && typeof kind === 'string' && kind.includes(':'),
  );
  assert(inside(x, z), `comercio fuera del mundo ${x},${z}`);
}
console.log(
  `Bajos: ${layer.parts.filter(Boolean).length} partes con datos y ${layer.shops.length} comercios dentro del mundo`,
);
