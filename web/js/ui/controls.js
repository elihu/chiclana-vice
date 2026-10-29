import { $ } from '../core/dom.js';
import { applyQuality, resizeRenderer } from '../engine/renderer.js';
import { clamp } from '../core/math.js';
import { clearInput } from './input.js';
import { closeMap, drawMap, listStreets, openMap } from './map.js';
import { closeModal, help, modal, pauseMenu, toggleFullscreen, trapFocus } from './dialogs.js';
import { cycleCamera } from '../engine/camera.js';
import { currentTime, nextTime, setTimeOfDay, timeName } from '../engine/time-of-day.js';
import { toast } from './feedback.js';
import { gfx, holdPointers, input, keys, player, pointer, session, view } from '../core/state.js';
import { interact } from '../game/player.js';
import { save } from '../game/save.js';
import { start } from '../game/flow.js';

export function installTouchDetection() {
  gfx.W = innerWidth;
  gfx.H = innerHeight;
  gfx.coarse = matchMedia('(any-pointer: coarse)').matches;
  const syncTouchUI = () => document.body.classList.toggle('touch-enabled', gfx.coarse);
  syncTouchUI();
  const coarseQuery = matchMedia('(any-pointer: coarse)');
  coarseQuery.addEventListener?.('change', (e) => {
    gfx.coarse = e.matches || gfx.touchSeen;
    syncTouchUI();
    if (gfx.renderer) applyQuality();
  });
  addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch' || gfx.touchSeen) return;
      gfx.touchSeen = true;
      if (!gfx.coarse) {
        gfx.coarse = true;
        syncTouchUI();
        if (gfx.renderer) applyQuality();
      }
    },
    { capture: true, passive: true },
  );
}

// Pone la hora actual en el título y la etiqueta accesible del botón de la hora.
export function describeTime() {
  const button = $('timeBtn');
  button.title = 'Hora del día: ' + timeName(currentTime());
  button.setAttribute('aria-label', 'Hora del día: ' + timeName(currentTime()) + '. Cambiar');
}

export function installControls() {
  const { closeTools, toolAction } = installToolMenu();
  function useInteract() {
    interact();
    clearInput();
  }
  installControlButtons(closeTools, toolAction, useInteract);
  installHoldControls();
  installJoystick();
  installCameraDrag();
  installKeyboard(closeTools, useInteract);
  installWindowControls(closeTools);
}

function installToolMenu() {
  function closeTools(focus = false) {
    $('toolMenu').classList.remove('open');
    $('toolsToggle').setAttribute('aria-expanded', 'false');
    if (focus && gfx.coarse) $('toolsToggle').focus?.();
  }
  function toolAction(action) {
    return (...args) => {
      closeTools(true);
      return action(...args);
    };
  }
  $('toolsToggle').onclick = () => {
    const open = $('toolMenu').classList.toggle('open');
    $('toolsToggle').setAttribute('aria-expanded', String(open));
  };
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.target.closest?.('#toolMenu')) closeTools();
    },
    { capture: true },
  );
  return { closeTools, toolAction };
}

function installControlButtons(closeTools, toolAction, useInteract) {
  $('start').onclick = () => {
    start();
    if (gfx.touchSeen && innerWidth > innerHeight && !document.fullscreenElement)
      void toggleFullscreen();
  };
  $('fullscreenBtn').onclick = toolAction(toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    const active = !!document.fullscreenElement;
    $('fullscreenBtn').setAttribute('aria-pressed', String(active));
    $('fullscreenBtn').setAttribute(
      'aria-label',
      active ? 'Salir de pantalla completa' : 'Pantalla completa',
    );
    clearInput();
  });
  $('introHelp').onclick = help;
  $('credits').onclick = () => help('sources');
  $('closeModal').onclick = closeModal;
  $('pauseBtn').onclick = toolAction(pauseMenu);
  $('mapBtn').onclick = toolAction(openMap);
  $('miniButton').onclick = openMap;
  $('closeMap').onclick = closeMap;
  $('cameraBtn').onclick = toolAction(cycleCamera);
  describeTime();
  $('timeBtn').onclick = async () => {
    closeTools(true);
    await setTimeOfDay(nextTime());
    describeTime();
    save();
    toast('Hora del día: ' + timeName(), 2);
  };
  $('interact').onclick = useInteract;
  $('streetSearch').oninput = listStreets;
  function selectMapStyle(aerial) {
    session.mapAerial = aerial;
    $('mapStyle').setAttribute('aria-pressed', String(aerial));
    $('mapStreet').setAttribute('aria-pressed', String(!aerial));
    drawMap($('map'));
  }
  $('mapStyle').onclick = () => selectMapStyle(true);
  $('mapStreet').onclick = () => selectMapStyle(false);
}

function installHoldControls() {
  function bindHold(id, key) {
    let e = $(id),
      pointers = new Set();
    holdPointers.set(key, pointers);
    e.onpointerdown = (v) => {
      v.preventDefault();
      if (!session.started || session.paused) return;
      pointers.add(v.pointerId);
      e.setPointerCapture(v.pointerId);
      input[key] = true;
      e.classList.add('pressed');
    };
    for (const n of ['pointerup', 'pointercancel', 'lostpointercapture'])
      e.addEventListener(n, (v) => {
        pointers.delete(v.pointerId);
        input[key] = pointers.size > 0;
        e.classList.toggle('pressed', input[key]);
      });
  }
  for (const type of ['contextmenu', 'selectstart', 'dragstart'])
    document.addEventListener(type, (e) => {
      if (e.target.closest?.('#hud, #world')) e.preventDefault();
    });
  bindHold('left', 'left');
  bindHold('right', 'right');
  bindHold('gas', 'gas');
  bindHold('brake', 'brake');
  bindHold('boost', 'boost');
}

