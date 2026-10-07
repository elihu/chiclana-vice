import assert from 'node:assert/strict';
import { createSurfaceModel, validateSurfaceDesign } from '../web/js/engine/surface-model.js';
import { placeVehicle } from '../web/js/engine/terrain-sampling.js';
import { world, waterAreas, streetEnvironment } from '../web/js/core/state.js';
import { blocked } from '../web/js/world/spatial.js';
import * as THREE from '../web/vendor/three.module.min.js';

// Escenario independiente de Chiclana: rampa, calzada ondulada y dos niveles cruzados.
const city = {
  roads: [
    {
      id: 'lower',
      p: [
        [-30, 0],
        [30, 0],
      ],
      w: 6,
    },
    {
      id: 'upper',
      p: [
        [0, -30],
        [0, 30],
      ],
      w: 6,
      bridge: true,
    },
    {
      id: 'road',
      p: [
        [-20, -30],
        [-20, 30],
      ],
      w: 6,
    },
  ],
  areas: [
    {
      kind: 'square',
      p: [
        [-10, -8],
        [10, -8],
        [10, 8],
        [-10, 8],
      ],
    },
    {
      kind: 'water',
      p: [
        [20, -30],
        [27, -30],
        [27, 10],
        [20, 10],
      ],
    },
  ],
};
const raw = (x, z) => x * 0.01 + (x < -15 ? Math.sin(z * 0.8) : 0) - (x > 20 && x < 27 ? 3 : 0),
  terrain = {
    kind: 'grid',
    heightAt: raw,
    manifest: { size: [80, 80], columns: 17, rows: 17, step: [5, 5] },
  };
const design = {
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
  platforms: [
    {
      id: 'platform',
      areaAnchor: { kind: 'square', vertex: [-10, -8], vertexCount: 4 },
      heightAnchors: [
        { roadId: 'upper', vertex: 0, offset: 4 },
        { roadId: 'upper', vertex: 1, offset: 4 },
      ],
      deckRoads: ['upper'],
      lowerRoads: ['lower'],
      clearance: 3.2,
      evidence: ['fixture sintético de dos niveles'],
    },
  ],
};
assert.deepEqual(validateSurfaceDesign(design, city), []);
const model = createSurfaceModel(city, terrain, design);
assert.equal(model.surfaceHeightAt(0, 0, 0), 0, 'continuidad inferior');
assert.equal(model.surfaceHeightAt(0, 0, 4), 4, 'continuidad superior');
assert.equal(model.surfaceHeightAt(0, 0, null, 'lower'), 0, 'anclaje de ruta inferior');
assert.equal(model.surfaceHeightAt(0, 0, null, 'upper'), 4, 'anclaje de ruta superior');
assert.equal(model.ceilingAt(0, 0, 0), 3.88);
assert.equal(model.ceilingAt(0, 0, 4), Infinity);
let previous = 0;
for (let x = -25; x <= 25; x += 0.25) {
  const y = model.surfaceHeightAt(x, 0, previous, 'lower');
  assert(Math.abs(y - previous) < 0.5, 'paso inferior sin salto al tablero');
  previous = y;
}
const oscillation = (values) => Math.max(...values) - Math.min(...values);
const samples = Array.from({ length: 41 }, (_, i) => i - 20),
  original = samples.map((z) => raw(-20, z) + 0.2),
  filtered = samples.map((z) => model.surfaceHeightAt(-20, z, null, 'road') + 0.2);
assert(oscillation(filtered) < oscillation(original) * 0.4, 'se atenúan bultos de la calzada');
assert.equal(model.groundHeightAt(-35, -35), raw(-35, -35), 'conserva terreno fuera de corredores');
assert(model.groundHeightAt(23, -10) < model.waterHeightAt(23, -10), 'lecho debajo del agua');
assert(
  Math.abs(model.waterHeightAt(23, -10) - model.waterHeightAt(23, 0)) <= 0.051,
  'agua por tramos con pendiente limitada',
);
for (const y of [0, 4]) {
  world.surfaces = model;
  const car = { x: 0, z: 0, a: 0, surfaceY: y, mesh: new THREE.Group() };
  placeVehicle(car);
  assert.equal(car.mesh.position.y, y, 'coche conserva nivel');
  assert(car.mesh.rotation.toArray().slice(0, 3).every(Number.isFinite));
}
world.surfaces = null;
world.surfaces = model;
world.worldW = 80;
world.worldH = 80;
waterAreas.push({ p: city.areas[0].p });
streetEnvironment.colliders.push({ x: 0, z: 0, r: 1, y: 4 });
assert.equal(
  blocked(0, 0, 0.3, 0),
  false,
  'paso inferior seco ignora obstáculo superior y máscara de agua',
);
assert.equal(blocked(0, 0, 0.3, 4), true, 'obstáculo del propio nivel sigue bloqueando');
streetEnvironment.colliders.length = 0;
assert.equal(blocked(0, 0, 0.3, 4), false, 'interior de plataforma transitable sobre agua');
waterAreas.length = 0;
world.surfaces = null;
const invalid = structuredClone(design);
invalid.platforms[0].lowerRoads = ['missing'];
assert(validateSurfaceDesign(invalid, city).some((e) => e.includes('vía inexistente')));
const changed = structuredClone(city);
changed.areas[0].p[0] = [-11, -8];
assert(validateSurfaceDesign(design, changed).some((e) => e.includes('área modificada')));
assert.throws(() => createSurfaceModel(changed, terrain, design), /Diseño vertical incompatible/);
assert.equal(createSurfaceModel(city, { kind: 'flat' }, design), null, 'modo plano intacto');
console.log('Superficies genéricas: rampa, calzada suave, agua y paso inferior/superior pasaron');
