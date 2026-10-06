import { blocked } from '../world/spatial.js';
import { clamp, d } from '../core/math.js';
import { createCar } from './vehicles.js';
import { findRoute, nearestNode } from './graph.js';
import { gfx, graph, player, police, session, state } from '../core/state.js';
import { save } from './save.js';
import { stepAgent } from './traffic.js';
import { toast } from '../ui/feedback.js';
import { updateHUD } from '../ui/hud.js';

export function setHeat(n) {
  state.wanted = clamp(state.wanted + n, 0, 5);
  state.heat = 22 + state.wanted * 7;
  updateHUD();
}

export function dropPolice() {
  for (const p of police) {
    gfx.scene.remove(p.mesh);
  }
  police.length = 0;
  state.wanted = 0;
  state.arrest = 0;
  updateHUD();
}

export function updatePolice(dt) {
  if (!state.wanted) return;
  while (police.length < Math.min(3, state.wanted + 1)) {
    let best = null;
    for (let i = 0; i < graph.length; i++) {
      let n = graph[i],
        di = Math.hypot(player.x - n.x, player.z - n.z);
      if (
        di > 130 + police.length * 30 &&
        di < 180 + police.length * 30 &&
        n.driveMain &&
        !blocked(n.x, n.z, 1)
      ) {
        best = i;
        break;
      }
    }
    if (best === null) break;
    let p = createCar('#293946', true),
      n = graph[best];
    Object.assign(p, {
      x: n.x,
      z: n.z,
      a: 0,
      node: best,
      next: n.adj.find((e) => e.drive).to,
      cruise: 12 + state.wanted,
      think: 0,
    });
    police.push(p);
  }
  let close = false;
  for (const p of police) {
    p.think -= dt;
    if (p.think <= 0) {
      p.path = findRoute(p.node, nearestNode(player.x, player.z, true), true);
      p.think = 3;
    }
    stepAgent(p, dt, true);
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.a;
    if (p.siren) p.siren.visible = Math.sin(session.t * 14) > -0.5;
    if (d(p, player) < 9) {
      close = true;
      if (Math.abs(player.speed) < 3) state.arrest += dt;
    } else if (d(p, player) > 400) {
      gfx.scene.remove(p.mesh);
      police.splice(police.indexOf(p), 1);
      break;
    }
  }
  if (!close) state.arrest = Math.max(0, state.arrest - dt);
  if (state.arrest > 4) {
    state.cash = Math.max(0, state.cash - 150);
    dropPolice();
    toast('Te han parado · Multa de 150 €', 4);
    save();
    return;
  }
  state.heat -= dt * (close ? 0.2 : 1);
  if (state.heat <= 0) {
    dropPolice();
    toast('HAS DESPISTADO A LA POLICÍA', 4);
  }
}
