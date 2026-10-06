import * as THREE from '../../vendor/three.module.min.js';
import {
  bevelGeometry,
  modelBox,
  modelCylinder,
  modelGeometry,
  modelMaterial,
  modelParts,
  sculptedBox,
} from '../engine/materials.js';
import { blocked } from '../world/spatial.js';
import { d } from '../core/math.js';
import { gfx, player, vehicles } from '../core/state.js';

function carCabin(material) {
  const p = [
      [-0.84, 0.86, -1.15],
      [0.84, 0.86, -1.15],
      [0.84, 0.86, 0.84],
      [-0.84, 0.86, 0.84],
      [-0.69, 1.36, -0.84],
      [0.69, 1.36, -0.84],
      [0.69, 1.36, 0.34],
      [-0.69, 1.36, 0.34],
    ],
    v = [];
  for (const f of [
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
    [4, 5, 6, 7],
  ])
    for (const i of [0, 1, 2, 0, 2, 3]) v.push(...p[f[i]]);
  let geo = modelGeometry('car-cabin', () => {
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  });
  return new THREE.Mesh(geo, material);
}

export function createCar(color = '#b9b8aa', cop = false) {
  let group = new THREE.Group(),
    paint = modelMaterial(color, { metalness: 0.55, roughness: 0.29 }),
    glass = modelMaterial('#345465', { metalness: 0.35, roughness: 0.2, side: THREE.DoubleSide }),
    black = modelMaterial('#182123'),
    chrome = modelMaterial('#a9b3b6', { metalness: 0.85, roughness: 0.23 }),
    parts = modelParts(),
    sideways = [0, 0, Math.PI / 2];
  // Body, lights and wheels never move relative to the car: one mesh per material.
  // Bevelled body panels never received shadows; skirt, mirrors and pillars did ('trim').
  parts.add('paint', paint, bevelGeometry(1.84, 0.48, 4.28, 0.1), 0, 0.58, 0);
  parts.box('trim', paint, 1.9, 0.13, 4.12, 0, 0.38, 0);
  parts.add('paint', paint, bevelGeometry(1.75, 0.19, 1.25, 0.06), 0, 0.89, 1.32);
  parts.add('paint', paint, bevelGeometry(1.79, 0.17, 0.85, 0.05), 0, 0.91, -1.55);
  parts.box('black', black, 1.74, 0.17, 0.13, 0, 0.48, 2.15);
  parts.box('black', black, 0.67, 0.2, 0.04, 0, 0.73, 2.17);
  parts.box('plate', modelMaterial('#edf0dd'), 0.46, 0.18, 0.03, 0, 0.54, -2.16);
  const head = modelMaterial('#fff3c5', { emissive: '#ffeeaa', emissiveIntensity: 0.5 }),
    tail = modelMaterial('#b52428', { emissive: '#a0141c', emissiveIntensity: 0.4 });
  for (const x of [-0.66, 0.66]) {
    parts.box('head', head, 0.46, 0.12, 0.05, x, 0.78, 2.13);
    parts.box('tail', tail, 0.46, 0.13, 0.05, x, 0.74, -2.16);
    parts.box('trim', paint, 0.22, 0.16, 0.31, x > 0 ? 0.99 : -0.99, 1.06, 0.54);
    parts.box('trim', paint, 0.05, 0.46, 0.09, x > 0 ? 0.86 : -0.86, 1.04, -0.38);
    parts.box('chrome', chrome, 0.09, 0.03, 0.19, x > 0 ? 0.927 : -0.927, 0.83, -0.2);
  }
  for (let x of [-0.91, 0.91])
    for (let z of [-1.34, 1.35]) {
      parts.add('black', black, modelCylinder(0.34, 0.34, 0.23, 24), x, 0.34, z, sideways);
      parts.add('chrome', chrome, modelCylinder(0.22, 0.22, 0.245, 20), x, 0.34, z, sideways);
      parts.add('black', black, modelCylinder(0.09, 0.09, 0.255, 12), x, 0.34, z, sideways);
    }
  if (cop) parts.box('livery', modelMaterial('#e9efed'), 1.86, 0.32, 1.6, 0, 0.63, -0.1);
  parts.attach(group, cop ? 'cop' : 'car', [
    'trim',
    'black',
    'chrome',
    'plate',
    'head',
    'tail',
    'livery',
  ]);
  // Cabin and roof stay separate: first-person view hides them.
  const cabin = carCabin(glass),
    roof = sculptedBox(1.43, 0.11, 1.24, paint, 0, 1.39, -0.25, 0.04);
  group.add(cabin);
  group.add(roof);
  let siren = null;
  if (cop) {
    siren = new THREE.Group();
    siren.position.y = 1.46;
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
  return {
    mesh: group,
    firstPersonOccluders: [cabin, roof],
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
    if (di < md && Math.abs(c.speed) < 3) {
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
    blocked(x, z, 0.55) ||
    blocked(x + Math.sin(c.a) * f, z + Math.cos(c.a) * f, 0.45) ||
    blocked(x - Math.sin(c.a) * f, z - Math.cos(c.a) * f, 0.45) ||
    blocked(x + Math.cos(c.a) * r, z - Math.sin(c.a) * r, 0.2) ||
    blocked(x - Math.cos(c.a) * r, z + Math.sin(c.a) * r, 0.2)
  );
}
