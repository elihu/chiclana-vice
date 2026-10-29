# Anexo: estado compartido (`web/js/core/state.js`)

Parte de [PLAN-MODULAR.md](../PLAN-MODULAR.md), decisión D3 y pasos 1.3 a 1.7.

## Reglas

1. `state.js` es una **hoja**: solo importa Three y `game-data.js`. No toca el DOM al
   evaluarse.
2. Los contenedores se exportan con su nombre actual (`export const`). Se mutan, nunca se
   reasignan.
3. Las variables reasignables pasan a propiedades de un objeto de grupo con **el mismo
   nombre de propiedad**: la variable `paused` pasa a ser `session.paused`.
4. Nunca se desestructura un objeto de grupo fuera de una función
   (`const { scene } = gfx` en nivel superior guardaría `null`). Dentro de una función se
   puede copiar a una local si no se reasigna mientras se usa.
5. Lo que solo usa un módulo se queda privado en ese módulo (tabla «Privado»).

## Contenido de `state.js`

Partes que se crean en el paso 1.3 («Contenedores») y en los pasos 1.4–1.7 (un grupo por
paso). Las propiedades se declaran todas con su valor inicial actual, en este orden.

```js
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

// --- Grupos de escalares (pasos 1.4 a 1.7) ---
export const world = {
  city: null,
  facadeProfiles: null,
  groundTexture: null,
  worldW: 0,
  worldH: 0,
  mappedStreetObjects: [],
  streetNames: [],
};
export const gfx = {
  renderer: null,
  scene: null,
  camera: null,
  sun: null,
  quality: 'auto',
  needsRender: true,
  contextLost: false,
  W: 0,
  H: 0,
  coarse: false,
  touchSeen: false,
  platform: null,
};
export const session = {
  started: false,
  paused: false,
  t: 0,
  last: 0,
  toastClock: 0,
  toastShown: false,
  collisionClock: 0,
  hold: 0,
  saveClock: 0,
  route: [],
  routeClock: 0,
  mapAerial: false,
};
export const audio = { audioOn: false, audioCtx: null, engineOsc: null, engineGain: null };
export const view = { mode: 0, orbit: 0, lookPitch: 0, orbitAge: 0, firstPersonCar: null };
export const pointer = { joyId: null, dragId: null, dragX: 0, dragY: 0 };
export const actors = { character: null, ring: null, beam: null, arrow: null };
```

`gfx.platform` se añade en el paso 1.13, cuando `platform` sale de `app.js`. En la fase 3
se añade `terrain: null` al final de `world`.

## Tabla de renombrado

| Paso | Variables actuales                                                                                                                      | Pasan a            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1.4  | `city`, `facadeProfiles`, `groundTexture`, `worldW`, `worldH`, `mappedStreetObjects`, `streetNames`                                     | `world.<nombre>`   |
| 1.5  | `renderer`, `scene`, `camera`, `sun`, `quality`, `needsRender`, `contextLost`, `W`, `H`, `coarse`, `touchSeen`                          | `gfx.<nombre>`     |
| 1.6  | `started`, `paused`, `t`, `last`, `toastClock`, `toastShown`, `collisionClock`, `hold`, `saveClock`, `route`, `routeClock`, `mapAerial` | `session.<nombre>` |
| 1.6  | `audioOn`, `audioCtx`, `engineOsc`, `engineGain`                                                                                        | `audio.<nombre>`   |
| 1.7  | `mode`, `orbit`, `lookPitch`, `orbitAge`, `firstPersonCar`                                                                              | `view.<nombre>`    |
| 1.7  | `joyId`, `dragId`, `dragX`, `dragY`                                                                                                     | `pointer.<nombre>` |
| 1.7  | `character`, `ring`, `beam`, `arrow`                                                                                                    | `actors.<nombre>`  |

Ninguno de estos nombres es un global del navegador para ESLint (comprobado con el paquete
`globals` del repositorio), así que, al borrar la declaración `let`, **cualquier referencia
olvidada sale como error `no-undef` en `npm run lint`**. Esa es la comprobación principal.

## Privado (no va a `state.js`)

| Variable                                                      | Módulo dueño          |
| ------------------------------------------------------------- | --------------------- |
| `randSeed`                                                    | `core/random.js`      |
| `ASSET_VERSION`                                               | `core/assets.js`      |
| `domRefs`, `domValues`                                        | `core/dom.js`         |
| `routeDist`, `routePrev`, `routeUsed`, `heapDist`, `heapNode` | `game/graph.js`       |
| `modelGeometryCache`, `modelMaterialCache`                    | `engine/materials.js` |
| `chart`, `chartCtx`                                           | `ui/map.js`           |
| `dialogOpener`                                                | `ui/dialogs.js`       |
| `frameCount`                                                  | `app.js`              |
| `platform` (hasta el paso 1.13)                               | `app.js`              |

## Sombras: locales con el mismo nombre que NO se renombran

Obtenidas con `eslint-scope` sobre `web/game3d.js` de `main` 5666928:

| Nombre | Dónde                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `t`    | Parámetro de `lerp(a, b, t)`                                                                                            |
| `t`    | Variable de intercambio en el bucle que invierte el orden de vértices de los lotes de fachada (`let t = attr.array[…]`) |
| `ring` | `const ring = mark.outline.slice(0, -1)` dentro de `nave()`                                                             |
| `ring` | `for (const ring of [b.p, ...b.holes])` en `buildBuildings`                                                             |

También hay locales `target` (en `setText`, `setStyle`, `updateCamera`, `openDialog`),
`d`, `segments` (parámetro de `modelCylinder`) y `base` (en `mergeParts` y `addSigns`),
pero esos nombres no se renombran (son funciones o contenedores) y no hay que tocarlos.

## Trampas al renombrar

- Propiedades abreviadas: `{ mode, pitch: lookPitch }` dentro del _getter_ `view` pasa a
  `{ mode: view.mode, pitch: view.lookPitch }`. El objeto público conserva las mismas
  claves.
- Plantillas de texto: `${quality === 'low' ? …}` y `${audioOn ? …}` en `pauseMenu`.
- Asignaciones compuestas y desestructuración: `[worldW, worldH] = city.size` pasa a
  `[world.worldW, world.worldH] = world.city.size`.
- Incrementos: `t += dt` → `session.t += dt`; `frameCount++` sigue privado.
- El getter de la API `get quality() { return gfx.quality; }`, igual con `paused`,
  `renderer`, `sun`.

## Comprobación de cada grupo

Además de `npm run lint`, la herramienta de sombras permite confirmar que no queda ninguna
variable de nivel superior con esos nombres. Ejecutar desde la raíz:

```fish
node -e "
const r=require('module').createRequire(process.cwd()+'/node_modules/eslint/package.json');
const espree=r('espree'),scope=r('eslint-scope'),fs=require('fs');
const f=process.argv[1],ast=espree.parse(fs.readFileSync(f,'utf8'),{ecmaVersion:2024,sourceType:'module',range:true,loc:true});
const m=scope.analyze(ast,{ecmaVersion:2024,sourceType:'module'}).scopes.find(s=>s.type==='module');
console.log(m.variables.filter(v=>v.defs[0]?.parent?.kind==='let').map(v=>v.name).join(' '));
" web/js/app.js
```

Tras el paso 1.7 la lista solo debe contener privados de la tabla anterior que sigan en
`app.js` en ese momento (`randSeed`, `ASSET_VERSION`, `routeDist`… hasta que se extraigan,
y siempre `frameCount`).
