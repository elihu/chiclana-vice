import * as THREE from '../vendor/three.module.min.js';
import { $, setStyle, setText, sleepFrame, ui } from './core/dom.js';
import {
  PLACES,
  POPULATION,
  SAVE_KEY,
  SPAWN_POSITION,
  VIEWPOINTS,
  JOBS as jobs,
} from '../game-data.js';
import { TAU, clamp, d, fold, lerp, pInside, pointSeg } from './core/math.js';
import {
  actors,
  audio,
  base,
  buildingGrid,
  camDesired,
  camLook,
  camPos,
  camTarget,
  cars,
  chunks,
  driveNetwork,
  facadeWork,
  gfx,
  graph,
  holdPointers,
  input,
  keys,
  labelPoint,
  people,
  player,
  pointer,
  pois,
  police,
  segments,
  session,
  state,
  streetEnvironment,
  traffic,
  vehicles,
  view,
  waterAreas,
  world,
} from './core/state.js';
import { asset, setAssetVersion } from './core/assets.js';
import {
  bevelGeometry,
  flatGeometry,
  flatPolygon,
  mat,
  mergeParts,
  modelBox,
  modelCylinder,
  modelGeometry,
  modelMaterial,
  modelParts,
  sculptedBox,
} from './engine/materials.js';
import { blocked, inBuilding, indexBuildings, nearestRoad, safePoint } from './world/spatial.js';
import {
  buildRoadGraph,
  connectOpenSpaces,
  findRoute,
  nearestNode,
  orientDriveGraph,
} from './game/graph.js';
import { facadeTexture, surfaceTexture } from './engine/textures.js';
import { loadProgress, toast } from './ui/feedback.js';
import { loadSavedProgress, save } from './game/save.js';
import { rnd } from './core/random.js';

let platform = null;

function installTouchDetection() {
  gfx.W = innerWidth;
  gfx.H = innerHeight;
  gfx.coarse = matchMedia('(any-pointer: coarse)').matches;
  const coarseQuery = matchMedia('(any-pointer: coarse)');
  coarseQuery.addEventListener?.('change', (e) => {
    gfx.coarse = e.matches || gfx.touchSeen;
    if (gfx.renderer) applyQuality();
  });
  addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch' || gfx.touchSeen) return;
      gfx.touchSeen = true;
      if (!gfx.coarse) {
        gfx.coarse = true;
        if (gfx.renderer) applyQuality();
      }
    },
    { capture: true, passive: true },
  );
}

// Reference-led facade upgrade: civic landmarks and their four surrounding streets.
const originalFacadeStreets = [
  'Calle Constitución',
  'Calle de la Vega',
  'Calle de la Plaza',
  'Calle Caraza',
  'Calle Jesús Nazareno',
];

// Optional LiDAR pilot: preserve cadastral floor counts/heights and footprint data.
function applyHeightSamples(samples) {
  if (
    samples?.version !== 1 ||
    samples.buildingCount !== world.city.buildings.length ||
    !Array.isArray(samples.origin) ||
    samples.origin.length !== 2 ||
    samples.origin.some((v, i) => v !== world.city.origin[i])
  )
    return;
  const policy = world.facadeProfiles.heightPolicy,
    acceptance = policy.acceptance;
  for (const s of samples.entries || []) {
    let b = world.city.buildings[s.index];
    if (
      !b ||
      b.floors !== s.floors ||
      b.h !== s.old ||
      b.p.length !== s.vertices ||
      b.p[0].some((v, i) => v !== s.p0?.[i]) ||
      !Number.isFinite(s.height) ||
      s.height < policy.minimumHeight ||
      Math.abs(s.height - b.h) > acceptance.absoluteCorrectionRange[1] ||
      !Number.isFinite(s.coverage) ||
      !Number.isFinite(s.spread) ||
      !Number.isFinite(s.samples) ||
      s.samples < acceptance.minimumSamples ||
      s.coverage < acceptance.minimumCoverage ||
      s.spread > acceptance.maximumP90P10Spread
    )
      continue;
    b.visualH = s.height;
    b.heightSource = samples.source;
  }
}

function prepareFacades() {
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

function buildDetailedFacades() {
  const unitBox = new THREE.BoxGeometry(1, 1, 1),
    staging = new THREE.Group(),
    palette = world.facadeProfiles.palette;
  const materials = new Map();
  function material(color) {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({
          color,
          roughness: color === palette.glass ? 0.32 : 0.83,
          metalness: color === palette.iron ? 0.3 : 0,
          side: THREE.DoubleSide,
        }),
      );
    return materials.get(color);
  }
  // Staging only: one unit box scaled per piece; the batches bake the final vertices.
  function cube(g, x, y, z, w, h, d, color) {
    let m = new THREE.Mesh(unitBox, material(color));
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    g.add(m);
    return m;
  }
  function geo(g, geometry, x, y, z, color) {
    let m = new THREE.Mesh(geometry, material(color));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }
  function wall(a, b, out) {
    let dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz);
    if (out && -dz * out[0] + dx * out[1] < 0) {
      a = b;
      dx = -dx;
      dz = -dz;
    }
    let g = new THREE.Group();
    g.position.set(a[0], 0, a[1]);
    g.rotation.y = Math.atan2(-dz, dx);
    staging.add(g);
    return { g, len };
  }
  function pane(g, x, y, w, h, z = 0.12, shutters = false, frameColor = palette.wood) {
    cube(g, x, y, z, w + 0.24, h + 0.23, 0.14, palette.cream);
    cube(g, x, y, z + 0.09, w, h, 0.035, palette.glass);
    cube(g, x, y, z + 0.13, 0.05, h, 0.04, frameColor);
    cube(g, x, y, z + 0.13, w, 0.05, 0.04, frameColor);
    cube(g, x, y - h / 2 - 0.1, z + 0.12, w + 0.38, 0.12, 0.36, palette.cream);
    if (shutters)
      for (const side of [-1, 1]) {
        cube(g, x + side * (w / 2 + 0.2), y, z + 0.12, 0.3, h, 0.055, palette.green);
        for (let k = 0; k < 8; k++)
          cube(
            g,
            x + side * (w / 2 + 0.2),
            y - h / 2 + 0.1 + (k * h) / 8,
            z + 0.16,
            0.28,
            0.025,
            0.03,
            '#788578',
          );
      }
  }
  function balcony(g, x, y, w, color = palette.iron, depth = 0.55) {
    cube(g, x, y, 0.25 + depth / 2, w + 0.4, 0.14, depth + 0.3, palette.cream);
    cube(g, x, y + 0.9, 0.2 + depth, w + 0.25, 0.055, 0.055, color);
    cube(g, x, y + 0.12, 0.2 + depth, w + 0.25, 0.045, 0.045, color);
    for (let u = -w / 2; u <= w / 2; u += 0.22)
      cube(g, x + u, y + 0.5, 0.2 + depth, 0.035, 0.8, 0.035, color);
    for (const side of [-1, 1])
      cube(g, x + side * (w / 2 + 0.08), y + 0.9, 0.2 + depth / 2, 0.04, 0.04, depth, color);
  }
  function archShape(w, h) {
    let s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h - w / 2);
    s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    s.lineTo(-w / 2, 0);
    return s;
  }
  function arch(g, x, y, w, h) {
    let inner = archShape(w, h);
    geo(g, new THREE.ShapeGeometry(inner, 14), x, y, 0.16, palette.iron);
    let outer = archShape(w + 0.48, h + 0.24);
    outer.holes.push(new THREE.Path(inner.getPoints(20)));
    geo(
      g,
      new THREE.ExtrudeGeometry(outer, { depth: 0.14, bevelEnabled: false, curveSegments: 16 }),
      x,
      y,
      0.2,
      palette.cream,
    );
    for (let u = -w / 2 + 0.14; u < w / 2; u += 0.2)
      cube(g, x + u, y + (h - w / 2) / 2, 0.23, 0.026, h - w / 2, 0.025, '#626561');
    for (let i = 0; i <= 16; i++) {
      let angle = -Math.PI / 2 + (i * Math.PI) / 16,
        r = w / 2,
        m = cube(
          g,
          x + (Math.sin(angle) * r) / 2,
          y + h - r + (Math.cos(angle) * r) / 2,
          0.26,
          0.022,
          r,
          0.025,
          '#626561',
        );
      m.rotation.z = -angle;
    }
    cube(g, x, y + 1.2, 0.25, w, 0.05, 0.045, '#626561');
  }
  function pediment(g, x, y, w) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(0, w * 0.25);
    s.closePath();
    geo(
      g,
      new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false }),
      x,
      y,
      0.26,
      palette.cream,
    );
    cube(g, x, y - 0.04, 0.3, w + 0.12, 0.12, 0.32, palette.white);
  }
  function sign(g, text, x, y, w, h, color = '#e5e0ce', bg = '#514d43') {
    let c = document.createElement('canvas');
    c.width = 1024;
    c.height = 128;
    let a = c.getContext('2d');
    a.fillStyle = bg;
    a.fillRect(0, 0, 1024, 128);
    a.fillStyle = color;
    a.font = 'bold 55px Arial';
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    a.fillText(text, 512, 65, 965);
    let tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    let m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }),
    );
    m.position.set(x, y, 0.42);
    g.add(m);
    return m;
  }
  function civicPane(g, x, y, w, h, z) {
    pane(g, x, y, w, h, z, false, '#4d3d32');
    for (const u of [-w / 6, w / 6]) cube(g, x + u, y, z + 0.14, 0.045, h, 0.035, '#4d3d32');
    for (const v of [-0.33, -0.16, 0.16, 0.33])
      cube(g, x, y + h * v, z + 0.14, w, 0.045, 0.035, '#4d3d32');
  }
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
  function cross(g, x, y, z = 0.2) {
    cube(g, x, y, z, 0.13, 1.5, 0.16, palette.iron);
    cube(g, x, y + 0.19, z, 0.78, 0.13, 0.16, palette.iron);
  }
  function column(g, x, y, h, r, color) {
    geo(g, new THREE.CylinderGeometry(r * 0.83, r, h, 12), x, y, 0.5, color);
    cube(g, x, y - h / 2, 0.5, r * 2.8, 0.2, 0.7, color);
    cube(g, x, y + h / 2, 0.5, r * 2.9, 0.24, 0.75, color);
  }
  function door(g, x, y, w, h) {
    geo(g, new THREE.ShapeGeometry(archShape(w, h), 20), x, y, 0.24, '#554437');
    for (let u = -w / 2 + 0.12; u < w / 2; u += 0.2) {
      let top = h - w / 2 + Math.sqrt(Math.max(0, (w * w) / 4 - u * u));
      cube(g, x + u, y + top / 2, 0.27, 0.016, top, 0.018, '#88715a');
    }
    cube(g, x, y + 1.1, 0.29, 0.05, 2.2, 0.035, '#352e29');
  }
  function belfry(g, x, y, w, h) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, h);
    shape.lineTo(-w / 2, h);
    shape.closePath();
    let path = new THREE.Path();
    path.moveTo(-w * 0.28, 0.15);
    path.lineTo(w * 0.28, 0.15);
    path.lineTo(w * 0.28, h - w * 0.28 - 0.2);
    path.absarc(0, h - w * 0.28 - 0.2, w * 0.28, 0, Math.PI, false);
    path.lineTo(-w * 0.28, 0.15);
    shape.holes.push(path);
    geo(
      g,
      new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false, curveSegments: 16 }),
      x,
      y,
      -0.15,
      palette.cream,
    );
    geo(g, new THREE.CylinderGeometry(0.15, 0.36, 0.52, 12), x, y + 0.85, 0.1, '#6a6554');
    cube(g, x, y + 1.3, 0.1, 0.06, 0.5, 0.08, palette.iron);
  }
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

