import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { SAVE_KEY } from '../web/game-data.js';
import * as Real from '../web/vendor/three.module.min.js';

// Un mismo entorno CPU para verificadores y exportadores; no ejecuta GPU.
export async function createRuntime({ progress = null } = {}) {
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
  globalThis.__THREE = { ...Real, WebGLRenderer: Renderer, TextureLoader: Loader };

  if (progress !== null) storage[SAVE_KEY] = JSON.stringify(progress);
  delete globalThis.__cityGame;
  const assetVersion = fs.readFileSync('web/index.html', 'utf8').match(/game3d\.js\?v=([^"]+)"/)[1];
  const patch = (source, pattern, replacement) => {
    assert.equal(
      [...source.matchAll(new RegExp(pattern.source, 'g'))].length,
      1,
      'unique runtime hook: ' + pattern,
    );
    return source.replace(pattern, replacement);
  };
  let code = fs.readFileSync('web/game3d.js', 'utf8');
  code = patch(
    code,
    /const THREE = await import\(asset\(['"]\.\/vendor\/three\.module(?:\.min)?\.js['"]\)\);/,
    'const THREE=globalThis.__THREE;globalThis.__runtimeRequested.push(asset("./vendor/three.module.min.js"));',
  );
  code = patch(
    code,
    /window\.__cityGame\s*=\s*\{/,
    'window.__cityGame={inBuilding,pInside,pointSeg,jobs,input,update,target,interact,updateCamera,cycleCamera,camPos,setOrbit:v=>{orbit=v},carCollision,findRoute,nearestNode,cars,start,updateHUD,frame,pauseMenu,closeModal,loadWorld,listStreets,openMap,help,nearestRoad,chunks,traffic,stepAgent,vehicles,people,get sun(){return sun},get renderer(){return renderer},get quality(){return quality},get paused(){return paused},',
  );
  code = patch(
    code,
    /init\(\)\.catch\(\s*\(?err\)?\s*=>/,
    'globalThis.__initPromise=init().catch(err=>',
  );
  for (const file of ['game-data.js', 'progress.js']) {
    code = patch(
      code,
      new RegExp("asset\\('\\./" + file.replace('.', '\\.') + "'\\)"),
      JSON.stringify(pathToFileURL(path.resolve('web', file)).href + '?v=' + assetVersion),
    );
    requested.push('./' + file + '?v=' + assetVersion);
  }
  globalThis.__runtimeRequested = requested;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chiclana-runtime-'));
  try {
    const runtime = path.join(temp, 'runtime.mjs');
    fs.writeFileSync(runtime, code);
    await import(pathToFileURL(runtime).href + '?v=' + assetVersion);
    await globalThis.__initPromise;
    assert(globalThis.__cityGame, 'init completed');
    return {
      g: globalThis.__cityGame,
      els,
      storage,
      requested,
      mediaQueries,
      windowListeners,
      assetVersion,
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
