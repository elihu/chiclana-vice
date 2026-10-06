import * as THREE from '../vendor/three.module.min.js';
import { $, sleepFrame, ui } from './core/dom.js';
import { SAVE_KEY, SPAWN_POSITION, VIEWPOINTS, JOBS as jobs } from '../game-data.js';
import { TAU, clamp, fold, lerp, pInside, pointSeg } from './core/math.js';
import {
  actors,
  audio,
  base,
  camPos,
  camTarget,
  cars,
  chunks,
  driveNetwork,
  facadeWork,
  gfx,
  graph,
  holdPointers,
  input,
  keys,
  people,
  player,
  pointer,
  pois,
  police,
  segments,
  session,
  state,
  streetEnvironment,
  traffic,
  vehicles,
  view,
  world,
} from './core/state.js';
import { addGroundPlanes, applyQuality, resizeRenderer, setupRenderer } from './engine/renderer.js';
import { addSigns } from './world/signs.js';
import { applyHeightSamples, loadLayers, loadWorld } from './world/loader.js';
import { blocked, inBuilding, indexBuildings, nearestRoad, safePoint } from './world/spatial.js';
import { buildBuildings } from './world/buildings.js';
import { buildDetailedFacades, prepareFacades } from './world/facades.js';
import { buildRoadDetails, buildStreetSurfaces } from './world/streets.js';
import {
  buildRoadGraph,
  connectOpenSpaces,
  findRoute,
  nearestNode,
  orientDriveGraph,
} from './game/graph.js';
import { buildTrees } from './world/vegetation.js';
import { buildUrbanFurniture } from './world/furniture.js';
import { cameraSweep, cycleCamera, snapCamera, updateCamera } from './engine/camera.js';
import { carCollision, createCar } from './game/vehicles.js';
import { createMissionMarkers, setupPOIs, target } from './game/jobs.js';
import { createPerson } from './game/people.js';
import { drawLabels, updateHUD, updateHudReadouts } from './ui/hud.js';
import { interact, rescue, updatePlayer } from './game/player.js';
import { loadProgress, toast } from './ui/feedback.js';
import { loadSavedProgress, save } from './game/save.js';
import { mute, toggleAudio } from './engine/audio.js';
import { setAssetVersion } from './core/assets.js';
import { spawnTraffic, stepAgent, updatePedestrians } from './game/traffic.js';
import { start } from './game/flow.js';
import { updateMarkers, updateMissions } from './game/missions.js';
import { updatePolice } from './game/police.js';

function installTouchDetection() {
  gfx.W = innerWidth;
  gfx.H = innerHeight;
  gfx.coarse = matchMedia('(any-pointer: coarse)').matches;
  const coarseQuery = matchMedia('(any-pointer: coarse)');
  coarseQuery.addEventListener?.('change', (e) => {
    gfx.coarse = e.matches || gfx.touchSeen;
    if (gfx.renderer) applyQuality();
  });
  addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch' || gfx.touchSeen) return;
      gfx.touchSeen = true;
      if (!gfx.coarse) {
        gfx.coarse = true;
        if (gfx.renderer) applyQuality();
      }
    },
    { capture: true, passive: true },
  );
}