async function buildBuildings() {
  let groups = new Map(),
    facade = facadeTexture(),
    wallMat = new THREE.MeshStandardMaterial({
      map: facade,
      vertexColors: true,
      roughness: 0.94,
      side: THREE.DoubleSide,
    }),
    roofMat = new THREE.MeshStandardMaterial({
      ...(world.groundTexture ? { map: world.groundTexture } : { color: '#b4a58f' }),
      roughness: 0.98,
      side: THREE.DoubleSide,
    }),
    plainWallMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
  let palette = ['#eee7d7', '#f4ece1', '#f1ead8', '#e8dfd3', '#e7d2b6', '#f3eddf', '#dabdaa'];
  function bucket(b) {
    let cx = (b.minX + b.maxX) / 2,
      cz = (b.minZ + b.maxZ) / 2,
      k = Math.floor(cx / 85) + ',' + Math.floor(cz / 85);
    if (!groups.has(k))
      groups.set(k, { w: [], wu: [], wc: [], dw: [], dwu: [], dwc: [], r: [], ru: [] });
    return groups.get(k);
  }
  let count = 0;
  for (const b of world.city.buildings) {
    let g = bucket(b),
      h = b.visualH ?? b.h,
      cx = (b.minX + b.maxX) / 2,
      cz = (b.minZ + b.maxZ) / 2;
    if (Math.hypot(cx - 207.09, cz - 140.89) < 9) h = Math.max(h, 17);
    if (Math.hypot(cx - 233.29, cz - 174.98) < 24) h = Math.max(h, 12);
    if (b.detailType === 'townhall' && b.floors >= 3) h = Math.max(h, 15.1);
    b.renderH = h;
    let paletteIndex = !b.detailType || b.newDetailOnly ? Math.floor(rnd() * palette.length) : 0;
    let col = new THREE.Color(
      b.detailType === 'church'
        ? '#e9e1cd'
        : b.detailType === 'townhall'
          ? '#d8b669'
          : b.detailType === 'market'
            ? '#cfbfaa'
            : b.detailType
              ? '#eee9db'
              : palette[paletteIndex],
    );
    for (const ring of [b.p, ...b.holes])
      for (let i = 0; i < ring.length; i++) {
        let a = ring[i],
          q = ring[(i + 1) % ring.length],
          len = Math.hypot(q[0] - a[0], q[1] - a[1]);
        if (len < 0.1) continue;
        const vertices = [
            [a[0], 0.02, a[1]],
            [q[0], 0.02, q[1]],
            [q[0], h, q[1]],
            [a[0], h, a[1]],
          ],
          uvs = [
            [0, 0],
            [len / 4.8, 0],
            [len / 4.8, h / world.facadeProfiles.heightPolicy.floorHeight],
            [0, h / world.facadeProfiles.heightPolicy.floorHeight],
          ];
        for (const j of [0, 1, 2, 0, 2, 3]) {
          (b.detailType ? g.dw : g.w).push(...vertices[j]);
          (b.detailType ? g.dwu : g.wu).push(...uvs[j]);
          (b.detailType ? g.dwc : g.wc).push(col.r, col.g, col.b);
        }
      }
    let outer = b.p.map((p) => new THREE.Vector2(...p)),
      holes = b.holes.map((r) => r.map((p) => new THREE.Vector2(...p))),
      all = [...outer, ...holes.flat()],
      tris = THREE.ShapeUtils.triangulateShape(outer, holes);
    for (const tr of tris)
      for (const i of tr) {
        let p = all[i];
        g.r.push(p.x, h + 0.02, p.y);
        g.ru.push(p.x / world.worldW + 0.5, 0.5 - p.y / world.worldH);
      }
    if (++count % 900 === 0) {
      loadProgress(
        'Reconstruyendo las manzanas y los patios…',
        30 + (count / world.city.buildings.length) * 25,
      );
      await sleepFrame();
    }
  }
  for (const g of groups.values()) {
    let group = new THREE.Group();
    for (const [pos, uv, colors, material] of [
      [g.w, g.wu, g.wc, wallMat],
      [g.dw, g.dwu, g.dwc, plainWallMat],
      [g.r, g.ru, null, roofMat],
    ]) {
      if (!pos.length) continue;
      let geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      let mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    gfx.scene.add(group);
    chunks.push(group);
  }
}

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

function createCar(color = '#b9b8aa', cop = false) {
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

function createPerson(color = '#78805a') {
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

function buildRoadDetails() {
  const positions = [],
    colors = [];
  let c = new THREE.Color('#e8e0cb');
  for (const s of segments) {
    if (!s.drive || s.width < 7 || s.length < 9) continue;
    let dx = (s.b[0] - s.a[0]) / s.length,
      dz = (s.b[1] - s.a[1]) / s.length;
    for (let at = 1; at < s.length - 2; at += 9) {
      let x = s.a[0] + dx * at,
        z = s.a[1] + dz * at,
        e = Math.min(3, s.length - at);
      let p = [
        [x - dz * 0.07, 0.065, z + dx * 0.07],
        [x + dz * 0.07, 0.065, z - dx * 0.07],
        [x + dx * e + dz * 0.07, 0.065, z + dz * e - dx * 0.07],
        [x + dx * e - dz * 0.07, 0.065, z + dz * e + dx * 0.07],
      ];
      for (let i of [0, 1, 2, 0, 2, 3]) {
        positions.push(...p[i]);
        colors.push(c.r, c.g, c.b);
      }
    }
  }
  let geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  gfx.scene.add(
    new THREE.Mesh(
      geom,
      mat('#e8dfbb', { side: THREE.DoubleSide, transparent: true, opacity: 0.55 }),
    ),
  );
  // Retain actual river outline and actual mapped bridges. Static pieces share one
  // cached material per colour and are merged into one mesh per material.
  const water = [],
    decks = [],
    rails = [],
    at = (x, y, z, angle = 0) => new THREE.Matrix4().makeRotationY(angle).setPosition(x, y, z);
  for (const a of waterAreas) water.push({ geometry: flatGeometry(a.p), matrix: at(0, 0.025, 0) });
  for (const r of world.city.roads) {
    if (!r.bridge) continue;
    for (let i = 1; i < r.p.length; i++) {
      let a = r.p[i - 1],
        b = r.p[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]),
        angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
      decks.push({
        geometry: new THREE.BoxGeometry(r.w, 0.12, length),
        matrix: at((a[0] + b[0]) / 2, 0.02, (a[1] + b[1]) / 2, angle),
      });
      for (let side of [-1, 1])
        rails.push({
          geometry: new THREE.BoxGeometry(0.12, 0.12, length),
          matrix: at(
            (a[0] + b[0]) / 2 + ((Math.cos(angle) * r.w) / 2) * side,
            1,
            (a[1] + b[1]) / 2 - ((Math.sin(angle) * r.w) / 2) * side,
            angle,
          ),
        });
    }
  }
  for (const [parts, material, cast] of [
    [water, modelMaterial('#658b80', { metalness: 0.2, roughness: 0.45 }), false],
    [decks, modelMaterial('#b9b5a5'), true],
    [rails, modelMaterial('#b7b9af'), true],
  ]) {
    if (!parts.length) continue;
    let mesh = new THREE.Mesh(mergeParts(parts), material);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    gfx.scene.add(mesh);
    for (const p of parts) p.geometry.dispose();
  }
}

function buildStreetSurfaces() {
  let asphalt = surfaceTexture('asphalt'),
    stone = surfaceTexture('stone'),
    slabs = surfaceTexture('slabs');
  let groups = {
    asphalt: { p: [], uv: [], tex: asphalt },
    stone: { p: [], uv: [], tex: stone },
    slabs: { p: [], uv: [], tex: slabs, roughness: 0.98 },
  };
  function tri(g, pts, uv) {
    for (let i of [0, 1, 2, 0, 2, 3]) {
      g.p.push(...pts[i]);
      g.uv.push(...uv[i]);
    }
  }
  for (const road of world.city.roads) {
    if (road.bridge) continue;
    let pedestrian = ['pedestrian', 'footway', 'path'].includes(road.type),
      local = road.p.some((p) => p[0] > -370 && p[0] < 100 && p[1] > -250 && p[1] < 110);
    if (!local) continue;
    let g = groups[pedestrian ? 'stone' : 'asphalt'],
      along = 0;
    for (let i = 1; i < road.p.length; i++) {
      let a = road.p[i - 1],
        b = road.p[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      let nx = -dz / len,
        nz = dx / len,
        half = Math.max(0.65, road.w / 2),
        y = pedestrian ? 0.05 : 0.028;
      let p = [
        [a[0] + nx * half, y, a[1] + nz * half],
        [a[0] - nx * half, y, a[1] - nz * half],
        [b[0] - nx * half, y, b[1] - nz * half],
        [b[0] + nx * half, y, b[1] + nz * half],
      ];
      tri(g, p, [
        [0, along / 4],
        [half / 2, along / 4],
        [half / 2, (along + len) / 4],
        [0, (along + len) / 4],
      ]);
      along += len;
      streetEnvironment.surfaces++;
    }
  }
  // Mapped pedestrian squares retain their real polygon outlines.
  for (const a of world.city.areas) {
    if (
      a.kind !== 'square' ||
      !a.p.some((p) => p[0] > -360 && p[0] < 100 && p[1] > -240 && p[1] < 100)
    )
      continue;
    // All squares share the slab material and one merged mesh.
    let geo = flatGeometry(a.p),
      p = geo.getAttribute('position'),
      index = geo.index;
    for (let i = 0; i < index.count; i++) {
      let k = index.getX(i),
        x = p.getX(k),
        z = p.getZ(k);
      groups.slabs.p.push(x, 0.036 + p.getY(k), z);
      groups.slabs.uv.push(x / 4, -z / 4);
    }
    geo.dispose();
    streetEnvironment.surfaces++;
  }
  for (const g of Object.values(groups)) {
    if (!g.p.length) continue;
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.computeVertexNormals();
    let mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: g.tex,
        roughness: g.roughness ?? 0.96,
        side: THREE.DoubleSide,
      }),
    );
    mesh.receiveShadow = true;
    gfx.scene.add(mesh);
  }
  // Crossing locations are taken from mapped OSM crossing nodes, not invented intersections.
  const mark = [];
  for (const p of world.mappedStreetObjects) {
    if (p.tags.highway !== 'crossing') continue;
    let near = nearestRoad(p.x, p.z, true);
    if (!near || near.d > 8 || near.s.bridge || near.s.width < 4) continue;
    let s = near.s,
      dx = (s.b[0] - s.a[0]) / s.length,
      dz = (s.b[1] - s.a[1]) / s.length,
      half = s.width * 0.43;
    for (let across = -half + 0.25; across < half - 0.2; across += 0.85) {
      let x = p.x - dz * across,
        z = p.z + dx * across,
        ww = 0.43,
        ll = 2;
      let pts = [
        [x - (dz * ww) / 2 - dx * ll, 0.082, z + (dx * ww) / 2 - dz * ll],
        [x + (dz * ww) / 2 - dx * ll, 0.082, z - (dx * ww) / 2 - dz * ll],
        [x + (dz * ww) / 2 + dx * ll, 0.082, z - (dx * ww) / 2 + dz * ll],
        [x - (dz * ww) / 2 + dx * ll, 0.082, z + (dx * ww) / 2 + dz * ll],
      ];
      for (let i of [0, 1, 2, 0, 2, 3]) mark.push(...pts[i]);
    }
    streetEnvironment.crossings++;
  }
  let mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(mark, 3));
  mg.computeVertexNormals();
  gfx.scene.add(new THREE.Mesh(mg, mat('#eeeade', { side: THREE.DoubleSide, roughness: 1 })));
}

