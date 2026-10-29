// Capa de vallas y muros: formato, tipos conocidos, atribución y que todo caiga dentro del mundo.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const layer = JSON.parse(fs.readFileSync('web/barriers.json'));
const world = JSON.parse(fs.readFileSync('web/world.json'));
assert.equal(layer.version, 1);
assert(layer.source && layer.license && layer.attribution);
assert(layer.license.includes('ODbL'), 'la licencia de barriers.json es ODbL');
assert.deepEqual(layer.origin, world.origin);
const KINDS = ['wall', 'fence', 'hedge', 'city_wall', 'retaining_wall'];
const inside = (x, z) =>
  world.bounds.some(
    ([x0, x1, z0, z1]) => x >= x0 - 0.01 && x <= x1 + 0.01 && z >= z0 - 0.01 && z <= z1 + 0.01,
  );
const point = (p, what) => {
  assert(Array.isArray(p) && p.length === 2 && p.every(Number.isFinite), what);
  assert(inside(p[0], p[1]), `${what} fuera del mundo ${p}`);
};
const ids = new Set();
assert(layer.lines.length > 0);
const meters = {};
for (const line of layer.lines) {
  assert(typeof line.id === 'string' && line.id && !ids.has(line.id), `id repetido ${line.id}`);
  ids.add(line.id);
  assert(KINDS.includes(line.kind), `tipo desconocido ${line.kind}`);
  assert(line.p.length >= 2, `trazo ${line.id} con menos de dos puntos`);
  line.p.forEach((p, i) => point(p, `punto ${i} de ${line.id}`));
  for (let i = 1; i < line.p.length; i++)
    meters[line.kind] =
      (meters[line.kind] ?? 0) +
      Math.hypot(line.p[i][0] - line.p[i - 1][0], line.p[i][1] - line.p[i - 1][1]);
}
for (const gate of layer.gates) point(gate, 'puerta');
console.log(
  `Vallas: ${layer.lines.length} trazos (` +
    Object.entries(meters)
      .map(([k, m]) => `${k} ${Math.round(m)} m`)
      .join(', ') +
    `) y ${layer.gates.length} puertas`,
);
