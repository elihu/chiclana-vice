// El aspecto de un edificio no depende del orden ni de la clasificación de sus vecinos.
import assert from 'node:assert/strict';
import { buildingIdentity, buildingPaletteIndex } from '../web/js/world/buildings.js';
import { randomForKey, rnd, setRandomSeed } from '../web/js/core/random.js';

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
  variation: { seed: 23, paletteAssignments: {} },
};
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
const colors = [a, b].map((building) => buildingPaletteIndex(building, rules));
assert.deepEqual(
  [b, { ...a, detailType: 'church' }].map((building) => buildingPaletteIndex(building, rules)),
  [...colors].reverse(),
);
rules.variation.paletteAssignments[key] = 2;
assert.equal(buildingPaletteIndex(a, rules), 2);
assert.equal(buildingPaletteIndex({ ...a, detailType: 'church' }, rules), 2);
const repeat = randomForKey(key, 23);
assert(repeat >= 0 && repeat < 1);
assert.equal(randomForKey(key, 23), repeat);
assert.notEqual(randomForKey(key, 24), repeat);
setRandomSeed(123);
const expected = [rnd(), rnd(), rnd()];
setRandomSeed(123);
const actual = [rnd()];
for (const building of [a, b, { ...a, detailType: 'church' }, courtyard])
  buildingPaletteIndex(building, rules);
actual.push(rnd(), rnd());
assert.deepEqual(actual, expected, 'ningún edificio consume la secuencia del entorno');
setRandomSeed(7631);
console.log(
  'Variación por identidad: orden, orientación, patios, clasificación y aislamiento del azar OK',
);