function buildUrbanFurniture() {
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
    if (!originalFacadeStreets.includes(s.name) || s.length < 10) continue;
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

// Partition static vegetation without changing any instance transform or color.
function addVegetationCells(root, source, kind, cellSize = 255) {
  let cells = new Map(),
    matrix = new THREE.Matrix4(),
    position = new THREE.Vector3(),
    color = new THREE.Color();
  for (let i = 0; i < source.count; i++) {
    source.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    let key = Math.floor(position.x / cellSize) + ',' + Math.floor(position.z / cellSize);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }
  for (const [key, ids] of cells) {
    let mesh = new THREE.InstancedMesh(source.geometry, source.material, ids.length);
    mesh.name = 'vegetation-' + kind + '-' + key;
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    ids.forEach((id, i) => {
      source.getMatrixAt(id, matrix);
      mesh.setMatrixAt(i, matrix);
      if (source.instanceColor) {
        source.getColorAt(id, color);
        mesh.setColorAt(i, color);
      }
    });
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  source.dispose();
}

function buildTrees() {
  let vegetation = new THREE.Group();
  vegetation.name = 'vegetation-cells';
  gfx.scene.add(vegetation);
  let points = [...world.city.trees];
  for (const a of world.city.areas) {
    if (a.kind !== 'park' || a.p.length < 3) continue;
    let xs = a.p.map((p) => p[0]),
      zs = a.p.map((p) => p[1]),
      mnx = Math.min(...xs),
      mxx = Math.max(...xs),
      mnz = Math.min(...zs),
      mxz = Math.max(...zs);
    for (let i = 0; i < Math.min(100, ((mxx - mnx) * (mxz - mnz)) / 105); i++) {
      let x = lerp(mnx, mxx, rnd()),
        z = lerp(mnz, mxz, rnd()),
        near = nearestRoad(x, z);
      if (
        Math.abs(x) > world.worldW / 2 ||
        Math.abs(z) > world.worldH / 2 ||
        !pInside(x, z, a.p) ||
        inBuilding(x, z, 1.8) ||
        !near ||
        near.d < near.s.width / 2 + 2 ||
        points.some((p) => Math.hypot(x - p[0], z - p[1]) < 4.2)
      )
        continue;
      points.push([x, z]);
    }
  }
  // Street trees at the market plaza, kept off the carriageway and facades.
  for (let i = 0; i < 5; i++) {
    let x = lerp(-254, -195, i / 4) + 9,
      z = lerp(-164, -98, i / 4) - 8;
    let near = nearestRoad(x, z);
    if (
      !inBuilding(x, z, 1.8) &&
      near &&
      near.d > near.s.width / 2 + 1.2 &&
      !streetEnvironment.colliders.some((p) => Math.hypot(x - p.x, z - p.z) < 2)
    )
      points.push([x, z]);
  }
  let trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.13, 0.23, 3.3, 7),
      mat('#786d57'),
      points.length,
    ),
    crowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      mat('#ffffff', { roughness: 1 }),
      points.length * 5,
    ),
    branches = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.045, 0.09, 2, 5),
      mat('#796c54'),
      points.length * 3,
    ),
    dummy = new THREE.Object3D(),
    color = new THREE.Color();
  let k = 0,
    bk = 0;
  points.forEach((p, i) => {
    let size = 0.8 + rnd() * 0.55,
      h = 3.3 * size;
    dummy.position.set(p[0], h / 2, p[1]);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(size, size, size);
    dummy.updateMatrix();
    trunk.setMatrixAt(i, dummy.matrix);
    for (let j = 0; j < 5; j++) {
      let angle = (j * TAU) / 5 + rnd() * 0.3,
        rad = j === 4 ? 0 : 1.05 * size;
      dummy.position.set(
        p[0] + Math.cos(angle) * rad,
        h + 0.7 * size + (j === 4 ? 0.9 : 0),
        p[1] + Math.sin(angle) * rad,
      );
      dummy.rotation.set(rnd(), rnd(), rnd());
      dummy.scale.set(
        (1.4 + rnd() * 0.35) * size,
        (1.4 + rnd() * 0.4) * size,
        (1.4 + rnd() * 0.35) * size,
      );
      dummy.updateMatrix();
      crowns.setMatrixAt(k, dummy.matrix);
      color.setHSL(0.23 + rnd() * 0.08, 0.18 + rnd() * 0.13, 0.24 + rnd() * 0.13);
      crowns.setColorAt(k++, color);
    }
    for (let j = 0; j < 3; j++) {
      let a = (j * TAU) / 3;
      dummy.position.set(
        p[0] + Math.cos(a) * 0.5 * size,
        h * 0.84,
        p[1] + Math.sin(a) * 0.5 * size,
      );
      dummy.rotation.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      branches.setMatrixAt(bk++, dummy.matrix);
    }
    if (!streetEnvironment.colliders.some((o) => Math.hypot(o.x - p[0], o.z - p[1]) < 1))
      streetEnvironment.colliders.push({ x: p[0], z: p[1], r: 0.23 * size });
  });
  trunk.castShadow = branches.castShadow = crowns.castShadow = true;
  crowns.receiveShadow = true;
  addVegetationCells(vegetation, trunk, 'trunks');
  addVegetationCells(vegetation, branches, 'branches');
  addVegetationCells(vegetation, crowns, 'crowns');
  streetEnvironment.trees = points.length;
  // Low shrubs use the same compact instancing approach in mapped green areas.
  const shrubs = [];
  for (const a of world.city.areas) {
    if (a.kind !== 'park') continue;
    for (let i = 0; i < a.p.length; i += 3) {
      let p = a.p[i],
        near = nearestRoad(...p);
      if (
        Math.abs(p[0]) > world.worldW / 2 ||
        Math.abs(p[1]) > world.worldH / 2 ||
        inBuilding(...p, 0.7) ||
        !near ||
        near.d < near.s.width / 2 + 1
      )
        continue;
      shrubs.push(p);
    }
  }
  let leaves = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    mat('#667f51'),
    shrubs.length,
  );
  shrubs.forEach((p, i) => {
    dummy.position.set(p[0], 0.42, p[1]);
    dummy.rotation.set(0, i, 0);
    dummy.scale.set(0.8, 0.55, 0.75);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  });
  leaves.castShadow = true;
  addVegetationCells(vegetation, leaves, 'shrubs');
}

// Street signs: one canvas atlas, one material and one merged mesh; posts are instanced.
function addSigns() {
  let selected = world.city.roads.filter((r) => r.name && r.p.length > 2),
    seen = new Set(),
    signs = [];
  for (const r of selected) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    let p = r.p[Math.floor(r.p.length / 2)],
      near = nearestRoad(...p);
    if (!near) continue;
    let s = near.s,
      ang = Math.atan2(s.b[0] - s.a[0], s.b[1] - s.a[1]),
      x = p[0] + Math.cos(ang) * (r.w / 2 + 0.5),
      z = p[1] - Math.sin(ang) * (r.w / 2 + 0.5);
    if (inBuilding(x, z, 0.15)) continue;
    signs.push({ name: r.name, x, z, ang });
    if (seen.size > 90) break;
  }
  if (!signs.length) return;
  // 512×96 cells as before, separated by an 8 px gutter of the background colour so
  // mipmaps do not bleed neighbouring text.
  const cellW = 512,
    cellH = 96,
    gutter = 8,
    cols = 4,
    pitchW = cellW + gutter * 2,
    pitchH = cellH + gutter * 2,
    atlas = document.createElement('canvas');
  atlas.width = cols * pitchW;
  atlas.height = Math.ceil(signs.length / cols) * pitchH;
  let a = atlas.getContext('2d');
  a.fillStyle = '#204e66';
  a.fillRect(0, 0, atlas.width, atlas.height);
  a.strokeStyle = '#ececdc';
  a.lineWidth = 5;
  a.fillStyle = '#f2eedc';
  a.font = 'bold 30px Arial';
  a.textAlign = 'center';
  a.textBaseline = 'middle';
  const position = [],
    uv = [],
    index = [],
    posts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.06, 2.8, 0.06),
      mat('#5d6260'),
      signs.length,
    ),
    matrix = new THREE.Matrix4();
  signs.forEach((sign, i) => {
    let ox = (i % cols) * pitchW + gutter,
      oy = Math.floor(i / cols) * pitchH + gutter;
    a.strokeRect(ox + 8, oy + 8, 496, 80);
    a.fillText(sign.name.toUpperCase(), ox + 256, oy + 50, 470);
    let cos = Math.cos(sign.ang),
      sin = Math.sin(sign.ang),
      base = position.length / 3;
    // Same vertex order and UV orientation as PlaneGeometry(3.3, 0.62) rotated by ang.
    for (const [u, v] of [
      [0, 1],
      [1, 1],
      [0, 0],
      [1, 0],
    ]) {
      let lx = (u - 0.5) * 3.3;
      position.push(sign.x + lx * cos, 2.45 + (v - 0.5) * 0.62, sign.z - lx * sin);
      uv.push((ox + u * cellW) / atlas.width, 1 - (oy + (1 - v) * cellH) / atlas.height);
    }
    index.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    posts.setMatrixAt(i, matrix.makeTranslation(sign.x, 1.4, sign.z));
  });
  let tex = new THREE.CanvasTexture(atlas);
  tex.colorSpace = THREE.SRGBColorSpace;
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  let plates = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  plates.name = 'street-signs';
  posts.name = 'street-sign-posts';
  posts.castShadow = posts.receiveShadow = true;
  posts.computeBoundingSphere();
  gfx.scene.add(plates, posts);
  streetEnvironment.signs = signs.length;
}

function setupPOIs() {
  for (const [name, x, z] of PLACES) {
    let safe = safePoint(x, z);
    let el = document.createElement('span');
    el.className = 'poi';
    el.textContent = name;
    $('poiLabels').appendChild(el);
    pois.push({ name, x: safe.x, z: safe.z, labelX: x, labelZ: z, el });
  }
}

function target() {
  let j = jobs[state.job];
  if (!j) return null;
  let s = j.stages[state.stage];
  return { ...pois[s.poi], ...s };
}

