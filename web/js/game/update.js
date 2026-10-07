import { placeVehicle } from '../engine/terrain-sampling.js';
import { findRoute, nearestNode } from './graph.js';
import { lerp } from '../core/math.js';
import { player, session, traffic, vehicles, view } from '../core/state.js';
import { save } from './save.js';
import { stepAgent, updatePedestrians } from './traffic.js';
import { ui } from '../core/dom.js';
import { updateCamera } from '../engine/camera.js';
import { updateHudReadouts } from '../ui/hud.js';
import { updateMarkers, updateMissions } from './missions.js';
import { updatePlayer } from './player.js';
import { updatePolice } from './police.js';

export function update(dt) {
  session.t += dt;
  session.collisionClock = Math.max(0, session.collisionClock - dt);
  session.toastClock -= dt;
  if (session.toastShown && session.toastClock <= 0) {
    session.toastShown = false;
    ui('toast').classList.remove('show');
  }
  updatePlayer(dt);
  for (const c of traffic) stepAgent(c, dt);
  for (const c of vehicles) {
    placeVehicle(c);
  }
  updatePolice(dt);
  updatePedestrians(dt);
  let goal = updateMissions(dt);
  updateMarkers(goal);
  session.routeClock -= dt;
  if (session.routeClock <= 0) {
    session.routeClock = 2.5;
    session.route =
      goal && !goal.escape
        ? findRoute(nearestNode(player.x, player.z), nearestNode(goal.x, goal.z))
        : [];
  }
  if (view.orbitAge > 0) view.orbitAge -= dt;
  else if (player.car && view.mode !== 1) view.orbit = lerp(view.orbit, 0, dt * 2);
  updateCamera(dt);
  updateHudReadouts(goal);
  session.saveClock += dt;
  if (session.saveClock > 10) {
    session.saveClock = 0;
    save();
  }
}
