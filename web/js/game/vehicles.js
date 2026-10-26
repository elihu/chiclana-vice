import * as THREE from '../../vendor/three.webgpu.min.js';
import { modelBox, modelMaterial, modelParts } from '../engine/materials.js';
import { addContactShadow } from '../engine/contact-shadows.js';
import { carModel } from './car-model.js';
import { blocked } from '../world/spatial.js';
import { d } from '../core/math.js';
import { gfx, player, vehicles } from '../core/state.js';

// Carrocería, cristales y techo por secciones (car-model.js). Las piezas fijas se agrupan por
// material en una malla cada una (los neumáticos van con las piezas negras); cristal y techo
// van aparte porque la primera persona los oculta.
export function createCar(color = '#b9b8aa', cop = false) {
  const { slots, roofY } = carModel('sedan'),
    group = new THREE.Group(),
    paint = modelMaterial(color, { metalness: 0.35, roughness: 0.32 }),
    materials = {
      paint,
      frame: paint,
      glass: modelMaterial('#2b4250', { metalness: 0.4, roughness: 0.12, side: THREE.DoubleSide }),
      alloy: modelMaterial('#a9b3b6', { metalness: 0.85, roughness: 0.28 }),
      trim: modelMaterial('#182123', { roughness: 0.8 }),
      head: modelMaterial('#fff3c5', { emissive: '#ffeeaa', emissiveIntensity: 0.5 }),
      tail: modelMaterial('#b52428', { emissive: '#a0141c', emissiveIntensity: 0.4 }),
      plate: modelMaterial('#edf0dd'),
      plateBand: modelMaterial('#1f4fa0'),
      livery: modelMaterial('#e9efed'),
    },
    key = cop ? 'cop' : 'car',
    outside = modelParts(),
    inside = modelParts(),
    cabin = new THREE.Group();
  for (const [name, geometries] of Object.entries(slots)) {
    if (name === 'livery' && !cop) continue;
    const slot = name === 'tyre' ? 'trim' : name;
    for (const geometry of geometries)
      (slot === 'glass' || slot === 'frame' ? inside : outside).add(
        slot,
        materials[slot],
        geometry,
      );
  }
  group.name = 'vehicle';
  outside.attach(group, key, ['trim', 'alloy', 'plate', 'plateBand', 'head', 'tail', 'livery']);
  inside.attach(cabin, key + '-cabin', ['frame']);
  const occluders = [...cabin.children];
  group.add(...occluders);
  let siren = null;
  if (cop) {
    siren = new THREE.Group();
    siren.position.y = roofY + 0.085;
    siren.add(
      modelBox(
        0.45,
        0.15,
        0.26,
        modelMaterial('#427ce9', { emissive: '#286eee', emissiveIntensity: 2 }),
        -0.36,
        0,
        -0.15,
      ),
    );
    siren.add(
      modelBox(
        0.45,
        0.15,
        0.26,
        modelMaterial('#e85d5d', { emissive: '#dc2424', emissiveIntensity: 2 }),
        0.36,
        0,
        -0.15,
      ),
    );
    group.add(siren);
  }
  gfx.scene.add(group);
  addContactShadow(group, 'car');
  return {
    mesh: group,
    firstPersonOccluders: occluders,
    x: 0,
    z: 0,
    a: 0,
    speed: 0,
    health: 100,
    cop,
    siren,
    name: cop ? 'PATRULLA' : 'COSTA GT',
    radius: 1.12,
  };
}

export function nearestCar() {
  let best = null,
    md = 5.5;
  for (const c of vehicles) {
    let di = d(c, player);
    if (
      di < md &&
      Math.abs(c.speed) < 3 &&
      Math.abs((c.surfaceY ?? 0) - (player.surfaceY ?? 0)) < 2
    ) {
      md = di;
      best = c;
    }
  }
  return best;
}

export function carCollision(c, x, z) {
  let f = 1.4,
    r = 0.7;
  return (
    blocked(x, z, 0.55, c.surfaceY ?? null) ||
    blocked(x + Math.sin(c.a) * f, z + Math.cos(c.a) * f, 0.45, c.surfaceY ?? null) ||
    blocked(x - Math.sin(c.a) * f, z - Math.cos(c.a) * f, 0.45, c.surfaceY ?? null) ||
    blocked(x + Math.cos(c.a) * r, z - Math.sin(c.a) * r, 0.2, c.surfaceY ?? null) ||
    blocked(x - Math.cos(c.a) * r, z + Math.sin(c.a) * r, 0.2, c.surfaceY ?? null)
  );
}