function updateHUD() {
  const j = jobs[state.job],
    p = target();
  setText('money', Math.floor(state.cash).toLocaleString('es-ES') + ' €');
  setText('stars', '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted));
  setText(
    'jobTag',
    j ? String(state.job + 1).padStart(2, '0') + ' / ' + j.name : 'EXPLORACIÓN LIBRE',
  );
  setText('jobTitle', p ? p.text : 'Recorre las calles reales del centro');
  setText('interactText', player.car ? 'BAJAR' : 'SUBIR');
  setText('boostText', player.car ? 'TURBO' : 'CORRER');
  ui('joy').classList.toggle('hidden', !!player.car);
  ui('driveControls').classList.toggle('hidden', !player.car);
  updateCameraVisibility();
}

function spawnTraffic() {
  let eligible = segments.filter((s) => s.forward.drive && s.length > 18);
  for (let i = 0; i < POPULATION.traffic; i++) {
    let s = eligible[Math.floor(rnd() * eligible.length)],
      n = graph[s.ai];
    if (blocked(n.x, n.z, 1)) continue;
    let car = createCar(['#d8d3c5', '#50575b', '#9f5446', '#b8b2a1', '#6b8587', '#a9b4bf'][i % 6]);
    Object.assign(car, {
      x: n.x,
      z: n.z,
      node: s.ai,
      next: s.bi,
      cruise: 6 + rnd() * 4,
      progress: 0,
    });
    traffic.push(car);
  }
  for (let i = 0; i < POPULATION.parked; i++) {
    let s = eligible[Math.floor(rnd() * eligible.length)],
      p = safePoint((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, true),
      car = createCar(['#dcc394', '#69747b', '#becec1'][i % 3]);
    Object.assign(car, p);
    cars.push(car);
  }
  // 28 pedestrians on segments of at least 8 m; bounded attempts keep start-up predictable.
  for (
    let i = 0, attempts = 0;
    i < POPULATION.pedestrians && attempts < POPULATION.pedestrianAttempts;
    attempts++
  ) {
    let s = segments[Math.floor(rnd() * segments.length)];
    if (s.length < 8) continue;
    let person = createPerson(['#d5be8a', '#697b70', '#8d6d62', '#9cadaa'][i++ % 4]);
    Object.assign(person, { x: s.a[0], z: s.a[1], s, u: rnd(), dir: 1 });
    people.push(person);
  }
}

async function loadWorld() {
  const read = async (file) => {
    const r = await fetch(asset(file));
    if (!r.ok) throw Error('No se ha podido cargar ' + file);
    return r.json();
  };
  const manifest = await read('world.json');
  if (manifest.version !== 1) throw Error('Versión de mapa incompatible');
  // Validate the layer structure up front: a clear message instead of a TypeError later.
  const incompatible = () => Error('Capas del mapa incompatibles'),
    pair = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
  if (
    !pair(manifest.origin) ||
    !pair(manifest.size) ||
    typeof manifest.files?.buildings !== 'string' ||
    typeof manifest.files?.osm !== 'string'
  )
    throw incompatible();
  const [buildings, osm] = await Promise.all([
    read(manifest.files.buildings),
    read(manifest.files.osm),
  ]);
  for (const layer of [buildings, osm])
    if (
      layer?.version !== 1 ||
      !pair(layer.origin) ||
      layer.origin.some((v, i) => v !== manifest.origin[i])
    )
      throw incompatible();
  if (![buildings.buildings, osm.roads, osm.areas].every(Array.isArray)) throw incompatible();
  return {
    origin: manifest.origin,
    size: manifest.size,
    buildings: buildings.buildings,
    roads: osm.roads,
    areas: osm.areas,
    landmarks: Array.isArray(osm.landmarks) ? osm.landmarks : [],
    trees: Array.isArray(osm.trees) ? osm.trees : [],
  };
}

async function init() {
  loadProgress('Descargando el trazado y los edificios reales…', 8);
  const [res, tex, heightSamples, profiles, streetObjects] = await Promise.all([
    loadWorld(),
    // Light mode and touch devices start with the 2048×1536 derivative (same extent).
    // Toggling quality later does not reload it. Without the orthophoto, plain colours.
    new platform.TextureLoader()
      .loadAsync(asset(gfx.quality === 'low' || gfx.coarse ? 'aerial-2048.jpg' : 'aerial.jpg'))
      .catch(() => null),
    fetch(asset('height-samples.json'))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch(asset('facade-profiles.json')).then((r) => {
      if (!r.ok) throw Error('No se han podido cargar los perfiles');
      return r.json();
    }),
    // Optional layer: without it there are no mapped crossings or street furniture.
    fetch(asset('street-objects.json'))
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
  ]);
  world.city = res;
  world.mappedStreetObjects = Array.isArray(streetObjects) ? streetObjects : [];
  if (profiles.version !== 1) throw Error('Perfiles incompatibles');
  world.facadeProfiles = profiles;
  world.groundTexture = tex;
  if (world.groundTexture) {
    world.groundTexture.colorSpace = THREE.SRGBColorSpace;
    world.groundTexture.anisotropy = 4;
  } else toast('Ortofoto no disponible: suelo y tejados en color liso', 5);
  [world.worldW, world.worldH] = world.city.size;
  loadProgress('Preparando el mundo 3D…', 25);
  gfx.renderer = new platform.WebGLRenderer({
    canvas: $('world'),
    antialias: true,
    powerPreference: 'high-performance',
  });
  gfx.renderer.setSize(gfx.W, gfx.H);
  gfx.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  gfx.renderer.outputColorSpace = THREE.SRGBColorSpace;
  gfx.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  gfx.renderer.toneMappingExposure = 1.2;
  gfx.scene = new THREE.Scene();
  gfx.scene.background = new THREE.Color('#a5bbc8');
  gfx.scene.fog = new THREE.Fog('#a5bbc8', 175, 620);
  gfx.camera = new THREE.PerspectiveCamera(62, gfx.W / gfx.H, 0.15, 1800);
  const hemi = new THREE.HemisphereLight('#d9eaf4', '#9a8868', 2.2);
  gfx.scene.add(hemi);
  gfx.sun = new THREE.DirectionalLight('#fff0d6', 3.2);
  gfx.sun.position.set(-100, 150, 60);
  gfx.sun.shadow.mapSize.set(1024, 1024);
  Object.assign(gfx.sun.shadow.camera, {
    left: -75,
    right: 75,
    top: 75,
    bottom: -75,
    near: 1,
    far: 350,
  });
  gfx.sun.shadow.camera.updateProjectionMatrix();
  gfx.sun.shadow.bias = -0.0002;
  gfx.sun.shadow.normalBias = 0.09;
  gfx.scene.add(gfx.sun, gfx.sun.target);
  applyQuality();
  let g = new THREE.Mesh(
    new THREE.PlaneGeometry(world.worldW, world.worldH),
    new THREE.MeshStandardMaterial(
      world.groundTexture
        ? { map: world.groundTexture, roughness: 1 }
        : { color: '#9a9b86', roughness: 1 },
    ),
  );
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  gfx.scene.add(g);
  let outer = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), mat('#9a9b86'));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.1;
  gfx.scene.add(outer);
  buildRoadGraph();
  indexBuildings();
  connectOpenSpaces();
  orientDriveGraph();
  applyHeightSamples(heightSamples);
  prepareFacades();
  await buildBuildings();
  buildDetailedFacades();
  loadProgress('Colocando puentes, vehículos y señales…', 68);
  await sleepFrame();
  buildStreetSurfaces();
  buildRoadDetails();
  buildUrbanFurniture();
  buildTrees();
  addSigns();
  setupPOIs();
  let spawn = safePoint(SPAWN_POSITION.x, SPAWN_POSITION.z, true);
  Object.assign(base, spawn);
  let car = createCar('#bba979');
  Object.assign(car, spawn);
  cars.push(car);
  Object.assign(player, spawn);
  player.car = car;
  actors.character = createPerson('#d7d5b0');
  actors.character.mesh.visible = false;
  spawnTraffic();
  vehicles.push(...cars, ...traffic);
  actors.ring = new THREE.Mesh(
    new THREE.RingGeometry(5.5, 6.2, 48),
    new THREE.MeshBasicMaterial({
      color: '#ffd285',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  actors.ring.rotation.x = -Math.PI / 2;
  actors.ring.position.y = 0.15;
  gfx.scene.add(actors.ring);
  actors.beam = new THREE.Mesh(
    new THREE.CylinderGeometry(5.6, 5.6, 4, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#ffc177',
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  gfx.scene.add(actors.beam);
  let arrowGeo = new THREE.ConeGeometry(0.55, 1.5, 4);
  actors.arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#edfa88' }));
  gfx.scene.add(actors.arrow);
  camPos.set(player.x - 15, 12, player.z - 15);
  camTarget.set(player.x, 1, player.z);
  gfx.camera.position.copy(camPos);
  gfx.camera.lookAt(camTarget);
  $('streetCount').textContent =
    new Set(world.city.roads.filter((r) => r.name).map((r) => r.name)).size + ' calles con nombre';
  loadProgress('Centro de Chiclana listo.', 100);
  updateHUD();
  prepareMap();
  await sleepFrame();
  $('loading').classList.add('hidden');
  $('welcome').classList.remove('hidden');
  session.last = performance.now();
  requestAnimationFrame(frame);
  window.__cityGame = createPublicApi();
}

function clearInput() {
  for (const p of holdPointers.values()) p.clear();
  for (const k in input) input[k] = typeof input[k] === 'boolean' ? false : 0;
  for (const k in keys) delete keys[k];
  pointer.joyId = null;
  pointer.dragId = null;
  $('stick').style.transform = '';
  document.querySelectorAll('.pressed').forEach((e) => e.classList.remove('pressed'));
}

function start() {
  session.started = true;
  session.paused = false;
  $('welcome').classList.add('hidden');
  $('hud').classList.remove('hidden');
  toast(
    'Alameda del Río. GAS para avanzar, flechas para girar. El mapa permite buscar una calle.',
    6,
  );
  snapCamera();
  session.last = performance.now();
}

function setHeat(n) {
  state.wanted = clamp(state.wanted + n, 0, 5);
  state.heat = 22 + state.wanted * 7;
  updateHUD();
}

function advanceStage() {
  let j = jobs[state.job];
  if (!j) return;
  if (state.stage === 0) {
    state.timer = j.limit;
    if (j.stages.some((s) => s.escape)) {
      setHeat(2);
      toast('Te han visto. Entrega el paquete y despista a las patrullas.', 5);
    } else toast('Recogida completada. Sigue la ruta del minimapa.', 3);
  }
  state.stage++;
  session.hold = 0;
  session.routeClock = 0;
  if (state.stage >= j.stages.length) {
    state.cash += j.reward;
    toast('ENCARGO COMPLETADO · +' + j.reward + ' €', 5);
    state.job++;
    state.stage = 0;
    state.timer = 0;
    save();
  }
  updateHUD();
}

function dropPolice() {
  for (const p of police) {
    gfx.scene.remove(p.mesh);
  }
  police.length = 0;
  state.wanted = 0;
  state.arrest = 0;
  updateHUD();
}

function rescue() {
  state.cash = Math.max(0, state.cash - 100);
  dropPolice();
  let p = safePoint(base.x, base.z, true);
  if (player.car) {
    Object.assign(player.car, p);
    player.car.speed = 0;
    player.car.health = 100;
  }
  Object.assign(player, p);
  state.health = 100;
  snapCamera();
  toast('Traslado a la Alameda y reparación · 100 €', 4);
  save();
  updateHUD();
}

function nearestCar() {
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

function interact() {
  if (!session.started || session.paused) return;
  if (player.car) {
    let c = player.car;
    if (Math.abs(c.speed) > 2.5) {
      toast('Frena antes de bajar.', 2);
      return;
    }
    let exit = null;
    for (const sign of [1, -1]) {
      let x = c.x + Math.cos(c.a) * 2.2 * sign,
        z = c.z - Math.sin(c.a) * 2.2 * sign;
      if (!blocked(x, z, 0.35)) {
        exit = { x, z };
        break;
      }
    }
    if (!exit) {
      toast('No hay espacio para abrir la puerta. Avanza un poco.', 3);
      return;
    }
    player.car = null;
    Object.assign(player, exit);
    player.speed = 0;
    toast('A pie · Usa el joystick. Arrastra la escena para mirar.', 3);
  } else {
    let c = nearestCar();
    if (!c) {
      toast('Acércate a un coche detenido para subir.', 3);
      return;
    }
    let i = traffic.indexOf(c);
    if (i >= 0) {
      traffic.splice(i, 1);
      cars.push(c);
      setHeat(1);
    }
    player.car = c;
    player.x = c.x;
    player.z = c.z;
    player.a = c.a;
    state.health = c.health;
    toast('Al volante · GAS, FRENO y flechas para girar.', 3);
  }
  updateHUD();
  snapCamera();
}

function carCollision(c, x, z) {
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

function updatePlayer(dt) {
  let steer =
      (input.right || keys.d || keys.ArrowRight ? 1 : 0) -
      (input.left || keys.a || keys.ArrowLeft ? 1 : 0),
    gas = input.gas || keys.w || keys.ArrowUp,
    brake = input.brake || keys.s || keys.ArrowDown,
    boost = input.boost || keys.Shift;
  const hand = keys[' '];
  if (player.car) {
    let c = player.car,
      max = boost ? 40 : 28;
    if (gas) c.speed += dt * (c.speed < 0 ? 16 : 9.5);
    else if (brake) c.speed -= dt * (c.speed > 0 ? 17 : 5);
    else
      c.speed =
        Math.sign(c.speed) * Math.max(0, Math.abs(c.speed) - dt * (2.3 + Math.abs(c.speed) * 0.08));
    if (hand) c.speed *= Math.exp(-dt * 4);
    c.speed = clamp(c.speed, -7, max);
    let steerAngle = (steer * 0.48) / (1 + Math.abs(c.speed) * 0.028);
    c.a -= (c.speed / 2.8) * Math.tan(steerAngle) * dt;
    let nx = c.x + Math.sin(c.a) * c.speed * dt,
      nz = c.z + Math.cos(c.a) * c.speed * dt;
    if (carCollision(c, nx, nz)) {
      if (Math.abs(c.speed) > 4 && session.collisionClock <= 0) {
        c.health -= Math.min(20, Math.abs(c.speed) * 0.45);
        session.collisionClock = 0.6;
        toast('Golpe · Frena y maniobra hacia atrás.', 1.8);
      }
      c.speed *= -0.15;
    } else {
      c.x = nx;
      c.z = nz;
    }
    for (let k = 0, total = vehicles.length + police.length; k < total; k++) {
      const other = k < vehicles.length ? vehicles[k] : police[k - vehicles.length];
      if (other === c || d(c, other) > 3.1) continue;
      if (session.collisionClock <= 0 && Math.abs(c.speed) > 3) {
        c.health -= 5;
        c.speed *= -0.15;
        session.collisionClock = 1.3;
        setHeat(other.cop ? 1 : state.wanted < 2 ? 1 : 0);
      }
    }
    player.x = c.x;
    player.z = c.z;
    player.a = c.a;
    player.speed = c.speed;
    state.health = c.health;
    c.mesh.rotation.z = lerp(
      c.mesh.rotation.z,
      -steer * Math.min(0.04, Math.abs(c.speed) * 0.002),
      dt * 6,
    );
    if (c.health <= 0) rescue();
  } else {
    let ix = input.jx,
      iy = -input.jy;
    if (pointer.joyId === null) {
      ix = steer;
      iy = (gas ? 1 : 0) - (brake ? 1 : 0);
    }
    let mag = Math.min(1, Math.hypot(ix, iy)),
      heading = player.a + view.orbit;
    let a = heading - Math.atan2(ix, iy),
      v = (boost ? 6.1 : 3.2) * mag;
    if (mag > 0.1) {
      let nx = player.x + Math.sin(a) * v * dt,
        nz = player.z + Math.cos(a) * v * dt;
      if (!blocked(nx, player.z, 0.28)) player.x = nx;
      if (!blocked(player.x, nz, 0.28)) player.z = nz;
      actors.character.mesh.rotation.y = a;
    }
    player.speed = v;
    actors.character.mesh.position.set(player.x, 0, player.z);
    actors.character.limbs.forEach(
      (l, i) =>
        (l.rotation.x =
          Math.sin(session.t * (boost ? 12 : 8) + (i % 2) * Math.PI) * Math.min(0.65, v * 0.13)),
    );
  }
  if (audio.audioCtx && audio.engineGain) {
    audio.engineGain.gain.setTargetAtTime(
      audio.audioOn && player.car ? 0.022 : 0,
      audio.audioCtx.currentTime,
      0.1,
    );
    audio.engineOsc.frequency.setTargetAtTime(
      32 + Math.abs(player.speed) * 5,
      audio.audioCtx.currentTime,
      0.1,
    );
  }
}

function stepAgent(c, dt, isCop = false) {
  if (c.next === undefined) return;
  let n = graph[c.next],
    di = Math.hypot(n.x - c.x, n.z - c.z),
    speed = c.cruise || 9;
  if (!isCop && d(c, player) < 7) speed = 0;
  if (di < Math.max(1, speed * dt)) {
    // Snap to the node so agents follow the checked segment lines exactly.
    c.x = n.x;
    c.z = n.z;
    c.node = c.next;
    let candidates = graph[c.node].adj.filter((e) => e.drive && e.to !== c.prev);
    if (!candidates.length) candidates = graph[c.node].adj.filter((e) => e.drive);
    // Last resort (spawned inside an excluded alley): any road back to the network.
    if (!candidates.length) candidates = graph[c.node].adj.filter((e) => e.s?.drive);
    c.prev = c.node;
    let next;
    if (isCop && c.path?.length) {
      while (c.path.length && c.path[0] === c.node) c.path.shift();
      if (c.path.length) next = { to: c.path.shift() };
    }
    if (!next) next = candidates[Math.floor(rnd() * candidates.length)];
    if (next) c.next = next.to;
    else c.next = undefined;
    return;
  }
  let a = Math.atan2(n.x - c.x, n.z - c.z),
    delta = Math.atan2(Math.sin(a - c.a), Math.cos(a - c.a));
  c.a += clamp(delta, -dt * 3, dt * 3);
  let nx = c.x + Math.sin(a) * speed * dt,
    nz = c.z + Math.cos(a) * speed * dt;
  if (!inBuilding(nx, nz, 0.35)) {
    c.x = nx;
    c.z = nz;
    c.speed = speed;
    c.stuck = 0;
  } else {
    c.speed = 0;
    c.stuck = (c.stuck || 0) + dt;
    if (c.stuck > 2) {
      let tmp = c.node;
      c.node = c.next;
      c.next = tmp;
      c.stuck = 0;
    }
  }
}

function updatePolice(dt) {
  if (!state.wanted) return;
  while (police.length < Math.min(3, state.wanted + 1)) {
    let best = null;
    for (let i = 0; i < graph.length; i++) {
      let n = graph[i],
        di = Math.hypot(player.x - n.x, player.z - n.z);
      if (
        di > 130 + police.length * 30 &&
        di < 180 + police.length * 30 &&
        n.driveMain &&
        !blocked(n.x, n.z, 1)
      ) {
        best = i;
        break;
      }
    }
    if (best === null) break;
    let p = createCar('#293946', true),
      n = graph[best];
    Object.assign(p, {
      x: n.x,
      z: n.z,
      a: 0,
      node: best,
      next: n.adj.find((e) => e.drive).to,
      cruise: 12 + state.wanted,
      think: 0,
    });
    police.push(p);
  }
  let close = false;
  for (const p of police) {
    p.think -= dt;
    if (p.think <= 0) {
      p.path = findRoute(p.node, nearestNode(player.x, player.z, true), true);
      p.think = 3;
    }
    stepAgent(p, dt, true);
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.a;
    if (p.siren) p.siren.visible = Math.sin(session.t * 14) > -0.5;
    if (d(p, player) < 9) {
      close = true;
      if (Math.abs(player.speed) < 3) state.arrest += dt;
    } else if (d(p, player) > 400) {
      gfx.scene.remove(p.mesh);
      police.splice(police.indexOf(p), 1);
      break;
    }
  }
  if (!close) state.arrest = Math.max(0, state.arrest - dt);
  if (state.arrest > 4) {
    state.cash = Math.max(0, state.cash - 150);
    dropPolice();
    toast('Te han parado · Multa de 150 €', 4);
    save();
    return;
  }
  state.heat -= dt * (close ? 0.2 : 1);
  if (state.heat <= 0) {
    dropPolice();
    toast('HAS DESPISTADO A LA POLICÍA', 4);
  }
}

function update(dt) {
  session.t += dt;
  session.collisionClock = Math.max(0, session.collisionClock - dt);
  session.toastClock -= dt;
  if (session.toastShown && session.toastClock <= 0) {
    session.toastShown = false;
    ui('toast').classList.remove('show');
  }
  updatePlayer(dt);
  for (const c of traffic) stepAgent(c, dt);
  for (const c of vehicles) {
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.a;
  }
  updatePolice(dt);
  for (const p of people) {
    p.u += (p.dir * dt * 1.05) / p.s.length;
    if (p.u > 1 || p.u < 0) {
      p.dir *= -1;
      p.u = clamp(p.u, 0, 1);
    }
    let x = lerp(p.s.a[0], p.s.b[0], p.u),
      z = lerp(p.s.a[1], p.s.b[1], p.u),
      a = Math.atan2(p.s.b[0] - p.s.a[0], p.s.b[1] - p.s.a[1]);
    x += Math.cos(a) * (p.s.width / 2 + 0.5);
    z -= Math.sin(a) * (p.s.width / 2 + 0.5);
    p.mesh.visible = !inBuilding(x, z, 0.2) && Math.hypot(x - player.x, z - player.z) < 140;
    p.mesh.position.set(x, 0, z);
    p.mesh.rotation.y = a + (p.dir < 0 ? Math.PI : 0);
    p.limbs.forEach((l, i) => (l.rotation.x = Math.sin(session.t * 7 + (i % 2) * Math.PI) * 0.35));
  }
  let goal = target();
  if (goal) {
    if (state.timer > 0) {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.stage = 0;
        session.hold = 0;
        toast('Tiempo agotado. Vuelve al punto de recogida para intentarlo de nuevo.', 4);
        updateHUD();
        goal = target();
      }
    }
    if (goal.escape) {
      if (state.wanted === 0) advanceStage();
    } else if (d(player, goal) < 8 && Math.abs(player.speed) < 1.8) {
      session.hold += dt;
      if (session.hold > 1) advanceStage();
    } else session.hold = 0;
    goal = target();
  }
  for (let i = 0; i < pois.length; i++)
    if (d(player, pois[i]) < 24 && !state.found.has(i)) {
      state.found.add(i);
      state.cash += 75;
      toast('LUGAR DESCUBIERTO · ' + pois[i].name + ' · +75 €', 3);
      updateHUD();
      save();
    }
  if (goal && !goal.escape) {
    actors.ring.visible = actors.beam.visible = true;
    actors.ring.position.set(goal.x, 0.16, goal.z);
    actors.ring.scale.setScalar(1 + Math.sin(session.t * 2) * 0.025);
    actors.beam.position.set(goal.x, 2, goal.z);
    actors.beam.material.opacity = 0.1 + Math.sin(session.t * 2) * 0.025;
    actors.arrow.visible = true;
    actors.arrow.position.set(goal.x, 6 + Math.sin(session.t * 2) * 0.4, goal.z);
    actors.arrow.rotation.z = Math.PI;
    actors.arrow.rotation.y = session.t * 0.7;
  } else actors.ring.visible = actors.beam.visible = actors.arrow.visible = false;
  session.routeClock -= dt;
  if (session.routeClock <= 0) {
    session.routeClock = 2.5;
    session.route =
      goal && !goal.escape
        ? findRoute(nearestNode(player.x, player.z), nearestNode(goal.x, goal.z))
        : [];
  }
  if (view.orbitAge > 0) view.orbitAge -= dt;
  else if (player.car && view.mode !== 1) view.orbit = lerp(view.orbit, 0, dt * 2);
  updateCamera(dt);
  setText('speed', String(Math.round(Math.abs(player.speed) * 3.6)));
  setText('modeName', player.car ? 'COSTA GT' : input.boost || keys.Shift ? 'CORRIENDO' : 'A PIE');
  setStyle('conditionFill', 'width', state.health + '%');
  setStyle('conditionFill', 'background', state.health < 30 ? '#ff9473' : '#e7fa8a');
  setText(
    'jobDistance',
    goal
      ? goal.escape
        ? 'Evita a las patrullas'
        : Math.round(d(player, goal)) +
          ' m · ' +
          (session.hold > 0 ? 'Entregando…' : 'Señal dorada')
      : state.found.size + '/' + pois.length + ' lugares descubiertos',
  );
  setText(
    'jobTime',
    state.timer > 0
      ? Math.floor(state.timer / 60) + ':' + String(Math.floor(state.timer % 60)).padStart(2, '0')
      : '',
  );
  let near = nearestRoad(player.x, player.z);
  setText('street', near?.s.name || 'Centro de Chiclana');
  let hint = '';
  if (!player.car && nearestCar())
    hint = 'Coche disponible · ' + (gfx.coarse ? 'SUBIR' : 'E para subir');
  else if (goal && !goal.escape && d(player, goal) < 12 && Math.abs(player.speed) > 1.8)
    hint = 'Detente en el círculo dorado para entregar';
  else if (state.wanted)
    hint = 'Búsqueda activa · ' + Math.ceil(state.heat) + ' s para despistarlos';
  else if (Math.abs(player.x) > world.worldW / 2 - 30 || Math.abs(player.z) > world.worldH / 2 - 30)
    hint = 'Fin de la zona recreada · Abre el mapa para volver';
  setText('hint', hint);
  session.saveClock += dt;
  if (session.saveClock > 10) {
    session.saveClock = 0;
    save();
  }
}

function updateCameraVisibility() {
  if (view.firstPersonCar && (view.mode !== 1 || view.firstPersonCar !== player.car))
    view.firstPersonCar.firstPersonOccluders.forEach((m) => (m.visible = true));
  view.firstPersonCar = view.mode === 1 ? player.car : null;
  if (view.firstPersonCar)
    view.firstPersonCar.firstPersonOccluders.forEach((m) => (m.visible = false));
  actors.character.mesh.visible = !player.car && view.mode !== 1;
}

function snapCamera() {
  view.orbit = 0;
  view.lookPitch = 0;
  updateCamera(1);
}

// Sweep against cadastral volumes at the ray height; camera only, no physics changes.
function cameraSweep(position) {
  let dx = position.x - player.x,
    dz = position.z - player.z,
    length = Math.hypot(dx, dz),
    steps = Math.max(1, Math.ceil(length / 0.25));
  for (let i = 1; i <= steps; i++) {
    let u = i / steps,
      x = player.x + dx * u,
      z = player.z + dz * u,
      y = lerp(1.1, position.y, u),
      pad = 0.18;
    const seen = new Set();
    for (let gx = Math.floor((x - pad) / 25); gx <= Math.floor((x + pad) / 25); gx++)
      for (let gz = Math.floor((z - pad) / 25); gz <= Math.floor((z + pad) / 25); gz++)
        for (const b of buildingGrid.get(gx + ',' + gz) || []) {
          if (seen.has(b)) continue;
          seen.add(b);
          if (
            y > (b.renderH ?? b.h) + pad ||
            x < b.minX - pad ||
            x > b.maxX + pad ||
            z < b.minZ - pad ||
            z > b.maxZ + pad
          )
            continue;
          let hit = pInside(x, z, b.p) && !b.holes.some((h) => pInside(x, z, h));
          if (!hit)
            for (let k = 0; k < b.p.length; k++)
              if (pointSeg(x, z, b.p[k], b.p[(k + 1) % b.p.length]).d < pad) {
                hit = true;
                break;
              }
          if (hit) return Math.max(0, (i - 1) / steps - 0.2 / (length || 1));
        }
  }
  return 1;
}

function constrainCamera(position) {
  let u = cameraSweep(position);
  if (u < 1) {
    position.x = lerp(player.x, position.x, u);
    position.z = lerp(player.z, position.z, u);
  }
}

function updateCamera(dt) {
  let heading = player.a + view.orbit,
    follow = player.car ? 9.7 : 5.9,
    y = player.car ? 4.7 : 3.2,
    look = player.car ? 4.8 : 2.8;
  let desired, target;
  if (view.mode === 1) {
    let ahead = player.car ? -0.15 : 0,
      side = player.car ? 0.38 : 0;
    desired = camDesired.set(
      player.x + Math.sin(player.a) * ahead + Math.cos(player.a) * side,
      player.car ? 1.2 : 1.61,
      player.z + Math.cos(player.a) * ahead - Math.sin(player.a) * side,
    );
    target = camLook.set(
      desired.x + Math.sin(heading) * Math.cos(view.lookPitch) * 18,
      desired.y + Math.sin(view.lookPitch) * 18,
      desired.z + Math.cos(heading) * Math.cos(view.lookPitch) * 18,
    );
    camPos.copy(desired);
    camTarget.copy(target);
  } else {
    if (view.mode === 2) {
      follow = 25;
      y = 45;
      look = 0;
    }
    desired = camDesired.set(
      player.x - Math.sin(heading) * follow,
      y,
      player.z - Math.cos(heading) * follow,
    );
    target = camLook.set(
      player.x + Math.sin(heading) * look,
      view.mode === 2 ? 0 : 1.1 + Math.tan(view.lookPitch) * look,
      player.z + Math.cos(heading) * look,
    );
    if (view.mode === 0) constrainCamera(desired);
    camPos.lerp(desired, 1 - Math.exp(-dt * 6));
    camTarget.lerp(target, 1 - Math.exp(-dt * 8));
    if (view.mode === 0) constrainCamera(camPos);
  }
  updateCameraVisibility();
  gfx.camera.position.copy(camPos);
  gfx.camera.lookAt(camTarget);
  gfx.sun.position.set(player.x - 85, 125, player.z + 60);
  gfx.sun.target.position.set(player.x, 0, player.z);
  gfx.sun.target.updateMatrixWorld();
  // In light mode, chunks beyond the fog end are culled (measured from the camera).
  const low = gfx.quality === 'low',
    reach = low ? gfx.scene.fog.far : view.mode === 2 ? 650 : 520,
    ox = low ? gfx.camera.position.x : player.x,
    oz = low ? gfx.camera.position.z : player.z;
  for (const group of chunks) {
    let m = group.children[0],
      c = m.geometry.boundingSphere;
    group.visible = Math.hypot(c.center.x - ox, c.center.z - oz) < reach + c.radius;
  }
}

function drawLabels() {
  for (const p of pois) {
    let di = Math.hypot(p.labelX - player.x, p.labelZ - player.z);
    if (di > 125 || view.mode === 1) {
      setStyle(p.el, 'display', 'none');
      continue;
    }
    let v = labelPoint.set(p.labelX, 14, p.labelZ).project(gfx.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
      setStyle(p.el, 'display', 'none');
      continue;
    }
    setStyle(p.el, 'display', 'block');
    setStyle(p.el, 'left', (v.x * 0.5 + 0.5) * gfx.W + 'px');
    setStyle(p.el, 'top', (-v.y * 0.5 + 0.5) * gfx.H + 'px');
  }
  let goal = target(),
    el = ui('direction');
  if (!goal || goal.escape) {
    setStyle(el, 'display', 'none');
    return;
  }
  let v = labelPoint.set(goal.x, 2, goal.z).project(gfx.camera);
  if (v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.65) {
    setStyle(el, 'display', 'none');
    return;
  }
  let angle = Math.atan2(goal.x - player.x, goal.z - player.z) - (player.a + view.orbit);
  let x = gfx.W / 2 - Math.sin(angle) * Math.min(gfx.W * 0.33, 180),
    y = gfx.H * 0.47 - Math.cos(angle) * Math.min(gfx.H * 0.18, 90);
  setStyle(el, 'display', 'grid');
  setStyle(el, 'left', x - 19 + 'px');
  setStyle(el, 'top', y - 19 + 'px');
  const relative = Math.atan2(Math.sin(angle), Math.cos(angle)); // normalised to [-π, π]
  setText(el, Math.abs(relative) > Math.PI * 0.65 ? '↶' : '◆');
}

let chart, chartCtx;

function trace(c, poly) {
  c.beginPath();
  poly.forEach((p, i) =>
    i
      ? c.lineTo(p[0] + world.worldW / 2, p[1] + world.worldH / 2)
      : c.moveTo(p[0] + world.worldW / 2, p[1] + world.worldH / 2),
  );
}

function prepareMap() {
  chart = document.createElement('canvas');
  chart.width = 1344;
  chart.height = 1002;
  chartCtx = chart.getContext('2d');
  chartCtx.fillStyle = '#6c806f';
  chartCtx.fillRect(0, 0, chart.width, chart.height);
  for (let a of world.city.areas) {
    trace(chartCtx, a.p);
    chartCtx.fillStyle = a.kind === 'water' ? '#234f62' : a.kind === 'park' ? '#57734f' : '#a8aa91';
    chartCtx.fill();
  }
  for (let b of world.city.buildings) {
    trace(chartCtx, b.p);
    chartCtx.fillStyle = '#bfc2aa';
    chartCtx.fill();
    for (let h of b.holes) {
      trace(chartCtx, h);
      chartCtx.fillStyle = '#6c806f';
      chartCtx.fill();
    }
  }
  chartCtx.lineJoin = chartCtx.lineCap = 'round';
  for (let r of world.city.roads) {
    trace(chartCtx, r.p);
    chartCtx.strokeStyle = '#d6d7b7';
    chartCtx.lineWidth = r.w;
    chartCtx.stroke();
  }
  world.streetNames = [...new Set(world.city.roads.map((r) => r.name).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  );
  listStreets();
}

function drawMap(canvas, mini = false) {
  let cw = canvas.width,
    ch = canvas.height,
    c = canvas.getContext('2d'),
    scale = mini ? 1.1 : Math.min(cw / world.worldW, ch / world.worldH) * 0.92;
  let ox = mini
      ? cw / 2 - player.x * scale
      : (cw - world.worldW * scale) / 2 + (world.worldW / 2) * scale,
    oy = mini
      ? ch / 2 - player.z * scale
      : (ch - world.worldH * scale) / 2 + (world.worldH / 2) * scale;
  c.fillStyle = '#1a343d';
  c.fillRect(0, 0, cw, ch);
  c.save();
  c.translate(ox - (world.worldW / 2) * scale, oy - (world.worldH / 2) * scale);
  c.scale(scale, scale);
  // The 2D orthophoto reuses the image already loaded for the ground texture.
  if (session.mapAerial && !mini && world.groundTexture?.image)
    c.drawImage(world.groundTexture.image, 0, 0, world.worldW, world.worldH);
  else c.drawImage(chart, 0, 0, world.worldW, world.worldH);
  c.translate(world.worldW / 2, world.worldH / 2);
  if (session.route.length) {
    c.strokeStyle = '#ddf98a';
    c.lineWidth = mini ? 4 : 5 / scale;
    c.lineJoin = 'round';
    c.beginPath();
    session.route.forEach((id, i) => {
      let n = graph[id];
      i ? c.lineTo(n.x, n.z) : c.moveTo(n.x, n.z);
    });
    c.stroke();
  }
  for (let p of pois) {
    c.fillStyle = '#96dcc2';
    c.beginPath();
    c.arc(p.x, p.z, mini ? 3.5 : 4 / scale, 0, TAU);
    c.fill();
  }
  let goal = target();
  if (goal) {
    c.strokeStyle = '#ffb677';
    c.lineWidth = 2 / scale;
    c.beginPath();
    c.arc(goal.x, goal.z, 8 / scale, 0, TAU);
    c.stroke();
  }
  for (let p of police) {
    c.fillStyle = '#ee8377';
    c.beginPath();
    c.arc(p.x, p.z, 4 / scale, 0, TAU);
    c.fill();
  }
  c.translate(player.x, player.z);
  c.rotate(-player.a);
  c.fillStyle = '#f2ffa0';
  c.strokeStyle = '#182f35';
  c.lineWidth = 2 / scale;
  c.beginPath();
  c.moveTo(0, 8 / scale);
  c.lineTo(-5 / scale, -5 / scale);
  c.lineTo(0, -2 / scale);
  c.lineTo(5 / scale, -5 / scale);
  c.closePath();
  c.stroke();
  c.fill();
  c.restore();
  if (!mini) {
    c.font = 'bold ' + Math.max(12, cw / 55) + 'px Arial';
    c.textAlign = 'center';
    for (let p of pois) {
      let x = ox + p.x * scale,
        y = oy + p.z * scale,
        w = c.measureText(p.name).width;
      c.fillStyle = '#142d36ee';
      c.fillRect(x - w / 2 - 5, y + 8, w + 10, 20);
      c.fillStyle = '#f0f2df';
      c.fillText(p.name, x, y + 23);
    }
    c.fillStyle = '#e2edc7';
    c.textAlign = 'right';
    c.fillText('N ↑', cw - 14, 25);
  }
}

function listStreets() {
  let q = fold($('streetSearch').value),
    names = world.streetNames.filter((n) => fold(n).includes(q));
  let list = $('streetList');
  list.replaceChildren();
  for (const view of VIEWPOINTS) {
    if (q && !fold(view.name).includes(q)) continue;
    let b = document.createElement('button');
    b.textContent = view.name;
    b.style.color = '#e7fa8a';
    b.onclick = () => {
      let position = { x: view.x, z: view.z, a: Math.atan2(view.tx - view.x, view.tz - view.z) };
      if (player.car) {
        Object.assign(player.car, position);
        player.car.speed = 0;
      }
      Object.assign(player, position);
      player.speed = 0;
      view.mode = 0;
      session.routeClock = 0;
      closeMap();
      snapCamera();
      toast(view.name, 3);
    };
    list.appendChild(b);
  }
  for (let n of names) {
    let b = document.createElement('button');
    b.textContent = n;
    b.onclick = () => {
      let rs = world.city.roads.filter((r) => r.name === n),
        r = rs.reduce((a, b) => (a.p.length > b.p.length ? a : b)),
        pt = r.p[Math.floor(r.p.length / 2)],
        safe = safePoint(pt[0], pt[1], !!player.car);
      if (player.car) {
        Object.assign(player.car, safe);
        player.car.speed = 0;
      }
      Object.assign(player, safe);
      player.speed = 0;
      session.routeClock = 0;
      closeMap();
      snapCamera();
      toast(n, 3);
    };
    list.appendChild(b);
  }
  if (!list.children.length) {
    let p = document.createElement('p');
    p.textContent = 'No aparece en este sector del centro.';
    p.style.fontSize = '13px';
    list.appendChild(p);
  }
}

function mute() {
  if (audio.engineGain) audio.engineGain.gain.setTargetAtTime(0, audio.audioCtx.currentTime, 0.1);
}

function openMap() {
  if (!session.started || gfx.contextLost) return;
  session.paused = true;
  clearInput();
  mute();
  $('mapOverlay').classList.remove('hidden');
  openDialog($('closeMap')); // not the search field: no on-screen keyboard
  let c = $('map'),
    r = c.getBoundingClientRect();
  c.width = Math.round(r.width * 1.5);
  c.height = Math.round(r.height * 1.5);
  drawMap(c);
}

function closeMap() {
  if (gfx.contextLost) return; // only reloading can bring the image back
  $('mapOverlay').classList.add('hidden');
  closeDialog();
  session.paused = false;
  gfx.needsRender = true;
  session.last = performance.now();
}

// Dialog focus: the HUD becomes inert, focus moves inside, Tab cycles within the open
// dialog and focus returns to the opener on close.
let dialogOpener = null;

function openDialog(target) {
  if (!dialogOpener) dialogOpener = document.activeElement;
  $('hud').inert = true;
  target?.focus?.();
}

function closeDialog() {
  if (!$('modal').classList.contains('hidden') || !$('mapOverlay').classList.contains('hidden'))
    return;
  $('hud').inert = false;
  dialogOpener?.focus?.();
  dialogOpener = null;
}

function trapFocus(e) {
  const overlay = ['mapOverlay', 'modal'].map($).find((o) => !o.classList.contains('hidden'));
  if (!overlay) return;
  const items = [...overlay.querySelectorAll('button, a[href], input')].filter(
      (el) => !el.closest('.hidden'),
    ),
    first = items[0],
    lastItem = items[items.length - 1];
  if (!first) return;
  const inside = overlay.contains(document.activeElement);
  if (e.shiftKey && (!inside || document.activeElement === first)) {
    e.preventDefault();
    lastItem.focus();
  } else if (!e.shiftKey && (!inside || document.activeElement === lastItem)) {
    e.preventDefault();
    first.focus();
  }
}

function modal(html) {
  session.paused = true;
  clearInput();
  mute();
  $('modalBody').innerHTML = html;
  const title = $('modalBody').querySelector('h2');
  if (title) title.id = 'modalTitle';
  $('modal').classList.remove('hidden');
  openDialog($('modalBody').querySelector('button') || $('closeModal'));
}

function closeModal() {
  if (gfx.contextLost) return; // only reloading can bring the image back
  $('modal').classList.add('hidden');
  closeDialog();
  session.paused = false;
  gfx.needsRender = true;
  session.last = performance.now();
}

function help() {
  if (gfx.contextLost) return;
  modal(
    `<span class="eyebrow">CHICLANA VICE / CALLES REALES</span><h2>El centro, de verdad.</h2><div class="controlTable"><b>Conducir</b><span>Móvil: GAS para avanzar, flechas para girar, FRENO para detenerte y marcha atrás si lo mantienes. TURBO en las rectas.<br>Teclado: WASD o flechas, espacio freno de mano.</span><b>A pie</b><span>BAJAR junto a una zona libre. Joystick para andar; CORRER para ir más rápido. Acércate a un coche detenido para SUBIR. Teclado: E.</span><b>Cámara</b><span>Arrastra la escena horizontal y verticalmente para mirar. En primera persona, la mirada se mantiene hasta que la cambies. El botón Cámara alterna seguimiento, primera persona y vista aérea. Tecla C.</span><b>Mapa</b><span>Busca cualquiera de las ${world.streetNames.length} calles con nombre del sector y selecciónala para trasladarte. Tecla M.</span><b>Encargos</b><span>Detente dentro del círculo dorado durante un segundo. Completa ${jobs.length} encargos y descubre ${pois.length} lugares.</span></div><h3>Qué es real y qué se aproxima</h3><p>Las calles y sus conexiones conservan coordenadas geográficas. Los ${world.city.buildings.length.toLocaleString('es-ES')} volúmenes de edificios y sus patios proceden de contornos oficiales. Los tejados y el suelo usan fotografía aérea PNOA.</p><p>El Ayuntamiento y el Mercado tienen fachadas modeladas a partir de fotografías; Constitución, La Vega, La Plaza y el tramo cercano de Caraza incorporan fachadas de mayor detalle, aproximadas; el piloto continúa por Álamo, García Gutiérrez y Corredera Baja. El resto son genéricas. Los pavimentos del entorno mejorado y el mobiliario son recreaciones; los pasos peatonales usan posiciones cartografiadas. Los árboles combinan puntos de OSM con distribución aproximada dentro de parques y de la plaza del Mercado. Las naves de Jesús Nazareno, San Telmo y San Juan Bautista tienen volúmenes y fachadas específicos, con alturas aproximadas a partir de referencias. La calle Jesús Nazareno incorpora fachadas interpretativas. ${world.city.buildings.filter((b) => b.heightSource).length} partes del piloto tienen alturas de cubierta estimadas de IGN / PNOA-LiDAR, primera cobertura 2008–2015; píxeles de unos 2,5 m y valores en pasos de 1 m. Se mantienen sus plantas catastrales. En los demás, la altura se estima con el número de plantas. Las proporciones verticales del Ayuntamiento se han interpretado del alzado y la sección de Rafael Suárez Almanzor y Victorín Agueda Goyeneche (proyecto de 2006), publicados por la Junta de Andalucía. El terreno es plano. Los monumentos tienen volúmenes simplificados. No es una reconstrucción fotogramétrica ni reproduce el nivel de detalle de GTA V.</p><h3>Fachadas: referencias fotográficas</h3><p>Modelado interpretativo a partir de <a href="https://commons.wikimedia.org/wiki/File:Ayuntamiento_de_Chiclana_de_la_Frontera.jpg" target="_blank" rel="noopener">Ayuntamiento, Jms1952 (2023)</a> y <a href="https://commons.wikimedia.org/wiki/File:Mercado_municioal_Chiclana.jpg" target="_blank" rel="noopener">Mercado, Xemenendura (2025)</a>, ambas CC BY-SA 4.0. Las fotos sirven de referencia: los detalles son geometría de juego, no una captura fotogramétrica.</p><p>Portada Jesús Nazareno: Xemenendura (29/12/2015), <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>. San Telmo: Xemenendura (5/12/2021), CC BY-SA 4.0. San Telmo y San Juan Bautista: fichas de turismo.chiclana.es como referencia. IAPH: «Fachadas lateral y principal del Convento de Jesús Nazareno», Isabel Dugo Cobacho (23/8/2012), © Instituto Andaluz del Patrimonio Histórico, <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener">CC BY-NC-SA 3.0</a>. Referencias, enlaces originales y revisión pendiente de figuras/alzado en los avisos detallados.</p><h3>Fuentes y créditos</h3><p>Calles: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© colaboradores de OpenStreetMap · ODbL 1.0</a>. <a href="osm-world.json" download target="_blank" rel="noopener">Descargar capa OSM utilizada</a> · <a href="street-objects.json" download target="_blank" rel="noopener">Objetos de calle</a> · <a href="licenses/ODbL-1.0.txt" target="_blank" rel="noopener">Licencia ODbL</a>.<br>Ortofoto: obra derivada de PNOA 2022-07 © <a href="https://pnoa.ign.es/" target="_blank" rel="noopener">IGN / PNOA / SCNE</a>, CC BY 4.0.<br>Edificios: obra de juego transformada a partir de <a href="https://www.catastro.hacienda.gob.es/webinspire/" target="_blank" rel="noopener">D.G. del Catastro · INSPIRE BU</a>, descargada el 4/10/2026. Sin validez catastral.<br>Piloto de alturas: Obra derivada de PNOA-LiDAR MDSnE2,5 2008–2015 CC-BY 4.0 scne.es; consultado el 5/10/2026. Alturas derivadas aproximadas; fecha del vuelo local sin confirmar. <a href="https://pnoa.ign.es/pnoa-lidar/productos-a-descarga" target="_blank" rel="noopener">Datos y procedencia</a>.<br>Motor: Three.js, licencia MIT. Juego independiente, sin afiliación con Rockstar Games.</p><p>El progreso se guarda en este navegador; los encargos en curso vuelven a su inicio al recargar.</p><p><a href="THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener">Licencias y procedencia detalladas</a> · <a href="data-sources.json" target="_blank" rel="noopener">Manifiesto de datos</a></p><p><a href="arcade/">Abrir la versión arcade anterior</a></p><button class="primary" id="understood">VOLVER</button>`,
  );
  $('understood').onclick = closeModal;
}

function toggleAudio() {
  audio.audioOn = !audio.audioOn;
  try {
    if (audio.audioOn && !audio.audioCtx) {
      audio.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audio.engineOsc = audio.audioCtx.createOscillator();
      audio.engineGain = audio.audioCtx.createGain();
      audio.engineOsc.type = 'sawtooth';
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(audio.engineGain).connect(audio.audioCtx.destination);
      audio.engineOsc.start();
    }
    if (audio.audioOn) audio.audioCtx.resume();
    else mute();
  } catch {
    audio.audioOn = false;
  }
  toast(audio.audioOn ? 'Sonido del motor activado' : 'Sonido desactivado', 2);
}

// Light mode: DPR 1, no shadow casting (forces shader recompilation) and shorter fog.
function applyQuality() {
  const low = gfx.quality === 'low';
  gfx.renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio || 1, gfx.coarse ? 1.35 : 1.75));
  gfx.renderer.shadowMap.enabled = !low;
  gfx.sun.castShadow = !low;
  gfx.scene.fog.far = low ? 380 : 620;
  gfx.needsRender = true;
}

function pauseMenu() {
  if (gfx.contextLost) return;
  modal(
    `<span class="eyebrow">PAUSA / CENTRO DE CHICLANA</span><h2>Un momento en la Alameda.</h2><p>${state.job}/${jobs.length} encargos · ${state.found.size}/${pois.length} lugares · ${Math.floor(state.cash)} €</p><button class="primary" id="resume">VOLVER AL JUEGO</button><button class="primary secondary" id="full">PANTALLA COMPLETA</button><button class="primary secondary" id="audio">${audio.audioOn ? 'DESACTIVAR' : 'ACTIVAR'} SONIDO</button><button class="primary secondary" id="quality">${gfx.quality === 'low' ? 'CALIDAD NORMAL' : 'MODO MÓVIL LIGERO'}</button><button class="primary secondary" id="help">CONTROLES Y FUENTES</button><button class="primary secondary" id="rescue">REPARAR Y VOLVER A LA ALAMEDA · 100 €</button><button class="textButton" id="reset">Empezar una partida nueva</button>`,
  );
  $('resume').onclick = closeModal;
  $('help').onclick = help;
  $('audio').onclick = () => {
    toggleAudio();
    closeModal();
  };
  $('quality').onclick = () => {
    gfx.quality = gfx.quality === 'low' ? 'auto' : 'low';
    applyQuality();
    save();
    closeModal();
    toast(gfx.quality === 'low' ? 'Modo ligero activado' : 'Calidad normal', 2);
  };
  $('rescue').onclick = () => {
    rescue();
    closeModal();
  };
  $('full').onclick = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
      try {
        await screen.orientation.lock('landscape');
      } catch {}
    } catch {
      toast('En este navegador, gira el móvil para jugar en horizontal.', 4);
    }
    closeModal();
  };
  $('reset').onclick = () => {
    modal(
      '<h2>¿Empezar de cero?</h2><p>Se borrará el progreso guardado de la versión 3D en este navegador.</p><button class="primary" id="yesReset">SÍ, NUEVA PARTIDA</button><button class="primary secondary" id="noReset">CONSERVAR MI PARTIDA</button>',
    );
    $('yesReset').onclick = () => {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {}
      location.reload();
    };
    $('noReset').onclick = pauseMenu;
  };
}

function cycleCamera() {
  view.mode = (view.mode + 1) % 3;
  snapCamera();
  toast(
    ['Cámara de seguimiento', 'Primera persona · mirada libre', 'Vista aérea del trazado real'][
      view.mode
    ],
    2,
  );
}

function installControls() {
  $('start').onclick = start;
  $('introHelp').onclick = help;
  $('credits').onclick = help;
  $('closeModal').onclick = closeModal;
  $('pauseBtn').onclick = pauseMenu;
  $('mapBtn').onclick = openMap;
  $('miniButton').onclick = openMap;
  $('closeMap').onclick = closeMap;
  $('cameraBtn').onclick = cycleCamera;
  $('interact').onclick = interact;
  $('streetSearch').oninput = listStreets;
  $('mapStyle').onclick = () => {
    session.mapAerial = !session.mapAerial;
    $('mapStyle').textContent = session.mapAerial ? 'Ver callejero' : 'Ver ortofoto';
    drawMap($('map'));
  };
  function bindHold(id, key) {
    let e = $(id),
      pointers = new Set();
    holdPointers.set(key, pointers);
    e.onpointerdown = (v) => {
      v.preventDefault();
      if (!session.started || session.paused) return;
      pointers.add(v.pointerId);
      e.setPointerCapture(v.pointerId);
      input[key] = true;
      e.classList.add('pressed');
    };
    for (const n of ['pointerup', 'pointercancel', 'lostpointercapture'])
      e.addEventListener(n, (v) => {
        pointers.delete(v.pointerId);
        input[key] = pointers.size > 0;
        e.classList.toggle('pressed', input[key]);
      });
  }
  for (const type of ['contextmenu', 'selectstart', 'dragstart'])
    document.addEventListener(type, (e) => {
      if (e.target.closest?.('#hud, #world')) e.preventDefault();
    });
  bindHold('left', 'left');
  bindHold('right', 'right');
  bindHold('gas', 'gas');
  bindHold('brake', 'brake');
  bindHold('boost', 'boost');
  const joy = $('joy');
  function joyMove(e) {
    if (e.pointerId !== pointer.joyId) return;
    let r = joy.getBoundingClientRect(),
      dx = e.clientX - r.left - r.width / 2,
      dz = e.clientY - r.top - r.height / 2,
      max = r.width * 0.32,
      len = Math.hypot(dx, dz),
      s = len > max ? max / len : 1;
    input.jx = (dx * s) / max;
    input.jy = (dz * s) / max;
    $('stick').style.transform = `translate(${dx * s}px,${dz * s}px)`;
  }
  joy.onpointerdown = (e) => {
    e.preventDefault();
    if (pointer.joyId !== null) return;
    pointer.joyId = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    joyMove(e);
  };
  joy.onpointermove = joyMove;
  for (const n of ['pointerup', 'pointercancel', 'lostpointercapture'])
    joy.addEventListener(n, (e) => {
      if (e.pointerId !== pointer.joyId) return;
      pointer.joyId = null;
      input.jx = input.jy = 0;
      $('stick').style.transform = '';
    });
  $('world').onpointerdown = (e) => {
    if (!session.started || session.paused || pointer.dragId !== null) return;
    pointer.dragId = e.pointerId;
    pointer.dragX = e.clientX;
    pointer.dragY = e.clientY;
    $('world').setPointerCapture(e.pointerId);
  };
  $('world').onpointermove = (e) => {
    if (e.pointerId !== pointer.dragId) return;
    view.orbit -= (e.clientX - pointer.dragX) * 0.008;
    if (view.mode !== 2)
      view.lookPitch = clamp(
        view.lookPitch - (e.clientY - pointer.dragY) * 0.006,
        view.mode === 1 ? -1.35 : -0.65,
        view.mode === 1 ? 1.35 : 0.65,
      );
    pointer.dragX = e.clientX;
    pointer.dragY = e.clientY;
    view.orbitAge = 2.5;
  };
  for (const n of ['pointerup', 'pointercancel', 'lostpointercapture'])
    $('world').addEventListener(n, (e) => {
      if (e.pointerId === pointer.dragId) pointer.dragId = null;
    });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') return trapFocus(e);
    const editable =
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
    const control = ['BUTTON', 'A'].includes(e.target.tagName);
    if (
      editable ||
      (control && (session.paused || !session.started || e.key === ' ' || e.key === 'Enter'))
    ) {
      // Edición y activación nativas; los atajos de conducción siguen tras pulsar Cámara.
      if (e.key === 'Escape') {
        if (!$('mapOverlay').classList.contains('hidden')) closeMap();
        else if (!$('modal').classList.contains('hidden')) closeModal();
      }
      return;
    }
    let k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    if (e.repeat) return;
    keys[k] = true;
    if (k === 'e') interact();
    if (k === 'c' && session.started && !session.paused) cycleCamera();
    if (k === 'm') {
      if (!$('mapOverlay').classList.contains('hidden')) closeMap();
      else if (!session.paused) openMap();
    }
    if (k === 'Escape') {
      if (!$('mapOverlay').classList.contains('hidden')) closeMap();
      else if (!$('modal').classList.contains('hidden')) closeModal();
      else if (session.started) pauseMenu();
    }
  });
  window.addEventListener(
    'keyup',
    (e) => (keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false),
  );
  window.addEventListener('blur', () => {
    clearInput();
    if (session.started && !session.paused) pauseMenu();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      save();
      clearInput();
      if (session.started && !session.paused) pauseMenu();
    }
    session.last = performance.now();
  });
  window.addEventListener('pagehide', save);
  window.addEventListener('resize', () => {
    gfx.W = innerWidth;
    gfx.H = innerHeight;
    if (!gfx.renderer) return;
    gfx.renderer.setSize(gfx.W, gfx.H);
    gfx.camera.aspect = gfx.W / gfx.H;
    gfx.camera.updateProjectionMatrix();
    gfx.needsRender = true;
    if (!$('mapOverlay').classList.contains('hidden')) openMap();
  });
  $('world').addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    session.paused = true;
    $('mapOverlay').classList.add('hidden');
    modal(
      '<h2>Se ha interrumpido la imagen.</h2><p>Tu progreso está guardado. Recarga la página y activa el modo móvil ligero en Pausa.</p><button class="primary" id="reload">RECARGAR</button>',
    );
    gfx.contextLost = true;
    $('closeModal').classList.add('hidden');
    save();
    $('reload').onclick = () => location.reload();
  });
}

