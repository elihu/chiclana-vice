import * as THREE from '../vendor/three.module.min.js';
import { $, sleepFrame, ui } from './core/dom.js';
import { SPAWN_POSITION } from '../game-data.js';
import {
  actors,
  base,
  camPos,
  camTarget,
  cars,
  gfx,
  player,
  session,
  traffic,
  vehicles,
  world,
} from './core/state.js';
import { addGroundPlanes, setupRenderer } from './engine/renderer.js';
import { addSigns } from './world/signs.js';
import { applyHeightSamples, loadLayers } from './world/loader.js';
import { buildBuildings } from './world/buildings.js';
import { KIT_PIECES } from './world/facade-kit.js';
import { buildDetailedFacades, prepareFacades } from './world/facades.js';
import { validateCityDesign, validateFacadeDesigns } from './world/design-validate.js';
import { buildRoadDetails, buildStreetSurfaces } from './world/streets.js';
import { buildRoadGraph, connectOpenSpaces, orientDriveGraph } from './game/graph.js';
import { buildTrees } from './world/vegetation.js';
import { buildUrbanFurniture } from './world/furniture.js';
import { clamp } from './core/math.js';
import { createCar } from './game/vehicles.js';
import { createMissionMarkers, setupPOIs } from './game/jobs.js';
import { createPerson } from './game/people.js';
import { createPublicApi, createTestApi } from './test-api.js';
import { drawLabels, updateHUD } from './ui/hud.js';
import { drawMap, prepareMap } from './ui/map.js';
import { indexBuildings, safePoint } from './world/spatial.js';
import { installControls, installTouchDetection } from './ui/controls.js';
import { loadProgress, toast } from './ui/feedback.js';
import { loadSavedProgress } from './game/save.js';
import { setAssetVersion } from './core/assets.js';
import { spawnTraffic } from './game/traffic.js';
import { flatTerrain } from './world/terrain.js';
import { update } from './game/update.js';

async function init() {
  loadProgress('Descargando el trazado y los edificios reales…', 8);
  const { res, tex, aerial, heightSamples, profiles, streetObjects, designs, cityDesign } =
    await loadLayers();
  world.city = res;
  world.terrain = flatTerrain;
  world.mappedStreetObjects = Array.isArray(streetObjects) ? streetObjects : [];
  if (profiles.version !== 1) throw Error('Perfiles incompatibles');
  world.facadeProfiles = profiles;
  const cityErrors = validateCityDesign(cityDesign, {
    recipes: Object.keys(designs?.recipes || {}),
  });
  if (cityErrors.length) throw Error('Diseño de ciudad incompatible: ' + cityErrors.join('; '));
  const designErrors = validateFacadeDesigns(designs, {
    kitPieces: KIT_PIECES,
    palette: profiles.palette,
    frontRecipes: [cityDesign.frontages.recipe],
  });
  if (designErrors.length)
    throw Error('Diseños de fachada incompatibles: ' + designErrors.join('; '));
  world.facadeDesigns = designs;
  world.cityDesign = cityDesign;
  world.groundTexture = tex;
  world.groundTextureFile = tex ? aerial : null;
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
  const api = createTestApi(frame);
  // Modo de depuración opcional: sin `?debug` el módulo ni se pide.
  if (new URLSearchParams(globalThis.location?.search ?? '').has('debug'))
    (await import('./debug/inspector.js')).installInspector(api);
  return api;
}
