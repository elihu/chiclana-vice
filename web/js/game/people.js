import * as THREE from '../../vendor/three.module.min.js';
import { gfx } from '../core/state.js';
import { modelCylinder, modelGeometry, modelMaterial, modelParts } from '../engine/materials.js';

export function createPerson(color = '#78805a') {
  const g = new THREE.Group(),
    skin = modelMaterial('#c99a78'),
    shirt = modelMaterial(color),
    pants = modelMaterial('#334550'),
    shoes = modelMaterial('#252b2d'),
    hair = modelMaterial('#3b302a'),
    sphere = modelGeometry('person-sphere', () => new THREE.SphereGeometry(1, 12, 8));
  // Torso/head and each leg/arm are merged per material; legs and arms remain animated groups.
  const oval = (parts, slot, m, x, y, z, sx, sy, sz) =>
    parts.add(slot, m, sphere, x, y, z, [0, 0, 0], [sx, sy, sz]);
  const limb = (parts, slot, m, top, bottom, length, y) =>
    parts.add(slot, m, modelCylinder(top, bottom, length, 10), 0, y);
  let body = modelParts();
  oval(body, 'shirt', shirt, 0, 1.14, 0, 0.215, 0.285, 0.135);
  oval(body, 'pants', pants, 0, 0.91, 0, 0.185, 0.15, 0.13);
  limb(body, 'skin', skin, 0.055, 0.06, 0.12, 1.44);
  oval(body, 'skin', skin, 0, 1.585, 0, 0.115, 0.145, 0.117);
  oval(body, 'hair', hair, 0, 1.665, -0.024, 0.118, 0.079, 0.108);
  oval(body, 'skin', skin, 0, 1.57, 0.114, 0.033, 0.035, 0.03);
  for (const x of [-0.116, 0.116]) oval(body, 'skin', skin, x, 1.59, 0, 0.023, 0.04, 0.027);
  body.attach(g, 'person-body');
  const limbs = [];
  for (const x of [-0.105, 0.105]) {
    const leg = new THREE.Group(),
      parts = modelParts();
    leg.position.set(x, 0.9, 0);
    limb(parts, 'pants', pants, 0.083, 0.065, 0.39, -0.19);
    oval(parts, 'pants', pants, 0, -0.39, 0, 0.065, 0.073, 0.067);
    limb(parts, 'pants', pants, 0.062, 0.048, 0.36, -0.58);
    oval(parts, 'shoes', shoes, 0, -0.815, 0.055, 0.069, 0.075, 0.145);
    parts.attach(leg, 'person-leg');
    g.add(leg);
    limbs.push(leg);
  }
  for (const x of [-0.237, 0.237]) {
    const arm = new THREE.Group(),
      parts = modelParts();
    arm.position.set(x, 1.34, 0);
    oval(parts, 'shirt', shirt, 0, -0.065, 0, 0.073, 0.1, 0.073);
    limb(parts, 'shirt', shirt, 0.068, 0.052, 0.22, -0.13);
    limb(parts, 'skin', skin, 0.048, 0.034, 0.24, -0.35);
    oval(parts, 'skin', skin, 0, -0.49, 0, 0.042, 0.068, 0.044);
    parts.attach(arm, 'person-arm');
    g.add(arm);
    limbs.push(arm);
  }
  g.userData.heightMeters = 1.744;
  gfx.scene.add(g);
  return { mesh: g, limbs };
}