let frameCount = 0;

function frame(now) {
  let dt = clamp((now - session.last) / 1000, 0, 0.04) || 0.016;
  session.last = now;
  if (session.started && !session.paused) update(dt);
  else if (!session.started) {
    session.t += dt;
    gfx.camera.position.set(
      player.x + Math.sin(session.t * 0.075) * 36,
      22,
      player.z + Math.cos(session.t * 0.075) * 36,
    );
    gfx.camera.lookAt(player.x, 0, player.z);
    gfx.sun.target.position.set(player.x, 0, player.z);
    gfx.sun.position.set(player.x - 85, 125, player.z + 60);
    for (let c of vehicles) {
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.a;
    }
  }
  // While paused (map, modal), the last frame stays on screen; redraw only on demand.
  if (!gfx.contextLost && (!session.started || !session.paused || gfx.needsRender)) {
    gfx.renderer.render(gfx.scene, gfx.camera);
    gfx.needsRender = false;
  }
  if (session.started && !session.paused && frameCount++ % 3 === 0) {
    let mini = ui('mini');
    if (mini.width !== 280) {
      mini.width = 280;
      mini.height = 200;
    }
    drawMap(mini, true);
    drawLabels();
  }
  requestAnimationFrame(frame);
}

function showStartupError(err) {
  console.error(err);
  $('loadStatus').textContent = 'No se ha podido iniciar el mundo 3D. ' + err.message;
  let btn = document.createElement('button');
  btn.className = 'primary';
  btn.style.marginTop = '25px';
  btn.textContent = 'REINTENTAR';
  btn.onclick = () => location.reload();
  document.querySelector('.loadingInner').appendChild(btn);
}

