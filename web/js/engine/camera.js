import {
  actors,
  buildingGrid,
  camDesired,
  camLook,
  camPos,
  camTarget,
  chunks,
  gfx,
  player,
  view,
} from '../core/state.js';
import { lerp, pInside, pointSeg } from '../core/math.js';
import { toast } from '../ui/feedback.js';
import { surfaceHeightAt, placeVehicle } from './terrain-sampling.js';

export function updateCameraVisibility() {
  if (view.firstPersonCar && (view.mode !== 1 || view.firstPersonCar !== player.car))
    view.firstPersonCar.firstPersonOccluders.forEach((m) => (m.visible = true));
  view.firstPersonCar = view.mode === 1 ? player.car : null;
  if (view.firstPersonCar)
    view.firstPersonCar.firstPersonOccluders.forEach((m) => (m.visible = false));
  actors.character.mesh.visible = !player.car && view.mode !== 1;
}

export function snapCamera() {
  if (player.car) placeVehicle(player.car);
  else actors.character.mesh.position.set(player.x, surfaceHeightAt(player.x, player.z), player.z);
  view.orbit = 0;
  view.lookPitch = 0;
  updateCamera(1);
}

// Sweep against cadastral volumes at the ray height; camera only, no physics changes.
export function cameraSweep(position) {
  let dx = position.x - player.x,
    dz = position.z - player.z,
    length = Math.hypot(dx, dz),
    steps = Math.max(1, Math.ceil(length / 0.25));
  for (let i = 1; i <= steps; i++) {
    let u = i / steps,
      x = player.x + dx * u,
      z = player.z + dz * u,
      y = lerp(surfaceHeightAt(player.x, player.z) + 1.1, position.y, u),
      pad = 0.18;
    if (y < surfaceHeightAt(x, z) + pad) return Math.max(0, (i - 1) / steps);
    const seen = new Set();
    for (let gx = Math.floor((x - pad) / 25); gx <= Math.floor((x + pad) / 25); gx++)
      for (let gz = Math.floor((z - pad) / 25); gz <= Math.floor((z + pad) / 25); gz++)
        for (const b of buildingGrid.get(gx + ',' + gz) || []) {
          if (seen.has(b)) continue;
          seen.add(b);
          if (
            y > (b.baseY ?? 0) + (b.renderH ?? b.h) + pad ||
            x < b.minX - pad ||
            x > b.maxX + pad ||
            z < b.minZ - pad ||
            z > b.maxZ + pad
          )
            continue;
          let hit = pInside(x, z, b.p) && !b.holes.some((h) => pInside(x, z, h));
          if (!hit)
            for (const r of [b.p, ...b.holes])
              for (let k = 0; k < r.length && !hit; k++)
                if (pointSeg(x, z, r[k], r[(k + 1) % r.length]).d < pad) hit = true;
          if (hit) return Math.max(0, (i - 1) / steps - 0.2 / (length || 1));
        }
  }
  return 1;
}

function constrainCamera(position) {
  let u = cameraSweep(position);
  if (u < 1) {
    position.x = lerp(player.x, position.x, u);
    position.z = lerp(player.z, position.z, u);
  }
  position.y = Math.max(position.y, surfaceHeightAt(position.x, position.z) + 0.25);
}

export function updateCamera(dt) {
  const ground = surfaceHeightAt(player.x, player.z);
  let heading = player.a + view.orbit,
    follow = player.car ? 9.7 : 5.9,
    y = player.car ? 4.7 : 3.2,
    look = player.car ? 4.8 : 2.8;
  let desired, target;
  if (view.mode === 1) {
    let ahead = player.car ? -0.15 : 0,
      side = player.car ? 0.38 : 0;
    desired = camDesired.set(
      player.x + Math.sin(player.a) * ahead + Math.cos(player.a) * side,
      ground + (player.car ? 1.2 : 1.61),
      player.z + Math.cos(player.a) * ahead - Math.sin(player.a) * side,
    );
    if (player.car) {
      player.car.mesh.updateMatrixWorld(true);
      camDesired.set(side, 1.2, ahead).applyMatrix4(player.car.mesh.matrixWorld);
    }
    target = camLook.set(
      desired.x + Math.sin(heading) * Math.cos(view.lookPitch) * 18,
      desired.y + Math.sin(view.lookPitch) * 18,
      desired.z + Math.cos(heading) * Math.cos(view.lookPitch) * 18,
    );
    camPos.copy(desired);
    camTarget.copy(target);
  } else {
    if (view.mode === 2) {
      follow = 25;
      y = 45;
      look = 0;
    }
    desired = camDesired.set(
      player.x - Math.sin(heading) * follow,
      ground + y,
      player.z - Math.cos(heading) * follow,
    );
    target = camLook.set(
      player.x + Math.sin(heading) * look,
      ground + (view.mode === 2 ? 0 : 1.1 + Math.tan(view.lookPitch) * look),
      player.z + Math.cos(heading) * look,
    );
    if (view.mode === 0) constrainCamera(desired);
    camPos.lerp(desired, 1 - Math.exp(-dt * 6));
    camTarget.lerp(target, 1 - Math.exp(-dt * 8));
    if (view.mode === 0) constrainCamera(camPos);
  }
  updateCameraVisibility();
  gfx.camera.position.copy(camPos);
  gfx.camera.lookAt(camTarget);
  gfx.sun.position.set(player.x - 85, ground + 125, player.z + 60);
  gfx.sun.target.position.set(player.x, ground, player.z);
  gfx.sun.target.updateMatrixWorld();
  // In light mode, chunks beyond the fog end are culled (measured from the camera).
  const low = gfx.quality === 'low',
    reach = low ? gfx.scene.fog.far : view.mode === 2 ? 650 : 520,
    ox = low ? gfx.camera.position.x : player.x,
    oz = low ? gfx.camera.position.z : player.z;
  for (const group of chunks) {
    let m = group.children[0],
      c = m.geometry.boundingSphere;
    group.visible = Math.hypot(c.center.x - ox, c.center.z - oz) < reach + c.radius;
  }
}

export function cycleCamera() {
  view.mode = (view.mode + 1) % 3;
  snapCamera();
  toast(
    ['Cámara de seguimiento', 'Primera persona · mirada libre', 'Vista aérea del trazado real'][
      view.mode
    ],
    2,
  );
}
