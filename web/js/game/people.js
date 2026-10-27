import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';
import { addContactShadow } from '../engine/contact-shadows.js';
import { LoftGeometry } from './car-model.js';

// Personas: un solo cuerpo continuo con esqueleto (SkinnedMesh) y colores por vértice, una
// llamada de dibujo por persona en lugar de una por pieza y material. Idea tomada de los
// peatones de slop-newyork (cuerpo por secciones sobre un esqueleto), simplificada: piezas
// rígidas por hueso y mezcla de pesos solo en rodillas y codos.
//
// Ejes: +z al frente, +x a la izquierda de la persona; origen en el suelo entre los pies.

// Variantes de complexión, pelo y tono. `height` escala a la persona (≤ 1,744 m).
const VARIANTS = [
  { shoulders: 1, hips: 1, hair: 'short', skin: '#c99a78', hairColor: '#3b302a', height: 1 },
  { shoulders: 0.9, hips: 1.07, hair: 'long', skin: '#e3bc9a', hairColor: '#5a3d26', height: 0.95 },
  { shoulders: 1.02, hips: 1, hair: 'short', skin: '#e0b48f', hairColor: '#9a938b', height: 0.98 },
  { shoulders: 0.9, hips: 1.05, hair: 'bun', skin: '#8d5f3e', hairColor: '#1f1a17', height: 0.94 },
  { shoulders: 1.04, hips: 1, hair: 'short', skin: '#6f4a31', hairColor: '#151312', height: 1 },
  {
    shoulders: 0.91,
    hips: 1.06,
    hair: 'long',
    skin: '#c99a78',
    hairColor: '#2b2420',
    height: 0.96,
  },
];
const PANTS = ['#334550', '#2d2f33', '#5b5246', '#47546a', '#b9ab8f', '#3d3a4a'];
const SHOES = ['#252b2d', '#ece9e1', '#5a3b26', '#2a2523'];

// Huesos: índice en el esqueleto.
const B = {
  ROOT: 0,
  PELVIS: 1,
  CHEST: 2,
  HIP_L: 3,
  KNEE_L: 4,
  HIP_R: 5,
  KNEE_R: 6,
  SHOULDER_L: 7,
  ELBOW_L: 8,
  SHOULDER_R: 9,
  ELBOW_R: 10,
};
const HIP_Y = 0.92,
  THIGH = 0.42,
  SHIN = 0.4,
  SHOULDER_Y = 1.4,
  UPPER_ARM = 0.29,
  FOREARM = 0.25;

const material = () =>
  (gfx.personMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));

// Anillo elíptico en altura y (rx de lado, rz de frente/espalda).
function ring(y, rx, rz, cz = 0, n = 16) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (-i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * rx, y, cz + Math.sin(a) * rz));
  }
  return pts;
}
// Superficie de revolución alrededor de un eje vertical que pasa por (x, z); `profile` es
// [[radio, y]...] de arriba abajo.
function lathe(profile, x, z, segments = 10) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)).reverse(),
    segments,
  ).translate(x, 0, z);
}
const blob = (sx, sy, sz, x, y, z, w = 10, h = 8) =>
  new THREE.SphereGeometry(1, w, h).scale(sx, sy, sz).translate(x, y, z);
