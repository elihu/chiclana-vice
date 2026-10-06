import { $ } from '../core/dom.js';
import { holdPointers, input, keys, pointer } from '../core/state.js';

export function clearInput() {
  for (const p of holdPointers.values()) p.clear();
  for (const k in input) input[k] = typeof input[k] === 'boolean' ? false : 0;
  for (const k in keys) delete keys[k];
  pointer.joyId = null;
  pointer.dragId = null;
  $('stick').style.transform = '';
  document.querySelectorAll('.pressed').forEach((e) => e.classList.remove('pressed'));
}
