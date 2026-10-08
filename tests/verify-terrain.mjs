import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createTerrain, flatTerrain, heightAt, loadTerrain } from '../web/js/world/terrain.js';
import { world } from '../web/js/core/state.js';
import { terrainGeometry } from '../web/js/world/terrain-mesh.js';
import { drapeTriangles, terrainEdge } from '../web/js/engine/terrain-drape.js';
import { groundHeightAt, surfaceHeightAt } from '../web/js/engine/terrain-sampling.js';
import { prepareTerrainPlacement } from '../web/js/world/terrain-placement.js';
import { sha256Hex } from '../web/js/world/corrections.js';

const city = { origin: [0, 0], size: [10, 10] },
  buffer = new ArrayBuffer(18),
  view = new DataView(buffer);
[0, 50, 100, 100, 200, 250, 200, 300, 400].forEach((v, i) => view.setInt16(i * 2, v, true));
const digest = async (b) => createHash('sha256').update(new Uint8Array(b)).digest('hex');
assert.equal(
  sha256Hex(new Uint8Array(buffer)),
  await digest(buffer),
  'SHA binario también funciona en HTTP de LAN sin Web Crypto',
);
const manifest = {
  version: 1,
  bounds: [-10, 10, -10, 10],
  ...city,
  columns: 3,
  rows: 3,
  step: [10, 10],
  encoding: 'int16-le',
  scale: 0.1,
  rowOrder: 'north-to-south',
  diagonal: 'nw-se',
  file: 'terrain.bin',
  sha256: await digest(buffer),
  referenceElevation: 5,
};
const terrain = createTerrain(manifest, buffer, city);
assert.equal(heightAt(flatTerrain, 0, 0), 0);
assert.throws(() => heightAt(terrain, NaN, 0), /finita/);
for (const [x, z, y] of [
  [-10, -10, 0],
  [10, -10, 10],
  [-10, 10, 20],
  [10, 10, 40],
  [0, 0, 20],
  [5, -5, 15],
  [-5, 5, 20],
  [50, 50, 40],
  [-50, -50, 0],
])
  assert.equal(heightAt(terrain, x, z), y);
for (const patch of [
  { version: 2 },
  { file: '../terrain.bin' },
  { origin: [1, 0] },
  { size: [11, 10] },
  { rows: 1 },
  { rows: 1e9 },
  { encoding: 'int16-be' },
  { scale: 1 },
  { diagonal: 'ne-sw' },
  { rowOrder: 'south-to-north' },
  { step: [5, 10] },
  { referenceElevation: NaN },
])
  assert.throws(() => createTerrain({ ...manifest, ...patch }, buffer, city), /incompatible/);
assert.throws(() => createTerrain(manifest, new ArrayBuffer(6), city), /incompatible/);
const response = { ok: true, json: async () => manifest },
  binary = { ok: true, arrayBuffer: async () => buffer };
assert.equal(
  (await loadTerrain(async (f) => (f.endsWith('json') ? response : binary), city, digest)).terrain
    .kind,
  'grid',
);
assert.equal(
  (await loadTerrain(async () => ({ ok: false, status: 404 }), city, digest)).terrain,
  flatTerrain,
);
assert.match(
  (
    await loadTerrain(
      async () => {
        throw Error('red');
      },
      city,
      digest,
    )
  ).warning,
  /plano/,
);
await assert.rejects(
  loadTerrain(
    async () => ({
      ok: true,
      json: async () => {
        throw Error('mal');
      },
    }),
    city,
    digest,
  ),
  /inválido/,
);
await assert.rejects(
  loadTerrain(async () => ({ ok: true, json: async () => null }), city, digest),
  /incompatible/,
);
await assert.rejects(
  loadTerrain(
    async (f) => (f.endsWith('json') ? response : { ok: false, status: 404 }),
    city,
    digest,
  ),
  /binario/,
);
await assert.rejects(
  loadTerrain(
    async (f) => (f.endsWith('json') ? response : binary),
    city,
    async () => '0'.repeat(64),
  ),
  /Checksum/,
);
const unavailable = await loadTerrain(
  async (f) => {
    if (f.endsWith('bin')) throw Error('red');
    return response;
  },
  city,
  digest,
);
assert.equal(unavailable.terrain, flatTerrain);
world.terrain = terrain;
world.worldW = 10;
world.worldH = 10;
const geometry = terrainGeometry(terrain);
assert.equal(geometry.index.count, 24);
const normals = geometry.getAttribute('normal');
for (let i = 0; i < normals.count; i++) assert(normals.getY(i) > 0);
const draped = drapeTriangles([-5, 0.1, -5, 5, 0.1, -5, -5, 0.1, 5], [0, 0, 1, 0, 0, 1]);
assert.equal(draped.position.length / 3, draped.uv.length / 2);
for (let k = 0; k < draped.position.length; k += 3)
  assert(
    Math.abs(
      draped.position[k + 1] - 0.1 - groundHeightAt(draped.position[k], draped.position[k + 2]),
    ) < 1e-5,
  );
