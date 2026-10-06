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
