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
