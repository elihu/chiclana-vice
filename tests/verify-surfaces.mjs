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
const retained = { surfaceY: 0, surfaceSupport: 'road:upper' };
assert.equal(
  model.actorHeightAt(retained, 0, 0),
  4,
  'soporte persistente no salta al paso inferior',
);
const lowerActor = { surfaceY: 0 };
assert.equal(
  model.actorHeightAt(lowerActor, 0, 0),
  0,
  'cruce inferior no adquiere tablero por proximidad',
);
const thick = structuredClone(design);
thick.platforms[0].thickness = 0.8;
const thickModel = createSurfaceModel(city, terrain, thick);
assert.equal(thickModel.ceilingAt(0, 0, 0), 3.2, 'techo coincide con cara inferior estructural');
for (const list of model.profiles.values())
  for (const s of list) {
    if (s.bridge) continue;
    for (const t of [0, 0.25, 0.5, 0.75, 1])
      for (const side of [-0.98, 0, 0.98]) {
        const x = s.a[0] + s.dx * t - (((s.dz / s.length) * s.width) / 2) * side;
        const z = s.a[1] + s.dz * t + (((s.dx / s.length) * s.width) / 2) * side;
        assert(
          model.groundHeightAt(x, z) < s.y0 + (s.y1 - s.y0) * t,
          'suelo y ortofoto debajo del pavimento opaco',
        );
      }
  }
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
assert(
  Math.abs(model.groundHeightAt(-35, -35) - raw(-35, -35)) < 1e-6,
  'conserva terreno fuera de corredores en la rejilla Float32',
);
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

// Una T interior y una cadena corta heredan el acceso estructural sin depender del orden.
{
  const junctionCity = {
    roads: [
      {
        id: 'deck',
        bridge: true,
        w: 2,
        p: [
          [-8, 0],
          [0, 0],
        ],
      },
      {
        id: 'tee',
        w: 2,
        p: [
          [0, -10],
          [0, 0],
          [0, 10],
        ],
      },
      {
        id: 'chain-a',
        w: 2,
        p: [
          [0, 0],
          [3, 0],
        ],
      },
      {
        id: 'chain-b',
        w: 2,
        p: [
          [3, 0],
          [6, 0],
        ],
      },
      {
        id: 'chain-c',
        w: 2,
        p: [
          [6, 0],
          [9, 0],
        ],
      },
      {
        id: 'split',
        w: 2,
        p: [
          [9, 0],
          [12, 0],
        ],
      },
      {
        id: 'split',
        w: 2,
        p: [
          [12, 0],
          [15, 0],
        ],
      },
    ],
    areas: [],
  };
  const fixtureDesign = structuredClone(design);
  fixtureDesign.platforms = [];
  const fixtureTerrain = { ...terrain, heightAt: (x, z) => Math.sin(x * 0.3) + Math.cos(z * 0.5) };
  const a = createSurfaceModel(junctionCity, fixtureTerrain, fixtureDesign);
  const b = createSurfaceModel(
    { ...junctionCity, roads: [...junctionCity.roads].reverse() },
    fixtureTerrain,
    fixtureDesign,
  );
  for (const [x, z, ids] of [
    [0, 0, ['deck', 'tee', 'chain-a']],
    [3, 0, ['chain-a', 'chain-b']],
    [6, 0, ['chain-b', 'chain-c']],
    [9, 0, ['chain-c', 'split']],
  ]) {
    const ys = ids.map((id) => a.roadAt(x, z, id).y);
    assert(Math.max(...ys) - Math.min(...ys) < 1e-9, 'unión al mismo nivel');
    for (const id of ids)
      assert(
        Math.abs(a.roadAt(x, z, id).y - b.roadAt(x, z, id).y) < 1e-9,
        'orden de vías independiente',
      );
  }
  assert(
    a.roadAt(6, 0, 'chain-b').y !== fixtureTerrain.heightAt(6, 0),
    'propaga más allá de un salto',
  );
  assert(a.roadAt(14, 0, 'split'), 'no sobrescribe la primera aparición de una vía dividida');
  const list = a.profiles.get('chain-a');
  for (const segment of list)
    assert(Math.abs(segment.y1 - segment.y0) < 1, 'transición de cadena acotada');
}
