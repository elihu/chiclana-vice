import { setRandomSeed } from './core/random.js';
import { boundsBox } from './world/bounds.js';
import * as THREE from '../vendor/three.webgpu.min.js';
import { $, sleepFrame, ui, urlOptions } from './core/dom.js';
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
import { addGroundPlanes, placeSun, renderFrame, setupRenderer } from './engine/renderer.js';
import { precompileShaders } from './engine/precompile.js';
import { installPerf, resetPerf, tickPerf } from './ui/perf.js';
import { addSigns } from './world/signs.js';
import { addShopSigns } from './world/shop-signs.js';
import { buildBarriers } from './world/barriers.js';
import { buildTram } from './world/tram.js';
import { applyHeightSamples, loadLayers } from './world/loader.js';
import { buildBuildings } from './world/buildings.js';
import { KIT_PIECES } from './world/facade-kit.js';
import { buildDetailedFacades, prepareFacades } from './world/facades.js';
import { validateCityDesign, validateFacadeDesigns } from './world/design-validate.js';
import { buildRoadDetails, buildStreetSurfaces } from './world/streets.js';
import { buildRoadGraph, connectOpenSpaces, orientDriveGraph } from './game/graph.js';
import { buildTrees } from './world/vegetation.js';
import { prepareGroundClean } from './world/ground-clean.js';
import { buildShadowProxies } from './world/shadow-proxies.js';
import { buildUrbanFurniture } from './world/furniture.js';
import { clamp } from './core/math.js';
import { createCar } from './game/vehicles.js';
import { createMissionMarkers, setupPOIs } from './game/jobs.js';
import { createPerson } from './game/people.js';
import { createPublicApi, createTestApi } from './test-api.js';
import { drawLabels, updateHUD } from './ui/hud.js';
import { drawMap, prepareMap } from './ui/map.js';
import { indexBuildings, safePoint } from './world/spatial.js';
import { describeTime, installControls, installTouchDetection } from './ui/controls.js';
import { loadProgress, toast } from './ui/feedback.js';
import { initialTime, setTimeOfDay } from './engine/time-of-day.js';
import { loadSavedProgress } from './game/save.js';
import { setAssetVersion } from './core/assets.js';
import { spawnTraffic, updatePedestrians } from './game/traffic.js';
import { terrainTiles, terrainExterior } from './world/terrain-mesh.js';
import { prepareTerrainPlacement } from './world/terrain-placement.js';
import { surfaceHeightAt, placeVehicle, placeVehicleIfChanged } from './engine/terrain-sampling.js';
import { aerialMaterial, updateAerialTiles } from './world/aerial-tiles.js';
import { update } from './game/update.js';

