import assert from 'node:assert/strict';
import { normalizeProgress, readProgress } from '../web/progress.js';
import { PROGRESS_LIMITS as limits, JOBS, PLACES, SAVE_KEY } from '../web/game-data.js';

const defaults = { cash: limits.cash, job: 0, found: [], quality: 'auto' };
for (const value of [null, [], 42, 'old-save', {}, { cash: -5, job: 1.5, found: {} }])
  assert.deepEqual(normalizeProgress(value, limits), defaults, 'invalid save recovers defaults');
for (const value of [null, '{bad json', 'null', '{"found":{}}'])
  assert.deepEqual(readProgress({ getItem: () => value }, limits), defaults);
assert.deepEqual(
  readProgress(
    {
      getItem: () => {
        throw Error('storage blocked');
      },
    },
    limits,
  ),
  defaults,
);
const valid = { cash: 800, job: JOBS.length, found: [0, PLACES.length - 1], quality: 'low' };
assert.deepEqual(
  readProgress(
    {
      getItem(key) {
        assert.equal(key, SAVE_KEY);
        return JSON.stringify(valid);
      },
    },
    limits,
  ),
  valid,
);
assert.deepEqual(
  normalizeProgress({ ...valid, found: [0, 0, -1, PLACES.length, '0', null] }, limits).found,
  [0],
);
assert.equal(normalizeProgress({ job: JOBS.length + 1 }, limits).job, 0);
console.log('Invalid saves recover; valid progress and quality preserved');

assert.deepEqual(
  readProgress(() => {
    throw Error('storage getter blocked');
  }, limits),
  defaults,
);
