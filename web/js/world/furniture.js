import { insideBounds } from './bounds.js';
import { surfaceHeightAt } from '../engine/terrain-sampling.js';
import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx, segments, streetEnvironment, waterAreas, world } from '../core/state.js';
import { someCollider, inBuilding } from './spatial.js';
import { lerp, pInside } from '../core/math.js';
import { mat } from '../engine/materials.js';
import { addLampGlow } from '../engine/night-glow.js';
import { skyUniforms } from '../engine/sky.js';

const { attribute, vec3 } = THREE.TSL;
// Cristales de las farolas al anochecer: color e intensidad del emisivo.
const LAMP_GLASS = { color: new THREE.Color('#ffb860'), intensity: 2.6 };

export function buildUrbanFurniture() {
  const unitBox = new THREE.BoxGeometry(1, 1, 1),
    staging = new THREE.Group(),
    materials = new Map();
  function ma(col) {
    if (!materials.has(col)) materials.set(col, mat(col));
    return materials.get(col);
  }
  // Los cristales de las farolas se marcan (`userData.glass`) para encenderlos de noche en la
  // malla fusionada (atributo `glow`).
  function cube(g, x, y, z, w, h, d, c, glass = false) {
    let m = new THREE.Mesh(unitBox, ma(c));
    m.userData.glass = glass;
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    g.add(m);
    return m;
  }
  function cyl(g, x, y, z, rt, rb, h, c, glass = false) {
    let m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 7), ma(c));
    m.userData.glass = glass;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }
  // Reglas y posiciones en web/city-design.json (sección `furniture`).
  const rules = world.cityDesign.furniture,
    [lampMinX, lampMaxX, lampMinZ, lampMaxZ] = world.cityDesign.zones.streetLamps;
  function clear(x, z, r = 0.35) {
    return (
      insideBounds(x, z, 3, world.city.bounds, false) &&
      !inBuilding(x, z, r) &&
      !waterAreas.some((p) => pInside(x, z, p.p)) &&
      !rules.protectedPoints.some((p) => Math.hypot(x - p[0], z - p[1]) < rules.protectedRadius) &&
      !someCollider(x, z, r + 0.35, (p) => Math.hypot(x - p.x, z - p.z) < p.r + r + 0.35)
    );
  }
  function group(x, z, a = 0) {
    let g = new THREE.Group();
    g.position.set(x, surfaceHeightAt(x, z), z);
    g.rotation.y = a;
    staging.add(g);
    return g;
  }
  function collider(x, z, r) {
    streetEnvironment.colliders.push({ x, z, r, y: surfaceHeightAt(x, z) });
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
      cyl(g, 0, h - 0.08, 0, 0.28, 0.28, 0.07, '#e8dabb', true);
    } else {
      cube(g, 0, h - 0.2, 0, 0.38, 0.5, 0.38, col);
      for (let x of [-0.2, 0.2]) cube(g, x, h - 0.2, 0, 0.025, 0.36, 0.28, '#d5cba8', true);
      for (let z of [-0.2, 0.2]) cube(g, 0, h - 0.2, z, 0.28, 0.36, 0.025, '#d5cba8', true);
      cyl(g, 0, h + 0.16, 0, 0.02, 0.36, 0.23, col);
    }
    collider(x, z, 0.18);
    addLampGlow(x, g.position.y, z);
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
  const lampPoints = [],
    lamps = rules.streetLamps;
  for (const s of segments) {
    if (
      !world.cityDesign.frontages.originalStreets.includes(s.name) ||
      s.length < lamps.minimumSegment
    )
      continue;
    for (let at = lamps.start; at < s.length; at += lamps.spacing) {
      let u = at / s.length,
        x = lerp(s.a[0], s.b[0], u),
        z = lerp(s.a[1], s.b[1], u);
      if (x < lampMinX || x > lampMaxX || z < lampMinZ || z > lampMaxZ) continue;
      let nx = -(s.b[1] - s.a[1]) / s.length,
        nz = (s.b[0] - s.a[0]) / s.length;
      for (let side of [1, -1]) {
        let xx = x + nx * (s.width / 2 + lamps.offset) * side,
          zz = z + nz * (s.width / 2 + lamps.offset) * side;
        if (lampPoints.some((p) => Math.hypot(xx - p[0], zz - p[1]) < lamps.minimumSeparation))
          continue;
        if (clear(xx, zz, 0.35)) {
          lamp(xx, zz);
          lampPoints.push([xx, zz]);
          break;
        }
      }
    }
  }
  // Plaza de las Bodegas: slender red lamps echo the photographic market reference.
  const plaza = rules.plazaLamps;
  for (let i = 0; i < plaza.count; i++) {
    let x = lerp(plaza.from[0], plaza.to[0], i / (plaza.count - 1)) + plaza.shift[0],
      z = lerp(plaza.from[1], plaza.to[1], i / (plaza.count - 1)) + plaza.shift[1];
    lamp(x, z, true);
    if (i % plaza.benchEvery === 0) {
      bench(x + plaza.bench[0], z + plaza.bench[1], plaza.bench[2]);
      bin(x + plaza.bin[0], z + plaza.bin[1]);
    }
  }
  for (const [x, z, a] of rules.benches) {
    bench(x, z, a);
    bin(x + rules.binOffset, z);
  }
  // Bollards protect pedestrian edges; keep the centreline and mission access clear.
  const bollards = rules.bollards;
  for (const s of segments) {
    if (!bollards.streets.includes(s.name) || s.length < bollards.minimumSegment) continue;
    for (let at = bollards.start; at < s.length - bollards.endMargin; at += bollards.spacing) {
      let u = at / s.length,
        x = lerp(s.a[0], s.b[0], u),
        z = lerp(s.a[1], s.b[1], u),
        nx = -(s.b[1] - s.a[1]) / s.length,
        nz = (s.b[0] - s.a[0]) / s.length;
      for (let side of [-1, 1])
        bollard(
          x + nx * (s.width / 2 + bollards.offset) * side,
          z + nz * (s.width / 2 + bollards.offset) * side,
        );
    }
  }
  const builders = { lamp: (p) => lamp(p.x, p.z), bench: (p) => bench(p.x, p.z) };
  for (const p of world.mappedStreetObjects)
    for (const [tag, kind] of Object.entries(rules.fromOsm)) {
      const [key, value] = tag.split('=');
      if (p.tags[key] === value) builders[kind](p);
    }
  // Una sola malla con el color de cada pieza en un atributo de vértice: una llamada de dibujo
  // para todo el mobiliario, con los mismos colores (y la misma rugosidad) que los materiales.
  staging.updateMatrixWorld(true);
  const position = [],
    normal = [],
    color = [],
    glow = [],
    tint = new THREE.Color();
  staging.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.toNonIndexed();
    geo.applyMatrix4(o.matrixWorld);
    tint.copy(o.material.color);
    for (const v of geo.getAttribute('position').array) position.push(v);
    for (const v of geo.getAttribute('normal').array) normal.push(v);
    for (let i = 0; i < geo.getAttribute('position').count; i++) {
      color.push(tint.r, tint.g, tint.b);
      glow.push(o.userData.glass ? 1 : 0);
    }
    geo.dispose();
  });
  let root = new THREE.Group();
  root.name = 'urban-furniture';
  if (position.length) {
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1));
    g.computeBoundingSphere();
    const material = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.78 });
    // Cristales de las farolas encendidos al anochecer: emisivo cálido por `night` del cielo.
    material.emissiveNode = vec3(LAMP_GLASS.color)
      .mul(attribute('glow', 'float'))
      .mul(skyUniforms.night)
      .mul(LAMP_GLASS.intensity);
    let m = new THREE.Mesh(g, material);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
  gfx.scene.add(root);
}
