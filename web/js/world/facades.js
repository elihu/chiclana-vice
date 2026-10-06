import * as THREE from '../../vendor/three.module.min.js';
import { TAU, pInside } from '../core/math.js';
import { facadeWork, gfx, world } from '../core/state.js';
import { flatPolygon } from '../engine/materials.js';
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
  const {
    material,
    cube,
    geo,
    wall,
    pane,
    balcony,
    archShape,
    arch,
    pediment,
    sign,
    civicPane,
    cross,
    column,
    door,
    belfry,
  } = createFacadeKit({ staging, palette });
  // Ayuntamiento: mapped west frontage; vertical proportions interpreted from the official elevation/section.
  let civic = wall(
      world.facadeProfiles.townhall.a,
      world.facadeProfiles.townhall.b,
      world.facadeProfiles.townhall.outward,
    ),
    cg = civic.g,
    L = civic.len,
    mid = L * 0.5;
  cg.scale.y = world.facadeProfiles.townhall.verticalScale;
  cube(cg, L / 2, 4.72, 0.06, L, 9.44, 0.1, palette.ochre);
  for (let y = 0.3; y < 3.8; y += 0.4) cube(cg, L / 2, y, 0.12, L, 0.045, 0.09, '#bea166');
  for (const [y, h, d] of [
    [3.9, 0.24, 0.45],
    [4.12, 0.13, 0.56],
    [8.76, 0.2, 0.45],
    [9, 0.18, 0.62],
    [9.38, 0.32, 0.45],
  ])
    cube(cg, L / 2, y, 0.15, L + 0.4, h, d, palette.cream);
  for (let u of [1.2, L - 1.2, mid - 6.1, mid - 2.05, mid + 2.05, mid + 6.1]) {
    cube(cg, u, 6.4, 0.21, 0.58, 4.65, 0.32, palette.cream);
    cube(cg, u, 8.63, 0.32, 0.92, 0.2, 0.55, palette.white);
    cube(cg, u, 4.2, 0.32, 0.9, 0.18, 0.5, palette.white);
  }
  for (let j = -1; j <= 1; j++) {
    let x = mid + j * 4.1;
    arch(cg, x, 0.2, 2.5, 3.35);
    civicPane(cg, x, 5.82, 1.92, 2.45, 0.28);
    pediment(cg, x, 7.18, 2.42);
    geo(cg, new THREE.TorusGeometry(0.43, 0.09, 6, 24), x, 8.03, 0.29, palette.cream);
    geo(cg, new THREE.CircleGeometry(0.35, 24), x, 8.03, 0.24, '#718080');
    let lun = new THREE.TorusGeometry(1.45, 0.07, 6, 24, Math.PI);
    geo(cg, lun, x, 7.33, 0.22, palette.cream);
  }
  for (const x of [4.25, L - 4.25]) {
    civicPane(cg, x, 1.7, 1.7, 2.45, 0.19);
    civicPane(cg, x, 5.85, 1.75, 2.48, 0.22);
    pediment(cg, x, 7.2, 2.25);
    pane(cg, x, 8.02, 1.7, 0.62, 0.16);
  }
  // Broad projecting civic balcony with pale stone balusters.
  cube(cg, mid, 4.04, 0.7, 13, 0.28, 1.48, palette.cream);
  cube(cg, mid, 4.85, 1.35, 13, 0.14, 0.23, palette.cream);
  for (let u = mid - 6.2; u < mid + 6.3; u += 0.35) {
    geo(cg, new THREE.CylinderGeometry(0.065, 0.09, 0.61, 6), u, 4.45, 1.35, palette.cream);
    geo(cg, new THREE.SphereGeometry(0.105, 6, 5), u, 4.5, 1.35, palette.cream);
  }
  for (let x of [mid - 6.4, mid - 2.15, mid + 2.15, mid + 6.4])
    cube(cg, x, 4.43, 1.32, 0.27, 0.86, 0.3, palette.cream);
  cube(cg, mid, 10.54, -0.35, 4.9, 2.8, 1.15, palette.ochre);
  for (const x of [mid - 2.2, mid + 2.2]) cube(cg, x, 10.6, 0.26, 0.37, 2.9, 0.38, palette.cream);
  cube(cg, mid, 11.99, 0.12, 5.25, 0.26, 1.2, palette.cream);
  pediment(cg, mid, 11.28, 2.5);
  geo(cg, new THREE.CircleGeometry(0.66, 32), mid, 10.55, 0.3, palette.cream);
  geo(cg, new THREE.TorusGeometry(0.68, 0.045, 6, 32), mid, 10.55, 0.32, '#c1ad8c');
  for (let i = 0; i < 12; i++) {
    let a = (i * TAU) / 12,
      m = cube(
        cg,
        mid + Math.sin(a) * 0.52,
        10.55 + Math.cos(a) * 0.52,
        0.34,
        0.027,
        0.09,
        0.018,
        palette.iron,
      );
    m.rotation.z = -a;
  }
  let h = cube(cg, mid - 0.12, 10.72, 0.36, 0.038, 0.43, 0.02, palette.iron);
  h.rotation.z = 0.62;
  h = cube(cg, mid + 0.15, 10.55, 0.37, 0.35, 0.032, 0.02, palette.iron);
  h.rotation.z = 0.1;
  for (let j = 0; j < 3; j++) {
    let x = mid + (j - 1) * 3.2;
    let pole = geo(cg, new THREE.CylinderGeometry(0.025, 0.025, 2.8, 6), x, 6.18, 1.08, '#b1b5ac');
    pole.rotation.x = 0.35;
    let cols =
      j === 0
        ? ['#264177', '#264177', '#264177']
        : j === 1
          ? ['#ab2930', '#e2b644', '#ab2930']
          : ['#3c8058', '#e8ead8', '#3c8058'];
    for (let k = 0; k < 3; k++) {
      let f = cube(cg, x + 0.43, 6.97 - k * 0.31, 1.57, 0.84, 0.31, 0.025, cols[k]);
      f.rotation.y = 0.12;
    }
  }
  for (const x of [mid - 6.15, mid - 2.05, mid + 2.05, mid + 6.15]) {
    cube(cg, x, 3.25, 0.62, 0.035, 0.55, 0.66, palette.iron);
    cube(cg, x, 2.96, 0.89, 0.31, 0.44, 0.31, palette.iron);
    cube(cg, x, 2.97, 1.055, 0.2, 0.31, 0.02, '#dbc68f');
  }
  sign(cg, 'AYUNTAMIENTO', mid, 3.64, 5.4, 0.3, palette.cream, '#a08754');
  // Mercado: long modern stone facade, upper louvers, dark shopfronts and cafe awnings.
  const mp = world.facadeProfiles.market.outline;
  const center = world.facadeProfiles.market.center;
  for (let i = 0; i < 4; i++) {
    let a = mp[i],
      b = mp[(i + 1) % 4],
      mx = (a[0] + b[0]) / 2,
      mz = (a[1] + b[1]) / 2,
      { g, len } = wall(a, b, [mx - center[0], mz - center[1]]);
    cube(g, len / 2, 4.77, 0.055, len, 9.5, 0.09, palette.stone);
    cube(g, len / 2, 1.46, 0.115, len, 2.92, 0.15, palette.base);
    cube(g, len / 2, 9.3, 0.37, len + 0.5, 0.24, 0.85, '#ded9c9');
    cube(g, len / 2, 9.62, 0.1, len + 0.2, 0.3, 0.3, '#d9d1bf');
    let bays = Math.max(3, Math.round(len / 5.15)),
      step = len / bays;
    for (let j = 0; j < bays; j++) {
      let x = (j + 0.5) * step,
        ww = Math.min(2.8, step * 0.65);
      cube(g, x, 5.32, 0.135, ww + 0.23, 2.48, 0.12, '#a79782');
      pane(g, x, 5.32, ww, 2.23, 0.14);
      cube(g, x, 5.88, 0.28, ww, 0.075, 0.045, palette.iron);
      cube(g, x - ww * 0.25, 5.32, 0.28, 0.045, 2.23, 0.04, palette.iron);
      cube(g, x + ww * 0.25, 5.32, 0.28, 0.045, 2.23, 0.04, palette.iron);
      cube(g, x, 8.08, 0.15, step - 0.42, 1.7, 0.08, '#768580');
      for (let q = -step / 2 + 0.35; q < step / 2 - 0.25; q += 0.17)
        cube(g, x + q, 8.08, 0.28, 0.057, 1.75, 0.23, '#e6dfcb');
      cube(g, x, 1.36, 0.2, step - 0.63, 2.57, 0.055, '#303b3c');
      for (let k = 0; k < 3; k++)
        cube(g, x - step * 0.3 + k * step * 0.3, 1.38, 0.25, 0.055, 2.55, 0.05, '#9a9485');
      if (len > 60 && j % 5 !== 2) {
        let aw = cube(g, x, 2.94, 0.93, step - 0.19, 0.1, 1.72, '#d8bf83');
        aw.rotation.x = 0.13;
        cube(g, x, 2.8, 1.77, step - 0.16, 0.3, 0.055, '#d8bf83');
        cube(g, x, 3.06, 0.34, step - 0.1, 0.085, 0.12, '#645949');
      }
    }
    for (let y = 0.45; y < 2.8; y += 0.46) {
      cube(g, len / 2, y, 0.198, len, 0.018, 0.02, '#a78770');
      for (let x = (Math.round(y / 0.46) % 2) * 0.57; x < len; x += 1.14)
        cube(g, x, y - 0.23, 0.198, 0.018, 0.44, 0.02, '#a78770');
    }
    for (let x = 0; x < len; x += 1.35) cube(g, x, 5.1, 0.13, 0.016, 4.0, 0.018, '#b5a78f');
    for (let y = 3.35; y < 7.1; y += 0.76) cube(g, len / 2, y, 0.131, len, 0.015, 0.02, '#b5a78f');
    if (len > 60) sign(g, 'MERCADO DE ABASTOS', len / 2, 3.42, 13, 0.46, '#e7deca', '#988571');
  }

  // Church naves have atypical storey heights; dimensions below are visual estimates.
  function nave(name, h, color) {
    const mark = world.city.landmarks.find((p) => p.name.includes(name));
    if (!mark) return;
    const ring = mark.outline.slice(0, -1),
      center = mark.p;
    for (let i = 0; i < ring.length; i++) {
      let a = ring[i],
        b = ring[(i + 1) % ring.length],
        mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        f = wall(a, b, [mid[0] - center[0], mid[1] - center[1]]);
      cube(f.g, f.len / 2, h / 2, -0.12, f.len, h, 0.28, color);
      cube(f.g, f.len / 2, h - 0.1, 0.06, f.len, 0.22, 0.35, color);
    }
    let roof = flatPolygon(ring, h, material('#bca68b'));
    staging.add(roof);
  }
  for (const c of world.facadeProfiles.churches) nave(c.name, c.naveHeight, c.color);
  // Jesús Nazareno: white side facade, ochre bands and sculpted marble portal.
  {
    let { g, len } = wall([-73.04, 73.69], [-50.77, 76.89], [0, -1]),
      x = len * 0.52;
    cube(g, len / 2, 5.2, 0.09, len, 10.4, 0.16, '#f0ede2');
    for (let y of [3.2, 6.75, 10.2]) cube(g, len / 2, y, 0.22, len, 0.18, 0.4, '#bd9038');
    for (let u = 1.5; u < len; u += 3.6) {
      geo(g, new THREE.CircleGeometry(0.28, 20), u, 8.9, 0.19, '#4c5350');
      geo(g, new THREE.TorusGeometry(0.29, 0.045, 6, 20), u, 8.9, 0.22, palette.cream);
    }
    cube(g, x, 3.25, 0.27, 5.8, 6.5, 0.24, palette.cream);
    cube(g, x, 2.15, 0.43, 2.6, 4.3, 0.09, '#433832');
    cube(g, x, 2.15, 0.49, 0.045, 4.2, 0.035, '#7d6c55');
    for (let side of [-1, 1])
      for (let delta of [1.8, 2.7]) {
        let xx = x + side * delta;
        cube(g, xx, 0.56, 0.55, 0.7, 1.1, 0.65, palette.cream);
        let points = [];
        for (let j = 0; j <= 52; j++) {
          let a = (j / 52) * TAU * 3;
          points.push(
            new THREE.Vector3(
              xx + Math.sin(a) * 0.1,
              1.15 + (j / 52) * 3.75,
              0.55 + Math.cos(a) * 0.1,
            ),
          );
        }
        geo(
          g,
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 52, 0.18, 8, false),
          0,
          0,
          0,
          palette.cream,
        );
        cube(g, xx, 5, 0.55, 0.75, 0.3, 0.72, palette.cream);
      }
    for (let y of [5.22, 5.6, 5.88]) cube(g, x, y, 0.48, 6.4, 0.16, 0.85, palette.cream);
    geo(g, new THREE.ShapeGeometry(archShape(2.2, 2.6), 18), x, 5.98, 0.33, '#7d8887');
    for (let side of [-1, 1]) {
      column(g, x + side * 1.45, 7.13, 2.4, 0.18, palette.cream);
      let scroll = geo(
        g,
        new THREE.TorusGeometry(0.55, 0.1, 6, 20, Math.PI),
        x + side * 2,
        6.18,
        0.42,
        palette.cream,
      );
      scroll.rotation.z = side < 0 ? 0 : Math.PI;
    }
    function statue(xx, yy, scale = 1) {
      geo(
        g,
        new THREE.ConeGeometry(0.23 * scale, 0.9 * scale, 9),
        xx,
        yy + 0.46 * scale,
        0.5,
        palette.cream,
      );
      geo(
        g,
        new THREE.SphereGeometry(0.115 * scale, 8, 6),
        xx,
        yy + 1.04 * scale,
        0.5,
        palette.cream,
      );
      cube(g, xx, yy, 0.5, 0.55 * scale, 0.13, 0.55, palette.cream);
    }
    statue(x, 6.15, 1.25);
    for (let side of [-1, 1]) statue(x + side * 2.24, 1.2, 0.85);
    let crossbar = cube(g, x + 0.2, 7.3, 0.66, 0.12, 1.9, 0.12, palette.cream);
    crossbar.rotation.z = 0.65;
    crossbar = cube(g, x + 0.15, 7.62, 0.67, 0.75, 0.12, 0.12, palette.cream);
    crossbar.rotation.z = 0.65;
    geo(g, new THREE.TorusGeometry(1.75, 0.13, 6, 28, Math.PI), x, 8.1, 0.4, palette.cream);
    cross(g, x, 10.7);
    cube(g, len - 0.9, 11.3, -1.2, 2.8, 2.2, 2.8, '#ede5d4');
    belfry(g, len - 0.9, 12.4, 2.8, 2.7);
    cube(g, len - 0.9, 15.18, 0.1, 3.2, 0.2, 0.9, '#bd9038');
    cross(g, len - 0.9, 16.15);
  }
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
