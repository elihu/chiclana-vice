import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';

const { float, length, mix, pow, smoothstep, uniform, uv, vec3 } = THREE.TSL;

// Sombras de contacto difuminadas bajo coches, personas y jugador. Una sola `InstancedMesh`
// (una llamada de dibujo) con un material compartido; también en el modo ligero, que no tiene
// sombras del sol. Cambia en vivo desde la consola con
// `(await import('./js/engine/contact-shadows.js')).setContactShadows({ opacity: 0.8 })`.
export const CONTACT_SHADOW = {
  opacity: 0.6, // oscuridad en el centro (0–1)
  softness: 0.55, // 0 borde duro, 1 muy difuso
  car: [2.7, 5.4], // ancho y largo en metros
  person: [1.15, 1.15],
  lift: 0.045, // m sobre el suelo, contra el parpadeo
};

const CAPACITY = 256,
  strength = uniform(CONTACT_SHADOW.opacity),
  softness = uniform(CONTACT_SHADOW.softness),
  targets = [],
  dummy = new THREE.Object3D();
let mesh = null;

export function setContactShadows(patch = {}) {
  Object.assign(CONTACT_SHADOW, patch);
  strength.value = CONTACT_SHADOW.opacity;
  softness.value = CONTACT_SHADOW.softness;
  gfx.needsRender = true;
}

function create() {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    // Distancia al centro (0 centro, 1 borde); la opacidad cae suavemente hasta el borde.
    radius = length(uv().sub(0.5)).mul(2),
    falloff = float(1).sub(smoothstep(mix(float(0.9), float(0), softness), 1, radius));
  material.colorNode = vec3(0.02, 0.02, 0.03);
  material.opacityNode = pow(falloff, 1.6).mul(strength);
  mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.name = 'contact-shadows';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.count = 0;
  gfx.scene.add(mesh);
}

// Registra un objeto (hijo directo de la escena) que proyecta la sombra: `kind` es 'car' o 'person'.
export function addContactShadow(object, kind) {
  if (!mesh) create();
  targets.push({ object, kind });
}

function shown(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

// Coloca las sombras bajo sus objetos. Se llama antes de dibujar cada fotograma.
export function updateContactShadows() {
  if (!mesh) return;
  let n = 0;
  for (const { object, kind } of targets) {
    if (n >= CAPACITY || !object.parent || !shown(object)) continue;
    const [w, l] = CONTACT_SHADOW[kind];
    dummy.position.set(
      object.position.x,
      object.position.y + CONTACT_SHADOW.lift,
      object.position.z,
    );
    dummy.rotation.set(0, object.rotation.y, 0);
    dummy.scale.set(w, 1, l);
    dummy.updateMatrix();
    mesh.setMatrixAt(n++, dummy.matrix);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
}
