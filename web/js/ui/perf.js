import { urlOptions } from '../core/dom.js';
import { gfx } from '../core/state.js';

// Medición en pantalla con `?fps` o `#fps`: motor activo, FPS medios y peor frame de los últimos 2 s.
// Pensada para comparar WebGPU y WebGL 2 en el mismo móvil; sin `?fps` no hace nada.
const WINDOW_MS = 2000;
let el = null,
  last = 0,
  shown = 0;
const samples = [];

export function installPerf() {
  if (!urlOptions().has('fps')) return;
  el = document.createElement('div');
  el.id = 'perf';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
}

// Una llamada por frame dibujado.
export function tickPerf(now) {
  if (!el) return;
  if (last) samples.push([now, now - last]);
  last = now;
  while (samples.length && now - samples[0][0] > WINDOW_MS) samples.shift();
  if (now - shown < 500 || samples.length < 2) return;
  shown = now;
  const total = samples.reduce((sum, [, dt]) => sum + dt, 0),
    worst = Math.max(...samples.map(([, dt]) => dt)),
    fps = (samples.length * 1000) / total;
  el.textContent = `${gfx.backend ?? '—'} · ${fps.toFixed(0)} fps · peor ${worst.toFixed(0)} ms`;
}

// Al pausar (mapa, diálogos) el juego deja de dibujar: sin esto el primer frame al volver
// contaría toda la pausa como un frame lento.
export function resetPerf() {
  last = 0;
  samples.length = 0;
}
