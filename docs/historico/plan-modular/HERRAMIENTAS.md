# Anexo: herramientas, arnés y API de pruebas

Parte de [PLAN-MODULAR.md](../PLAN-MODULAR.md). El código de H1, H2, H3 y H7 está
formateado con la configuración de Prettier del repositorio y pasa ESLint; H1 y H2 se han
ejecutado contra `main` 5666928 y H3, H4 (variante del paso 1.1), H5 y H7 contra una copia
del repositorio con los pasos 1.1 y 1.2 aplicados en el scratchpad: `verify3d` pasa, la
huella es idéntica a la de `main` y el humo en Chrome arranca sin errores con 13 peticiones
versionadas. Cópialos tal cual.

## H1. `tools/scene-fingerprint.mjs`

```js
// Huella de la escena y del comportamiento en CPU (DOM y WebGL simulados; no prueba GPU).
// Uso, desde la raíz del repositorio que se quiere medir:
//   node tools/scene-fingerprint.mjs --out /tmp/chiclana-fp/base.json
//   node tools/scene-fingerprint.mjs --compare /tmp/chiclana-fp/base.json
//   node tools/scene-fingerprint.mjs --compare base.json --ignore resources  (omite claves de primer nivel)
//   node tools/scene-fingerprint.mjs --dump /tmp/chiclana-fp/objetos.txt  (una línea por objeto)
// El arnés se importa desde el directorio actual, así que el mismo script mide otra copia
// (por ejemplo, un worktree en el commit base) si se ejecuta con esa copia como cwd.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const { createRuntime } = await import(
  pathToFileURL(path.resolve('tests/runtime-harness.mjs')).href
);
const { g, els, requested } = await createRuntime();
const sha = () => createHash('sha256');
const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const hashArray = (a) => sha().update(bytes(a)).digest('hex');
const color = (c) => (c?.isColor ? c.getHexString() : (c ?? null));

function materialSignature(m) {
  const keys = [
    'type',
    'side',
    'transparent',
    'opacity',
    'depthWrite',
    'vertexColors',
    'roughness',
    'metalness',
    'emissiveIntensity',
    'flatShading',
  ];
  const out = Object.fromEntries(keys.map((k) => [k, m[k] ?? null]));
  out.color = color(m.color);
  out.emissive = color(m.emissive);
  out.map = m.map
    ? [m.map.constructor.name, m.map.wrapS, m.map.wrapT, m.map.colorSpace, m.map.anisotropy]
    : null;
  return out;
}
function geometrySignature(geometry) {
  const h = sha();
  for (const name of Object.keys(geometry.attributes).sort()) {
    h.update(name);
    h.update(bytes(geometry.attributes[name].array));
  }
  if (geometry.index) h.update(bytes(geometry.index.array));
  return h.digest('hex');
}

// 1. Escena: orden de recorrido, transformaciones, geometría, materiales e instancias.
const counts = {
  objects: 0,
  meshes: 0,
  instancedMeshes: 0,
  instances: 0,
  triangles: 0,
  trianglesWithoutInstancing: 0,
};
const materials = new Set(),
  textures = new Set(),
  geometries = new Set(),
  lines = [];
g.scene.updateMatrixWorld(true);
g.scene.traverse((o) => {
  counts.objects++;
  const record = [
    o.type,
    o.name,
    o.visible,
    o.castShadow,
    o.receiveShadow,
    o.renderOrder,
    o.frustumCulled,
    [...o.matrixWorld.elements],
  ];
  if (o.isLight)
    record.push(color(o.color), o.intensity, o.castShadow, o.shadow?.bias, o.shadow?.normalBias);
  if (o.isMesh) {
    counts.meshes++;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      materials.add(m);
      if (m.map) textures.add(m.map);
    }
    geometries.add(o.geometry);
    const position = o.geometry.getAttribute('position'),
      triangles = (o.geometry.index ? o.geometry.index.count : position.count) / 3;
    counts.trianglesWithoutInstancing += triangles;
    record.push(geometrySignature(o.geometry), list.map(materialSignature));
    if (o.isInstancedMesh) {
      counts.instancedMeshes++;
      counts.instances += o.count;
      counts.triangles += triangles * o.count;
      record.push(
        o.count,
        hashArray(o.instanceMatrix.array),
        o.instanceColor ? hashArray(o.instanceColor.array) : null,
      );
    } else counts.triangles += triangles;
  }
  lines.push(JSON.stringify(record));
});
const scene = {
  ...counts,
  materials: materials.size,
  textures: textures.size,
  geometries: geometries.size,
  strict: sha().update(lines.join('\n')).digest('hex'),
  unordered: sha()
    .update(
      lines
        .map((l) => sha().update(l).digest('hex'))
        .sort()
        .join(),
    )
    .digest('hex'),
};

// 2. Render: ajustes del renderizador simulado, niebla y fondo.
const r = g.renderer;
const render = {
  pixelRatio: r.pixelRatio,
  shadows: r.shadowMap.enabled,
  shadowType: r.shadowMap.type,
  toneMapping: r.toneMapping,
  exposure: r.toneMappingExposure,
  colorSpace: r.outputColorSpace,
  fog: [color(g.scene.fog.color), g.scene.fog.near, g.scene.fog.far],
  background: color(g.scene.background),
};

// 3. Rutas del grafo: entre cada par de lugares, a pie y en coche.
const routes = sha();
for (const a of g.pois)
  for (const b of g.pois)
    for (const drive of [false, true])
      routes.update(
        JSON.stringify(
          g.findRoute(g.nearestNode(a.x, a.z, drive), g.nearestNode(b.x, b.z, drive), drive),
        ),
      );

// 4. Recursos de datos pedidos (los módulos .js se comprueban aparte, en el importmap).
const resources = requested.filter((u) => !u.split('?')[0].endsWith('.js'));

// 5. Comportamiento: 600 pasos de 1/60 s con entrada fija y DOM resultante.
const dom = () =>
  sha()
    .update(
      JSON.stringify(
        Object.keys(els)
          .filter((id) => !id.startsWith('created'))
          .sort()
          .map((id) => [
            id,
            els[id].textContent ?? null,
            els[id].innerHTML ?? null,
            ['hidden', 'show', 'pressed'].map((c) => els[id].classList.contains(c)),
            els[id].style,
            els[id].attributes ?? null,
          ]),
      ),
    )
    .digest('hex');
const domAfterInit = dom();
g.start();
const trace = sha();
g.input.gas = true;
for (let i = 0; i < 600; i++) {
  g.input.right = i % 120 < 30;
  g.update(1 / 60);
  if (i % 30 === 0)
    trace.update(
      JSON.stringify([
        g.player.x,
        g.player.z,
        g.player.a,
        g.state,
        [...g.state.found],
        g.traffic.map((c) => [c.x, c.z, c.a, c.node, c.next]),
        g.people.map((p) => [p.u, p.dir, p.mesh.visible]),
        g.view.position,
      ]),
    );
}
const behaviour = { trace: trace.digest('hex'), domAfterInit, domAfterTrace: dom() };
const result = { scene, render, routes: routes.digest('hex'), resources, behaviour };

const dump = arg('--dump');
if (dump) fs.writeFileSync(dump, lines.join('\n') + '\n');
const out = arg('--out'),
  compare = arg('--compare');
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify(result, null, 2));
if (compare) {
  const base = JSON.parse(fs.readFileSync(compare, 'utf8'));
  const diffs = [];
  const walk = (a, b, at) => {
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
        walk(a[k], b[k], at ? at + '.' + k : k);
    } else if (JSON.stringify(a) !== JSON.stringify(b))
      diffs.push(at + ': ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b));
  };
  const ignored = (arg('--ignore') || '').split(',').filter(Boolean);
  for (const key of ignored) (delete base[key], delete result[key]);
  walk(base, result, '');
  if (diffs.length) {
    console.error('HUELLA DISTINTA de ' + compare + ':\n' + diffs.join('\n'));
    process.exit(1);
  }
  console.error('Huella idéntica a ' + compare);
}
```

