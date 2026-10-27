// Capa del tranvía: formato, atribución y que todo caiga dentro de los límites del mundo.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const layer = JSON.parse(fs.readFileSync('web/tram.json'));
const world = JSON.parse(fs.readFileSync('web/world.json'));
assert.equal(layer.version, 1);
assert(layer.source && layer.license && layer.attribution);
assert(layer.license.includes('ODbL'), 'la licencia de tram.json es ODbL');
assert.deepEqual(layer.origin, world.origin);
const inside = (x, z) =>
  world.bounds.some(
    ([x0, x1, z0, z1]) => x >= x0 - 0.01 && x <= x1 + 0.01 && z >= z0 - 0.01 && z <= z1 + 0.01,
  );
const point = (p, what) => {
  assert(Array.isArray(p) && p.length === 2 && p.every(Number.isFinite), what);
  assert(inside(p[0], p[1]), `${what} fuera del mundo ${p}`);
};
const ids = new Set();
const unique = (id) => {
  assert(typeof id === 'string' && id && !ids.has(id), `id repetido o vacío ${id}`);
  ids.add(id);
};
assert(layer.tracks.length > 0);
let meters = 0;
for (const t of layer.tracks) {
  unique('track:' + t.id);
  assert.equal(typeof t.bridge, 'boolean');
  assert(t.gauge > 1 && t.gauge < 2, `ancho de vía ${t.gauge}`);
  assert(t.p.length >= 2);
  t.p.forEach((p, i) => point(p, `vía ${t.id}[${i}]`));
  for (let i = 1; i < t.p.length; i++)
    meters += Math.hypot(t.p[i][0] - t.p[i - 1][0], t.p[i][1] - t.p[i - 1][1]);
}
const platforms = new Set();
for (const p of layer.platforms) {
  unique('platform:' + p.id);
  platforms.add(p.id);
  assert(p.p.length >= 3);
  p.p.forEach((q, i) => point(q, `andén ${p.id}[${i}]`));
}
for (const s of layer.stops) {
  unique('stop:' + s.id);
  assert(typeof s.name === 'string' && s.name, 'la parada tiene nombre');
  point([s.x, s.z], `parada ${s.id}`);
  assert(s.platform === null || platforms.has(s.platform), `andén de la parada ${s.id}`);
}
for (const c of layer.crossings) {
  unique('crossing:' + c.id);
  assert(['level', 'pedestrian'].includes(c.kind));
  point([c.x, c.z], `cruce ${c.id}`);
}
console.log(
  `Tranvía: ${layer.tracks.length} tramos (${Math.round(meters)} m), ${layer.stops.length} paradas, ${layer.platforms.length} andenes, ${layer.crossings.length} cruces`,
);
