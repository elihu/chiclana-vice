import * as THREE from '../vendor/three.module.min.js';
import { $, setStyle, setText, sleepFrame, ui } from './core/dom.js';
import { PLACES, SAVE_KEY, SPAWN_POSITION, VIEWPOINTS, JOBS as jobs } from '../game-data.js';
import { TAU, clamp, d, fold, lerp, pInside, pointSeg } from './core/math.js';
import {
  actors,
  audio,
  base,
  buildingGrid,
  camDesired,
  camLook,
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
  labelPoint,
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
import { carCollision, createCar, nearestCar } from './game/vehicles.js';
import { createPerson } from './game/people.js';
import { loadProgress, toast } from './ui/feedback.js';
import { loadSavedProgress, save } from './game/save.js';
import { setAssetVersion } from './core/assets.js';
import { spawnTraffic, stepAgent, updatePedestrians } from './game/traffic.js';

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

function setupPOIs() {
  for (const [name, x, z] of PLACES) {
    let safe = safePoint(x, z);
    let el = document.createElement('span');
    el.className = 'poi';
    el.textContent = name;
    $('poiLabels').appendChild(el);
    pois.push({ name, x: safe.x, z: safe.z, labelX: x, labelZ: z, el });
  }
}

function target() {
  let j = jobs[state.job];
  if (!j) return null;
  let s = j.stages[state.stage];
  return { ...pois[s.poi], ...s };
}

function updateHUD() {
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
  actors.ring = new THREE.Mesh(
    new THREE.RingGeometry(5.5, 6.2, 48),
    new THREE.MeshBasicMaterial({
      color: '#ffd285',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  actors.ring.rotation.x = -Math.PI / 2;
  actors.ring.position.y = 0.15;
  gfx.scene.add(actors.ring);
  actors.beam = new THREE.Mesh(
    new THREE.CylinderGeometry(5.6, 5.6, 4, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#ffc177',
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  gfx.scene.add(actors.beam);
  let arrowGeo = new THREE.ConeGeometry(0.55, 1.5, 4);
  actors.arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#edfa88' }));
  gfx.scene.add(actors.arrow);
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

function start() {
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

function setHeat(n) {
  state.wanted = clamp(state.wanted + n, 0, 5);
  state.heat = 22 + state.wanted * 7;
  updateHUD();
}

function advanceStage() {
  let j = jobs[state.job];
  if (!j) return;
  if (state.stage === 0) {
    state.timer = j.limit;
    if (j.stages.some((s) => s.escape)) {
      setHeat(2);
      toast('Te han visto. Entrega el paquete y despista a las patrullas.', 5);
    } else toast('Recogida completada. Sigue la ruta del minimapa.', 3);
  }
  state.stage++;
  session.hold = 0;
  session.routeClock = 0;
  if (state.stage >= j.stages.length) {
    state.cash += j.reward;
    toast('ENCARGO COMPLETADO · +' + j.reward + ' €', 5);
    state.job++;
    state.stage = 0;
    state.timer = 0;
    save();
  }
  updateHUD();
}

function dropPolice() {
  for (const p of police) {
    gfx.scene.remove(p.mesh);
  }
  police.length = 0;
  state.wanted = 0;
  state.arrest = 0;
  updateHUD();
}

function rescue() {
  state.cash = Math.max(0, state.cash - 100);
  dropPolice();
  let p = safePoint(base.x, base.z, true);
  if (player.car) {
    Object.assign(player.car, p);
    player.car.speed = 0;
    player.car.health = 100;
  }
  Object.assign(player, p);
  state.health = 100;
  snapCamera();
  toast('Traslado a la Alameda y reparación · 100 €', 4);
  save();
  updateHUD();
}

function interact() {
  if (!session.started || session.paused) return;
  if (player.car) {
    let c = player.car;
    if (Math.abs(c.speed) > 2.5) {
      toast('Frena antes de bajar.', 2);
      return;
    }
    let exit = null;
    for (const sign of [1, -1]) {
      let x = c.x + Math.cos(c.a) * 2.2 * sign,
        z = c.z - Math.sin(c.a) * 2.2 * sign;
      if (!blocked(x, z, 0.35)) {
        exit = { x, z };
        break;
      }
    }
    if (!exit) {
      toast('No hay espacio para abrir la puerta. Avanza un poco.', 3);
      return;
    }
    player.car = null;
    Object.assign(player, exit);
    player.speed = 0;
    toast('A pie · Usa el joystick. Arrastra la escena para mirar.', 3);
  } else {
    let c = nearestCar();
    if (!c) {
      toast('Acércate a un coche detenido para subir.', 3);
      return;
    }
    let i = traffic.indexOf(c);
    if (i >= 0) {
      traffic.splice(i, 1);
      cars.push(c);
      setHeat(1);
    }
    player.car = c;
    player.x = c.x;
    player.z = c.z;
    player.a = c.a;
    state.health = c.health;
    toast('Al volante · GAS, FRENO y flechas para girar.', 3);
  }
  updateHUD();
  snapCamera();
}

function updatePlayer(dt) {
  let steer =
      (input.right || keys.d || keys.ArrowRight ? 1 : 0) -
      (input.left || keys.a || keys.ArrowLeft ? 1 : 0),
    gas = input.gas || keys.w || keys.ArrowUp,
    brake = input.brake || keys.s || keys.ArrowDown,
    boost = input.boost || keys.Shift;
  const hand = keys[' '];
  if (player.car) {
    let c = player.car,
      max = boost ? 40 : 28;
    if (gas) c.speed += dt * (c.speed < 0 ? 16 : 9.5);
    else if (brake) c.speed -= dt * (c.speed > 0 ? 17 : 5);
    else
      c.speed =
        Math.sign(c.speed) * Math.max(0, Math.abs(c.speed) - dt * (2.3 + Math.abs(c.speed) * 0.08));
    if (hand) c.speed *= Math.exp(-dt * 4);
    c.speed = clamp(c.speed, -7, max);
    let steerAngle = (steer * 0.48) / (1 + Math.abs(c.speed) * 0.028);
    c.a -= (c.speed / 2.8) * Math.tan(steerAngle) * dt;
    let nx = c.x + Math.sin(c.a) * c.speed * dt,
      nz = c.z + Math.cos(c.a) * c.speed * dt;
    if (carCollision(c, nx, nz)) {
      if (Math.abs(c.speed) > 4 && session.collisionClock <= 0) {
        c.health -= Math.min(20, Math.abs(c.speed) * 0.45);
        session.collisionClock = 0.6;
        toast('Golpe · Frena y maniobra hacia atrás.', 1.8);
      }
      c.speed *= -0.15;
    } else {
      c.x = nx;
      c.z = nz;
    }
    for (let k = 0, total = vehicles.length + police.length; k < total; k++) {
      const other = k < vehicles.length ? vehicles[k] : police[k - vehicles.length];
      if (other === c || d(c, other) > 3.1) continue;
      if (session.collisionClock <= 0 && Math.abs(c.speed) > 3) {
        c.health -= 5;
        c.speed *= -0.15;
        session.collisionClock = 1.3;
        setHeat(other.cop ? 1 : state.wanted < 2 ? 1 : 0);
      }
    }
    player.x = c.x;
    player.z = c.z;
    player.a = c.a;
    player.speed = c.speed;
    state.health = c.health;
    c.mesh.rotation.z = lerp(
      c.mesh.rotation.z,
      -steer * Math.min(0.04, Math.abs(c.speed) * 0.002),
      dt * 6,
    );
    if (c.health <= 0) rescue();
  } else {
    let ix = input.jx,
      iy = -input.jy;
    if (pointer.joyId === null) {
      ix = steer;
      iy = (gas ? 1 : 0) - (brake ? 1 : 0);
    }
    let mag = Math.min(1, Math.hypot(ix, iy)),
      heading = player.a + view.orbit;
    let a = heading - Math.atan2(ix, iy),
      v = (boost ? 6.1 : 3.2) * mag;
    if (mag > 0.1) {
      let nx = player.x + Math.sin(a) * v * dt,
        nz = player.z + Math.cos(a) * v * dt;
      if (!blocked(nx, player.z, 0.28)) player.x = nx;
      if (!blocked(player.x, nz, 0.28)) player.z = nz;
      actors.character.mesh.rotation.y = a;
    }
    player.speed = v;
    actors.character.mesh.position.set(player.x, 0, player.z);
    actors.character.limbs.forEach(
      (l, i) =>
        (l.rotation.x =
          Math.sin(session.t * (boost ? 12 : 8) + (i % 2) * Math.PI) * Math.min(0.65, v * 0.13)),
    );
  }
  if (audio.audioCtx && audio.engineGain) {
    audio.engineGain.gain.setTargetAtTime(
      audio.audioOn && player.car ? 0.022 : 0,
      audio.audioCtx.currentTime,
      0.1,
    );
    audio.engineOsc.frequency.setTargetAtTime(
      32 + Math.abs(player.speed) * 5,
      audio.audioCtx.currentTime,
      0.1,
    );
  }
}

function updatePolice(dt) {
  if (!state.wanted) return;
  while (police.length < Math.min(3, state.wanted + 1)) {
    let best = null;
    for (let i = 0; i < graph.length; i++) {
      let n = graph[i],
        di = Math.hypot(player.x - n.x, player.z - n.z);
      if (
        di > 130 + police.length * 30 &&
        di < 180 + police.length * 30 &&
        n.driveMain &&
        !blocked(n.x, n.z, 1)
      ) {
        best = i;
        break;
      }
    }
    if (best === null) break;
    let p = createCar('#293946', true),
      n = graph[best];
    Object.assign(p, {
      x: n.x,
      z: n.z,
      a: 0,
      node: best,
      next: n.adj.find((e) => e.drive).to,
      cruise: 12 + state.wanted,
      think: 0,
    });
    police.push(p);
  }
  let close = false;
  for (const p of police) {
    p.think -= dt;
    if (p.think <= 0) {
      p.path = findRoute(p.node, nearestNode(player.x, player.z, true), true);
      p.think = 3;
    }
    stepAgent(p, dt, true);
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.a;
    if (p.siren) p.siren.visible = Math.sin(session.t * 14) > -0.5;
    if (d(p, player) < 9) {
      close = true;
      if (Math.abs(player.speed) < 3) state.arrest += dt;
    } else if (d(p, player) > 400) {
      gfx.scene.remove(p.mesh);
      police.splice(police.indexOf(p), 1);
      break;
    }
  }
  if (!close) state.arrest = Math.max(0, state.arrest - dt);
  if (state.arrest > 4) {
    state.cash = Math.max(0, state.cash - 150);
    dropPolice();
    toast('Te han parado · Multa de 150 €', 4);
    save();
    return;
  }
  state.heat -= dt * (close ? 0.2 : 1);
  if (state.heat <= 0) {
    dropPolice();
    toast('HAS DESPISTADO A LA POLICÍA', 4);
  }
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
  let goal = target();
  if (goal) {
    if (state.timer > 0) {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.stage = 0;
        session.hold = 0;
        toast('Tiempo agotado. Vuelve al punto de recogida para intentarlo de nuevo.', 4);
        updateHUD();
        goal = target();
      }
    }
    if (goal.escape) {
      if (state.wanted === 0) advanceStage();
    } else if (d(player, goal) < 8 && Math.abs(player.speed) < 1.8) {
      session.hold += dt;
      if (session.hold > 1) advanceStage();
    } else session.hold = 0;
    goal = target();
  }
  for (let i = 0; i < pois.length; i++)
    if (d(player, pois[i]) < 24 && !state.found.has(i)) {
      state.found.add(i);
      state.cash += 75;
      toast('LUGAR DESCUBIERTO · ' + pois[i].name + ' · +75 €', 3);
      updateHUD();
      save();
    }
  if (goal && !goal.escape) {
    actors.ring.visible = actors.beam.visible = true;
    actors.ring.position.set(goal.x, 0.16, goal.z);
    actors.ring.scale.setScalar(1 + Math.sin(session.t * 2) * 0.025);
    actors.beam.position.set(goal.x, 2, goal.z);
    actors.beam.material.opacity = 0.1 + Math.sin(session.t * 2) * 0.025;
    actors.arrow.visible = true;
    actors.arrow.position.set(goal.x, 6 + Math.sin(session.t * 2) * 0.4, goal.z);
    actors.arrow.rotation.z = Math.PI;
    actors.arrow.rotation.y = session.t * 0.7;
  } else actors.ring.visible = actors.beam.visible = actors.arrow.visible = false;
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
  session.saveClock += dt;
  if (session.saveClock > 10) {
    session.saveClock = 0;
    save();
  }
}

function updateCameraVisibility() {
  if (view.firstPersonCar && (view.mode !== 1 || view.firstPersonCar !== player.car))
    view.firstPersonCar.firstPersonOccluders.forEach((m) => (m.visible = true));
  view.firstPersonCar = view.mode === 1 ? player.car : null;
  if (view.firstPersonCar)
    view.firstPersonCar.firstPersonOccluders.forEach((m) => (m.visible = false));
  actors.character.mesh.visible = !player.car && view.mode !== 1;
}

function snapCamera() {
  view.orbit = 0;
  view.lookPitch = 0;
  updateCamera(1);
}

// Sweep against cadastral volumes at the ray height; camera only, no physics changes.
function cameraSweep(position) {
  let dx = position.x - player.x,
    dz = position.z - player.z,
    length = Math.hypot(dx, dz),
    steps = Math.max(1, Math.ceil(length / 0.25));
  for (let i = 1; i <= steps; i++) {
    let u = i / steps,
      x = player.x + dx * u,
      z = player.z + dz * u,
      y = lerp(1.1, position.y, u),
      pad = 0.18;
    const seen = new Set();
    for (let gx = Math.floor((x - pad) / 25); gx <= Math.floor((x + pad) / 25); gx++)
      for (let gz = Math.floor((z - pad) / 25); gz <= Math.floor((z + pad) / 25); gz++)
        for (const b of buildingGrid.get(gx + ',' + gz) || []) {
          if (seen.has(b)) continue;
          seen.add(b);
          if (
            y > (b.renderH ?? b.h) + pad ||
            x < b.minX - pad ||
            x > b.maxX + pad ||
            z < b.minZ - pad ||
            z > b.maxZ + pad
          )
            continue;
          let hit = pInside(x, z, b.p) && !b.holes.some((h) => pInside(x, z, h));
          if (!hit)
            for (let k = 0; k < b.p.length; k++)
              if (pointSeg(x, z, b.p[k], b.p[(k + 1) % b.p.length]).d < pad) {
                hit = true;
                break;
              }
          if (hit) return Math.max(0, (i - 1) / steps - 0.2 / (length || 1));
        }
  }
  return 1;
}

function constrainCamera(position) {
  let u = cameraSweep(position);
  if (u < 1) {
    position.x = lerp(player.x, position.x, u);
    position.z = lerp(player.z, position.z, u);
  }
}

function updateCamera(dt) {
  let heading = player.a + view.orbit,
    follow = player.car ? 9.7 : 5.9,
    y = player.car ? 4.7 : 3.2,
    look = player.car ? 4.8 : 2.8;
  let desired, target;
  if (view.mode === 1) {
    let ahead = player.car ? -0.15 : 0,
      side = player.car ? 0.38 : 0;
    desired = camDesired.set(
      player.x + Math.sin(player.a) * ahead + Math.cos(player.a) * side,
      player.car ? 1.2 : 1.61,
      player.z + Math.cos(player.a) * ahead - Math.sin(player.a) * side,
    );
    target = camLook.set(
      desired.x + Math.sin(heading) * Math.cos(view.lookPitch) * 18,
      desired.y + Math.sin(view.lookPitch) * 18,
      desired.z + Math.cos(heading) * Math.cos(view.lookPitch) * 18,
    );
    camPos.copy(desired);
    camTarget.copy(target);
  } else {
    if (view.mode === 2) {
      follow = 25;
      y = 45;
      look = 0;
    }
    desired = camDesired.set(
      player.x - Math.sin(heading) * follow,
      y,
      player.z - Math.cos(heading) * follow,
    );
    target = camLook.set(
      player.x + Math.sin(heading) * look,
      view.mode === 2 ? 0 : 1.1 + Math.tan(view.lookPitch) * look,
      player.z + Math.cos(heading) * look,
    );
    if (view.mode === 0) constrainCamera(desired);
    camPos.lerp(desired, 1 - Math.exp(-dt * 6));
    camTarget.lerp(target, 1 - Math.exp(-dt * 8));
    if (view.mode === 0) constrainCamera(camPos);
  }
  updateCameraVisibility();
  gfx.camera.position.copy(camPos);
  gfx.camera.lookAt(camTarget);
  gfx.sun.position.set(player.x - 85, 125, player.z + 60);
  gfx.sun.target.position.set(player.x, 0, player.z);
  gfx.sun.target.updateMatrixWorld();
  // In light mode, chunks beyond the fog end are culled (measured from the camera).
  const low = gfx.quality === 'low',
    reach = low ? gfx.scene.fog.far : view.mode === 2 ? 650 : 520,
    ox = low ? gfx.camera.position.x : player.x,
    oz = low ? gfx.camera.position.z : player.z;
  for (const group of chunks) {
    let m = group.children[0],
      c = m.geometry.boundingSphere;
    group.visible = Math.hypot(c.center.x - ox, c.center.z - oz) < reach + c.radius;
  }
}

function drawLabels() {
  for (const p of pois) {
    let di = Math.hypot(p.labelX - player.x, p.labelZ - player.z);
    if (di > 125 || view.mode === 1) {
      setStyle(p.el, 'display', 'none');
      continue;
    }
    let v = labelPoint.set(p.labelX, 14, p.labelZ).project(gfx.camera);
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
  let v = labelPoint.set(goal.x, 2, goal.z).project(gfx.camera);
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

function mute() {
  if (audio.engineGain) audio.engineGain.gain.setTargetAtTime(0, audio.audioCtx.currentTime, 0.1);
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

function toggleAudio() {
  audio.audioOn = !audio.audioOn;
  try {
    if (audio.audioOn && !audio.audioCtx) {
      audio.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audio.engineOsc = audio.audioCtx.createOscillator();
      audio.engineGain = audio.audioCtx.createGain();
      audio.engineOsc.type = 'sawtooth';
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(audio.engineGain).connect(audio.audioCtx.destination);
      audio.engineOsc.start();
    }
    if (audio.audioOn) audio.audioCtx.resume();
    else mute();
  } catch {
    audio.audioOn = false;
  }
  toast(audio.audioOn ? 'Sonido del motor activado' : 'Sonido desactivado', 2);
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

function cycleCamera() {
  view.mode = (view.mode + 1) % 3;
  snapCamera();
  toast(
    ['Cámara de seguimiento', 'Primera persona · mirada libre', 'Vista aérea del trazado real'][
      view.mode
    ],
    2,
  );
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