async function init(startupTimings) {
  let {
    res,
    tex,
    aerial,
    aerialIndex,
    heightSamples,
    profiles,
    streetObjects,
    designs,
    cityDesign,
    vegetation,
    groundFloors,
    tram,
    barriers,
    terrain,
    warning,
  } = {};
  const stages = [
    {
      name: 'loadLayers',
      run: async () => {
        loadProgress('Descargando el trazado y los edificios reales…', 8);
        ({
          res,
          tex,
          aerial,
          aerialIndex,
          heightSamples,
          profiles,
          streetObjects,
          designs,
          cityDesign,
          vegetation,
          groundFloors,
          tram,
          barriers,
          terrain,
          warning,
        } = await loadLayers());
      },
    },
    {
      name: 'prepareWorld',
      run: () => {
        world.city = res;
        world.vegetation = vegetation;
        world.groundFloors = groundFloors;
        world.tram = tram;
        world.barriers = barriers;
        world.terrain = terrain;
        if (warning) toast(warning, 5);
        world.mappedStreetObjects = Array.isArray(streetObjects) ? streetObjects : [];
        if (profiles.version !== 1) throw Error('Perfiles incompatibles');
        world.facadeProfiles = profiles;
        const cityErrors = validateCityDesign(cityDesign, {
          recipes: Object.keys(designs?.recipes || {}),
        });
        if (cityErrors.length)
          throw Error('Diseño de ciudad incompatible: ' + cityErrors.join('; '));
        const designErrors = validateFacadeDesigns(designs, {
          kitPieces: KIT_PIECES,
          palette: profiles.palette,
          frontRecipes: [cityDesign.frontages.recipe],
        });
        if (designErrors.length)
          throw Error('Diseños de fachada incompatibles: ' + designErrors.join('; '));
        world.facadeDesigns = designs;
        world.cityDesign = cityDesign;
        setRandomSeed(cityDesign.randomSeed);
        world.groundTexture = tex;
        world.groundTextureFile = tex ? aerial : null;
        if (world.groundTexture) {
          world.groundTexture.colorSpace = THREE.SRGBColorSpace;
          world.groundTexture.anisotropy = 4;
        } else toast('Ortofoto no disponible: suelo y tejados en color liso', 5);
        world.aerialIndex = aerialIndex;
        world.aerialBox = aerialIndex?.general.box ?? boundsBox();
      },
    },
    {
      name: 'setupRenderer',
      run: async () => {
        loadProgress('Preparando el mundo 3D…', 25);
        await setupRenderer(() => {
          setTimeOfDay(initialTime(), { bake: false });
          describeTime();
        });
      },
    },
    { name: 'buildRoadGraph', run: buildRoadGraph },
    { name: 'indexBuildings', run: indexBuildings },
    { name: 'prepareTerrainPlacement', run: prepareTerrainPlacement },
    {
      name: 'addGroundPlanes',
      run: () => {
        addGroundPlanes(
          terrainTiles(terrain).map((tile) => ({
            ...tile,
            material: aerialMaterial(tile.i, tile.j, { roughness: 1, detail: true }),
          })),
          terrainExterior(terrain),
        );
      },
    },
    { name: 'connectOpenSpaces', run: connectOpenSpaces },
    { name: 'orientDriveGraph', run: orientDriveGraph },
    {
      name: 'applyHeightSamples',
      run: () => {
        applyHeightSamples(heightSamples);
      },
    },
    { name: 'prepareFacades', run: prepareFacades },
    { name: 'buildBuildings', run: buildBuildings },
    { name: 'buildDetailedFacades', run: buildDetailedFacades },
    {
      name: 'buildStreetSurfaces',
      run: async () => {
        loadProgress('Colocando puentes, vehículos y señales…', 68);
        await sleepFrame();
        buildStreetSurfaces();
      },
    },
    { name: 'buildRoadDetails', run: buildRoadDetails },
    { name: 'buildTram', run: buildTram },
    { name: 'buildUrbanFurniture', run: buildUrbanFurniture },
    { name: 'buildBarriers', run: buildBarriers },
    { name: 'buildTrees', run: buildTrees },
    { name: 'prepareGroundClean', run: prepareGroundClean },
    { name: 'addSigns', run: addSigns },
    { name: 'addShopSigns', run: addShopSigns },
    { name: 'buildShadowProxies', run: buildShadowProxies },
    { name: 'setupPOIs', run: setupPOIs },
    {
      name: 'spawnActors',
      run: () => {
        let spawn = safePoint(SPAWN_POSITION.x, SPAWN_POSITION.z, true);
        Object.assign(base, spawn);
        let car = createCar('#bba979');
        Object.assign(car, spawn);
        cars.push(car);
        Object.assign(player, spawn);
        player.car = car;
        updateAerialTiles(player.x, player.z);
        actors.character = createPerson('#d7d5b0');
        actors.character.mesh.visible = false;
        spawnTraffic();
        if (terrain.kind === 'grid') updatePedestrians(0);
        vehicles.push(...cars, ...traffic);
        createMissionMarkers();
        for (const c of vehicles) placeVehicle(c);
      },
    },
    {
      name: 'prepareCamera',
      run: () => {
        camPos.set(player.x - 15, surfaceHeightAt(player.x, player.z) + 12, player.z - 15);
        camTarget.set(player.x, surfaceHeightAt(player.x, player.z) + 1, player.z);
        gfx.camera.position.copy(camPos);
        gfx.camera.lookAt(camTarget);
        $('streetCount').textContent =
          new Set(world.city.roads.filter((r) => r.name).map((r) => r.name)).size +
          ' calles con nombre';
      },
    },
    {
      name: 'precompileShaders',
      run: async () => {
        loadProgress('Compilando los shaders…', 80);
        await sleepFrame();
        await precompileShaders(({ loaded, total }) =>
          loadProgress('Compilando los shaders…', 80 + Math.round((loaded / total) * 19)),
        );
      },
    },
    {
      name: 'finishStartup',
      run: async () => {
        loadProgress('Centro de Chiclana listo.', 100);
        updateHUD();
        prepareMap();
        await sleepFrame();
        $('loading').classList.add('hidden');
        $('welcome').classList.remove('hidden');
        session.last = performance.now();
        requestAnimationFrame(frame);
        window.__cityGame = createPublicApi();
      },
    },
  ];
  for (const stage of stages) {
    const started = performance.now();
    await stage.run();
    startupTimings.push({ name: stage.name, ms: performance.now() - started });
  }
}

let frameCount = 0;

function frame(now) {
  let dt = clamp((now - session.last) / 1000, 0, 0.04) || 0.016;
  session.last = now;
  if (session.started && !session.paused) update(dt);
  else if (!session.started) {
    session.t += dt;
    const ground = surfaceHeightAt(player.x, player.z);
    gfx.camera.position.set(
      player.x + Math.sin(session.t * 0.075) * 36,
      ground + 22,
      player.z + Math.cos(session.t * 0.075) * 36,
    );
    gfx.camera.lookAt(player.x, ground, player.z);
    placeSun(player.x, ground, player.z);
    for (let c of vehicles) {
      placeVehicleIfChanged(c);
    }
  }
  // While paused (map, modal), the last frame stays on screen; redraw only on demand.
  if (!gfx.contextLost && (!session.started || !session.paused || gfx.needsRender)) {
    renderFrame();
    gfx.needsRender = false;
    if (session.started && session.paused) resetPerf();
    else tickPerf(now);
  } else resetPerf();
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
    Renderer: THREE.WebGPURenderer,
    TextureLoader: THREE.TextureLoader,
    ...injected,
  };
  installPerf();
  const startupTimings = [];
  try {
    await init(startupTimings);
  } catch (err) {
    showStartupError(err);
    return null;
  }
  const options = urlOptions();
  if (options.has('fps') || options.has('debug')) console.table(startupTimings);
  const api = createTestApi(frame, () => startupTimings.map((stage) => ({ ...stage })));
  // Modo de depuración opcional: sin `?debug` el módulo ni se pide.
  if (new URLSearchParams(globalThis.location?.search ?? '').has('debug'))
    (await import('./debug/inspector.js')).installInspector(api);
  return api;
}
