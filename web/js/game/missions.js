import { surfaceHeightAt } from '../engine/terrain-sampling.js';
import { actors, player, pois, session, state, world } from '../core/state.js';
import { d } from '../core/math.js';
import { JOBS as jobs } from '../../game-data.js';
import { save } from './save.js';
import { setHeat } from './police.js';
import { target } from './jobs.js';
import { toast } from '../ui/feedback.js';
import { updateHUD } from '../ui/hud.js';

function advanceStage() {
  let j = jobs[state.job];
  if (!j) return;
  if (state.stage === 0) {
    state.timer = j.limit;
    if (j.stages.some((s) => s.escape)) {
      setHeat(2);
      toast('Te han visto. Entrega el paquete y despista a las patrullas.', 5);
    } else toast('Recogida completada. Sigue la ruta del minimapa.', 3);
  }
  state.stage++;
  session.hold = 0;
  session.routeClock = 0;
  if (state.stage >= j.stages.length) {
    state.cash += j.reward;
    toast('ENCARGO COMPLETADO · +' + j.reward + ' €', 5);
    state.job++;
    state.stage = 0;
    state.timer = 0;
    save();
  }
  updateHUD();
}

export function updateMissions(dt) {
  let goal = target();
  if (goal) {
    if (state.timer > 0) {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.stage = 0;
        session.hold = 0;
        toast('Tiempo agotado. Vuelve al punto de recogida para intentarlo de nuevo.', 4);
        updateHUD();
        goal = target();
      }
    }
    if (goal.escape) {
      if (state.wanted === 0) advanceStage();
    } else if (d(player, goal) < 8 && Math.abs(player.speed) < 1.8) {
      session.hold += dt;
      if (session.hold > 1) advanceStage();
    } else session.hold = 0;
    goal = target();
  }
  for (let i = 0; i < pois.length; i++)
    if (d(player, pois[i]) < 24 && !state.found.has(i)) {
      state.found.add(i);
      state.cash += 75;
      toast('LUGAR DESCUBIERTO · ' + pois[i].name + ' · +75 €', 3);
      updateHUD();
      save();
    }
  return goal;
}

const markerSurfaces = new WeakMap();

export function updateMarkers(goal) {
  if (goal && !goal.escape) {
    actors.ring.visible = actors.beam.visible = true;
    const ring = actors.ring;
    let cached = markerSurfaces.get(ring);
    if (
      !cached ||
      cached.x !== goal.x ||
      cached.z !== goal.z ||
      cached.model !== world.surfaces ||
      cached.terrain !== world.terrain
    ) {
      const ground = surfaceHeightAt(goal.x, goal.z);
      cached = { x: goal.x, z: goal.z, ground, model: world.surfaces, terrain: world.terrain };
      markerSurfaces.set(ring, cached);
      if (world.terrain.kind === 'grid') {
        const positions = ring.geometry.getAttribute('position');
        // Conforma el anillo una vez por objetivo. La animación solo cambia escala.
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i),
            z = -positions.getY(i);
          positions.setZ(i, -(surfaceHeightAt(goal.x + x, goal.z + z) - ground));
        }
        positions.needsUpdate = true;
        ring.geometry.computeBoundingSphere();
      }
    }
    ring.position.set(goal.x, cached.ground + 0.16, goal.z);
    ring.scale.setScalar(1 + Math.sin(session.t * 2) * 0.025);
    actors.beam.position.set(goal.x, cached.ground + 2, goal.z);
    actors.beam.material.opacity = 0.1 + Math.sin(session.t * 2) * 0.025;
    actors.arrow.visible = true;
    actors.arrow.position.set(goal.x, cached.ground + 6 + Math.sin(session.t * 2) * 0.4, goal.z);
    actors.arrow.rotation.z = Math.PI;
    actors.arrow.rotation.y = session.t * 0.7;
  } else actors.ring.visible = actors.beam.visible = actors.arrow.visible = false;
}