async function init() {
  loadProgress('Descargando el trazado y los edificios reales…', 8);
  const { res, tex, heightSamples, profiles, streetObjects } = await loadLayers();
  world.city = res;
  world.mappedStreetObjects = Array.isArray(streetObjects) ? streetObjects : [];
  if (profiles.version !== 1) throw Error('Perfiles incompatibles');
  world.facadeProfiles = profiles;
  world.groundTexture = tex;
  if (world.groundTexture) {
    world.groundTexture.colorSpace = THREE.SRGBColorSpace;
    world.groundTexture.anisotropy = 4;
  } else toast('Ortofoto no disponible: suelo y tejados en color liso', 5);
  [world.worldW, world.worldH] = world.city.size;
  loadProgress('Preparando el mundo 3D…', 25);
  setupRenderer();
  addGroundPlanes();
  buildRoadGraph();
  indexBuildings();
  connectOpenSpaces();
  orientDriveGraph();
  applyHeightSamples(heightSamples);
  prepareFacades();
  await buildBuildings();
  buildDetailedFacades();
  loadProgress('Colocando puentes, vehículos y señales…', 68);
  await sleepFrame();
  buildStreetSurfaces();
  buildRoadDetails();
  buildUrbanFurniture();
  buildTrees();
  addSigns();
  setupPOIs();
  let spawn = safePoint(SPAWN_POSITION.x, SPAWN_POSITION.z, true);
  Object.assign(base, spawn);
  let car = createCar('#bba979');
  Object.assign(car, spawn);
  cars.push(car);
  Object.assign(player, spawn);
  player.car = car;
  actors.character = createPerson('#d7d5b0');
  actors.character.mesh.visible = false;
  spawnTraffic();
  vehicles.push(...cars, ...traffic);
  createMissionMarkers();
  camPos.set(player.x - 15, 12, player.z - 15);
  camTarget.set(player.x, 1, player.z);
  gfx.camera.position.copy(camPos);
  gfx.camera.lookAt(camTarget);
  $('streetCount').textContent =
    new Set(world.city.roads.filter((r) => r.name).map((r) => r.name)).size + ' calles con nombre';
  loadProgress('Centro de Chiclana listo.', 100);
  updateHUD();
  prepareMap();
  await sleepFrame();
  $('loading').classList.add('hidden');
  $('welcome').classList.remove('hidden');
  session.last = performance.now();
  requestAnimationFrame(frame);
  window.__cityGame = createPublicApi();
}

function clearInput() {
  for (const p of holdPointers.values()) p.clear();
  for (const k in input) input[k] = typeof input[k] === 'boolean' ? false : 0;
  for (const k in keys) delete keys[k];
  pointer.joyId = null;
  pointer.dragId = null;
  $('stick').style.transform = '';
  document.querySelectorAll('.pressed').forEach((e) => e.classList.remove('pressed'));
}

function update(dt) {
  session.t += dt;
  session.collisionClock = Math.max(0, session.collisionClock - dt);
  session.toastClock -= dt;
  if (session.toastShown && session.toastClock <= 0) {
    session.toastShown = false;
    ui('toast').classList.remove('show');
  }
  updatePlayer(dt);
  for (const c of traffic) stepAgent(c, dt);
  for (const c of vehicles) {
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.a;
  }
  updatePolice(dt);
  updatePedestrians(dt);
  let goal = updateMissions(dt);
  updateMarkers(goal);
  session.routeClock -= dt;
  if (session.routeClock <= 0) {
    session.routeClock = 2.5;
    session.route =
      goal && !goal.escape
        ? findRoute(nearestNode(player.x, player.z), nearestNode(goal.x, goal.z))
        : [];
  }
  if (view.orbitAge > 0) view.orbitAge -= dt;
  else if (player.car && view.mode !== 1) view.orbit = lerp(view.orbit, 0, dt * 2);
  updateCamera(dt);
  updateHudReadouts(goal);
  session.saveClock += dt;
  if (session.saveClock > 10) {
    session.saveClock = 0;
    save();
  }
}

let chart, chartCtx;

function trace(c, poly) {
  c.beginPath();
  poly.forEach((p, i) =>
    i
      ? c.lineTo(p[0] + world.worldW / 2, p[1] + world.worldH / 2)
      : c.moveTo(p[0] + world.worldW / 2, p[1] + world.worldH / 2),
  );
}

