import * as THREE from '../vendor/three.module.min.js';
import {
  actors,
  camPos,
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
import { blocked, inBuilding, nearestRoad, safePoint } from './world/spatial.js';
import { cameraSweep, cycleCamera, updateCamera } from './engine/camera.js';
import { carCollision, createCar } from './game/vehicles.js';
import { closeModal, help, pauseMenu } from './ui/dialogs.js';
import { createPerson } from './game/people.js';
import { findRoute, nearestNode } from './game/graph.js';
import { interact } from './game/player.js';
import { JOBS as jobs } from '../game-data.js';
import { listStreets, openMap } from './ui/map.js';
import { loadWorld, reloadGroundTexture } from './world/loader.js';
import { pInside, pointSeg } from './core/math.js';
import { start } from './game/flow.js';
import { stepAgent } from './game/traffic.js';
import { target } from './game/jobs.js';
import { update } from './game/update.js';
import { updateHUD } from './ui/hud.js';
import { groundHeightAt, surfaceHeightAt, placeVehicle } from './engine/terrain-sampling.js';

export function createPublicApi() {
  return {
    groundHeightAt,
    surfaceHeightAt,
    get terrain() {
      return world.terrain;
    },
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

export function createTestApi(frame) {
  const extra = {
    placeVehicle,
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
    get groundTexture() {
      return world.groundTexture;
    },
    reloadGroundTexture,
    // Simula un puntero fino para probar la ortofoto completa (el arnés es táctil).
    setCoarse: (v) => {
      gfx.coarse = v;
    },
    get paused() {
      return session.paused;
    },
  };
  return Object.defineProperties(createPublicApi(), Object.getOwnPropertyDescriptors(extra));
}
