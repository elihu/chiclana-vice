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
assert.deepEqual(
  layer.trees,
  candidates
    .filter((c) => treeCandidateStatus(c, review) === 'aceptado')
    .map((c) => [c.x, c.z, c.r].map((n) => Math.round(n * 100) / 100)),
);
const child = spawnSync(
  process.execPath,
  ['tests/verify-building-variation-environment.mjs', '--without-vegetation'],
  { encoding: 'utf8' },
);
assert.ifError(child.error);
assert.equal(child.status, 0, child.stderr);
assert.deepEqual(JSON.parse(child.stdout), {
  vegetation: '56a76b5c577c203b8403b92ac1d95f56936284541bdbad096262019efc01707c',
  trace: 'e63172d1d226305486b3e7d81696b551274f377f7c1b7316f30300170badecca',
});
console.log('Copas revisadas publicadas y entorno anterior idéntico sin capa opcional');
