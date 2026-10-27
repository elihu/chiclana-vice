import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';
import { skyUniforms } from './sky.js';

const { abs, float, length, mix, pow, smoothstep, uniform, uv, vec3 } = THREE.TSL;

// Luz falsa de noche, sin luces dinámicas: manchas aditivas sobre el suelo bajo las farolas y
// delante y detrás de los coches. Tres `InstancedMesh` (tres llamadas de dibujo) con materiales
// compartidos, cuya opacidad es el uniforme `night` del cielo; de día no se dibujan. Cambian en
// vivo con `(await import('./js/engine/night-glow.js')).setNightGlow({ lampRadius: 7 })`.
export const NIGHT_GLOW = {
  lampColor: '#ffcf8a', // mancha bajo las farolas
  lampRadius: 5.5, // m
  lampStrength: 0.5,
  beamColor: '#fff0cf', // haz de los faros
  beamLength: 11, // m por delante del coche
  beamWidth: 6, // m al final del haz
  beamStrength: 0.9,
  tailColor: '#ff3a2a', // brillo de los pilotos
  tailSize: 3.2, // m
  tailStrength: 0.45,
  lift: 0.06, // m sobre el suelo, contra el parpadeo
  beamLift: 0.25, // m del haz de los faros sobre el coche: que no lo tape el pavimento
};

const LAMP_CAPACITY = 1024,
  CAR_CAPACITY = 128,
  lampStrength = uniform(NIGHT_GLOW.lampStrength),
  beamStrength = uniform(NIGHT_GLOW.beamStrength),
  tailStrength = uniform(NIGHT_GLOW.tailStrength),
  lampColor = uniform(new THREE.Color(NIGHT_GLOW.lampColor)),
  beamColor = uniform(new THREE.Color(NIGHT_GLOW.beamColor)),
  tailColor = uniform(new THREE.Color(NIGHT_GLOW.tailColor)),
  cars = [],
  lampSpots = [],
  dummy = new THREE.Object3D();
let lamps = null,
  beams = null,
  tails = null;

export function setNightGlow(patch = {}) {
  Object.assign(NIGHT_GLOW, patch);
  lampStrength.value = NIGHT_GLOW.lampStrength;
  beamStrength.value = NIGHT_GLOW.beamStrength;
  tailStrength.value = NIGHT_GLOW.tailStrength;
  lampColor.value.set(NIGHT_GLOW.lampColor);
  beamColor.value.set(NIGHT_GLOW.beamColor);
  tailColor.value.set(NIGHT_GLOW.tailColor);
  if (lamps) placeLamps();
  gfx.needsRender = true;
}

function additive(color, opacity) {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.colorNode = vec3(color);
  material.opacityNode = opacity.mul(skyUniforms.night);
  return material;
}

function instanced(name, material, capacity) {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    material,
    capacity,
  );
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.count = 0;
  gfx.scene.add(mesh);
  return mesh;
}

// Mancha radial suave: 1 en el centro, 0 en el borde.
const radial = () => {
  const r = length(uv().sub(0.5)).mul(2);
  return pow(float(1).sub(smoothstep(0, 1, r)), 1.8);
};

function create() {
  lamps = instanced('lamp-glow', additive(lampColor, radial().mul(lampStrength)), LAMP_CAPACITY);
  tails = instanced('tail-glow', additive(tailColor, radial().mul(tailStrength)), CAR_CAPACITY);
  // Haz: t de 0 (coche) a 1 (extremo); se ensancha y se apaga con la distancia. Se usan las UV:
  // en una malla instanciada `positionLocal` ya está en el mundo. Tras `rotateX(-π/2)`, la V
  // vale 1 en el lado del coche (z local -0,5) y 0 en el extremo.
  const t = float(1).sub(uv().y),
    x = abs(uv().x.sub(0.5)).mul(2),
    cone = float(1).sub(smoothstep(0.55, 1, x.div(mix(float(0.3), float(1), t)))),
    fade = pow(float(1).sub(t), 1.4).mul(smoothstep(0, 0.06, t));
  beams = instanced(
    'beam-glow',
    additive(beamColor, cone.mul(fade).mul(beamStrength)),
    CAR_CAPACITY,
  );
}

function placeLamps() {
  const size = NIGHT_GLOW.lampRadius * 2;
  lampSpots.forEach(([x, y, z], i) => {
    dummy.position.set(x, y + NIGHT_GLOW.lift, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(size, 1, size);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
  });
  lamps.count = lampSpots.length;
  lamps.instanceMatrix.needsUpdate = true;
}

// Mancha de luz bajo una farola en (x, y, z), con `y` la altura del suelo.
export function addLampGlow(x, y, z) {
  if (!lamps) create();
  if (lampSpots.length >= LAMP_CAPACITY) return;
  lampSpots.push([x, y, z]);
  placeLamps();
}

// Registra un coche (hijo directo de la escena) con haz de faros y brillo de pilotos.
export function addCarGlow(object) {
  if (!lamps) create();
  cars.push(object);
}

function shown(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

// Coloca los haces y el brillo de los coches. Se llama antes de dibujar cada fotograma. Con
// `night` a 0 las mallas se ocultan (el precompilado de shaders las pone visibles igualmente).
export function updateNightGlow() {
  if (!lamps) return;
  const on = skyUniforms.night.value > 0.001;
  lamps.visible = beams.visible = tails.visible = on;
  if (!on) return;
  let n = 0;
  const { beamLength, beamWidth, tailSize } = NIGHT_GLOW;
  for (const object of cars) {
    if (n >= CAR_CAPACITY || !object.parent || !shown(object)) continue;
    const y = object.position.y + NIGHT_GLOW.beamLift,
      sin = Math.sin(object.rotation.y),
      cos = Math.cos(object.rotation.y),
      front = 2.1 + beamLength / 2,
      rear = -2.4;
    dummy.rotation.set(0, object.rotation.y, 0);
    dummy.position.set(object.position.x + sin * front, y, object.position.z + cos * front);
    dummy.scale.set(beamWidth, 1, beamLength);
    dummy.updateMatrix();
    beams.setMatrixAt(n, dummy.matrix);
    dummy.position.set(object.position.x + sin * rear, y, object.position.z + cos * rear);
    dummy.scale.set(tailSize, 1, tailSize);
    dummy.updateMatrix();
    tails.setMatrixAt(n++, dummy.matrix);
  }
  beams.count = tails.count = n;
  beams.instanceMatrix.needsUpdate = tails.instanceMatrix.needsUpdate = true;
}
