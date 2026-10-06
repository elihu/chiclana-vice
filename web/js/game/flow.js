import { $ } from '../core/dom.js';
import { session } from '../core/state.js';
import { snapCamera } from '../engine/camera.js';
import { toast } from '../ui/feedback.js';

export function start() {
  session.started = true;
  session.paused = false;
  $('welcome').classList.add('hidden');
  $('hud').classList.remove('hidden');
  toast(
    'Alameda del Río. GAS para avanzar, flechas para girar. El mapa permite buscar una calle.',
    6,
  );
  snapCamera();
  session.last = performance.now();
}