function prepareMap() {
  chart = document.createElement('canvas');
  chart.width = 1344;
  chart.height = 1002;
  chartCtx = chart.getContext('2d');
  chartCtx.fillStyle = '#6c806f';
  chartCtx.fillRect(0, 0, chart.width, chart.height);
  for (let a of world.city.areas) {
    trace(chartCtx, a.p);
    chartCtx.fillStyle = a.kind === 'water' ? '#234f62' : a.kind === 'park' ? '#57734f' : '#a8aa91';
    chartCtx.fill();
  }
  for (let b of world.city.buildings) {
    trace(chartCtx, b.p);
    chartCtx.fillStyle = '#bfc2aa';
    chartCtx.fill();
    for (let h of b.holes) {
      trace(chartCtx, h);
      chartCtx.fillStyle = '#6c806f';
      chartCtx.fill();
    }
  }
  chartCtx.lineJoin = chartCtx.lineCap = 'round';
  for (let r of world.city.roads) {
    trace(chartCtx, r.p);
    chartCtx.strokeStyle = '#d6d7b7';
    chartCtx.lineWidth = r.w;
    chartCtx.stroke();
  }
  world.streetNames = [...new Set(world.city.roads.map((r) => r.name).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  );
  listStreets();
}

function drawMap(canvas, mini = false) {
  let cw = canvas.width,
    ch = canvas.height,
    c = canvas.getContext('2d'),
    scale = mini ? 1.1 : Math.min(cw / world.worldW, ch / world.worldH) * 0.92;
  let ox = mini
      ? cw / 2 - player.x * scale
      : (cw - world.worldW * scale) / 2 + (world.worldW / 2) * scale,
    oy = mini
      ? ch / 2 - player.z * scale
      : (ch - world.worldH * scale) / 2 + (world.worldH / 2) * scale;
  c.fillStyle = '#1a343d';
  c.fillRect(0, 0, cw, ch);
  c.save();
  c.translate(ox - (world.worldW / 2) * scale, oy - (world.worldH / 2) * scale);
  c.scale(scale, scale);
  // The 2D orthophoto reuses the image already loaded for the ground texture.
  if (session.mapAerial && !mini && world.groundTexture?.image)
    c.drawImage(world.groundTexture.image, 0, 0, world.worldW, world.worldH);
  else c.drawImage(chart, 0, 0, world.worldW, world.worldH);
  c.translate(world.worldW / 2, world.worldH / 2);
  if (session.route.length) {
    c.strokeStyle = '#ddf98a';
    c.lineWidth = mini ? 4 : 5 / scale;
    c.lineJoin = 'round';
    c.beginPath();
    session.route.forEach((id, i) => {
      let n = graph[id];
      i ? c.lineTo(n.x, n.z) : c.moveTo(n.x, n.z);
    });
    c.stroke();
  }
  for (let p of pois) {
    c.fillStyle = '#96dcc2';
    c.beginPath();
    c.arc(p.x, p.z, mini ? 3.5 : 4 / scale, 0, TAU);
    c.fill();
  }
  let goal = target();
  if (goal) {
    c.strokeStyle = '#ffb677';
    c.lineWidth = 2 / scale;
    c.beginPath();
    c.arc(goal.x, goal.z, 8 / scale, 0, TAU);
    c.stroke();
  }
  for (let p of police) {
    c.fillStyle = '#ee8377';
    c.beginPath();
    c.arc(p.x, p.z, 4 / scale, 0, TAU);
    c.fill();
  }
  c.translate(player.x, player.z);
  c.rotate(-player.a);
  c.fillStyle = '#f2ffa0';
  c.strokeStyle = '#182f35';
  c.lineWidth = 2 / scale;
  c.beginPath();
  c.moveTo(0, 8 / scale);
  c.lineTo(-5 / scale, -5 / scale);
  c.lineTo(0, -2 / scale);
  c.lineTo(5 / scale, -5 / scale);
  c.closePath();
  c.stroke();
  c.fill();
  c.restore();
  if (!mini) {
    c.font = 'bold ' + Math.max(12, cw / 55) + 'px Arial';
    c.textAlign = 'center';
    for (let p of pois) {
      let x = ox + p.x * scale,
        y = oy + p.z * scale,
        w = c.measureText(p.name).width;
      c.fillStyle = '#142d36ee';
      c.fillRect(x - w / 2 - 5, y + 8, w + 10, 20);
      c.fillStyle = '#f0f2df';
      c.fillText(p.name, x, y + 23);
    }
    c.fillStyle = '#e2edc7';
    c.textAlign = 'right';
    c.fillText('N ↑', cw - 14, 25);
  }
}

function listStreets() {
  let q = fold($('streetSearch').value),
    names = world.streetNames.filter((n) => fold(n).includes(q));
  let list = $('streetList');
  list.replaceChildren();
  for (const view of VIEWPOINTS) {
    if (q && !fold(view.name).includes(q)) continue;
    let b = document.createElement('button');
    b.textContent = view.name;
    b.style.color = '#e7fa8a';
    b.onclick = () => {
      let position = { x: view.x, z: view.z, a: Math.atan2(view.tx - view.x, view.tz - view.z) };
      if (player.car) {
        Object.assign(player.car, position);
        player.car.speed = 0;
      }
      Object.assign(player, position);
      player.speed = 0;
      view.mode = 0;
      session.routeClock = 0;
      closeMap();
      snapCamera();
      toast(view.name, 3);
    };
    list.appendChild(b);
  }
  for (let n of names) {
    let b = document.createElement('button');
    b.textContent = n;
    b.onclick = () => {
      let rs = world.city.roads.filter((r) => r.name === n),
        r = rs.reduce((a, b) => (a.p.length > b.p.length ? a : b)),
        pt = r.p[Math.floor(r.p.length / 2)],
        safe = safePoint(pt[0], pt[1], !!player.car);
      if (player.car) {
        Object.assign(player.car, safe);
        player.car.speed = 0;
      }
      Object.assign(player, safe);
      player.speed = 0;
      session.routeClock = 0;
      closeMap();
      snapCamera();
      toast(n, 3);
    };
    list.appendChild(b);
  }
  if (!list.children.length) {
    let p = document.createElement('p');
    p.textContent = 'No aparece en este sector del centro.';
    p.style.fontSize = '13px';
    list.appendChild(p);
  }
}

function openMap() {
  if (!session.started || gfx.contextLost) return;
  session.paused = true;
  clearInput();
  mute();
  $('mapOverlay').classList.remove('hidden');
  openDialog($('closeMap')); // not the search field: no on-screen keyboard
  let c = $('map'),
    r = c.getBoundingClientRect();
  c.width = Math.round(r.width * 1.5);
  c.height = Math.round(r.height * 1.5);
  drawMap(c);
}

function closeMap() {
  if (gfx.contextLost) return; // only reloading can bring the image back
  $('mapOverlay').classList.add('hidden');
  closeDialog();
  session.paused = false;
  gfx.needsRender = true;
  session.last = performance.now();
}

// Dialog focus: the HUD becomes inert, focus moves inside, Tab cycles within the open
// dialog and focus returns to the opener on close.
let dialogOpener = null;

function openDialog(target) {
  if (!dialogOpener) dialogOpener = document.activeElement;
  $('hud').inert = true;
  target?.focus?.();
}

function closeDialog() {
  if (!$('modal').classList.contains('hidden') || !$('mapOverlay').classList.contains('hidden'))
    return;
  $('hud').inert = false;
  dialogOpener?.focus?.();
  dialogOpener = null;
}

function trapFocus(e) {
  const overlay = ['mapOverlay', 'modal'].map($).find((o) => !o.classList.contains('hidden'));
  if (!overlay) return;
  const items = [...overlay.querySelectorAll('button, a[href], input')].filter(
      (el) => !el.closest('.hidden'),
    ),
    first = items[0],
    lastItem = items[items.length - 1];
  if (!first) return;
  const inside = overlay.contains(document.activeElement);
  if (e.shiftKey && (!inside || document.activeElement === first)) {
    e.preventDefault();
    lastItem.focus();
  } else if (!e.shiftKey && (!inside || document.activeElement === lastItem)) {
    e.preventDefault();
    first.focus();
  }
}

function modal(html) {
  session.paused = true;
  clearInput();
  mute();
  $('modalBody').innerHTML = html;
  const title = $('modalBody').querySelector('h2');
  if (title) title.id = 'modalTitle';
  $('modal').classList.remove('hidden');
  openDialog($('modalBody').querySelector('button') || $('closeModal'));
}

function closeModal() {
  if (gfx.contextLost) return; // only reloading can bring the image back
  $('modal').classList.add('hidden');
  closeDialog();
  session.paused = false;
  gfx.needsRender = true;
  session.last = performance.now();
}

function help() {
  if (gfx.contextLost) return;
  modal(
    `<span class="eyebrow">CHICLANA VICE / CALLES REALES</span><h2>El centro, de verdad.</h2><div class="controlTable"><b>Conducir</b><span>Móvil: GAS para avanzar, flechas para girar, FRENO para detenerte y marcha atrás si lo mantienes. TURBO en las rectas.<br>Teclado: WASD o flechas, espacio freno de mano.</span><b>A pie</b><span>BAJAR junto a una zona libre. Joystick para andar; CORRER para ir más rápido. Acércate a un coche detenido para SUBIR. Teclado: E.</span><b>Cámara</b><span>Arrastra la escena horizontal y verticalmente para mirar. En primera persona, la mirada se mantiene hasta que la cambies. El botón Cámara alterna seguimiento, primera persona y vista aérea. Tecla C.</span><b>Mapa</b><span>Busca cualquiera de las ${world.streetNames.length} calles con nombre del sector y selecciónala para trasladarte. Tecla M.</span><b>Encargos</b><span>Detente dentro del círculo dorado durante un segundo. Completa ${jobs.length} encargos y descubre ${pois.length} lugares.</span></div><h3>Qué es real y qué se aproxima</h3><p>Las calles y sus conexiones conservan coordenadas geográficas. Los ${world.city.buildings.length.toLocaleString('es-ES')} volúmenes de edificios y sus patios proceden de contornos oficiales. Los tejados y el suelo usan fotografía aérea PNOA.</p><p>El Ayuntamiento y el Mercado tienen fachadas modeladas a partir de fotografías; Constitución, La Vega, La Plaza y el tramo cercano de Caraza incorporan fachadas de mayor detalle, aproximadas; el piloto continúa por Álamo, García Gutiérrez y Corredera Baja. El resto son genéricas. Los pavimentos del entorno mejorado y el mobiliario son recreaciones; los pasos peatonales usan posiciones cartografiadas. Los árboles combinan puntos de OSM con distribución aproximada dentro de parques y de la plaza del Mercado. Las naves de Jesús Nazareno, San Telmo y San Juan Bautista tienen volúmenes y fachadas específicos, con alturas aproximadas a partir de referencias. La calle Jesús Nazareno incorpora fachadas interpretativas. ${world.city.buildings.filter((b) => b.heightSource).length} partes del piloto tienen alturas de cubierta estimadas de IGN / PNOA-LiDAR, primera cobertura 2008–2015; píxeles de unos 2,5 m y valores en pasos de 1 m. Se mantienen sus plantas catastrales. En los demás, la altura se estima con el número de plantas. Las proporciones verticales del Ayuntamiento se han interpretado del alzado y la sección de Rafael Suárez Almanzor y Victorín Agueda Goyeneche (proyecto de 2006), publicados por la Junta de Andalucía. El terreno es plano. Los monumentos tienen volúmenes simplificados. No es una reconstrucción fotogramétrica ni reproduce el nivel de detalle de GTA V.</p><h3>Fachadas: referencias fotográficas</h3><p>Modelado interpretativo a partir de <a href="https://commons.wikimedia.org/wiki/File:Ayuntamiento_de_Chiclana_de_la_Frontera.jpg" target="_blank" rel="noopener">Ayuntamiento, Jms1952 (2023)</a> y <a href="https://commons.wikimedia.org/wiki/File:Mercado_municioal_Chiclana.jpg" target="_blank" rel="noopener">Mercado, Xemenendura (2025)</a>, ambas CC BY-SA 4.0. Las fotos sirven de referencia: los detalles son geometría de juego, no una captura fotogramétrica.</p><p>Portada Jesús Nazareno: Xemenendura (29/12/2015), <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>. San Telmo: Xemenendura (5/12/2021), CC BY-SA 4.0. San Telmo y San Juan Bautista: fichas de turismo.chiclana.es como referencia. IAPH: «Fachadas lateral y principal del Convento de Jesús Nazareno», Isabel Dugo Cobacho (23/8/2012), © Instituto Andaluz del Patrimonio Histórico, <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener">CC BY-NC-SA 3.0</a>. Referencias, enlaces originales y revisión pendiente de figuras/alzado en los avisos detallados.</p><h3>Fuentes y créditos</h3><p>Calles: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© colaboradores de OpenStreetMap · ODbL 1.0</a>. <a href="osm-world.json" download target="_blank" rel="noopener">Descargar capa OSM utilizada</a> · <a href="street-objects.json" download target="_blank" rel="noopener">Objetos de calle</a> · <a href="licenses/ODbL-1.0.txt" target="_blank" rel="noopener">Licencia ODbL</a>.<br>Ortofoto: obra derivada de PNOA 2022-07 © <a href="https://pnoa.ign.es/" target="_blank" rel="noopener">IGN / PNOA / SCNE</a>, CC BY 4.0.<br>Edificios: obra de juego transformada a partir de <a href="https://www.catastro.hacienda.gob.es/webinspire/" target="_blank" rel="noopener">D.G. del Catastro · INSPIRE BU</a>, descargada el 4/10/2026. Sin validez catastral.<br>Piloto de alturas: Obra derivada de PNOA-LiDAR MDSnE2,5 2008–2015 CC-BY 4.0 scne.es; consultado el 5/10/2026. Alturas derivadas aproximadas; fecha del vuelo local sin confirmar. <a href="https://pnoa.ign.es/pnoa-lidar/productos-a-descarga" target="_blank" rel="noopener">Datos y procedencia</a>.<br>Motor: Three.js, licencia MIT. Juego independiente, sin afiliación con Rockstar Games.</p><p>El progreso se guarda en este navegador; los encargos en curso vuelven a su inicio al recargar.</p><p><a href="THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener">Licencias y procedencia detalladas</a> · <a href="data-sources.json" target="_blank" rel="noopener">Manifiesto de datos</a></p><p><a href="arcade/">Abrir la versión arcade anterior</a></p><button class="primary" id="understood">VOLVER</button>`,
  );
  $('understood').onclick = closeModal;
}

function pauseMenu() {
  if (gfx.contextLost) return;
  modal(
    `<span class="eyebrow">PAUSA / CENTRO DE CHICLANA</span><h2>Un momento en la Alameda.</h2><p>${state.job}/${jobs.length} encargos · ${state.found.size}/${pois.length} lugares · ${Math.floor(state.cash)} €</p><button class="primary" id="resume">VOLVER AL JUEGO</button><button class="primary secondary" id="full">PANTALLA COMPLETA</button><button class="primary secondary" id="audio">${audio.audioOn ? 'DESACTIVAR' : 'ACTIVAR'} SONIDO</button><button class="primary secondary" id="quality">${gfx.quality === 'low' ? 'CALIDAD NORMAL' : 'MODO MÓVIL LIGERO'}</button><button class="primary secondary" id="help">CONTROLES Y FUENTES</button><button class="primary secondary" id="rescue">REPARAR Y VOLVER A LA ALAMEDA · 100 €</button><button class="textButton" id="reset">Empezar una partida nueva</button>`,
  );
  $('resume').onclick = closeModal;
  $('help').onclick = help;
  $('audio').onclick = () => {
    toggleAudio();
    closeModal();
  };
  $('quality').onclick = () => {
    gfx.quality = gfx.quality === 'low' ? 'auto' : 'low';
    applyQuality();
    save();
    closeModal();
    toast(gfx.quality === 'low' ? 'Modo ligero activado' : 'Calidad normal', 2);
  };
  $('rescue').onclick = () => {
    rescue();
    closeModal();
  };
  $('full').onclick = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
      try {
        await screen.orientation.lock('landscape');
      } catch {}
    } catch {
      toast('En este navegador, gira el móvil para jugar en horizontal.', 4);
    }
    closeModal();
  };
  $('reset').onclick = () => {
    modal(
      '<h2>¿Empezar de cero?</h2><p>Se borrará el progreso guardado de la versión 3D en este navegador.</p><button class="primary" id="yesReset">SÍ, NUEVA PARTIDA</button><button class="primary secondary" id="noReset">CONSERVAR MI PARTIDA</button>',
    );
    $('yesReset').onclick = () => {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {}
      location.reload();
    };
    $('noReset').onclick = pauseMenu;
  };
}

