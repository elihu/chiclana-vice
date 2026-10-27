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
assert(Array.isArray(layer.parts) && layer.parts.length > 0);
const seen = new Set();
for (const part of layer.parts) {
  assert(
    Number.isInteger(part.i) && part.i >= 0 && part.i < city.buildings.length,
    `índice ${part.i}`,
  );
  assert(!seen.has(part.i), `índice repetido ${part.i}`);
  seen.add(part.i);
  assert.equal(
    part.sha256,
    createHash('sha256').update(JSON.stringify(city.buildings[part.i].p)).digest('hex'),
    `huella del contorno de la parte ${part.i}`,
  );
  assert.equal(typeof part.use, 'string');
  assert(Number.isInteger(part.units) && part.units >= 0);
  assert(Number.isInteger(part.dwellings) && part.dwellings >= 0);
}
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
  `Bajos: ${layer.parts.length} partes con huella válida y ${layer.shops.length} comercios dentro del mundo`,
);
