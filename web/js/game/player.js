import {
  actors,
  base,
  cars,
  input,
  keys,
  player,
  pointer,
  police,
  session,
  state,
  traffic,
  vehicles,
  view,
} from '../core/state.js';
import { blocked, crossesWall, safePoint } from '../world/spatial.js';
import { carCollision, nearestCar } from './vehicles.js';
import { clamp, d, lerp } from '../core/math.js';
import { dropPolice, setHeat } from './police.js';
import { save } from './save.js';
import { snapCamera } from '../engine/camera.js';
import { toast } from '../ui/feedback.js';
import { updateEngineSound } from '../engine/audio.js';
import { updateHUD } from '../ui/hud.js';

export function rescue() {
  state.cash = Math.max(0, state.cash - 100);
  dropPolice();
  let p = safePoint(base.x, base.z, true);
  if (player.car) {
    Object.assign(player.car, p);
    player.car.speed = 0;
    player.car.health = 100;
  }
  Object.assign(player, p);
  state.health = 100;
  snapCamera();
  toast('Traslado a la Alameda y reparación · 100 €', 4);
  save();
  updateHUD();
}

export function interact() {
  if (!session.started || session.paused) return;
  if (player.car) {
    let c = player.car;
    if (Math.abs(c.speed) > 2.5) {
      toast('Frena antes de bajar.', 2);
      return;
    }
    let exit = null;
    for (const sign of [1, -1]) {
      let x = c.x + Math.cos(c.a) * 2.2 * sign,
        z = c.z - Math.sin(c.a) * 2.2 * sign;
      // La puerta no puede atravesar un muro (p. ej., hacia un patio cerrado).
      if (!blocked(x, z, 0.35) && !crossesWall(c.x, c.z, x, z)) {
        exit = { x, z };
        break;
      }
    }
    if (!exit) {
      toast('No hay espacio para abrir la puerta. Avanza un poco.', 3);
      return;
    }
    player.car = null;
    Object.assign(player, exit);
    player.speed = 0;
    toast('A pie · Usa el joystick. Arrastra la escena para mirar.', 3);
  } else {
    let c = nearestCar();
    if (!c) {
      toast('Acércate a un coche detenido para subir.', 3);
      return;
    }
    let i = traffic.indexOf(c);
    if (i >= 0) {
      traffic.splice(i, 1);
      cars.push(c);
      setHeat(1);
    }
    player.car = c;
    player.x = c.x;
    player.z = c.z;
    player.a = c.a;
    state.health = c.health;
    toast('Al volante · GAS, FRENO y flechas para girar.', 3);
  }
  updateHUD();
  snapCamera();
}

export function updatePlayer(dt) {
  let steer =
      (input.right || keys.d || keys.ArrowRight ? 1 : 0) -
      (input.left || keys.a || keys.ArrowLeft ? 1 : 0),
    gas = input.gas || keys.w || keys.ArrowUp,
    brake = input.brake || keys.s || keys.ArrowDown,
    boost = input.boost || keys.Shift;
  const hand = keys[' '];
  if (player.car) {
    let c = player.car,
      max = boost ? 40 : 28;
    if (gas) c.speed += dt * (c.speed < 0 ? 16 : 9.5);
    else if (brake) c.speed -= dt * (c.speed > 0 ? 17 : 5);
    else
      c.speed =
        Math.sign(c.speed) * Math.max(0, Math.abs(c.speed) - dt * (2.3 + Math.abs(c.speed) * 0.08));
    if (hand) c.speed *= Math.exp(-dt * 4);
    c.speed = clamp(c.speed, -7, max);
    let steerAngle = (steer * 0.48) / (1 + Math.abs(c.speed) * 0.028);
    c.a -= (c.speed / 2.8) * Math.tan(steerAngle) * dt;
    let nx = c.x + Math.sin(c.a) * c.speed * dt,
      nz = c.z + Math.cos(c.a) * c.speed * dt;
    if (carCollision(c, nx, nz)) {
      if (Math.abs(c.speed) > 4 && session.collisionClock <= 0) {
        c.health -= Math.min(20, Math.abs(c.speed) * 0.45);
        session.collisionClock = 0.6;
        toast('Golpe · Frena y maniobra hacia atrás.', 1.8);
      }
      c.speed *= -0.15;
    } else {
      c.x = nx;
      c.z = nz;
    }
    for (let k = 0, total = vehicles.length + police.length; k < total; k++) {
      const other = k < vehicles.length ? vehicles[k] : police[k - vehicles.length];
      if (other === c || d(c, other) > 3.1) continue;
      if (session.collisionClock <= 0 && Math.abs(c.speed) > 3) {
        c.health -= 5;
        c.speed *= -0.15;
        session.collisionClock = 1.3;
        setHeat(other.cop ? 1 : state.wanted < 2 ? 1 : 0);
      }
    }
    player.x = c.x;
    player.z = c.z;
    player.a = c.a;
    player.speed = c.speed;
    state.health = c.health;
    c.mesh.rotation.z = lerp(
      c.mesh.rotation.z,
      -steer * Math.min(0.04, Math.abs(c.speed) * 0.002),
      dt * 6,
    );
    if (c.health <= 0) rescue();
  } else {
    let ix = input.jx,
      iy = -input.jy;
    if (pointer.joyId === null) {
      ix = steer;
      iy = (gas ? 1 : 0) - (brake ? 1 : 0);
    }
    let mag = Math.min(1, Math.hypot(ix, iy)),
      heading = player.a + view.orbit;
    let a = heading - Math.atan2(ix, iy),
      v = (boost ? 6.1 : 3.2) * mag;
    if (mag > 0.1) {
      let nx = player.x + Math.sin(a) * v * dt,
        nz = player.z + Math.cos(a) * v * dt;
      if (!blocked(nx, player.z, 0.28)) player.x = nx;
      if (!blocked(player.x, nz, 0.28)) player.z = nz;
      actors.character.mesh.rotation.y = a;
    }
    player.speed = v;
    actors.character.mesh.position.set(player.x, 0, player.z);
    actors.character.limbs.forEach(
      (l, i) =>
        (l.rotation.x =
          Math.sin(session.t * (boost ? 12 : 8) + (i % 2) * Math.PI) * Math.min(0.65, v * 0.13)),
    );
  }
  updateEngineSound();
}