function smooth(t) {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

/**
 * Geometría de una persona: piezas con color y hueso, unidas en un BufferGeometry con
 * skinIndex/skinWeight. `weight(p)` devuelve [huesoA, huesoB, pesoB] para mezclar en rodillas
 * y codos.
 */
function buildBody(v, colors) {
  const parts = [],
    add = (geometry, color, bone, weight = null) =>
      parts.push({ geometry, color: new THREE.Color(color), bone, weight }),
    sh = v.shoulders,
    hp = v.hips;

  // Cadera y torso por secciones: pantalón hasta la cintura y camisa encima, solapados.
  add(
    new LoftGeometry(
      [
        ring(0.82, 0.12 * hp, 0.09),
        ring(0.88, 0.165 * hp, 0.105),
        ring(0.95, 0.164 * hp, 0.104),
        ring(0.99, 0.15 * hp, 0.094),
      ],
      { capStart: true, capEnd: true },
    ),
    colors.pants,
    B.PELVIS,
  );
  add(
    new LoftGeometry(
      [
        ring(0.97, 0.168 * hp, 0.11),
        ring(1.06, 0.152 * (hp + sh) * 0.5, 0.1),
        ring(1.17, 0.162 * sh, 0.108, 0.005),
        ring(1.27, 0.176 * sh, 0.117, 0.01),
        ring(1.36, 0.178 * sh, 0.106, 0),
        ring(1.42, 0.16 * sh, 0.085, -0.005),
        ring(1.455, 0.09, 0.06, -0.005),
      ],
      { capStart: true, capEnd: true },
    ),
    colors.shirt,
    B.CHEST,
  );
  // Cuello, cabeza, mandíbula, nariz y orejas
  add(
    lathe(
      [
        [0.05, 1.54],
        [0.053, 1.47],
        [0.058, 1.43],
      ],
      0,
      -0.005,
    ),
    colors.skin,
    B.CHEST,
  );
  add(blob(0.093, 0.115, 0.104, 0, 1.615, 0.005, 14, 10), colors.skin, B.CHEST);
  add(blob(0.072, 0.055, 0.078, 0, 1.555, 0.02), colors.skin, B.CHEST);
  add(blob(0.016, 0.026, 0.022, 0, 1.6, 0.104, 6, 5), colors.skin, B.CHEST);
  for (const x of [-0.095, 0.095])
    add(blob(0.018, 0.032, 0.022, x, 1.605, 0, 6, 5), colors.skin, B.CHEST);
  // Ojos y cejas
  for (const x of [-0.034, 0.034]) {
    add(blob(0.012, 0.009, 0.006, x, 1.627, 0.098, 6, 4), colors.eyes, B.CHEST);
    add(blob(0.022, 0.006, 0.008, x, 1.652, 0.096, 6, 4), colors.hair, B.CHEST);
  }
  // Pelo
  add(blob(0.1, 0.07, 0.108, 0, 1.672, -0.008, 14, 8), colors.hair, B.CHEST);
  if (v.hair !== 'long') add(blob(0.097, 0.075, 0.07, 0, 1.63, -0.045), colors.hair, B.CHEST);
  if (v.hair === 'long') add(blob(0.102, 0.15, 0.075, 0, 1.56, -0.055), colors.hair, B.CHEST);
  if (v.hair === 'bun') add(blob(0.05, 0.05, 0.05, 0, 1.68, -0.11, 8, 6), colors.hair, B.CHEST);

  // Piernas: una pieza continua de cadera a tobillo con la rodilla mezclada, y zapato.
  for (const [side, hip, knee] of [
    [1, B.HIP_L, B.KNEE_L],
    [-1, B.HIP_R, B.KNEE_R],
  ]) {
    const x = side * 0.092 * hp,
      kneeY = HIP_Y - THIGH;
    add(
      lathe(
        [
          [0.088 * hp, HIP_Y + 0.02],
          [0.082 * hp, HIP_Y - 0.12],
          [0.066, kneeY + 0.04],
          [0.06, kneeY],
          [0.058, kneeY - 0.1],
          [0.046, kneeY - SHIN + 0.04],
          [0.04, kneeY - SHIN],
        ],
        x,
        0,
      ),
      colors.pants,
      hip,
      (p) => [hip, knee, smooth((kneeY + 0.05 - p.y) / 0.1)],
    );
    add(blob(0.052, 0.045, 0.125, x, 0.045, 0.04, 10, 6), colors.shoes, knee);
  }

  // Brazos: manga corta rígida al hombro, brazo de piel de hombro a muñeca con el codo
  // mezclado, y mano.
  for (const [side, shoulder, elbow] of [
    [1, B.SHOULDER_L, B.ELBOW_L],
    [-1, B.SHOULDER_R, B.ELBOW_R],
  ]) {
    const x = side * 0.205 * sh,
      elbowY = SHOULDER_Y - UPPER_ARM;
    add(blob(0.062, 0.058, 0.066, x, SHOULDER_Y - 0.015, 0, 14, 10), colors.shirt, shoulder);
    add(
      lathe(
        [
          [0.068, SHOULDER_Y - 0.02],
          [0.06, SHOULDER_Y - 0.17],
        ],
        x,
        0,
      ),
      colors.shirt,
      shoulder,
    );
    add(
      lathe(
        [
          [0.05, SHOULDER_Y - 0.03],
          [0.046, elbowY + 0.03],
          [0.042, elbowY],
          [0.04, elbowY - 0.06],
          [0.032, elbowY - FOREARM],
        ],
        x,
        0,
        8,
      ),
      colors.skin,
      shoulder,
      (p) => [shoulder, elbow, smooth((elbowY + 0.04 - p.y) / 0.08)],
    );
    add(blob(0.028, 0.07, 0.042, x, elbowY - FOREARM - 0.055, 0.005, 8, 6), colors.skin, elbow);
  }

  // Unión con color y pesos
  let vertices = 0,
    indices = 0;
  for (const { geometry } of parts) {
    vertices += geometry.attributes.position.count;
    indices += geometry.index ? geometry.index.count : geometry.attributes.position.count;
  }
  const position = new Float32Array(vertices * 3),
    normal = new Float32Array(vertices * 3),
    color = new Float32Array(vertices * 3),
    skinIndex = new Uint16Array(vertices * 4),
    skinWeight = new Float32Array(vertices * 4),
    index = new Uint32Array(indices),
    p = new THREE.Vector3();
  let base = 0,
    at = 0;
  for (const { geometry, color: c, bone, weight } of parts) {
    const pos = geometry.attributes.position,
      nor = geometry.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).toArray(position, (base + i) * 3);
      normal.set([nor.getX(i), nor.getY(i), nor.getZ(i)], (base + i) * 3);
      c.toArray(color, (base + i) * 3);
      const [a, b, w] = weight ? weight(p) : [bone, bone, 0];
      skinIndex.set([a, b, 0, 0], (base + i) * 4);
      skinWeight.set([1 - w, w, 0, 0], (base + i) * 4);
    }
    const src = geometry.index,
      count = src ? src.count : pos.count;
    for (let i = 0; i < count; i++) index[at + i] = base + (src ? src.getX(i) : i);
    base += pos.count;
    at += count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  // Brazos y piernas salen de la caja de reposo al andar: esfera de recorte holgada.
  g.boundingSphere.radius = Math.max(g.boundingSphere.radius, 1.1);
  return g;
}

