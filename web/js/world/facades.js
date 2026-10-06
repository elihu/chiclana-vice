import * as THREE from '../../vendor/three.module.min.js';
import { TAU, pInside } from '../core/math.js';
import { facadeWork, gfx, world } from '../core/state.js';
import { composeBuilding } from './facade-composer.js';
import { createFacadeKit } from './facade-kit.js';
import { inBuilding, nearestRoad } from './spatial.js';

// Reference-led facade upgrade: civic landmarks and their four surrounding streets.
export const originalFacadeStreets = [
  'Calle Constitución',
  'Calle de la Vega',
  'Calle de la Plaza',
  'Calle Caraza',
  'Calle Jesús Nazareno',
];

export function prepareFacades() {
  const special = world.city.landmarks.filter((p) =>
    /Ayuntamiento de Chiclana|Mercado Municipal/.test(p.name),
  );
  for (const [buildingIndex, b] of world.city.buildings.entries()) {
    const cx = (b.minX + b.maxX) / 2,
      cz = (b.minZ + b.maxZ) / 2;
    let hit = special.find((p) => pInside(cx, cz, p.outline));
    if (hit) {
      b.detailType = hit.name.startsWith('Mercado') ? 'market' : 'townhall';
      continue;
    }
    if (
      world.city.landmarks.some(
        (p) =>
          /Iglesia de Jesús Nazareno|San Telmo|Iglesia Mayor/.test(p.name) &&
          pInside(cx, cz, p.outline),
      )
    ) {
      b.detailType = 'church';
      continue;
    }
    if (cx < -410 || cx > 110 || cz < -270 || cz > 125) continue;
    for (let i = 0; i < b.p.length; i++) {
      let a = b.p[i],
        q = b.p[(i + 1) % b.p.length],
        len = Math.hypot(q[0] - a[0], q[1] - a[1]);
      if (len < 3.3) continue;
      let mx = (a[0] + q[0]) / 2,
        mz = (a[1] + q[1]) / 2,
        nx = -(q[1] - a[1]) / len,
        nz = (q[0] - a[0]) / len;
      let left = inBuilding(mx + nx * 0.45, mz + nz * 0.45, 0.02),
        right = inBuilding(mx - nx * 0.45, mz - nz * 0.45, 0.02);
      if (left === right) continue;
      if (left) {
        nx = -nx;
        nz = -nz;
      }
      let road = nearestRoad(mx + nx, mz + nz);
      if (
        !road ||
        road.d > 17 ||
        !facadeWork.streetNames.includes(road.s.name) ||
        (road.x - mx) * nx + (road.z - mz) * nz < 1
      )
        continue;
      let original =
        cx >= -365 &&
        cx <= 90 &&
        cz >= -230 &&
        cz <= 125 &&
        originalFacadeStreets.includes(road.s.name);
      if (!b.detailType) b.newDetailOnly = !original;
      else if (original) b.newDetailOnly = false;
      b.detailType = 'street';
      facadeWork.fronts.push({
        id: `building-${buildingIndex}-edge-${i}`,
        buildingIndex,
        edgeIndex: i,
        a,
        q,
        len,
        nx,
        nz,
        h: b.visualH ?? b.h,
        floors: b.floors,
        street: road.s.name,
        seed: Math.abs(Math.round(cx * 7 + cz * 13)),
      });
    }
  }
  facadeWork.parts = world.city.buildings.filter((b) => b.detailType).length;
}