function createPublicApi() {
  return {
    get character() {
      return actors.character;
    },
    createCar,
    createPerson,
    state,
    player,
    get city() {
      return world.city;
    },
    graph,
    segments,
    driveNetwork,
    pois,
    get scene() {
      return gfx.scene;
    },
    blocked,
    safePoint,
    facadeWork,
    streetEnvironment,
    get view() {
      return {
        position: gfx.camera.position.toArray(),
        mode: view.mode,
        pitch: view.lookPitch,
        yaw: player.a + view.orbit,
        direction: gfx.camera.getWorldDirection(new THREE.Vector3()).toArray(),
        obstructed: view.mode === 0 && cameraSweep(gfx.camera.position) < 1,
      };
    },
    get stats() {
      return gfx.renderer.info.render;
    },
  };
}

function createTestApi() {
  const extra = {
    inBuilding,
    pInside,
    pointSeg,
    jobs,
    input,
    update,
    target,
    interact,
    updateCamera,
    cycleCamera,
    camPos,
    setOrbit: (v) => {
      view.orbit = v;
    },
    carCollision,
    findRoute,
    nearestNode,
    cars,
    start,
    updateHUD,
    frame,
    pauseMenu,
    closeModal,
    loadWorld,
    listStreets,
    openMap,
    help,
    nearestRoad,
    chunks,
    traffic,
    stepAgent,
    vehicles,
    people,
    get sun() {
      return gfx.sun;
    },
    get renderer() {
      return gfx.renderer;
    },
    get quality() {
      return gfx.quality;
    },
    get paused() {
      return session.paused;
    },
  };
  return Object.defineProperties(createPublicApi(), Object.getOwnPropertyDescriptors(extra));
}

export async function startGame({ version = null, platform: injected = {} } = {}) {
  setAssetVersion(version);
  installTouchDetection();
  loadSavedProgress();
  installControls();
  platform = {
    WebGLRenderer: THREE.WebGLRenderer,
    TextureLoader: THREE.TextureLoader,
    ...injected,
  };
  try {
    await init();
  } catch (err) {
    showStartupError(err);
    return null;
  }
  return createTestApi();
}
