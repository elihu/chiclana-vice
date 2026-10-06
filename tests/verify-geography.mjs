import assert from 'node:assert/strict';
import { readWorld } from '../tools/world-files.mjs';
import { geographicHash } from '../tools/geographic-fingerprint.mjs';

const world = readWorld(),
  baseline = geographicHash(world);
const mutations = [
  (w) => (w.origin[0] += 0.01),
  (w) => (w.size[0] += 1),
  (w) => (w.buildings[0].p[0][0] += 1),
  (w) =>
    w.buildings[0].holes.push([
      [0, 0],
      [1, 0],
      [1, 1],
    ]),
  (w) => (w.buildings[0].floors += 1),
  (w) => (w.roads[0].p[0][0] += 1),
  (w) => (w.roads[0].name += 'changed'),
  (w) => (w.roads[0].type = 'changed'),
  (w) => (w.roads[0].w += 1),
  (w) => (w.roads[0].bridge = !w.roads[0].bridge),
  (w) => (w.roads[0].oneway = !w.roads[0].oneway),
  (w) => (w.areas[0].p[0][0] += 1),
  (w) => (w.landmarks[0].p[0] += 1),
  (w) => (w.trees[0][0] += 1),
];
for (const mutate of mutations) {
  const changed = structuredClone(world);
  mutate(changed);
  assert.notEqual(geographicHash(changed), baseline, 'geographic mutation must be detected');
}
const metadata = structuredClone(world);
metadata.meta = { refreshed: true };
assert.equal(geographicHash(metadata), baseline, 'metadata refresh preserves geography');
console.log('Fixed fingerprint detects coordinates, courtyards, floors, circulation and areas');