export function buildDetailedFacades() {
  const staging = new THREE.Group(),
    palette = world.facadeProfiles.palette;
  const kit = createFacadeKit({ staging, palette });
  const { cube, geo, wall, pane, balcony, archShape, pediment, column, door, belfry } = kit;
  // Ayuntamiento: mapped west frontage; vertical proportions interpreted from the official elevation/section.
  composeBuilding(kit, world.facadeDesigns, 'ayuntamiento');
  // Mercado: long modern stone facade, upper louvers, dark shopfronts and cafe awnings.
  composeBuilding(kit, world.facadeDesigns, 'mercado');

  // Church naves have atypical storey heights; dimensions are visual estimates.
  for (const id of ['nave-jesus-nazareno', 'nave-san-telmo', 'nave-iglesia-mayor'])
    composeBuilding(kit, world.facadeDesigns, id, { landmarks: world.city.landmarks });
  // Jesús Nazareno: white side facade, ochre bands and sculpted marble portal.
  composeBuilding(kit, world.facadeDesigns, 'portada-jesus-nazareno');
  // San Telmo: ochre-trimmed gable and offset bell-screen; no invented twin towers.
  {
    let { g, len } = wall([-17.15, -161.36], [-6.55, -171.73], [1, 1]),
      x = len * 0.5;
    cube(g, len / 2, 5.6, 0.05, len, 11.2, 0.14, '#eeeade');
    cube(g, len / 2, 0.4, 0.16, len, 0.8, 0.2, '#868d87');
    for (let y of [4.6, 10.9]) cube(g, len / 2, y, 0.2, len, 0.2, 0.45, '#c9ad69');
    door(g, x, 0.08, 2.9, 4.3);
    pane(g, x, 8.1, 1.65, 2.55, 0.14);
    for (let xx of [x - 4.8, x + 4.8]) {
      pane(g, xx, 6.25, 1.35, 2, 0.15);
      balcony(g, xx, 5.18, 1.7, palette.iron, 0.35);
    }
    let shape = new THREE.Shape();
    shape.moveTo(x - 7.5, 11.2);
    shape.lineTo(x + 7.5, 11.2);
    shape.lineTo(x, 15.5);
    shape.closePath();
    geo(
      g,
      new THREE.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: false }),
      0,
      0,
      0.02,
      '#eeeade',
    );
    for (let side of [-1, 1]) {
      let slope = cube(g, x + side * 3.75, 13.35, 0.22, 8.65, 0.21, 0.38, '#c9ad69');
      slope.rotation.z = -side * Math.atan2(4.3, 7.5);
    }
    geo(g, new THREE.CircleGeometry(0.64, 24), x, 13.25, 0.34, '#46514b');
    geo(g, new THREE.TorusGeometry(0.7, 0.13, 8, 28), x, 13.25, 0.36, '#c9ad69');
    belfry(g, x - 6.2, 11.15, 3.5, 3.4);
    balcony(g, x - 6.2, 11.05, 4.1, palette.iron, 0.5);
    for (let side of [-1, 1])
      cube(g, x - 6.2 + side * 1.65, 12.9, 0.26, 0.19, 3.55, 0.55, '#c9ad69');
    pediment(g, x - 6.2, 14.65, 3.8);
    let wing = new THREE.Group();
    wing.position.set(x - 6.2, 0, -0.15);
    wing.rotation.y = Math.PI / 2;
    g.add(wing);
    belfry(wing, 1.5, 11.15, 3, 3.4);
    balcony(wing, 1.5, 11.05, 3.5, palette.iron, 0.4);
    pediment(wing, 1.5, 14.65, 3.4);
  }
  // San Juan Bautista: three-bay stone facade, giant pilasters and a central pediment.
  {
    let { g, len } = wall([206.93, 180.32], [218.19, 152.82], [-1, -0.4]),
      x = len / 2,
      stone = '#c7b495';
    cube(g, x, 7.1, 0.08, len, 14.2, 0.17, stone);
    for (let y = 0.55; y < 14; y += 0.62) {
      cube(g, x, y, 0.18, len, 0.023, 0.025, '#ab987c');
      for (let u = (Math.round(y / 0.62) % 2) * 0.75; u < len; u += 1.5)
        cube(g, u, y - 0.3, 0.18, 0.022, 0.58, 0.025, '#ab987c');
    }
    for (let u of [0.9, len * 0.29, len * 0.71, len - 0.9]) {
      cube(g, u, 7, 0.35, 1.2, 13.4, 0.65, stone);
      cube(g, u, 13.3, 0.46, 1.8, 0.48, 0.9, palette.cream);
      cube(g, u, 0.55, 0.45, 1.75, 0.85, 0.92, stone);
      for (let side of [-1, 1])
        geo(
          g,
          new THREE.TorusGeometry(0.3, 0.08, 6, 16),
          u + side * 0.44,
          13.3,
          0.91,
          palette.cream,
        );
    }
    for (let yy of [13.75, 14.12, 14.45]) cube(g, x, yy, 0.46, len + 0.7, 0.24, 0.95, stone);
    for (let u of [len * 0.15, x, len * 0.85]) {
      door(g, u, 0.12, u === x ? 3.3 : 2.7, 4.4);
      for (let side of [-1, 1]) column(g, u + side * 1.65, 2.6, 4.7, 0.2, stone);
      pediment(g, u, 5.15, 4.4);
    }
    for (let u of [len * 0.15, len * 0.85]) {
      geo(g, new THREE.CircleGeometry(0.88, 28), u, 8.4, 0.23, '#495b61');
      geo(g, new THREE.TorusGeometry(0.94, 0.17, 8, 28), u, 8.4, 0.3, palette.cream);
      geo(g, new THREE.TorusGeometry(2.45, 0.13, 6, 30, Math.PI), u, 7.85, 0.26, palette.cream);
      pane(g, u, 11.7, 1.9, 0.85, 0.13);
    }
    geo(g, new THREE.ShapeGeometry(archShape(3.7, 4.6), 20), x, 7.25, 0.2, '#706857');
    for (let side of [-1, 1]) column(g, x + side * 2.35, 9.35, 4.6, 0.23, palette.cream);
    pediment(g, x, 11.85, 5.7);
    balcony(g, x, 7.08, 5.6, palette.cream, 0.75);
    pediment(g, x, 14.6, len * 0.7);
    geo(g, new THREE.TorusGeometry(0.93, 0.18, 8, 28), x, 16.1, 0.52, palette.cream);
    geo(
      staging,
      new THREE.SphereGeometry(4.7, 24, 12, 0, TAU, 0, Math.PI / 2),
      236.7,
      14.3,
      177.2,
      '#d4dbdf',
    );
    for (let j = 0; j < 12; j++) {
      let rib = geo(
        staging,
        new THREE.TorusGeometry(4.72, 0.065, 5, 24, Math.PI),
        236.7,
        14.3,
        177.2,
        '#3e6b8a',
      );
      rib.rotation.y = (j * Math.PI) / 12;
    }
  }

  // Nearby residential and commercial frontages: varied plaster, framed openings, shutters and balconies.
  for (const f of facadeWork.fronts) {
    let { g, len } = wall(f.a, f.q, [f.nx, f.nz]),
      floors = Math.max(1, f.floors),
      storey = (f.h - 0.4) / floors,
      hash = f.seed,
      shade = world.facadeProfiles.streetShades[hash % world.facadeProfiles.streetShades.length],
      trim = hash % 3 === 0 ? '#c9b78e' : palette.cream;
    cube(g, len / 2, f.h / 2, 0.055, len, f.h, 0.08, shade);
    cube(g, len / 2, 0.37, 0.15, len, 0.74, 0.19, hash % 2 ? '#aaa59b' : '#b7ab96');
    cube(g, len / 2, f.h - 0.15, 0.18, len + 0.08, 0.17, 0.35, trim);
    if (floors > 1) cube(g, len / 2, storey + 0.03, 0.16, len, 0.13, 0.24, trim);
    let bays = Math.max(1, Math.floor(len / world.facadeProfiles.bayWidth)),
      step = len / bays;
    for (let j = 0; j < bays; j++) {
      let x = (j + 0.5) * step,
        w = Math.min(1.32, step * 0.52);
      let commercial = f.street !== 'Calle Constitución' && hash % 3 !== 0;
      if (commercial) {
        let width = step * 0.8;
        cube(g, x, 1.43, 0.145, width + 0.2, 2.65, 0.14, '#b5ada0');
        cube(g, x, 1.44, 0.235, width, 2.42, 0.04, hash % 4 === 0 ? '#8d9590' : palette.glass);
        if (hash % 4 === 0) {
          for (let y = 0.35; y < 2.65; y += 0.12)
            cube(g, x, y, 0.268, width, 0.022, 0.025, '#b3b7ad');
        } else {
          cube(g, x, 1.45, 0.28, 0.06, 2.4, 0.06, '#5f6763');
          cube(
            g,
            x,
            2.87,
            0.25,
            width + 0.12,
            0.32,
            0.15,
            ['#586d63', '#94765a', '#5e6b79'][hash % 3],
          );
        }
        if (j === 0 && hash % 3 === 1) {
          let aw = cube(g, x, 2.7, 0.66, width + 0.25, 0.08, 1.12, '#d0c4a7');
          aw.rotation.x = 0.16;
          cube(g, x, 2.58, 1.19, width + 0.25, 0.22, 0.045, '#c6b895');
        }
      } else if (j === 0) {
        cube(g, x, 1.36, 0.2, w + 0.22, 2.7, 0.15, trim);
        cube(g, x, 1.32, 0.3, w, 2.54, 0.05, palette.wood);
        for (let k = 0; k < 3; k++)
          cube(g, x, 0.5 + k * 0.72, 0.34, w * 0.72, 0.51, 0.024, '#6e6050');
      } else pane(g, x, 1.75, w, 1.63, 0.13, true);
      for (let level = 1; level < floors; level++) {
        let y = level * storey + storey * 0.465,
          openingH = Math.min(1.87, storey * 0.64);
        pane(g, x, y, w, openingH, 0.12, hash % 3 === 0);
        if (hash % 3 !== 2) balcony(g, x, y - openingH / 2 - 0.085, w + 0.32, palette.iron, 0.42);
        else {
          for (let k = -2; k <= 2; k++)
            cube(g, x + (k * w) / 5, y - 0.43, 0.26, 0.024, 0.9, 0.035, palette.iron);
        }
      }
    }
  }
  // Closed solids only show their outside, so they can use FrontSide; flat shapes and
  // open surfaces (half tori, tubes, the dome) keep DoubleSide.
  function closedSolid(geometry) {
    const p = geometry.parameters || {},
      full = (v) => v === undefined || v >= TAU - 1e-9;
    switch (geometry.type) {
      case 'BoxGeometry':
      case 'ExtrudeGeometry':
        return true;
      case 'CylinderGeometry':
      case 'ConeGeometry':
        return !p.openEnded && full(p.thetaLength);
      case 'SphereGeometry':
        return full(p.phiLength) && !p.thetaStart && p.thetaLength >= Math.PI - 1e-9;
      case 'TorusGeometry':
        return full(p.arc);
      default:
        return false;
    }
  }
  const frontMaterials = new Map();
  function frontSide(m) {
    if (!frontMaterials.has(m)) {
      let front = m.clone();
      front.side = THREE.FrontSide;
      frontMaterials.set(m, front);
    }
    return frontMaterials.get(m);
  }
  // Batch by material, side and 170 m cell, so off-screen frontage groups can be culled.
  staging.updateMatrixWorld(true);
  let batches = new Map(),
    textMeshes = [];
  staging.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material.map) {
      textMeshes.push(o);
      return;
    }
    let geom = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(),
      closed = closedSolid(o.geometry);
    geom.applyMatrix4(o.matrixWorld);
    if (o.matrixWorld.determinant() < 0) {
      // A mirrored transform reverses triangle winding; restore it for FrontSide culling.
      for (const attr of [geom.getAttribute('position'), geom.getAttribute('normal')])
        for (let i = 0; i < attr.count; i += 3)
          for (let c = 0; c < 3; c++) {
            let t = attr.array[(i + 1) * 3 + c];
            attr.array[(i + 1) * 3 + c] = attr.array[(i + 2) * 3 + c];
            attr.array[(i + 2) * 3 + c] = t;
          }
    }
    geom.computeBoundingSphere();
    let cell =
      Math.floor(geom.boundingSphere.center.x / world.facadeProfiles.facadeCellSize) +
      ',' +
      Math.floor(geom.boundingSphere.center.z / world.facadeProfiles.facadeCellSize);
    let p = geom.getAttribute('position'),
      n = geom.getAttribute('normal'),
      key = o.material.color.getHexString() + (closed ? '-front' : '') + '@' + cell,
      bucket = batches.get(key);
    if (!bucket) {
      bucket = { p: [], n: [], material: closed ? frontSide(o.material) : o.material };
      batches.set(key, bucket);
    }
    for (let i = 0; i < p.array.length; i++) bucket.p.push(p.array[i]);
    for (let i = 0; i < n.array.length; i++) bucket.n.push(n.array[i]);
    geom.dispose();
  });
  let root = new THREE.Group();
  root.name = 'reference-led-facades';
  for (const [key, b] of batches) {
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    g.computeBoundingSphere();
    let m = new THREE.Mesh(g, b.material);
    m.name = 'facade-cell-' + key;
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  for (const o of textMeshes) {
    let m = o.clone();
    m.matrixAutoUpdate = false;
    m.matrix.copy(o.matrixWorld);
    root.add(m);
  }
  gfx.scene.add(root);
  facadeWork.meshes = root.children.length;
}
