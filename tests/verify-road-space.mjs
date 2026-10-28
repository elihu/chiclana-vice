import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRoadSpace, carvePavement, roundaboutIslands } from '../web/js/world/road-space.js';
const nonDrive = ['pedestrian', 'footway', 'path', 'cycleway'];
const road = {
  id: 'calzada',
  type: 'residential',
  w: 4,
  p: [
    [0, -10],
    [0, 10],
  ],
};
const space = createRoadSpace([road], nonDrive, () => 5);
assert(space.covers(0, 0));
assert(!space.covers(3, 0));
assert(!space.covers(0, 0, 0, 1), 'un paso inferior no pertenece al tablero de arriba');
const triangle = [
  [-5, 5, -5, 0, 0],
  [5, 5, -5, 1, 0],
  [0, 5, 5, 0.5, 1],
];
const pieces = space.subtract(triangle, 5);
let retained = 0;
for (const p of pieces)
  for (let i = 1; i < p.length - 1; i++) {
    const [a, b, c] = [p[0], p[i], p[i + 1]],
      x = (a[0] + b[0] + c[0]) / 3,
      z = (a[2] + b[2] + c[2]) / 3;
    assert(!space.covers(x, z), 'ningún triángulo de acera pisa la calzada');
    retained += Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) / 2;
  }
assert(Math.abs(retained - 18) < 1e-7, 'conserva exactamente el área fuera de la carretera');
assert.deepEqual(space.subtract(triangle, 1), [triangle], 'el recorte conserva distintos niveles');
const layer = JSON.parse(fs.readFileSync('web/osm-world.json'));
const real = createRoadSpace(layer.roads, nonDrive);
const vega = layer.roads.find((r) => r.id === '184177554'),
  end = vega.p.at(-1),
  previous = vega.p.at(-2),
  dx = end[0] - previous[0],
  dz = end[1] - previous[1],
  len = Math.hypot(dx, dz),
  nx = (-dz / len) * 2.5,
  nz = (dx / len) * 2.5,
  vertices = [
    [end[0] + nx, 0, end[1] + nz],
    [end[0] - nx, 0, end[1] - nz],
    [previous[0] + nx, 0, previous[1] + nz],
  ];
const cut = carvePavement(vertices.flat(), [0, 0, 1, 0, 0, 1], real, () => 0);
for (let i = 0; i < cut.position.length; i += 9) {
  const x = (cut.position[i] + cut.position[i + 3] + cut.position[i + 6]) / 3,
    z = (cut.position[i + 2] + cut.position[i + 5] + cut.position[i + 8]) / 3;
  assert(!real.covers(x, z), 'La Vega termina ante la calzada de la Alameda');
}
const islands = roundaboutIslands(layer.roads);
assert(islands.length >= 5, 'se reconstruyen las glorietas cartografiadas por tramos');
for (const island of islands)
  for (const [x, z] of island.polygon) assert(!real.covers(x, z), 'isleta dentro de su anillo');
console.log(
  'Calzadas: recorte exacto, niveles, cruce Alameda/Vega y ' +
    islands.length +
    ' isletas verificados',
);
