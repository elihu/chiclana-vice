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
for (const shop of layer.shops) {
  const [x, z, kind, name, brand] = shop;
  assert(
    Number.isFinite(x) && Number.isFinite(z) && typeof kind === 'string' && kind.includes(':'),
  );
  assert(inside(x, z), `comercio fuera del mundo ${x},${z}`);
  assert(
    shop.length === 4 || shop.length === 5,
    `comercio ${x},${z}: [x, z, tipo, nombre(, marca)]`,
  );
  assert(name === null || (typeof name === 'string' && name), `nombre del comercio ${x},${z}`);
  if (shop.length === 5) assert(typeof brand === 'string' && brand, `marca del comercio ${x},${z}`);
}
assert(
  layer.shops.some((s) => s[3]),
  'hay comercios con nombre',
);
assert.deepEqual(layer.zoneKinds, ['industrial', 'retail']);
assert.equal(layer.zones.length, city.buildings.length, 'un indicio de zona por parte');
assert(
  layer.zones.every((z) => Number.isInteger(z) && z >= 0 && z <= layer.zoneKinds.length),
  'indicios de zona válidos',
);
for (const f of layer.fuel) {
  assert(inside(f.x, f.z), `gasolinera fuera del mundo ${f.x},${f.z}`);
  assert(f.name === null || typeof f.name === 'string');
  assert(f.brand === null || typeof f.brand === 'string');
  assert(
    f.outline === null ||
      (f.outline.length >= 4 && f.outline.every((p) => p.length === 2 && p.every(Number.isFinite))),
    `contorno de la gasolinera ${f.x},${f.z}`,
  );
}
console.log(
  `Bajos: ${layer.parts.filter(Boolean).length} partes con datos, ${layer.shops.length} comercios ` +
    `(${layer.shops.filter((s) => s[3]).length} con nombre), ` +
    `${layer.zones.filter(Boolean).length} partes con indicio de zona y ${layer.fuel.length} gasolineras`,
);
