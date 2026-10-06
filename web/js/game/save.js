import { PROGRESS_LIMITS, SAVE_KEY } from '../../game-data.js';
import { gfx, state } from '../core/state.js';
import { readProgress } from '../../progress.js';

export function loadSavedProgress() {
  const stored = readProgress(() => localStorage, PROGRESS_LIMITS);
  if (stored.quality === 'low') gfx.quality = 'low';
  state.cash = stored.cash;
  state.job = stored.job;
  state.found = new Set(stored.found);
}

export function save() {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        cash: state.cash,
        job: state.job,
        found: [...state.found],
        quality: gfx.quality,
      }),
    );
  } catch {}
}