## H2. `tools/browser-smoke.mjs`

Necesita Chrome o Chromium instalado (en esta máquina, `google-chrome-stable`). Usa
`WebSocket` y `fetch` globales de Node 22.

```js
// Prototipo: humo en Chrome real sin interfaz (SwiftShader), sin dependencias.
// node browser-smoke.mjs URL [chrome]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8080/';
const chrome = process.argv[3] || 'google-chrome-stable';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chiclana-smoke-'));
const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-first-run',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  proc.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
  setTimeout(() => reject(Error('chrome no arranca')), 15000);
});
const port = new URL(wsUrl).port;
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map(),
  errors = [],
  requests = [];
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) (pending.get(msg.id)(msg), pending.delete(msg.id));
  if (msg.method === 'Runtime.exceptionThrown')
    errors.push(
      msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text,
    );
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
    errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url);
  if (msg.method === 'Network.loadingFailed') errors.push('network ' + msg.params.errorText);
});
const send = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
await send('Runtime.enable');
await send('Network.enable');
await send('Page.enable');
const t0 = Date.now();
await send('Page.navigate', { url });
let state;
for (;;) {
  await new Promise((r) => setTimeout(r, 500));
  const res = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
    ready: !document.getElementById('welcome').classList.contains('hidden'),
    status: document.getElementById('loadStatus').textContent,
    streets: document.getElementById('streetCount').textContent,
    game: !!window.__cityGame,
  })`,
  });
  state = res.result.result.value;
  if (state.ready || errors.length || Date.now() - t0 > 90000) break;
}
const scene = (
  await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
  const g = window.__cityGame; if (!g) return null; let meshes = 0, triangles = 0;
  g.scene.traverse((o) => { if (!o.isMesh) return; meshes++; const p = o.geometry.getAttribute('position');
    triangles += ((o.geometry.index ? o.geometry.index.count : p.count) / 3) * (o.isInstancedMesh ? o.count : 1); });
  return { meshes, triangles, drawCalls: g.stats.calls };
})()`,
  })
).result.result.value;
const local = requests.filter(
  (u) => u.startsWith(new URL(url).origin) && !u.endsWith('/') && !u.includes('favicon'),
);
console.log(
  JSON.stringify(
    {
      ms: Date.now() - t0,
      state,
      scene,
      errors,
      requests: local.length,
      unversioned: local.filter((u) => !/[?&]v=/.test(u)),
    },
    null,
    1,
  ),
);
ws.close();
proc.kill();
fs.rmSync(profile, { recursive: true, force: true });
process.exit(state.ready && !errors.length ? 0 : 1);
```

