import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as Real from '../web/vendor/three.module.min.js';
import { JOBS, PLACES, POPULATION, VIEWPOINTS, SAVE_KEY } from '../web/game-data.js';
import './verify-progress.mjs';
import { createRuntime } from './runtime-harness.mjs';
const { g, els, storage, requested, mediaQueries, windowListeners, assetVersion } =
  await createRuntime({ progress: { cash: -1, job: 1.5, found: {} } });
assert.equal(g.state.job, 0, 'invalid saved job does not break initialization');
assert.equal(g.state.found.size, 0, 'invalid found list does not break initialization');
assert.equal(
  globalThis.__aerialUrl,
  'aerial-2048.jpg?v=' + assetVersion,
  'touch devices load the reduced orthophoto',
);
{
  const html = fs.readFileSync('web/index.html', 'utf8');
  assert.equal(html.match(/style\.css\?v=([^"]+)"/)[1], assetVersion, 'CSS and JS share version');
  for (const file of [
    'world.json',
    'buildings.json',
    'osm-world.json',
    'aerial-2048.jpg',
    'height-samples.json',
    'facade-profiles.json',
    'facade-designs.json',
    'city-design.json',
    'street-objects.json',
  ])
    assert(requested.includes(file + '?v=' + assetVersion), 'versioned ' + file);
  assert(
    requested.every((u) => u.endsWith('?v=' + assetVersion)),
    'every resource versioned',
  );
  console.log('Common resource version', assetVersion, 'on', requested.length, 'requests');
}

{
  const brute = (x, z, pad) =>
    g.city.buildings.some(
      (b) =>
        (g.pInside(x, z, b.p) && !b.holes.some((h) => g.pInside(x, z, h))) ||
        (pad > 0 && b.p.some((p, i) => g.pointSeg(x, z, p, b.p[(i + 1) % b.p.length]).d < pad)),
    );
  for (const [x, z] of [
    [-625.12, 135.16],
    [-649.93, 166.84],
    [-654.93, 424.81],
  ])
    for (const pad of [0, 0.3, 1.1])
      assert.equal(g.inBuilding(x, z, pad), brute(x, z, pad), 'grid padding matches all buildings');
  assert(g.inBuilding(-625.12, 135.16, 0.3), 'padding crosses cell boundary');
  const ring = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    hole = [
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
    ];
  assert(g.pInside(5, 5, ring) && g.pInside(5, 5, hole), 'courtyard lies within outer ring');
}
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
assert.deepEqual(
  g.pois.map((p) => p.name),
  PLACES.map(([name]) => name),
);
for (const job of JOBS)
  for (const stage of job.stages) assert(g.pois[stage.poi], 'mission has a real place');
for (const p of g.pois) {
  assert(!g.blocked(p.x, p.z, 1), 'POI clear ' + p.name);
  let path = g.findRoute(g.nearestNode(g.player.x, g.player.z), g.nearestNode(p.x, p.z));
  assert(path.length, 'route to ' + p.name);
  console.log('POI', p.name, p.x, p.z, 'route nodes', path.length);
}
for (let j = 0; j < JOBS.length; j++) {
  let attempts = 0;
  while (g.state.job === j && attempts++ < JOBS[j].stages.length * 3) {
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
assert.equal(g.state.job, JOBS.length);
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
      'all planned missions',
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
assert(g.facadeWork.fronts.length > 0, 'street frontages upgraded');
// Closed facade solids are single-sided; flat/open shapes keep DoubleSide.
const facadeSides = detail.children.map((m) => m.material.side);
assert(facadeSides.filter((s) => s === Real.FrontSide).length > facadeSides.length / 2);
assert(facadeSides.includes(Real.DoubleSide), 'flat facade shapes stay double-sided');
for (const v of VIEWPOINTS) assert(!g.blocked(v.x, v.z, 1.1), 'viewpoint clear ' + v.name);
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

const signPlates = g.scene.getObjectByName('street-signs'),
  signPosts = g.scene.getObjectByName('street-sign-posts');
assert(signPlates && signPosts.isInstancedMesh, 'sign atlas and instanced posts');
assert.equal(signPosts.count, environmentCounts.signs);
assert.equal(signPlates.geometry.index.count, environmentCounts.signs * 6, 'one quad per sign');
const signUV = signPlates.geometry.getAttribute('uv');
for (let i = 0; i < signUV.count; i++)
  assert(signUV.getX(i) >= 0 && signUV.getX(i) <= 1 && signUV.getY(i) >= 0 && signUV.getY(i) <= 1);

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
// Static parts are merged per material; cabin/roof, siren and animated limbs stay separate.
assert.equal(am.length, 9, 'car merged per material and shadow role');
const cop = g.createCar('#123456', true);
assert.equal(carMeshes(cop).length, 12, 'patrol keeps separate siren');
assert(cop.siren.isGroup && cop.siren.children.length === 2);
assert(a.firstPersonOccluders.every((m) => m.parent === a.mesh && am.includes(m)));
assert.equal(carMeshes({ mesh: person.mesh }).length, 12, 'person merged per material');
assert.equal(person.limbs.length, 4);
for (const limb of person.limbs) assert(limb.isGroup && limb.children.length === 2);
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
assert(heights.entries.length > 0, 'independent IGN first-coverage pilot');
const acceptance = JSON.parse(fs.readFileSync('source-data/height-policy.json', 'utf8')).acceptance;
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
  assert(
    s.coverage >= acceptance.minimumCoverage &&
      s.spread <= acceptance.maximumP90P10Spread &&
      s.samples >= acceptance.minimumSamples,
    'height sample quality',
  );
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
for (const { x, z } of VIEWPOINTS.slice(0, 3)) {
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
assert.equal(JSON.parse(storage[SAVE_KEY]).quality, 'low', 'quality persisted');
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
assert.equal(JSON.parse(storage[SAVE_KEY]).quality, 'auto');
console.log('Light mode shadows, persistence and fog culling passed');

// Cambio de calidad en caliente: con puntero fino se carga la ortofoto que toca una sola
// vez, se sustituye en suelo y cubiertas y se libera la anterior.
{
  const usersOf = (tex) => {
    let n = 0;
    g.scene.traverse((o) => {
      for (const m of [o.material].flat()) if (m?.map === tex) n++;
    });
    return n;
  };
  const toggle = () => (g.pauseMenu(), els.quality.onclick());
  const disposed = new Set(),
    watch = (tex) => tex.addEventListener('dispose', () => disposed.add(tex)),
    full = 'aerial.jpg?v=' + assetVersion,
    reduced = 'aerial-2048.jpg?v=' + assetVersion,
    count = (u) => requested.filter((r) => r === u).length;
  const first = g.groundTexture,
    users = usersOf(first),
    reducedBefore = count(reduced);
  assert(users >= 2, 'orthophoto on ground and roofs');
  watch(first);
  g.setCoarse(false);
  toggle(); // ligero: ya está la reducida
  assert.equal(await g.reloadGroundTexture(), false);
  toggle(); // normal: pide la completa
  toggle(); // ligero mientras carga: no pide nada
  toggle(); // normal otra vez: reutiliza la carga en curso
  assert.equal(await g.reloadGroundTexture(), true, 'full orthophoto swapped in');
  assert.equal(count(full), 1, 'full orthophoto requested once');
  const second = g.groundTexture;
  assert(second !== first && disposed.has(first), 'previous orthophoto disposed');
  assert.equal(usersOf(first), 0);
  assert.equal(usersOf(second), users, 'every orthophoto material updated');
  watch(second);
  toggle(); // ligero: vuelve la reducida
  assert.equal(await g.reloadGroundTexture(), true);
  assert(disposed.has(second) && usersOf(g.groundTexture) === users);
  assert.equal(count(reduced), reducedBefore + 1);
  g.setCoarse(true);
  toggle(); // normal en táctil: sigue la reducida
  assert.equal(await g.reloadGroundTexture(), false);
  assert(g.quality === 'auto' && count(full) === 1 && count(reduced) === reducedBefore + 1);
  console.log('Hot quality change swaps and disposes the orthophoto passed');
}

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

assert.equal(g.people.length, POPULATION.pedestrians, 'all planned pedestrians spawned');
assert(g.people.every((p) => p.s.length >= 8));
console.log('Pedestrians', g.people.length);

// Street search: accent-insensitive also for viewpoints; teleport by car lands on a drive road.
{
  els.streetSearch.value = 'jesus';
  g.listStreets();
  const labels = els.streetList.children.map((b) => b.textContent);
  assert(labels.includes('Jesús Nazareno · ver fachada'), 'viewpoint found without accent');
  assert(labels.includes('Calle Jesús Nazareno'), 'street found without accent');
  if (!g.player.car) g.interact();
  if (!g.player.car) {
    const car = g.cars[0];
    Object.assign(g.player, { x: car.x, z: car.z });
    car.speed = 0;
    g.interact();
  }
  assert(g.player.car, 'driving for teleport test');
  els.streetSearch.value = '';
  g.listStreets();
  for (const name of ['Calle Jesús Nazareno', 'Calle de la Vega', 'Plaza Mayor']) {
    const button = els.streetList.children.find((b) => b.textContent === name);
    if (!button) continue;
    button.onclick();
    const road = g.nearestRoad(g.player.x, g.player.z, true);
    assert(road.d < 0.01, 'car teleported onto a drive road: ' + name);
    assert.equal(g.player.car.x, g.player.x);
  }
  console.log('Accent-insensitive search and drive-safe teleport passed');
}
// nearestRoad coincide con el mínimo de pointSeg sobre todos los tramos.
{
  for (const [x, z, drive] of [
    [g.player.x, g.player.z, false],
    [0, 0, true],
    [-180, 95, false],
    [240, -160, true],
  ]) {
    let want = null;
    for (const s of g.segments) {
      if (drive && !s.drive) continue;
      const p = g.pointSeg(x, z, s.a, s.b);
      if (!want || p.d < want.d) want = { ...p, s };
    }
    assert.deepEqual(g.nearestRoad(x, z, drive), want, 'nearestRoad matches pointSeg');
  }
}
// Escape closes the map even while typing in the search field.
{
  g.openMap();
  assert(g.paused);
  windowListeners.keydown.forEach((f) =>
    f({ key: 'Escape', target: { tagName: 'INPUT' }, preventDefault() {} }),
  );
  assert(!g.paused, 'Escape in search closes the map');
}
// Credits links open in a new tab, except the arcade version.
{
  g.help();
  const links = [...els.modalBody.innerHTML.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
  assert(links.length > 10);
  for (const a of links)
    if (a.includes('href="arcade/"')) assert(!a.includes('target='));
    else assert(a.includes('target="_blank"') && a.includes('rel="noopener"'), a);
  g.closeModal();
  console.log('Escape in search and credit links passed');
}
// Malformed layers give a clear error instead of a TypeError.
{
  const realFetch = globalThis.fetch;
  for (const broken of [
    (layer) => delete layer.origin,
    (layer) => (layer.origin = 'x'),
    (layer) => delete layer.roads,
  ]) {
    globalThis.fetch = async (url) => {
      const data = JSON.parse(fs.readFileSync('web/' + url.split('?')[0], 'utf8'));
      if (url.startsWith('osm-world.json')) broken(data);
      return { ok: true, json: async () => data };
    };
    await assert.rejects(g.loadWorld(), /Capas del mapa incompatibles/);
  }
  globalThis.fetch = realFetch;
  await g.loadWorld();
  console.log('Incompatible map layers rejected clearly');
}
assert(mediaQueries.includes('(any-pointer: coarse)'), 'touch controls for any coarse pointer');
assert(!/\(pointer:\s*coarse\)/.test(fs.readFileSync('web/style.css', 'utf8')));
assert(windowListeners.pointerdown, 'first touch enables touch mode');
// Accessibility without changing zoom: dialog semantics, labels, progressbar, focus.
{
  const html = fs.readFileSync('web/index.html', 'utf8'),
    css = fs.readFileSync('web/style.css', 'utf8');
  assert(/user-scalable=no/.test(html), 'zoom policy unchanged');
  assert.equal(html.match(/role="dialog" aria-modal="true"/g).length, 2);
  assert(/<canvas id="world" role="img" aria-label=/.test(html));
  assert(/role="progressbar"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"/.test(html));
  for (const id of ['cameraBtn', 'mapBtn', 'pauseBtn'])
    assert(new RegExp('id="' + id + '"[^>]*aria-label=').test(html), 'label ' + id);
  for (const size of css.match(/#credits \{[^}]*\}/g).map((r) => r.match(/font-size: (\d+)px/)))
    if (size) assert(+size[1] >= 11, 'credits at least 11 px');
  assert.equal(els.loadTrack.attributes?.['aria-valuenow'] ?? '100', '100');
  g.pauseMenu();
  assert.equal(els.hud.inert, true, 'HUD inert behind dialog');
  g.closeModal();
  assert.equal(els.hud.inert, false);
  console.log('Dialog semantics, labels, progressbar and credits size passed');
}

{
  const key = (tag, key) => {
    let prevented = false;
    windowListeners.keydown.forEach((f) =>
      f({
        key,
        target: { tagName: tag },
        repeat: false,
        preventDefault() {
          prevented = true;
        },
      }),
    );
    return prevented;
  };
  for (const tag of ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'])
    assert(!key(tag, ' '), 'native Space activation preserved');
  assert(key('BODY', ' '), 'Space still brakes in game');
  windowListeners.keyup.forEach((f) => f({ key: ' ' }));
  g.pauseMenu();
  key('BUTTON', 'Escape');
  assert(!g.paused, 'Escape closes focused dialog');
}

// After losing the WebGL context the game cannot be resumed, only reloaded (keep last).
{
  els.world.listeners.webglcontextlost.forEach((f) => f({ preventDefault() {} }));
  assert(g.paused);
  g.closeModal();
  windowListeners.keydown.forEach((f) =>
    f({ key: 'Escape', target: { tagName: 'BODY' }, preventDefault() {} }),
  );
  assert(g.paused, 'context loss cannot be dismissed');
  const renders = g.renderer.renders;
  g.frame(5000);
  assert.equal(g.renderer.renders, renders, 'no render after context loss');
  console.log('Context loss blocks resuming passed');
}

// Modo ?debug: el módulo solo se pide con ?debug; el inspector localiza edificio, frente y vía.
{
  const app = fs.readFileSync('web/js/app.js', 'utf8');
  assert.equal(app.match(/debug\/inspector\.js/g).length, 1, 'un único import del inspector');
  assert(
    /has\('debug'\)\)\s*\(await import\('\.\/debug\/inspector\.js'\)\)/.test(app),
    'el inspector se importa dinámicamente solo con ?debug',
  );
  assert.equal(globalThis.location, undefined, 'el arnés arranca sin ?debug');
  assert.equal(els.debugPanel, undefined, 'sin ?debug no hay panel');

  const { inspectPoint, installInspector, isTap, fragments, formatInfo } =
    await import('../web/js/debug/inspector.js');
  // Un punto conocido de la calle Jesús Nazareno: 0,2 m fuera de un frente catalogado.
  const front = g.facadeWork.fronts.find((f) => f.street === 'Calle Jesús Nazareno');
  assert(front, 'hay frentes en la calle Jesús Nazareno');
  const x = (front.a[0] + front.q[0]) / 2 + front.nx * 0.2,
    z = (front.a[1] + front.q[1]) / 2 + front.nz * 0.2,
    info = inspectPoint(x, z);
  assert.equal(info.building.index, front.buildingIndex, 'edificio del punto');
  assert.equal(info.front.id, front.id, 'frente del punto');
  assert(info.front.catalogued, 'frente catalogado en frontages.json');
  assert.equal(info.road.name, 'Calle Jesús Nazareno', 'vía del punto');
  assert.deepEqual(
    [info.point.x, info.point.z],
    [Math.round(x * 100) / 100, Math.round(z * 100) / 100],
  );
  assert.match(info.building.footprintSha256, /^[0-9a-f]{64}$/);
  const { anchor, correction } = fragments(info, '2026-10-06');
  assert.deepEqual(anchor, { front: front.id, footprintSha256: info.building.footprintSha256 });
  const { validateCorrections } = await import('../web/js/world/design-validate.js');
  assert.deepEqual(
    validateCorrections({
      version: 1,
      license: 'ODbL-1.0',
      attribution: 'x',
      corrections: [correction],
    }),
    [],
    'la corrección copiada es válida',
  );
  // En mitad del mar de agua o lejos de todo no hay edificio ni frente.
  assert.equal(inspectPoint(-5000, -5000).building, null);
  assert(
    formatInfo(info).some(([label]) => label === 'Jugador'),
    'incluye la posición del jugador',
  );

  // Un toque son menos de 6 px y menos de 350 ms con el mismo puntero.
  const down = { id: 1, x: 100, y: 100, t: 0 };
  assert(isTap(down, { id: 1, x: 103, y: 104, t: 200 }), 'toque corto');
  assert(!isTap(down, { id: 1, x: 120, y: 100, t: 100 }), 'arrastre');
  assert(!isTap(down, { id: 1, x: 100, y: 100, t: 400 }), 'pulsación larga');
  assert(!isTap(down, { id: 2, x: 100, y: 100, t: 100 }), 'otro puntero');

  // El panel se crea oculto y los oyentes no pisan los del juego (addEventListener).
  const root = {
      items: [],
      appendChild(e) {
        this.items.push(e);
      },
    },
    canvas = els.world,
    before = canvas.onpointerdown;
  const { panel } = installInspector(g, { root });
  assert.equal(root.items[0], panel);
  assert.equal(panel.hidden, true, 'panel oculto hasta el primer toque');
  assert.equal(canvas.onpointerdown, before, 'no sustituye el oyente de arrastre');
  const fire = (type, init) => {
    for (const f of canvas.listeners[type] ?? []) f({ target: canvas, pointerId: 7, ...init });
  };
  fire('pointerdown', { clientX: 100, clientY: 100 });
  fire('pointerup', { clientX: 140, clientY: 100 });
  assert.equal(panel.hidden, true, 'un arrastre no abre el panel');
  console.log(
    'Debug inspector passed: point, front and road found; tap rules; no cost without ?debug',
  );
}