function installJoystick() {
  const joy = $('joy');
  function joyMove(e) {
    if (e.pointerId !== pointer.joyId) return;
    let r = joy.getBoundingClientRect(),
      dx = e.clientX - r.left - r.width / 2,
      dz = e.clientY - r.top - r.height / 2,
      max = r.width * 0.32,
      len = Math.hypot(dx, dz),
      s = len > max ? max / len : 1;
    const deadZone = player.car ? 0.22 : 0.15;
    const linear = Math.max(0, (Math.min(1, len / max) - deadZone) / (1 - deadZone));
    // Más recorrido útil cerca del centro; a pie se conserva la respuesta anterior.
    const strength = player.car ? linear ** 1.7 : linear;
    input.jx = len ? (dx / len) * strength : 0;
    input.jy = len ? (dz / len) * strength : 0;
    $('stick').style.transform = `translate(${dx * s}px,${dz * s}px)`;
  }
  joy.onpointerdown = (e) => {
    e.preventDefault();
    if (!session.started || session.paused || pointer.joyId !== null) return;
    pointer.joyId = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    joyMove(e);
  };
  joy.onpointermove = joyMove;
  for (const n of ['pointerup', 'pointercancel', 'lostpointercapture'])
    joy.addEventListener(n, (e) => {
      if (e.pointerId !== pointer.joyId) return;
      pointer.joyId = null;
      pointer.driveSteer = 0;
      input.jx = input.jy = 0;
      $('stick').style.transform = '';
    });
}

function installCameraDrag() {
  $('world').onpointerdown = (e) => {
    if (!session.started || session.paused || pointer.dragId !== null) return;
    pointer.dragId = e.pointerId;
    pointer.dragX = e.clientX;
    pointer.dragY = e.clientY;
    $('world').setPointerCapture(e.pointerId);
  };
  $('world').onpointermove = (e) => {
    if (e.pointerId !== pointer.dragId) return;
    view.orbit -= (e.clientX - pointer.dragX) * 0.008;
    if (view.mode !== 2)
      view.lookPitch = clamp(
        view.lookPitch - (e.clientY - pointer.dragY) * 0.006,
        view.mode === 1 ? -1.35 : -0.65,
        view.mode === 1 ? 1.35 : 0.65,
      );
    pointer.dragX = e.clientX;
    pointer.dragY = e.clientY;
    view.orbitAge = 2.5;
  };
  for (const n of ['pointerup', 'pointercancel', 'lostpointercapture'])
    $('world').addEventListener(n, (e) => {
      if (e.pointerId === pointer.dragId) pointer.dragId = null;
    });
}

function installKeyboard(closeTools, useInteract) {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('toolMenu').classList.contains('open')) {
      e.preventDefault();
      closeTools(true);
      return;
    }
    if (e.key === 'Tab') return trapFocus(e);
    const editable =
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
    const control = ['BUTTON', 'A'].includes(e.target.tagName);
    if (
      editable ||
      (control && (session.paused || !session.started || e.key === ' ' || e.key === 'Enter'))
    ) {
      // Edición y activación nativas; los atajos de conducción siguen tras pulsar Cámara.
      if (e.key === 'Escape') {
        if (!$('mapOverlay').classList.contains('hidden')) closeMap();
        else if (!$('modal').classList.contains('hidden')) closeModal();
      }
      return;
    }
    let k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    if (e.repeat) return;
    keys[k] = true;
    if (k === 'e') useInteract();
    if (k === 'c' && session.started && !session.paused) cycleCamera();
    if (k === 'm') {
      if (!$('mapOverlay').classList.contains('hidden')) closeMap();
      else if (!session.paused) openMap();
    }
    if (k === 'Escape') {
      if (!$('mapOverlay').classList.contains('hidden')) closeMap();
      else if (!$('modal').classList.contains('hidden')) closeModal();
      else if (session.started) pauseMenu();
    }
  });
  window.addEventListener(
    'keyup',
    (e) => (keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false),
  );
}

function installWindowControls(closeTools) {
  window.addEventListener('blur', () => {
    clearInput();
    if (session.started && !session.paused) pauseMenu();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      save();
      clearInput();
      if (session.started && !session.paused) pauseMenu();
    }
    session.last = performance.now();
  });
  window.addEventListener('pagehide', save);
  window.addEventListener('resize', () => {
    closeTools();
    clearInput();
    resizeRenderer();
    if (!$('mapOverlay').classList.contains('hidden')) openMap();
  });
  $('world').addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    session.paused = true;
    $('mapOverlay').classList.add('hidden');
    modal(
      '<h2>Se ha interrumpido la imagen.</h2><p>Tu progreso está guardado. Recarga la página y activa el modo móvil ligero en Pausa.</p><button class="primary" id="reload">RECARGAR</button>',
    );
    gfx.contextLost = true;
    $('closeModal').classList.add('hidden');
    save();
    $('reload').onclick = () => location.reload();
  });
}