assert(
  terrainEdge([-5, 0], [5, 0]).some((p) => p[0] === 0 && p[1] === 0),
  'arista se corta en diagonal',
);
world.city = {
  ...city,
  roads: [
    {
      id: 'bridge',
      bridge: true,
      p: [
        [-5, 0],
        [5, 0],
      ],
      w: 2,
    },
  ],
  buildings: [],
  landmarks: [],
  areas: [],
};
const bridgeBuffer = new ArrayBuffer(18),
  bridgeView = new DataView(bridgeBuffer);
[100, 100, 100, 100, 50, 50, 100, 50, 0].forEach((v, i) => bridgeView.setInt16(i * 2, v, true));
world.terrain = createTerrain(manifest, bridgeBuffer, city);
assert.throws(() => prepareTerrainPlacement(), /Terreno real requiere terrainSurfaces/);
world.cityDesign = {
  terrainSurfaces: {
    version: 1,
    roads: {
      sampleStep: 2,
      pavementStep: 4,
      meshSubdivisions: 2,
      smoothingRadius: 12,
      shoulder: 3,
      bridgeAnchorRadius: 2,
    },
    water: {
      percentile: 0.2,
      bedDepth: 0.8,
      shoreWidth: 2,
      axis: 'z',
      sliceLength: 10,
      maximumSlope: 0.005,
    },
    platforms: [],
  },
};
prepareTerrainPlacement();
assert(
  Math.abs(surfaceHeightAt(0, 0) - (surfaceHeightAt(-5, 0) + surfaceHeightAt(5, 0)) / 2) < 1e-12,
  'tablero interpolado entre accesos estabilizados',
);
assert(groundHeightAt(0, 0) < surfaceHeightAt(0, 0), 'terreno construido bajo tablero');
assert.equal(surfaceHeightAt(0, 4), groundHeightAt(0, 4));
console.log(
  'Terrain contract, triangular interpolation, clipping, errors and single surface model passed',
);

const { gridX, gridZ, gridColumn, gridRow } = await import('../web/js/world/terrain.js');
const shifted = { bounds: [20, 40, -30, -10], step: [10, 10] };
assert.equal(gridX(shifted, 1), 30);
assert.equal(gridZ(shifted, 1), -20);
assert.equal(gridColumn(shifted, 25), 0.5);
assert.equal(gridRow(shifted, -15), 1.5);
assert.throws(
  () => createTerrain({ ...manifest, bounds: [0, 10, 0, 10] }, buffer, city),
  /incompatible/,
);

for (const bounds of [
  [-4, 10, -10, 10],
  [-10, 4, -10, 10],
  [-10, 10, -4, 10],
  [-10, 10, -10, 4],
  [-11, 9, -10, 10],
])
  assert.throws(() => createTerrain({ ...manifest, bounds }, buffer, city), /incompatible/);
const asymmetric = { ...manifest, bounds: [-10, 30, -20, 20], step: [20, 20] };
// La esquina X debe estar anclada también: esta rejilla se rechaza.
assert.throws(() => createTerrain(asymmetric, buffer, city), /incompatible/);
const covering = { ...manifest, bounds: [-20, 20, -20, 20], step: [20, 20] };
assert.equal(createTerrain(covering, buffer, city).heightAt(0, 0), 20);
const nonCentered = { ...manifest, bounds: [-10, 20, -10, 10], columns: 4 };
assert.equal(createTerrain(nonCentered, new ArrayBuffer(24), city).heightAt(15, 5), 0);
