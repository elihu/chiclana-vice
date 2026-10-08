import assert from 'node:assert/strict';
import { world } from '../web/js/core/state.js';
import {
  boundsBox,
  insideBounds,
  nearEdge,
  validBounds,
  worldBounds,
} from '../web/js/world/bounds.js';
import { loadWorld } from '../web/js/world/loader.js';

const bounds = [
    [-20, -10, 5, 15],
    [10, 30, -5, 20],
  ],
  previousCity = world.city;
world.city = { bounds };
try {
  assert(validBounds(bounds));
  assert(insideBounds(-15, 10));
  assert(insideBounds(20, 10));
  assert(insideBounds(-20, 5), 'el contorno está incluido');
  assert(!insideBounds(0, 10), 'el hueco no es jugable');
  assert(!insideBounds(40, 10));
  assert(!insideBounds(-19, 10, 2), 'margen interior');
  assert(insideBounds(-18, 10, 2), 'borde del margen incluido');
  assert(!insideBounds(-18, 10, 2, bounds, false), 'mobiliario conserva margen estricto');
  assert(insideBounds(-21, 10, -2), 'margen exterior');
  assert(!insideBounds(NaN, 10));
  assert(nearEdge(-19, 10, 2));
  assert(!nearEdge(-15, 10, 2));
  assert(nearEdge(0, 10, 2), 'hueco fuera del margen seguro');
  assert.deepEqual(boundsBox(), [-20, 30, -5, 20]);
} finally {
  world.city = previousCity;
}

// El margen se mide hasta el borde de la unión, no de cada rectángulo.
const touching = [
    [0, 100, 0, 100],
    [100, 200, 0, 100],
  ],
  overlapping = [
    [0, 104, 0, 100],
    [100, 200, 0, 100],
  ],
  // L: el brazo inferior derecho deja un rincón cóncavo en (100, 100).
  ell = [
    [0, 100, 0, 200],
    [100, 200, 100, 200],
  ];
for (const b of [touching, overlapping])
  for (const x of [95, 99, 100, 101, 105]) {
    assert(insideBounds(x, 50, 5, b), `costura sin muro en x=${x}`);
    assert(insideBounds(x, 50, 3, b, false), `costura estricta en x=${x}`);
    assert(!nearEdge(x, 50, 30, b), `costura sin aviso en x=${x}`);
  }
assert(insideBounds(100, 50, 0, touching, false), 'la costura es interior a la unión');
assert(!insideBounds(100, 0, 0, touching, false), 'el borde exterior no es interior');
assert(insideBounds(100, 0, 0, touching), 'el borde exterior sí pertenece');
assert(!insideBounds(100, 3, 5, touching), 'margen exterior junto a la costura');
assert(insideBounds(100, 5, 5, touching), 'borde del margen incluido en la costura');
assert(!insideBounds(100, 5, 5, touching, false), 'y excluido en modo estricto');
assert(!insideBounds(200, 50, 0, touching, false));
assert(!insideBounds(103, 97, 5, ell), 'rincón cóncavo: el cuadrado asoma fuera');
assert(insideBounds(95, 105, 5, ell), 'rincón cóncavo cubierto por los dos brazos');
assert(insideBounds(100, 150, 5, ell) && insideBounds(150, 105, 5, ell));
assert(!insideBounds(150, 103, 5, ell), 'margen del brazo inferior');
assert(!insideBounds(NaN, 50, 5, touching));
assert(insideBounds(-2, 50, -3, touching), 'margen negativo por rectángulo');

for (const invalid of [null, [], [[0, 0, 0, 1]], [[1, 0, 0, 1]], [[0, 1, 0, NaN]], [[0, 1, 2]]])
  assert(!validBounds(invalid));
assert.deepEqual(worldBounds({ size: [40, 30] }), [[-20, 20, -15, 15]]);
assert.equal(worldBounds({ size: [-1, 30] }), null);
assert.equal(worldBounds({ bounds, size: [40, 30] }), bounds, 'bounds tiene prioridad');

// Compatibilidad del cargador completo; sin DOM ni solicitudes de red.
const previousFetch = globalThis.fetch,
  manifest = {
    version: 1,
    origin: [0, 0],
    files: { buildings: 'buildings.json', osm: 'osm.json' },
  },
  layers = {
    'buildings.json': { version: 1, origin: [0, 0], buildings: [] },
    'osm.json': { version: 1, origin: [0, 0], roads: [], areas: [] },
    'map-corrections.json': {
      version: 1,
      license: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors',
      corrections: [],
    },
  };
let limits;
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () =>
    url.startsWith('world.json') ? { ...manifest, ...limits } : layers[url.split('?')[0]],
});
try {
  limits = { bounds };
  assert.deepEqual((await loadWorld()).bounds, bounds);
  limits = { size: [40, 30] };
  assert.deepEqual((await loadWorld()).bounds, [[-20, 20, -15, 15]]);
  for (const invalid of [[], [[0, 0, 0, 1]], [[0, 1, 0, NaN]]]) {
    limits = { bounds: invalid, size: [40, 30] };
    await assert.rejects(loadWorld(), /incompatibles/);
  }
} finally {
  globalThis.fetch = previousFetch;
}
console.log('Rectángulos: unión, hueco, márgenes, caja, validación y cargador antiguo verificados');