function installControls() {
  $('start').onclick = start;
  $('introHelp').onclick = help;
  $('credits').onclick = help;
  $('closeModal').onclick = closeModal;
  $('pauseBtn').onclick = pauseMenu;
  $('mapBtn').onclick = openMap;
  $('miniButton').onclick = openMap;
  $('closeMap').onclick = closeMap;
  $('cameraBtn').onclick = cycleCamera;
  $('interact').onclick = interact;
  $('streetSearch').oninput = listStreets;
  $('mapStyle').onclick = () => {
    session.mapAerial = !session.mapAerial;
    $('mapStyle').textContent = session.mapAerial ? 'Ver callejero' : 'Ver ortofoto';
    drawMap($('map'));
  };
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
  const joy = $('joy');
  function joyMove(e) {
    if (e.pointerId !== pointer.joyId) return;
    let r = joy.getBoundingClientRect(),
      dx = e.clientX - r.left - r.width / 2,
      dz = e.clientY - r.top - r.height / 2,
      max = r.width * 0.32,
      len = Math.hypot(dx, dz),
      s = len > max ? max / len : 1;
    input.jx = (dx * s) / max;
    input.jy = (dz * s) / max;
    $('stick').style.transform = `translate(${dx * s}px,${dz * s}px)`;
  }
  joy.onpointerdown = (e) => {
    e.preventDefault();
    if (pointer.joyId !== null) return;
    pointer.joyId = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    joyMove(e);
  };
  joy.onpointermove = joyMove;
  for (const n of ['pointerup', 'pointercancel', 'lostpointercapture'])
    joy.addEventListener(n, (e) => {
      if (e.pointerId !== pointer.joyId) return;
      pointer.joyId = null;
      input.jx = input.jy = 0;
      $('stick').style.transform = '';
    });
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
  window.addEventListener('keydown', (e) => {
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
    if (k === 'e') interact();
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

let frameCount = 0;

function frame(now) {
  let dt = clamp((now - session.last) / 1000, 0, 0.04) || 0.016;
  session.last = now;
  if (session.started && !session.paused) update(dt);
  else if (!session.started) {
    session.t += dt;
    gfx.camera.position.set(
      player.x + Math.sin(session.t * 0.075) * 36,
      22,
      player.z + Math.cos(session.t * 0.075) * 36,
    );
    gfx.camera.lookAt(player.x, 0, player.z);
    gfx.sun.target.position.set(player.x, 0, player.z);
    gfx.sun.position.set(player.x - 85, 125, player.z + 60);
    for (let c of vehicles) {
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.a;
    }
  }
  // While paused (map, modal), the last frame stays on screen; redraw only on demand.
  if (!gfx.contextLost && (!session.started || !session.paused || gfx.needsRender)) {
    gfx.renderer.render(gfx.scene, gfx.camera);
    gfx.needsRender = false;
  }
  if (session.started && !session.paused && frameCount++ % 3 === 0) {
    let mini = ui('mini');
    if (mini.width !== 280) {
      mini.width = 280;
      mini.height = 200;
    }
    drawMap(mini, true);
    drawLabels();
  }
  requestAnimationFrame(frame);
}

function showStartupError(err) {
  console.error(err);
  $('loadStatus').textContent = 'No se ha podido iniciar el mundo 3D. ' + err.message;
  let btn = document.createElement('button');
  btn.className = 'primary';
  btn.style.marginTop = '25px';
  btn.textContent = 'REINTENTAR';
  btn.onclick = () => location.reload();
  document.querySelector('.loadingInner').appendChild(btn);
}

function createPublicApi() {
  return {
    get character() {
      return actors.character;
    },
    createCar,
    createPerson,
    state,
    player,
    get city() {
      return world.city;
    },
    graph,
    segments,
    driveNetwork,
    pois,
    get scene() {
      return gfx.scene;
    },
    blocked,
    safePoint,
    facadeWork,
    streetEnvironment,
    get view() {
      return {
        position: gfx.camera.position.toArray(),
        mode: view.mode,
        pitch: view.lookPitch,
        yaw: player.a + view.orbit,
        direction: gfx.camera.getWorldDirection(new THREE.Vector3()).toArray(),
        obstructed: view.mode === 0 && cameraSweep(gfx.camera.position) < 1,
      };
    },
    get stats() {
      return gfx.renderer.info.render;
    },
  };
}

function createTestApi() {
  const extra = {
    inBuilding,
    pInside,
    pointSeg,
    jobs,
    input,
    update,
    target,
    interact,
    updateCamera,
    cycleCamera,
    camPos,
    setOrbit: (v) => {
      view.orbit = v;
    },
    carCollision,
    findRoute,
    nearestNode,
    cars,
    start,
    updateHUD,
    frame,
    pauseMenu,
    closeModal,
    loadWorld,
    listStreets,
    openMap,
    help,
    nearestRoad,
    chunks,
    traffic,
    stepAgent,
    vehicles,
    people,
    get sun() {
      return gfx.sun;
    },
    get renderer() {
      return gfx.renderer;
    },
    get quality() {
      return gfx.quality;
    },
    get paused() {
      return session.paused;
    },
  };
  return Object.defineProperties(createPublicApi(), Object.getOwnPropertyDescriptors(extra));
}

export async function startGame({ version = null, platform: injected = {} } = {}) {
  setAssetVersion(version);
  installTouchDetection();
  loadSavedProgress();
  installControls();
  gfx.platform = {
    WebGLRenderer: THREE.WebGLRenderer,
    TextureLoader: THREE.TextureLoader,
    ...injected,
  };
  try {
    await init();
  } catch (err) {
    showStartupError(err);
    return null;
  }
  return createTestApi();
}
