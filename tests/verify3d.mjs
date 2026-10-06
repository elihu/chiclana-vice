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
globalThis.addEventListener = noop;
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
globalThis.localStorage = { getItem: () => null, setItem: noop };
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => JSON.parse(fs.readFileSync('web/' + url, 'utf8')),
});
class Renderer {
  constructor() {
    this.shadowMap = {};
    this.info = { render: { calls: 0, triangles: 0 } };
  }
  setPixelRatio() {}
  setSize() {}
  render() {}
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
    'window.__cityGame={input,update,target,interact,updateCamera,cycleCamera,camPos,setOrbit:v=>{orbit=v},carCollision,findRoute,nearestNode,cars,start,updateHUD,',
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
