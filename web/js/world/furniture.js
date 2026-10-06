import * as THREE from '../../vendor/three.module.min.js';
import { gfx, segments, streetEnvironment, waterAreas, world } from '../core/state.js';
import { inBuilding } from './spatial.js';
import { lerp, pInside } from '../core/math.js';
import { mat } from '../engine/materials.js';

export function buildUrbanFurniture() {
  const unitBox = new THREE.BoxGeometry(1, 1, 1),
    staging = new THREE.Group(),
    materials = new Map();
  function ma(col) {
    if (!materials.has(col)) materials.set(col, mat(col));
    return materials.get(col);
  }
  function cube(g, x, y, z, w, h, d, c) {
    let m = new THREE.Mesh(unitBox, ma(c));
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    g.add(m);
    return m;
  }
  function cyl(g, x, y, z, rt, rb, h, c) {
    let m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 7), ma(c));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }
  const protectedPoints = [
    [186, -156],
    [-279, -95],
    [133, -229],
    [188, 185],
    [207, 141],
    [-95, -12],
    [-35, -174],
    [-99, -15],
    [-215, -145],
  ];
  function clear(x, z, r = 0.35) {
    return (
      Math.abs(x) < world.worldW / 2 - 3 &&
      Math.abs(z) < world.worldH / 2 - 3 &&
      !inBuilding(x, z, r) &&
      !waterAreas.some((p) => pInside(x, z, p.p)) &&
      !protectedPoints.some((p) => Math.hypot(x - p[0], z - p[1]) < 5) &&
      !streetEnvironment.colliders.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + r + 0.35)
    );
  }
  function group(x, z, a = 0) {
    let g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = a;
    staging.add(g);
    return g;
  }
  function collider(x, z, r) {
    streetEnvironment.colliders.push({ x, z, r });
  }
  function lamp(x, z, modern = false) {
    if (!clear(x, z, 0.32)) return;
    let g = group(x, z),
      col = modern ? '#ad6450' : '#424b47',
      h = modern ? 5.1 : 4.1;
    cyl(g, 0, 0.16, 0, 0.17, 0.23, 0.32, col);
    cyl(g, 0, h / 2, 0, 0.055, 0.085, h, col);
    if (modern) {
      cyl(g, 0, h, 0, 0.43, 0.43, 0.09, col);
      cyl(g, 0, h - 0.08, 0, 0.28, 0.28, 0.07, '#e8dabb');
    } else {
      cube(g, 0, h - 0.2, 0, 0.38, 0.5, 0.38, col);
      for (let x of [-0.2, 0.2]) cube(g, x, h - 0.2, 0, 0.025, 0.36, 0.28, '#d5cba8');
      for (let z of [-0.2, 0.2]) cube(g, 0, h - 0.2, z, 0.28, 0.36, 0.025, '#d5cba8');
      cyl(g, 0, h + 0.16, 0, 0.02, 0.36, 0.23, col);
    }
    collider(x, z, 0.18);
    streetEnvironment.lamps++;
  }
  function bench(x, z, a = 0) {
    if (!clear(x, z, 1.12)) return;
    let g = group(x, z, a);
    for (let xx of [-0.7, 0.7]) {
      cube(g, xx, 0.26, 0, 0.1, 0.5, 0.55, '#47534c');
      cube(g, xx, 0.64, -0.23, 0.07, 0.8, 0.07, '#47534c');
      cube(g, xx, 0.71, 0.0, 0.065, 0.065, 0.52, '#47534c');
    }
    for (let j = 0; j < 4; j++) cube(g, 0, 0.5, -0.23 + j * 0.14, 1.9, 0.085, 0.11, '#a0865f');
    for (let j = 0; j < 3; j++) cube(g, 0, 0.74 + j * 0.15, -0.29, 1.9, 0.115, 0.05, '#a0865f');
    collider(x, z, 1.05);
    streetEnvironment.benches++;
  }
  function bin(x, z) {
    if (!clear(x, z, 0.5)) return;
    let g = group(x, z);
    cyl(g, 0, 0.52, 0, 0.28, 0.25, 0.85, '#495e53');
    cyl(g, 0, 0.97, 0, 0.32, 0.32, 0.06, '#7a8375');
    cyl(g, 0, 0.95, 0, 0.23, 0.23, 0.03, '#283c35');
    collider(x, z, 0.34);
    streetEnvironment.bins++;
  }
  function bollard(x, z) {
    if (!clear(x, z, 0.22)) return;
    let g = group(x, z);
    cyl(g, 0, 0.38, 0, 0.065, 0.095, 0.76, '#575d55');
    cyl(g, 0, 0.66, 0, 0.072, 0.072, 0.05, '#d4d1b9');
    collider(x, z, 0.14);
    streetEnvironment.bollards++;
  }
  const lampPoints = [];
  for (const s of segments) {
    if (!world.cityDesign.frontages.originalStreets.includes(s.name) || s.length < 10) continue;
    for (let at = 7; at < s.length; at += 22) {
      let u = at / s.length,
        x = lerp(s.a[0], s.b[0], u),
        z = lerp(s.a[1], s.b[1], u);
      if (x < -355 || x > 90 || z < -230 || z > 100) continue;
      let nx = -(s.b[1] - s.a[1]) / s.length,
        nz = (s.b[0] - s.a[0]) / s.length;
      for (let side of [1, -1]) {
        let xx = x + nx * (s.width / 2 + 0.48) * side,
          zz = z + nz * (s.width / 2 + 0.48) * side;
        if (lampPoints.some((p) => Math.hypot(xx - p[0], zz - p[1]) < 14)) continue;
        if (clear(xx, zz, 0.35)) {
          lamp(xx, zz);
          lampPoints.push([xx, zz]);
          break;
        }
      }
    }
  }
  // Plaza de las Bodegas: slender red lamps echo the photographic market reference.
  for (let i = 0; i < 5; i++) {
    let x = lerp(-258, -192, i / 4) + 7,
      z = lerp(-167, -93, i / 4) - 6;
    lamp(x, z, true);
    if (i % 2 === 0) {
      bench(x + 2.5, z - 2, -0.7);
      bin(x + 4.4, z - 1.2);
    }
  }
  for (const [x, z, a] of [
    [-107, -33, 1.4],
    [-105, 20, 1.4],
    [-118, 45, 1.4],
    [-48, -45, -0.7],
    [-173, -87, -0.7],
    [-299, -120, -0.6],
  ]) {
    bench(x, z, a);
    bin(x + 2.3, z);
  }
  // Bollards protect pedestrian edges; keep the centreline and mission access clear.
  for (const s of segments) {
    if (!['Calle Constitución', 'Calle de la Plaza'].includes(s.name) || s.length < 12) continue;
    for (let at = 3; at < s.length - 3; at += 9) {
      let u = at / s.length,
        x = lerp(s.a[0], s.b[0], u),
        z = lerp(s.a[1], s.b[1], u),
        nx = -(s.b[1] - s.a[1]) / s.length,
        nz = (s.b[0] - s.a[0]) / s.length;
      for (let side of [-1, 1])
        bollard(x + nx * (s.width / 2 + 0.2) * side, z + nz * (s.width / 2 + 0.2) * side);
    }
  }
  for (const p of world.mappedStreetObjects) {
    if (p.tags.highway === 'street_lamp') lamp(p.x, p.z);
    if (p.tags.amenity === 'bench') bench(p.x, p.z);
  }
  // Static batching keeps all furniture to one draw call per material.
  staging.updateMatrixWorld(true);
  let batches = new Map();
  staging.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.toNonIndexed();
    geo.applyMatrix4(o.matrixWorld);
    let key = o.material.color.getHexString();
    if (!batches.has(key)) batches.set(key, { p: [], n: [], mat: o.material });
    let b = batches.get(key);
    b.p.push(...geo.getAttribute('position').array);
    b.n.push(...geo.getAttribute('normal').array);
    geo.dispose();
  });
  let root = new THREE.Group();
  root.name = 'urban-furniture';
  for (let b of batches.values()) {
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    g.computeBoundingSphere();
    let m = new THREE.Mesh(g, b.mat);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
  gfx.scene.add(root);
}
