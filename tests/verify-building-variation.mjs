// El aspecto de un edificio no depende del orden ni de la clasificación de sus vecinos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  buildingIdentity,
  buildingPaletteIndex,
  randomForKey,
  resolveBuildingVariation,
} from '../tools/building-variation.mjs';
import { rnd, setRandomSeed } from '../web/js/core/random.js';

const a = {
  p: [
    [0, 0],
    [6, 0],
    [6, 8],
    [0, 8],
  ],
  holes: [],
};
const b = {
  p: [
    [20, 0],
    [26, 0],
    [26, 8],
    [20, 8],
  ],
  holes: [],
};
const rules = {
  palette: ['#ffffff', '#aaaaaa', '#bbbbbb'],
  variation: { seed: 23 },
};
const assignments = {};
const key = buildingIdentity(a);
assert.equal(buildingIdentity({ ...a, p: [...a.p.slice(2), ...a.p.slice(0, 2)] }), key);
assert.equal(buildingIdentity({ ...a, p: [...a.p].reverse() }), key);
assert.equal(buildingIdentity({ ...a, p: [...a.p, a.p[0]] }), key);
assert.equal(buildingIdentity({ ...a, floors: 3, h: 8, detailType: 'church' }), key);
assert.notEqual(buildingIdentity(b), key);
const courtyard = {
  ...a,
  holes: [
    [
      [1, 1],
      [2, 1],
      [2, 2],
    ],
  ],
};
assert.notEqual(buildingIdentity(courtyard), key);
const colors = [a, b].map((building) => buildingPaletteIndex(building, rules, assignments));
assert.deepEqual(
  [b, { ...a, detailType: 'church' }].map((building) =>
    buildingPaletteIndex(building, rules, assignments),
  ),
  [...colors].reverse(),
);
assignments[key] = 2;
assert.equal(buildingPaletteIndex(a, rules, assignments), 2);
assert.equal(buildingPaletteIndex({ ...a, detailType: 'church' }, rules, assignments), 2);
const repeat = randomForKey(key, 23);
assert(repeat >= 0 && repeat < 1);
assert.equal(randomForKey(key, 23), repeat);
assert.notEqual(randomForKey(key, 24), repeat);
setRandomSeed(123);
const expected = [rnd(), rnd(), rnd()];
setRandomSeed(123);
const actual = [rnd()];
for (const building of [a, b, { ...a, detailType: 'church' }, courtyard])
  buildingPaletteIndex(building, rules, assignments);
actual.push(rnd(), rnd());
assert.deepEqual(actual, expected, 'ningún edificio consume la secuencia del entorno');
setRandomSeed(7631);
console.log(
  'Variación por identidad: orden, orientación, patios, clasificación y aislamiento del azar OK',
);

// Referencia capturada antes de sacar el cálculo del navegador (commit 60c3e7a).
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const baseline = read('source-data/building-variation-baseline.json');
const parts = read('web/buildings.json').buildings;
const design = read('web/city-design.json');
const catalogue = read('source-data/building-variation.json');
assert.equal(parts.length, baseline.count);
assert.equal(
  createHash('sha256').update(JSON.stringify(baseline.indices)).digest('hex'),
  baseline.sha256,
);
assert.deepEqual(
  parts.map((b) => b.paletteIndex),
  baseline.indices,
  'todos los índices coinciden con la rama antes de la migración',
);
assert.deepEqual(
  resolveBuildingVariation(parts, design.buildings, catalogue).map((b) => b.paletteIndex),
  baseline.indices,
  'el generador reproduce los índices publicados',
);
assert.equal(design.randomSeed, baseline.randomSeed, 'la semilla del entorno no cambia');
assert(!('paletteAssignments' in design.buildings.variation), 'el catálogo no se publica');
assert.throws(
  () => resolveBuildingVariation([a], rules, { version: 1, paletteAssignments: { bad: 0 } }),
  /Asignación/,
);
assert.throws(
  () => resolveBuildingVariation([a], rules, { version: 1, paletteAssignments: { [key]: 3 } }),
  /Asignación/,
);
console.log(
  parts.length +
    ' índices de paleta idénticos a ' +
    baseline.revision +
    '; semilla del entorno conservada',
);

const probe = spawnSync(process.execPath, ['tests/verify-building-variation-environment.mjs'], {
  encoding: 'utf8',
  timeout: 120000,
});
assert.ifError(probe.error);
assert.equal(probe.status, 0, probe.stderr);
assert.deepEqual(
  JSON.parse(probe.stdout),
  baseline.environment,
  'vegetación inicial y 600 pasos de actores idénticos a la rama anterior',
);
console.log('Vegetación y actores conservados con randomSeed=' + design.randomSeed);
