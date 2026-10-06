import { $, setText, ui } from '../core/dom.js';
import { session } from '../core/state.js';

export function loadProgress(message, p) {
  $('loadStatus').textContent = message;
  $('loadProgress').style.width = p + '%';
  $('loadTrack').setAttribute('aria-valuenow', String(p));
}

export function toast(message, duration = 4) {
  setText('toast', message);
  ui('toast').classList.add('show');
  session.toastClock = duration;
  session.toastShown = true;
}
