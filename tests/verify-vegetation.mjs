// Capa derivada, deduplicación y compatibilidad al faltar el recurso opcional.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateTreeReview, treeCandidateStatus } from '../web/js/debug/inspector.js';

const bytes = fs.readFileSync('source-data/tree-candidates.json');
const { candidates } = JSON.parse(bytes);
const review = validateTreeReview(
  JSON.parse(fs.readFileSync('source-data/tree-review.json')),
  candidates,
  createHash('sha256').update(bytes).digest('hex'),
);
const layer = JSON.parse(fs.readFileSync('web/vegetation.json'));
assert.equal(layer.version, 1);
assert(layer.source && layer.license && layer.attribution);
const accepted = candidates.filter((c) => treeCandidateStatus(c, review) === 'aceptado'),
  shrub = (c) => c.source !== 'imagen' && c.ign < layer.shrubMaxHeight,
  round = (c) => [c.x, c.z, c.r].map((n) => Math.round(n * 100) / 100);
assert.equal(layer.shrubMaxHeight, 5);
assert.deepEqual(layer.trees, accepted.filter((c) => !shrub(c)).map(round));
assert.deepEqual(layer.shrubs, accepted.filter(shrub).map(round));
assert(layer.shrubs.length > 0 && layer.trees.length > layer.shrubs.length);
const child = spawnSync(
  process.execPath,
  ['tests/verify-building-variation-environment.mjs', '--without-vegetation'],
  { encoding: 'utf8' },
);
assert.ifError(child.error);
assert.equal(child.status, 0, child.stderr);
assert.deepEqual(JSON.parse(child.stdout), {
  vegetation: '44a0ab5a1498ea77265a347837c043d0fe55a28106b96a88687d7984155dfcc1',
  trace: '6e0cb463b4391b3dd04acc3c60c0a878ca1d38138f7533ad7f34f7c824dd4f2f',
});
console.log('Copas publicadas y arbolado de respaldo conservados; recorridos peatonales renovados');