// Esqueleto en postura de reposo, con los huesos en las articulaciones.
function buildSkeleton(v) {
  const bones = Array.from({ length: 11 }, () => new THREE.Bone()),
    at = (b, parent, x, y, z) => {
      bones[parent]?.add(bones[b]);
      bones[b].position.set(x, y, z);
    };
  at(B.ROOT, -1, 0, 0, 0);
  at(B.PELVIS, B.ROOT, 0, HIP_Y, 0);
  at(B.CHEST, B.PELVIS, 0, SHOULDER_Y - HIP_Y, 0);
  for (const [side, hip, knee] of [
    [1, B.HIP_L, B.KNEE_L],
    [-1, B.HIP_R, B.KNEE_R],
  ]) {
    at(hip, B.PELVIS, side * 0.092 * v.hips, 0, 0);
    at(knee, hip, 0, -THIGH, 0);
  }
  for (const [side, shoulder, elbow] of [
    [1, B.SHOULDER_L, B.ELBOW_L],
    [-1, B.SHOULDER_R, B.ELBOW_R],
  ]) {
    at(shoulder, B.CHEST, side * 0.205 * v.shoulders, 0, 0);
    at(elbow, shoulder, 0, -UPPER_ARM, 0);
  }
  return bones;
}

let created = 0;
const geometries = new Map();

/**
 * Persona con esqueleto. `limbs` son los huesos de caderas y hombros (como antes, se animan con
 * `rotation.x`); `joints` son rodillas y codos (`animateWalk`). `variant` fija complexión, piel
 * y pelo; sin ella se reparten en orden para que el centro tenga gente variada.
 */
export function createPerson(color = '#78805a', { variant } = {}) {
  const index = variant ?? created++,
    v = VARIANTS[index % VARIANTS.length],
    colors = {
      shirt: color,
      pants: PANTS[(index * 5 + 1) % PANTS.length],
      shoes: SHOES[(index * 3) % SHOES.length],
      skin: v.skin,
      hair: v.hairColor,
      eyes: '#231c18',
    },
    key = [index % VARIANTS.length, colors.shirt, colors.pants, colors.shoes].join('|');
  if (!geometries.has(key)) geometries.set(key, buildBody(v, colors));
  const bones = buildSkeleton(v),
    mesh = new THREE.SkinnedMesh(geometries.get(key), material());
  mesh.add(bones[B.ROOT]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.scale.setScalar(v.height);
  g.userData.heightMeters = 1.744 * v.height;
  gfx.scene.add(g);
  addContactShadow(g, 'person');
  const person = {
    mesh: g,
    limbs: [bones[B.HIP_L], bones[B.HIP_R], bones[B.SHOULDER_L], bones[B.SHOULDER_R]],
    joints: [bones[B.KNEE_L], bones[B.KNEE_R], bones[B.ELBOW_L], bones[B.ELBOW_R]],
  };
  animateWalk(person, 0, 0);
  return person;
}

/**
 * Paso al andar. Cada brazo va en oposición a la pierna de su lado; la rodilla se dobla
 * mientras la pierna avanza y el codo cuando el brazo va por delante. `amount` es la amplitud
 * del giro de cadera en radianes (0 = de pie, con los codos apenas doblados). Ángulo positivo
 * en `rotation.x` = hacia atrás.
 */
export function animateWalk(person, phase, amount) {
  const [hipL, hipR, shoulderL, shoulderR] = person.limbs,
    left = phase,
    right = phase + Math.PI;
  hipL.rotation.x = Math.sin(left) * amount;
  hipR.rotation.x = Math.sin(right) * amount;
  shoulderL.rotation.x = Math.sin(right) * amount * 0.8;
  shoulderR.rotation.x = Math.sin(left) * amount * 0.8;
  if (!person.joints) return;
  const [kneeL, kneeR, elbowL, elbowR] = person.joints;
  // La pierna avanza cuando su ángulo disminuye (derivada cos < 0).
  kneeL.rotation.x = Math.max(0, -Math.cos(left)) * amount * 1.7;
  kneeR.rotation.x = Math.max(0, -Math.cos(right)) * amount * 1.7;
  elbowL.rotation.x = -(0.15 + Math.max(0, -Math.sin(right)) * amount * 0.9);
  elbowR.rotation.x = -(0.15 + Math.max(0, -Math.sin(left)) * amount * 0.9);
}
