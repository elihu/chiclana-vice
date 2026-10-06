// Estado compartido entre módulos. Hoja del grafo: no importa módulos del juego ni toca
// el DOM al evaluarse. Contenedores: se mutan, no se reasignan. Escalares: propiedades
// de los objetos de grupo, con el nombre de la antigua variable de nivel superior.
import * as THREE from '../../vendor/three.module.min.js';
import { INITIAL_POSITION } from '../../game-data.js';

// --- Contenedores (paso 1.3) ---
export const input = {
  left: false,
  right: false,
  gas: false,
  brake: false,
  boost: false,
  jx: 0,
  jy: 0,
};
export const keys = {};
export const holdPointers = new Map();
// Valores por defecto; loadSavedProgress() aplica la partida guardada.
export const state = {
  cash: 0,
  job: 0,
  stage: 0,
  timer: 0,
  wanted: 0,
  heat: 0,
  arrest: 0,
  found: new Set(),
  health: 100,
};
export const player = { ...INITIAL_POSITION, a: 0, speed: 0, car: null };
export const base = { ...INITIAL_POSITION };
export const camPos = new THREE.Vector3(),
  camTarget = new THREE.Vector3(),
  camDesired = new THREE.Vector3(),
  camLook = new THREE.Vector3(),
  labelPoint = new THREE.Vector3();
export const cars = [],
  police = [],
  traffic = [],
  vehicles = [], // cars + traffic, kept in sync instead of spreading both every frame
  people = [],
  chunks = [],
  waterAreas = [],
  pois = [],
  graph = [],
  segments = [],
  buildingGrid = new Map();
export const driveNetwork = { oneway: 0, relaxed: 0, blocked: 0, components: 0, mainNodes: 0 };
export const facadeWork = {
  fronts: [],
  parts: 0,
  streetNames: [
    'Calle Constitución',
    'Calle de la Vega',
    'Calle de la Plaza',
    'Calle Caraza',
    'Calle Jesús Nazareno',
    'Calle Álamo',
    'Calle Garcia Gutierrez',
    'Calle Corredera Baja',
  ],
};
export const streetEnvironment = {
  colliders: [],
  lamps: 0,
  benches: 0,
  bollards: 0,
  bins: 0,
  trees: 0,
  crossings: 0,
  surfaces: 0,
  signs: 0,
};
