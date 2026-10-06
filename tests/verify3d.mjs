import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as Real from '../web/vendor/three.module.js';
const noop = () => {};
const context = new Proxy(
  { measureText: (s) => ({ width: s.length * 7 }) },
  { get: (o, k) => (k in o ? o[k] : noop), set: (o, k, v) => ((o[k] = v), true) },
);
const els = {};
function el(id) {
  return (els[id] ??= {
    id,
    tagName: 'DIV',
    style: {},
    value: '',
    children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => true },
    getContext: () => context,
    appendChild(v) {
      this.children.push(v);
    },
    replaceChildren() {
      this.children = [];
    },
    querySelector: () => el(id + 'child'),
    setAttribute: noop,
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
globalThis.matchMedia = () => ({ matches: true });
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
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => JSON.parse(fs.readFileSync('web/' + url, 'utf8')),
});
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
  loadAsync() {
    return Promise.resolve(new Real.Texture({ width: 4096, height: 3072 }));
  }
}
globalThis.__THREE = { ...Real, WebGLRenderer: Renderer, TextureLoader: Loader };
let code = fs
  .readFileSync('web/game3d.js', 'utf8')
  .replace(
    /import \* as THREE from ['"]\.\/vendor\/three\.module\.js['"];?/,
    'const THREE=globalThis.__THREE;',
  )
  .replace(
    /window\.__cityGame\s*=\s*\{/,
    'window.__cityGame={input,update,target,interact,updateCamera,cycleCamera,camPos,setOrbit:v=>{orbit=v},carCollision,findRoute,nearestNode,cars,start,updateHUD,frame,pauseMenu,closeModal,chunks,traffic,stepAgent,vehicles,people,get sun(){return sun},get renderer(){return renderer},get quality(){return quality},get paused(){return paused},',
  )
  .replace(/init\(\)\.catch\(\s*\(?err\)?\s*=>/, 'globalThis.__initPromise=init().catch(err=>');
fs.writeFileSync('tests/qa3d-runtime.mjs', code);
await import('./qa3d-runtime.mjs');
await globalThis.__initPromise;
assert(globalThis.__cityGame, 'init completed');
const g = globalThis.__cityGame;
assert(!g.blocked(g.player.x, g.player.z, 1), 'spawn center is clear');
console.log(
  'spawn',
  g.player.x,
  g.player.z,
  g.player.a,
  'full car blocked?',
  g.carCollision(g.player.car, g.player.x, g.player.z),
);
let triangles = 0,
  meshes = 0;
g.scene.traverse((o) => {
  if (o.isMesh) {
    meshes++;
    const p = o.geometry.getAttribute('position');
    assert(p, 'geometry positions');
    for (let i = 0; i < p.array.length; i++) assert(Number.isFinite(p.array[i]), 'geometry finite');
    triangles += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
  }
});
g.start();
const angleBefore = g.player.a;
g.input.gas = true;
g.input.right = true;
for (let i = 0; i < 12; i++) g.update(0.016);
assert(g.player.a < angleBefore, 'right steering turns camera-right');
g.input.gas = false;
g.input.right = false;
g.player.car.speed = 0;
for (let i = 0; i < 30; i++) g.update(0.016);
// Oneway: traffic graph strongly connected inside every drive component; walking unaffected.
{
  const net = g.driveNetwork,
    drive = (i) => g.graph[i].adj.some((e) => e.s?.drive && !e.s.blocked);
  assert(net.oneway > 0 && net.relaxed < net.oneway / 2, 'oneway respected on most segments');
  assert(net.blocked < 100, 'few alleys excluded from traffic');
  for (const s of g.segments) {
    const open = s.drive && !s.blocked;
    assert(s.forward.drive === open, 'forward direction drivable');
    if (s.oneway && !s.relaxed) assert(!s.reverse.drive, 'oneway reverse closed to traffic');
    if (!s.oneway) assert.equal(s.reverse.drive, open);
    assert(s.drive || !s.oneway);
  }
  const bfs = (root, forward) => {
    const seen = new Set([root]),
      queue = [root];
    for (let k = 0; k < queue.length; k++)
      for (let u = 0; u < g.graph.length; u++) {
        if (forward && u !== queue[k]) continue;
        for (const e of g.graph[u].adj) {
          if (!e.drive) continue;
          const [from, to] = forward ? [u, e.to] : [e.to, u];
          if (from === queue[k] && !seen.has(to)) {
            seen.add(to);
            queue.push(to);
          }
        }
      }
    return seen;
  };
  const mainNodes = g.graph.map((n, i) => (n.driveMain ? i : -1)).filter((i) => i >= 0);
  assert.equal(mainNodes.length, net.mainNodes);
  const out = bfs(mainNodes[0], true),
    back = bfs(mainNodes[0], false);
  for (const i of mainNodes)
    assert(out.has(i) && back.has(i), 'main drive network strongly connected');
  for (let i = 0; i < g.graph.length; i++)
    if (drive(i))
      assert(
        g.graph[i].adj.some((e) => e.drive),
        'no traffic dead end at ' + i,
      );
  const spawn = g.nearestNode(g.player.x, g.player.z, true);
  for (const p of g.pois) {
    const goal = g.nearestNode(p.x, p.z, true);
    assert(g.findRoute(spawn, goal, true).length, 'police route to ' + p.name);
    assert(g.findRoute(goal, spawn, true).length, 'police route back from ' + p.name);
  }
  console.log('Oneway network', JSON.stringify(net), 'strongly connected, police routes passed');
}
for (const p of g.pois) {
  assert(!g.blocked(p.x, p.z, 1), 'POI clear ' + p.name);
  let path = g.findRoute(g.nearestNode(g.player.x, g.player.z), g.nearestNode(p.x, p.z));
  assert(path.length, 'route to ' + p.name);
  console.log('POI', p.name, p.x, p.z, 'route nodes', path.length);
}
for (let j = 0; j < 4; j++) {
  let attempts = 0;
  while (g.state.job === j && attempts++ < 8) {
    let goal = g.target();
    g.player.x = g.player.car.x = goal.x;
    g.player.z = g.player.car.z = goal.z;
    g.player.car.speed = 0;
    if (goal.escape) g.state.wanted = 0;
    for (let i = 0; i < 75; i++) g.update(0.016);
  }
  assert(g.state.job > j, 'mission completion ' + j);
}
g.player.car.speed = 0;
g.interact();
assert(!g.player.car, 'exit car');
g.interact();
assert(g.player.car, 'enter car');
assert.equal(g.state.job, 4);
console.log(
  JSON.stringify({
    ok: true,
    meshes,
    triangles,
    buildings: g.city.buildings.length,
    roads: g.city.roads.length,
    graphNodes: g.graph.length,
    completedMissions: g.state.job,
    cash: g.state.cash,
    tests: [
      'scene construction',
      'finite mesh vertices',
      'spawn and POI collisions',
      'street graph routes',
      'all 4 missions',
      'enter and exit vehicle',
      'update loop with police',
    ],
  }),
);
console.log(
  'Facade work',
  JSON.stringify({
    parts: g.facadeWork.parts,
    fronts: g.facadeWork.fronts.length,
    meshes: g.facadeWork.meshes,
  }),
);
const detail = g.scene.getObjectByName('reference-led-facades');
assert(detail, 'custom details exist');
assert(g.facadeWork.fronts.length > 20, 'street frontages upgraded');
for (const p of [
  [-99, -15],
  [-215, -145],
  [-205, -155],
  [-209, -148],
])
  console.log('Viewpoint', p, 'blocked', g.blocked(p[0], p[1], 1.1));
const { colliders, ...environmentCounts } = g.streetEnvironment;
console.log(
  'Street environment',
  JSON.stringify({ ...environmentCounts, colliders: colliders.length }),
);
assert(
  environmentCounts.surfaces > 0 &&
    environmentCounts.trees > 0 &&
    environmentCounts.lamps > 0 &&
    environmentCounts.crossings > 0,
  'environment generated',
);

const person = g.createPerson();
const bounds = new Real.Box3().setFromObject(person.mesh);
assert(bounds.max.y < 1.76 && bounds.min.y >= -0.001, 'human scale 1.74m with feet grounded');
console.log('Character bounds', bounds.min.toArray(), bounds.max.toArray());
const gas = els.gas,
  right = els.right,
  ev = (id) => ({
    pointerId: id,
    preventDefault() {
      this.prevented = true;
    },
  });
let e = ev(1);
gas.onpointerdown(e);
assert(e.prevented && g.input.gas);
gas.onpointerdown(ev(2));
right.onpointerdown(ev(3));
for (const f of gas.listeners.pointerup) f(ev(1));
assert(g.input.gas && g.input.right, 'multi-touch held');
for (const f of gas.listeners.pointercancel) f(ev(2));
assert(!g.input.gas && g.input.right, 'cancel releases only affected control');
for (const f of right.listeners.lostpointercapture) f(ev(3));
assert(!g.input.right, 'capture loss releases control');
console.log('Touch holds, cancellation and player scale passed');
for (const p of [
  [-81, 69],
  [-10, -155],
  [191, 163],
]) {
  assert(!g.blocked(...p, 1.1), 'church viewpoint clear ' + p);
}
console.log(
  'Nazareno street fronts',
  g.facadeWork.fronts.filter((f) => f.street === 'Calle Jesús Nazareno').length,
);

// Reuse must preserve individual transforms/materials and the complete planting.
const a = g.createCar('#123456'),
  b = g.createCar('#123456');
const carMeshes = (c) => {
  const result = [];
  c.mesh.traverse((o) => {
    if (o.isMesh) result.push(o);
  });
  return result;
};
const am = carMeshes(a),
  bm = carMeshes(b);
assert.equal(am.length, bm.length);
am.forEach((m, i) => {
  assert.equal(m.geometry, bm[i].geometry, 'car geometries shared');
  assert.equal(m.material, bm[i].material, 'same-color materials shared');
  assert.notEqual(m.position, bm[i].position, 'transforms independent');
});
const otherPerson = g.createPerson();
assert.equal(
  person.mesh.children[0].geometry,
  otherPerson.mesh.children[0].geometry,
  'person spheres shared',
);
const vegetation = g.scene.getObjectByName('vegetation-cells');
assert(vegetation, 'vegetation spatial groups exist');
const count = (kind) =>
  vegetation.children
    .filter((m) => m.name.startsWith('vegetation-' + kind + '-'))
    .reduce((n, m) => n + m.count, 0);
assert.equal(count('trunks'), g.streetEnvironment.trees);
assert.equal(count('crowns'), g.streetEnvironment.trees * 5);
assert.equal(count('branches'), g.streetEnvironment.trees * 3);
for (const m of vegetation.children) {
  assert(m.isInstancedMesh);
  assert(Number.isFinite(m.boundingSphere.radius));
  if (m.name.startsWith('vegetation-crowns-'))
    assert.equal(m.instanceColor.count, m.count, 'all crown colors kept');
}
console.log(
  'Shared models and complete spatial vegetation passed',
  vegetation.children.length,
  'batches',
);
const heights = JSON.parse(fs.readFileSync('web/height-samples.json', 'utf8'));
assert.equal(heights.entries.length, 15, 'independent IGN first-coverage pilot');
assert(heights.source.startsWith('IGN /'));
assert.equal(heights.license, 'CC BY 4.0 scne.es');
assert.equal(
  new Set(heights.entries.map((s) => s.index)).size,
  heights.entries.length,
  'unique height IDs',
);
for (const s of heights.entries) {
  const b = g.city.buildings[s.index];
  assert.equal(b.h, s.old, 'cadastral height unchanged');
  assert.equal(b.floors, s.floors, 'floor count unchanged');
  assert.equal(b.heightSource, heights.source);
  assert.equal(b.visualH, s.height);
  assert.equal(b.renderH, s.height, 'roof uses pilot height');
  assert(s.coverage >= 0.95 && s.spread <= 1.5 && s.samples >= 12, 'height sample quality');
}
for (const f of g.facadeWork.fronts) {
  assert(Number.isInteger(f.floors));
  assert(f.h / f.floors > 2, 'facade storeys remain plausible');
}
console.log('Pilot roof heights, floor counts and adaptive frontages passed');

assert.equal(
  new Set(g.facadeWork.fronts.map((f) => f.id)).size,
  g.facadeWork.fronts.length,
  'unique frontage IDs',
);
for (const f of g.facadeWork.fronts) {
  const b = g.city.buildings[f.buildingIndex];
  assert.deepEqual(f.a, b.p[f.edgeIndex]);
  assert.deepEqual(f.q, b.p[(f.edgeIndex + 1) % b.p.length]);
}
for (const street of ['Calle Álamo', 'Calle Garcia Gutierrez', 'Calle Corredera Baja'])
  assert(
    g.facadeWork.fronts.some((f) => f.street === street),
    'pilot frontage on ' + street,
  );
console.log('Expanded pilot frontage IDs match cadastral edges');

// Camera sweep must prevent cuts through walls while orbiting at tight viewpoints.
for (const [x, z] of [
  [-99, -15],
  [-215, -145],
  [-81, 69],
]) {
  Object.assign(g.player, { x, z });
  for (let i = 0; i < 24; i++) {
    g.setOrbit((i * Math.PI) / 12);
    g.camPos.set(x + 15, 4.7, z + 15);
    g.updateCamera(0.016);
    assert(!g.view.obstructed, 'follow camera clear at ' + [x, z, i]);
    assert(g.view.position.every(Number.isFinite));
  }
}
g.cycleCamera();
g.updateCamera(0.016);
assert.equal(g.view.mode, 1);
g.cycleCamera();
g.updateCamera(0.016);
assert.equal(g.view.mode, 2);
g.cycleCamera();
g.setOrbit(0);
console.log('Camera sweep, orbit transitions and three camera modes passed');

// First-person rotation must turn the view around a fixed eye, with no own model.
g.cycleCamera();
g.updateCamera(0.016);
const ownCar = g.player.car;
assert(ownCar.mesh.visible);
assert(ownCar.firstPersonOccluders.every((m) => !m.visible));
assert.equal(g.view.position[1], 1.2);
const eye = [...g.view.position],
  world = els.world;
world.onpointerdown({ pointerId: 91, clientX: 200, clientY: 200 });
world.onpointermove({ pointerId: 91, clientX: 310, clientY: 100 });
g.updateCamera(0.016);
assert.deepEqual(g.view.position, eye, 'rotation keeps driver eye fixed');
assert(g.view.direction[1] > 0.5, 'vertical look works');
const yaw = g.view.yaw;
g.update(3);
assert.equal(g.view.yaw, yaw, 'first-person car look does not auto-recentre');
world.listeners.pointercancel.forEach((f) => f({ pointerId: 91 }));
g.player.car.speed = 0;
g.interact();
assert(!g.player.car);
g.updateCamera(0.016);
assert(ownCar.mesh.visible, 'car visible after exit');
assert(
  ownCar.firstPersonOccluders.every((m) => m.visible),
  'cabin restored after exit',
);
assert(!g.character.mesh.visible, 'own head/body hidden');
assert.equal(g.view.position[1], 1.61);
world.onpointerdown({ pointerId: 92, clientX: 200, clientY: 200 });
world.onpointermove({ pointerId: 92, clientX: 200, clientY: -10000 });
g.updateCamera(0.016);
assert.equal(g.view.pitch, 1.35, 'pitch clamped');
assert(g.view.direction.every(Number.isFinite));
world.listeners.lostpointercapture.forEach((f) => f({ pointerId: 92 }));
g.cycleCamera();
assert(g.character.mesh.visible, 'body restored in aerial');
g.cycleCamera();
assert(g.character.mesh.visible, 'body restored in follow');
console.log('First-person fixed eye, hidden own models, free yaw/pitch and restoration passed');

// Light mode: shadow casting follows the shadow map, persists and culls chunks at the fog end.
assert(g.sun.castShadow && g.renderer.shadowMap.enabled, 'normal quality casts shadows');
g.pauseMenu();
els.quality.onclick();
assert.equal(g.quality, 'low');
assert(!g.sun.castShadow && !g.renderer.shadowMap.enabled, 'light mode disables sun shadows');
assert.equal(g.renderer.pixelRatio, 1);
assert.equal(JSON.parse(storage['chiclana-real-v2']).quality, 'low', 'quality persisted');
g.updateCamera(0.016);
const fogFar = g.scene.fog.far;
for (const group of g.chunks) {
  const c = group.children[0].geometry.boundingSphere,
    dist = Math.hypot(c.center.x - g.view.position[0], c.center.z - g.view.position[2]);
  assert.equal(group.visible, dist < fogFar + c.radius, 'light chunks end at fog');
}
g.pauseMenu();
els.quality.onclick();
assert(g.sun.castShadow && g.renderer.shadowMap.enabled && g.quality === 'auto');
assert.equal(JSON.parse(storage['chiclana-real-v2']).quality, 'auto');
console.log('Light mode shadows, persistence and fog culling passed');

// Paused frames reuse the last image unless something requests a redraw.
g.pauseMenu();
assert(g.paused);
g.frame(984); // flushes the redraw requested by the previous quality change
let renders = g.renderer.renders;
g.frame(1000);
g.frame(1016);
assert.equal(g.renderer.renders, renders, 'no render while paused');
windowListeners.resize.forEach((f) => f());
g.frame(1032);
g.frame(1048);
assert.equal(g.renderer.renders, renders + 1, 'one render after resize while paused');
g.closeModal();
g.frame(1064);
g.frame(1080);
assert.equal(g.renderer.renders, renders + 3, 'continuous render after closing');
console.log('Paused rendering on demand passed');

// findRoute (binary heap) must return exactly the routes of the reference O(N²) Dijkstra.
function referenceRoute(graph, from, to, driveOnly) {
  if (from === to) return [from];
  const ds = new Float64Array(graph.length).fill(Infinity),
    prev = new Int32Array(graph.length).fill(-1),
    used = new Uint8Array(graph.length);
  ds[from] = 0;
  for (let n = 0; n < graph.length; n++) {
    let u = -1,
      md = Infinity;
    for (let i = 0; i < graph.length; i++)
      if (!used[i] && ds[i] < md) {
        md = ds[i];
        u = i;
      }
    if (u === -1 || u === to) break;
    used[u] = 1;
    for (const e of graph[u].adj) {
      if (driveOnly && !e.drive) continue;
      const nd = ds[u] + e.length;
      if (nd < ds[e.to]) {
        ds[e.to] = nd;
        prev[e.to] = u;
      }
    }
  }
  if (prev[to] === -1) return [];
  const out = [to];
  while (out[0] !== from) out.unshift(prev[out[0]]);
  return out;
}
{
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296,
    pairs = [];
  for (let i = 0; i < 60; i++)
    pairs.push([Math.floor(rand() * g.graph.length), Math.floor(rand() * g.graph.length)]);
  const start = g.nearestNode(g.player.x, g.player.z);
  for (const p of g.pois) pairs.push([start, g.nearestNode(p.x, p.z)]);
  for (const p of g.pois) pairs.push([g.nearestNode(p.x, p.z, true), start]);
  const time = (fn) => {
      const t0 = performance.now();
      for (let k = 0; k < 3; k++) for (const [a, b] of pairs) fn(a, b);
      return (performance.now() - t0) / (pairs.length * 3);
    },
    found = [0, 0];
  for (const drive of [false, true])
    for (const [a, b] of pairs) {
      const got = g.findRoute(a, b, drive);
      assert.deepEqual(got, referenceRoute(g.graph, a, b, drive), 'same route ' + [a, b, drive]);
      if (got.length) found[+drive]++;
    }
  const timing = {};
  for (const drive of [false, true]) {
    timing[drive ? 'drive' : 'walk'] = {
      reference: +time((a, b) => referenceRoute(g.graph, a, b, drive)).toFixed(3),
      heap: +time((a, b) => g.findRoute(a, b, drive)).toFixed(3),
    };
  }
  console.log(
    'findRoute matches reference Dijkstra on',
    pairs.length * 2,
    'queries; non-empty walk/drive',
    found.join('/'),
    'ms per call',
    JSON.stringify(timing),
  );
}

// Traffic keeps moving along permitted directions, without dead ends.
{
  const vehicles = g.traffic;
  assert(vehicles.length > 0);
  g.player.x = g.player.z = 10000; // far away: traffic does not stop for the player
  if (g.player.car) Object.assign(g.player.car, { x: 10000, z: 10000 });
  const arrivals = vehicles.map(() => 0);
  let wrongWay = 0,
    alleyExits = 0,
    swaps = 0;
  for (let i = 0; i < 1500; i++) {
    const before = vehicles.map((c) => [c.node, c.stuck || 0]);
    for (const c of vehicles) g.stepAgent(c, 0.04);
    vehicles.forEach((c, k) => {
      const [from, stuck] = before[k];
      if (c.node === from) return;
      // A collision escape swaps node/next (pre-existing behaviour), not an arrival.
      if (stuck > 0 && c.stuck === 0) {
        swaps++;
        return;
      }
      arrivals[k]++;
      if (g.graph[from].adj.some((e) => e.to === c.node && e.drive)) return;
      // Only allowed when leaving an excluded alley where the vehicle was spawned.
      if (g.graph[from].adj.some((e) => e.drive)) wrongWay++;
      else alleyExits++;
    });
  }
  assert(
    vehicles.every((c) => c.next !== undefined),
    'every vehicle has a next node',
  );
  assert.equal(wrongWay, 0, 'traffic never drives against a respected oneway');
  const moving = arrivals.filter((n) => n >= 5).length;
  assert.equal(moving, vehicles.length, 'all traffic keeps moving through the network');
  console.log('Traffic simulation', { vehicles: vehicles.length, moving, swaps, alleyExits });
}

// HUD writes only on change; vehicles list mirrors cars + traffic without per-frame copies.
{
  assert.equal(g.vehicles.length, g.cars.length + g.traffic.length);
  assert.equal(new Set(g.vehicles).size, g.vehicles.length);
  for (const c of [...g.cars, ...g.traffic]) assert(g.vehicles.includes(c));
  Object.assign(g.player, { x: g.player.car?.x ?? 0, z: g.player.car?.z ?? 0 });
  let writes = 0,
    text = els.street.textContent;
  Object.defineProperty(els.street, 'textContent', {
    get: () => text,
    set: (v) => {
      text = v;
      writes++;
    },
  });
  g.update(0.016);
  const first = writes;
  for (let i = 0; i < 5; i++) g.update(0.016);
  assert.equal(writes, first, 'street name not rewritten while unchanged');
  console.log('HUD writes on change and shared vehicle list passed');
}

assert.equal(g.people.length, 28, 'all planned pedestrians spawned');
assert(g.people.every((p) => p.s.length >= 8));
console.log('Pedestrians', g.people.length);
