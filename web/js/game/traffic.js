import { surfaceHeightAt } from '../engine/terrain-sampling.js';
import { POPULATION } from '../../game-data.js';
import { blocked, inBuilding, safePoint } from '../world/spatial.js';
import { cars, graph, people, player, segments, session, traffic } from '../core/state.js';
import { clamp, d, lerp } from '../core/math.js';
import { createCar } from './vehicles.js';
import { createPerson } from './people.js';
import { rnd } from '../core/random.js';

export function spawnTraffic() {
  let eligible = segments.filter((s) => s.forward.drive && s.length > 18);
  for (let i = 0; i < POPULATION.traffic; i++) {
    let s = eligible[Math.floor(rnd() * eligible.length)],
      n = graph[s.ai];
    if (blocked(n.x, n.z, 1)) continue;
    let car = createCar(['#d8d3c5', '#50575b', '#9f5446', '#b8b2a1', '#6b8587', '#a9b4bf'][i % 6]);
    Object.assign(car, {
      x: n.x,
      z: n.z,
      node: s.ai,
      next: s.bi,
      cruise: 6 + rnd() * 4,
      progress: 0,
      surfaceRoad: s.roadId,
    });
    traffic.push(car);
  }
  for (let i = 0; i < POPULATION.parked; i++) {
    let s = eligible[Math.floor(rnd() * eligible.length)],
      p = safePoint((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, true),
      car = createCar(['#dcc394', '#69747b', '#becec1'][i % 3]);
    Object.assign(car, p);
    cars.push(car);
  }
  // 28 pedestrians on segments of at least 8 m; bounded attempts keep start-up predictable.
  for (
    let i = 0, attempts = 0;
    i < POPULATION.pedestrians && attempts < POPULATION.pedestrianAttempts;
    attempts++
  ) {
    let s = segments[Math.floor(rnd() * segments.length)];
    if (s.length < 8) continue;
    let person = createPerson(['#d5be8a', '#697b70', '#8d6d62', '#9cadaa'][i++ % 4]);
    Object.assign(person, { x: s.a[0], z: s.a[1], s, u: rnd(), dir: 1 });
    people.push(person);
  }
}

export function stepAgent(c, dt, isCop = false) {
  if (c.next === undefined) return;
  let n = graph[c.next],
    di = Math.hypot(n.x - c.x, n.z - c.z),
    speed = c.cruise || 9;
  if (!isCop && d(c, player) < 7) speed = 0;
  if (di < Math.max(1, speed * dt)) {
    // Snap to the node so agents follow the checked segment lines exactly.
    c.x = n.x;
    c.z = n.z;
    c.node = c.next;
    let candidates = graph[c.node].adj.filter((e) => e.drive && e.to !== c.prev);
    if (!candidates.length) candidates = graph[c.node].adj.filter((e) => e.drive);
    // Last resort (spawned inside an excluded alley): any road back to the network.
    if (!candidates.length) candidates = graph[c.node].adj.filter((e) => e.s?.drive);
    c.prev = c.node;
    let next;
    if (isCop && c.path?.length) {
      while (c.path.length && c.path[0] === c.node) c.path.shift();
      if (c.path.length) next = { to: c.path.shift() };
    }
    if (!next) next = candidates[Math.floor(rnd() * candidates.length)];
    if (next) {
      c.next = next.to;
      c.surfaceRoad = next.s?.roadId ?? graph[c.node].adj.find((e) => e.to === next.to)?.s?.roadId;
    } else c.next = undefined;
    return;
  }
  let a = Math.atan2(n.x - c.x, n.z - c.z),
    delta = Math.atan2(Math.sin(a - c.a), Math.cos(a - c.a));
  c.a += clamp(delta, -dt * 3, dt * 3);
  let nx = c.x + Math.sin(a) * speed * dt,
    nz = c.z + Math.cos(a) * speed * dt;
  if (!inBuilding(nx, nz, 0.35)) {
    c.x = nx;
    c.z = nz;
    c.speed = speed;
    c.stuck = 0;
  } else {
    c.speed = 0;
    c.stuck = (c.stuck || 0) + dt;
    if (c.stuck > 2) {
      let tmp = c.node;
      c.node = c.next;
      c.next = tmp;
      c.stuck = 0;
    }
  }
}

export function updatePedestrians(dt) {
  for (const p of people) {
    p.u += (p.dir * dt * 1.05) / p.s.length;
    if (p.u > 1 || p.u < 0) {
      p.dir *= -1;
      p.u = clamp(p.u, 0, 1);
    }
    let x = lerp(p.s.a[0], p.s.b[0], p.u),
      z = lerp(p.s.a[1], p.s.b[1], p.u),
      a = Math.atan2(p.s.b[0] - p.s.a[0], p.s.b[1] - p.s.a[1]);
    x += Math.cos(a) * (p.s.width / 2 + 0.5);
    z -= Math.sin(a) * (p.s.width / 2 + 0.5);
    p.mesh.visible = !inBuilding(x, z, 0.2) && Math.hypot(x - player.x, z - player.z) < 140;
    p.surfaceY = surfaceHeightAt(x, z, p.surfaceY ?? null, p.s.roadId);
    p.mesh.position.set(x, p.surfaceY, z);
    p.mesh.rotation.y = a + (p.dir < 0 ? Math.PI : 0);
    p.limbs.forEach((l, i) => (l.rotation.x = Math.sin(session.t * 7 + (i % 2) * Math.PI) * 0.35));
  }
}