## H3. `tests/runtime-harness.mjs` (paso 1.1)

Mismo entorno simulado que hoy; desaparecen las sustituciones de texto, el módulo
temporal y `globalThis.__THREE`. El juego se importa con `import()` dinámico **después**
de crear los globales simulados (un `import` estático se evaluaría antes).

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { SAVE_KEY } from '../web/game-data.js';
import * as Real from '../web/vendor/three.module.min.js';

// Un mismo entorno CPU para verificadores y exportadores; no ejecuta GPU. Los módulos ES
// se evalúan una vez por proceso, así que el juego solo puede arrancarse una vez.
export async function createRuntime({ progress = null } = {}) {
  assert(!globalThis.__chiclanaRuntime, 'createRuntime: una sola vez por proceso');
  globalThis.__chiclanaRuntime = true;
  const noop = () => {};
  const context = new Proxy(
    { measureText: (s) => ({ width: s.length * 7 }) },
    { get: (o, k) => (k in o ? o[k] : noop), set: (o, k, v) => ((o[k] = v), true) },
  );
  const els = {};
  // Initial classes from index.html, so classList reflects which overlays are hidden.
  const initialClasses = {};
  for (const [tag] of fs.readFileSync('web/index.html', 'utf8').matchAll(/<[a-z]+\b[^>]*>/g)) {
    const id = tag.match(/\bid="([^"]+)"/)?.[1],
      cls = tag.match(/\bclass="([^"]+)"/)?.[1];
    if (id) initialClasses[id] = cls ? cls.split(/\s+/) : [];
  }
  function classList(id) {
    const set = new Set(initialClasses[id] || []);
    return {
      add: (...c) => c.forEach((v) => set.add(v)),
      remove: (...c) => c.forEach((v) => set.delete(v)),
      toggle: (c, force = !set.has(c)) => (force ? set.add(c) : set.delete(c), force),
      contains: (c) => set.has(c),
    };
  }
  function el(id) {
    return (els[id] ??= {
      id,
      tagName: 'DIV',
      style: {},
      value: '',
      children: [],
      classList: classList(id),
      getContext: () => context,
      appendChild(v) {
        this.children.push(v);
      },
      replaceChildren() {
        this.children = [];
      },
      querySelector: () => el(id + 'child'),
      setAttribute(k, v) {
        (this.attributes ??= {})[k] = v;
      },
      listeners: {},
      addEventListener(n, f) {
        (this.listeners[n] ??= []).push(f);
      },
      setPointerCapture: noop,
      getBoundingClientRect: () => ({ width: 390, height: 450, left: 0, top: 0 }),
    });
  }
  globalThis.window = globalThis;
  globalThis.innerWidth = 390;
  globalThis.innerHeight = 844;
  globalThis.devicePixelRatio = 2;
  const mediaQueries = [];
  globalThis.matchMedia = (q) => (mediaQueries.push(q), { matches: true });
  const windowListeners = {};
  globalThis.addEventListener = (n, f) => (windowListeners[n] ??= []).push(f);
  globalThis.document = {
    getElementById: el,
    createElement: (tag) => ({ ...el('created' + Math.random()), tagName: tag.toUpperCase() }),
    querySelectorAll: () => [],
    querySelector: () => el('query'),
    addEventListener: noop,
  };
  globalThis.Image = class {
    constructor() {
      this.complete = true;
    }
  };
  globalThis.requestAnimationFrame = (fn) => {
    if (fn.name !== 'frame') setTimeout(fn, 0);
  };
  const storage = {};
  globalThis.localStorage = {
    getItem: (k) => storage[k] ?? null,
    setItem: (k, v) => (storage[k] = String(v)),
    removeItem: (k) => delete storage[k],
  };
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(url);
    return {
      ok: true,
      json: async () => JSON.parse(fs.readFileSync('web/' + url.split('?')[0], 'utf8')),
    };
  };
  class Renderer {
    constructor() {
      this.shadowMap = {};
      this.info = { render: { calls: 0, triangles: 0 } };
      this.renders = 0;
    }
    setPixelRatio(v) {
      this.pixelRatio = v;
    }
    setSize() {}
    render() {
      this.renders++;
    }
  }
  class Loader {
    loadAsync(url) {
      globalThis.__aerialUrl = url;
      requested.push(url);
      return Promise.resolve(new Real.Texture({ width: 4096, height: 3072 }));
    }
  }

  if (progress !== null) storage[SAVE_KEY] = JSON.stringify(progress);
  delete globalThis.__cityGame;
  const assetVersion = fs.readFileSync('web/index.html', 'utf8').match(/game3d\.js\?v=([^"]+)"/)[1];
  // Import dinámico: los globales simulados ya existen cuando se evalúa el juego.
  const { startGame } = await import('../web/js/app.js');
  const g = await startGame({
    version: assetVersion,
    platform: { WebGLRenderer: Renderer, TextureLoader: Loader },
  });
  assert(g, 'init completed');
  return { g, els, storage, requested, mediaQueries, windowListeners, assetVersion };
}
```

## H4. API pública y API de pruebas

### Claves

- Públicas (`window.__cityGame`, sin cambios respecto a hoy): `character`, `createCar`,
  `createPerson`, `state`, `player`, `city`, `graph`, `segments`, `driveNetwork`, `pois`,
  `scene`, `blocked`, `safePoint`, `facadeWork`, `streetEnvironment`, `view`, `stats`.
- Solo pruebas (las que hoy inyecta el arnés): `inBuilding`, `pInside`, `pointSeg`,
  `jobs`, `input`, `update`, `target`, `interact`, `updateCamera`, `cycleCamera`,
  `camPos`, `setOrbit`, `carCollision`, `findRoute`, `nearestNode`, `cars`, `start`,
  `updateHUD`, `frame`, `pauseMenu`, `closeModal`, `loadWorld`, `listStreets`, `openMap`,
  `help`, `nearestRoad`, `chunks`, `traffic`, `stepAgent`, `vehicles`, `people`, `sun`,
  `renderer`, `quality`, `paused`.
- Los valores que se reasignan (`character`, `city`, `scene`, `sun`, `renderer`,
  `quality`, `paused`) son _getters_ para que la API siempre lea el valor actual.

### Variante del paso 1.1 (dentro de `app.js`, sin exportar)

```js
function createPublicApi() {
  return {
    get character() {
      return character;
    },
    createCar,
    createPerson,
    state,
    player,
    get city() {
      return city;
    },
    graph,
    segments,
    driveNetwork,
    pois,
    get scene() {
      return scene;
    },
    blocked,
    safePoint,
    facadeWork,
    streetEnvironment,
    get view() {
      return {
        position: camera.position.toArray(),
        mode,
        pitch: lookPitch,
        yaw: player.a + orbit,
        direction: camera.getWorldDirection(new THREE.Vector3()).toArray(),
        obstructed: mode === 0 && cameraSweep(camera.position) < 1,
      };
    },
    get stats() {
      return renderer.info.render;
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
      orbit = v;
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
      return sun;
    },
    get renderer() {
      return renderer;
    },
    get quality() {
      return quality;
    },
    get paused() {
      return paused;
    },
  };
  return Object.defineProperties(createPublicApi(), Object.getOwnPropertyDescriptors(extra));
}
```

En los pasos 1.4–1.7, los nombres reasignables de estas funciones pasan a
`grupo.nombre` (por ejemplo `return gfx.scene;`, `view.orbit = v`).

### Variante final (paso 1.18, `web/js/test-api.js`)

Las mismas dos funciones, exportadas, con imports explícitos:

```js
import * as THREE from '../vendor/three.module.min.js';
import { JOBS as jobs } from '../game-data.js';
import {
  state,
  player,
  input,
  camPos,
  cars,
  chunks,
  traffic,
  vehicles,
  people,
  graph,
  segments,
  driveNetwork,
  pois,
  facadeWork,
  streetEnvironment,
  world,
  gfx,
  session,
  view,
  actors,
} from './core/state.js';
import { pInside, pointSeg } from './core/math.js';
import { inBuilding, nearestRoad, blocked, safePoint } from './world/spatial.js';
import { loadWorld } from './world/loader.js';
import { findRoute, nearestNode } from './game/graph.js';
import { createCar, carCollision } from './game/vehicles.js';
import { createPerson } from './game/people.js';
import { stepAgent } from './game/traffic.js';
import { target } from './game/jobs.js';
import { interact } from './game/player.js';
import { start } from './game/flow.js';
import { update } from './game/update.js';
import { updateCamera, cycleCamera, cameraSweep } from './engine/camera.js';
import { updateHUD } from './ui/hud.js';
import { listStreets, openMap } from './ui/map.js';
import { pauseMenu, closeModal, help } from './ui/dialogs.js';

export function createPublicApi() {
  /* cuerpo de la variante 1.1 con world.city, gfx.scene, actors.character… */
}
export function createTestApi(frame) {
  /* cuerpo de la variante 1.1; `frame` llega como argumento desde app.js */
}
```

`frame` vive en `app.js`; para no importar `app.js` desde `test-api.js` (ciclo), `app.js`
llama a `createTestApi(frame)` y la clave `frame` de la API toma ese argumento.

## H5. `web/game3d.js` (entrada)

```js
// Entrada del navegador: la versión común de recursos es el ?v= de este módulo.
import { startGame } from './js/app.js';

startGame({ version: new URL(import.meta.url).searchParams.get('v') });
```

`startGame` asigna `window.__cityGame` dentro de `init`, en el mismo momento que hoy.

## H6. Plantilla de `index.html`

Sustituye `VERSION` por la versión vigente (la de `style.css?v=`). Una entrada por
módulo; la lista crece en cada paso que crea un módulo. El orden de `modulepreload` no
importa; se recomienda el del importmap.

```html
<!-- Versión común de recursos: el mismo ?v= en el importmap, los modulepreload,
     style.css y game3d.js; game3d.js la pasa al juego para los JSON y la ortofoto.
     Cambiarlas todas a la vez. -->
<script type="importmap">
  {
    "imports": {
      "./js/app.js": "./js/app.js?v=VERSION",
      "./vendor/three.module.min.js": "./vendor/three.module.min.js?v=VERSION",
      "./game-data.js": "./game-data.js?v=VERSION",
      "./progress.js": "./progress.js?v=VERSION"
    }
  }
</script>
<link rel="modulepreload" href="js/app.js?v=VERSION" />
<link rel="modulepreload" href="vendor/three.module.min.js?v=VERSION" />
<link rel="modulepreload" href="game-data.js?v=VERSION" />
<link rel="modulepreload" href="progress.js?v=VERSION" />
<link rel="stylesheet" href="style.css?v=VERSION" />
<script type="module" src="game3d.js?v=VERSION"></script>
```

El importmap debe ir antes del `<script type="module">`. Prettier lo formatea como JSON.

## H7. `tests/verify-modules.mjs`

```js
// Módulos del juego: importmap y versión común, evaluación sin DOM y grafo sin ciclos.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Paso 1.1: false. Desde el paso 1.2: true.
const STRICT_TOP_LEVEL = true;
// Se cargan solo bajo demanda (import dinámico); van en el importmap pero no se precargan.
const ON_DEMAND = new Set(['./js/debug/inspector.js']);

const html = fs.readFileSync('web/index.html', 'utf8');
const version = html.match(/game3d\.js\?v=([^"]+)"/)[1];
assert.equal(html.match(/style\.css\?v=([^"]+)"/)[1], version, 'CSS y JS comparten versión');
const mapText = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
assert(mapText, 'index.html declara un importmap');
assert(
  html.indexOf('type="importmap"') < html.indexOf('<script type="module"'),
  'el importmap va antes del primer módulo',
);
const imports = JSON.parse(mapText).imports;

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) =>
          e.isDirectory()
            ? walk(path.join(dir, e.name))
            : e.name.endsWith('.js')
              ? [path.join(dir, e.name)]
              : [],
        )
    : [];
const files = walk('web/js');
const key = (file) => './' + path.relative('web', file).split(path.sep).join('/');
const expected = [
  ...files.map(key),
  './vendor/three.module.min.js',
  './game-data.js',
  './progress.js',
].sort();
assert.deepEqual(Object.keys(imports).sort(), expected, 'el importmap lista todos los módulos');
for (const [k, v] of Object.entries(imports))
  assert.equal(v, k + '?v=' + version, 'versión común en ' + k);
const preload = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map(
  (m) => './' + m[1],
);
assert.deepEqual(
  preload.sort(),
  Object.entries(imports)
    .filter(([k]) => !ON_DEMAND.has(k))
    .map(([, v]) => v)
    .sort(),
  'modulepreload coincide con el importmap',
);

// Grafo de imports estáticos: relativos, sin versión escrita a mano y sin ciclos.
const graph = new Map();
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  assert(
    !/(?:from\s*|import\()['"][^'"]*\?v=/.test(source),
    'sin ?v= escrito a mano en los imports de ' + file,
  );
  assert(!/^[^\s/*].*\bawait\b/m.test(source), 'sin await de nivel superior en ' + file);
  const deps = [];
  for (const [, spec] of source.matchAll(/^(?:import|export)\b[^;]*?\bfrom\s*'([^']+)'/gms)) {
    assert(spec.startsWith('.'), 'solo imports relativos en ' + file + ': ' + spec);
    deps.push(path.normalize(path.join(path.dirname(file), spec)));
  }
  graph.set(path.normalize(file), deps);
}
const state = new Map();
const visit = (node, trail) => {
  if (state.get(node) === 'done') return;
  assert.notEqual(state.get(node), 'open', 'ciclo de imports: ' + [...trail, node].join(' -> '));
  state.set(node, 'open');
  for (const dep of graph.get(node) || []) visit(dep, [...trail, node]);
  state.set(node, 'done');
};
for (const node of graph.keys()) visit(node, []);

// Cada módulo se evalúa en un proceso sin DOM: ningún efecto de nivel superior.
if (STRICT_TOP_LEVEL) {
  const urls = files.map((f) => pathToFileURL(path.resolve(f)).href);
  const script = `for (const u of ${JSON.stringify(urls)}) await import(u);`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, 'módulos evaluables sin DOM:\n' + child.stderr);
}
console.log('Modules', files.length, 'versioned', version, 'acyclic, no top-level effects');
```

## H8. Comprobación del piloto del Mercado en `verify-design.mjs`

Además de la huella (criterio principal), un test de unidad independiente del arnés:

1. Crea un `THREE.Group` como `staging` y un kit con `createFacadeKit({ staging, palette })`
   usando la paleta de `web/facade-profiles.json`.
2. Ejecuta la receta `mercado-fachada` sobre los cuatro lados del anclaje de
   `web/facade-designs.json` con `composeBuilding`.
3. Recorre `staging` y comprueba: 4 grupos de pared; en total, el número de mallas por
   color coincide con la tabla que el propio test calcula ejecutando, sobre otro
   `staging`, una copia literal del bucle antiguo del Mercado incluida en el test como
   referencia (`referenceMarket(kit, outline, center)`), y las matrices de mundo de cada
   malla coinciden una a una.

La copia de referencia se borra del test cuando se cierre la fase 2.
