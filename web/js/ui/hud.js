import { surfaceHeightAt } from '../engine/terrain-sampling.js';
import { d } from '../core/math.js';
import {
  gfx,
  input,
  keys,
  labelPoint,
  player,
  pois,
  session,
  state,
  view,
  world,
} from '../core/state.js';
import { JOBS as jobs } from '../../game-data.js';
import { nearestCar } from '../game/vehicles.js';
import { nearestRoad } from '../world/spatial.js';
import { setStyle, setText, ui } from '../core/dom.js';
import { target } from '../game/jobs.js';
import { updateCameraVisibility } from '../engine/camera.js';

export function updateHUD() {
  const j = jobs[state.job],
    p = target();
  setText('money', Math.floor(state.cash).toLocaleString('es-ES') + ' €');
  setText('stars', '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted));
  setText(
    'jobTag',
    j ? String(state.job + 1).padStart(2, '0') + ' / ' + j.name : 'EXPLORACIÓN LIBRE',
  );
  setText('jobTitle', p ? p.text : 'Recorre las calles reales del centro');
  setText('interactText', player.car ? 'BAJAR' : 'SUBIR');
  setText('boostText', player.car ? 'TURBO' : 'CORRER');
  ui('joy').classList.toggle('hidden', !!player.car);
  ui('driveControls').classList.toggle('hidden', !player.car);
  updateCameraVisibility();
}

export function updateHudReadouts(goal) {
  setText('speed', String(Math.round(Math.abs(player.speed) * 3.6)));
  setText('modeName', player.car ? 'COSTA GT' : input.boost || keys.Shift ? 'CORRIENDO' : 'A PIE');
  setStyle('conditionFill', 'width', state.health + '%');
  setStyle('conditionFill', 'background', state.health < 30 ? '#ff9473' : '#e7fa8a');
  setText(
    'jobDistance',
    goal
      ? goal.escape
        ? 'Evita a las patrullas'
        : Math.round(d(player, goal)) +
          ' m · ' +
          (session.hold > 0 ? 'Entregando…' : 'Señal dorada')
      : state.found.size + '/' + pois.length + ' lugares descubiertos',
  );
  setText(
    'jobTime',
    state.timer > 0
      ? Math.floor(state.timer / 60) + ':' + String(Math.floor(state.timer % 60)).padStart(2, '0')
      : '',
  );
  let near = nearestRoad(player.x, player.z);
  setText('street', near?.s.name || 'Centro de Chiclana');
  let hint = '';
  if (!player.car && nearestCar())
    hint = 'Coche disponible · ' + (gfx.coarse ? 'SUBIR' : 'E para subir');
  else if (goal && !goal.escape && d(player, goal) < 12 && Math.abs(player.speed) > 1.8)
    hint = 'Detente en el círculo dorado para entregar';
  else if (state.wanted)
    hint = 'Búsqueda activa · ' + Math.ceil(state.heat) + ' s para despistarlos';
  else if (Math.abs(player.x) > world.worldW / 2 - 30 || Math.abs(player.z) > world.worldH / 2 - 30)
    hint = 'Fin de la zona recreada · Abre el mapa para volver';
  setText('hint', hint);
}

export function drawLabels() {
  for (const p of pois) {
    let di = Math.hypot(p.labelX - player.x, p.labelZ - player.z);
    if (di > 125 || view.mode === 1) {
      setStyle(p.el, 'display', 'none');
      continue;
    }
    let v = labelPoint
      .set(p.labelX, surfaceHeightAt(p.labelX, p.labelZ) + 14, p.labelZ)
      .project(gfx.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
      setStyle(p.el, 'display', 'none');
      continue;
    }
    setStyle(p.el, 'display', 'block');
    setStyle(p.el, 'left', (v.x * 0.5 + 0.5) * gfx.W + 'px');
    setStyle(p.el, 'top', (-v.y * 0.5 + 0.5) * gfx.H + 'px');
  }
  let goal = target(),
    el = ui('direction');
  if (!goal || goal.escape) {
    setStyle(el, 'display', 'none');
    return;
  }
  let v = labelPoint.set(goal.x, surfaceHeightAt(goal.x, goal.z) + 2, goal.z).project(gfx.camera);
  if (v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.65) {
    setStyle(el, 'display', 'none');
    return;
  }
  let angle = Math.atan2(goal.x - player.x, goal.z - player.z) - (player.a + view.orbit);
  let x = gfx.W / 2 - Math.sin(angle) * Math.min(gfx.W * 0.33, 180),
    y = gfx.H * 0.47 - Math.cos(angle) * Math.min(gfx.H * 0.18, 90);
  setStyle(el, 'display', 'grid');
  setStyle(el, 'left', x - 19 + 'px');
  setStyle(el, 'top', y - 19 + 'px');
  const relative = Math.atan2(Math.sin(angle), Math.cos(angle)); // normalised to [-π, π]
  setText(el, Math.abs(relative) > Math.PI * 0.65 ? '↶' : '◆');
}
