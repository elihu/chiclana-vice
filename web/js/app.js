import * as THREE from '../vendor/three.module.min.js';
import { $, sleepFrame, ui } from './core/dom.js';
import { SPAWN_POSITION, JOBS as jobs } from '../game-data.js';
import {
  actors,
  base,
  camPos,
  camTarget,
  cars,
  chunks,
  driveNetwork,
  facadeWork,
  gfx,
  graph,
  input,
  people,
  player,
  pois,
  segments,
  session,
  state,
  streetEnvironment,
  traffic,
  vehicles,
  view,
  world,
} from './core/state.js';
import { addGroundPlanes, setupRenderer } from './engine/renderer.js';
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
import { cameraSweep, cycleCamera, updateCamera } from './engine/camera.js';
import { carCollision, createCar } from './game/vehicles.js';
import { clamp, pInside, pointSeg } from './core/math.js';
import { closeModal, help, pauseMenu } from './ui/dialogs.js';
import { createMissionMarkers, setupPOIs, target } from './game/jobs.js';
import { createPerson } from './game/people.js';
import { drawLabels, updateHUD } from './ui/hud.js';
import { drawMap, listStreets, openMap, prepareMap } from './ui/map.js';
import { installControls, installTouchDetection } from './ui/controls.js';
import { interact } from './game/player.js';
import { loadProgress, toast } from './ui/feedback.js';
import { loadSavedProgress } from './game/save.js';
import { setAssetVersion } from './core/assets.js';
import { spawnTraffic, stepAgent } from './game/traffic.js';
import { start } from './game/flow.js';
import { update } from './game/update.js';

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
