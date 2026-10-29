import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx, segments, streetEnvironment, world } from '../core/state.js';
import { groundHeightAt } from '../engine/terrain-sampling.js';
import { inBuilding } from './spatial.js';

// Vallas, muros y setos de OSM (web/barriers.json; V1 de PLAN-VALLAS), con el aspecto de
// city-design.json → barriers. Muros, muralla, seto y postes van en una malla con color por
// vértice; los paños de las vallas, en otra con una malla metálica recortada (alphaTest): dos
// llamadas de dibujo. Cada trazo se parte en tramos de `pieceLength` m, cada uno apoyado en el
// relieve por sus extremos. Hay hueco donde una vía de OSM cruza el trazo (también peatonal: suelen
// ser entradas), con su media anchura más `roadClearance` a cada lado; una vía que solo corre en
// paralelo no lo corta. También junto a las puertas y dentro de los edificios. Los muros de
// contención van aparte (V3).
const SOLID_KINDS = ['wall', 'city_wall', 'hedge'],
  FOOT = 0.15; // m que el pie se hunde bajo el terreno, para no dejar rendija en cuesta

// Prisma entre p y q (planta), de media anchura `half`, desde las bases b0/b1 hasta las cimas
// t0/t1 en cada extremo, con sus dos caras largas, la superior y las dos de los extremos.
function prism(out, p, q, half, b0, b1, t0, t1, color) {
  const dx = q[0] - p[0],
    dz = q[1] - p[1],
    len = Math.hypot(dx, dz),
    nx = (-dz / len) * half,
    nz = (dx / len) * half,
    v = (s, x, z, y) => [x + nx * s, y, z + nz * s],
    pl = [v(-1, ...p, b0), v(1, ...p, b0), v(1, ...p, t0), v(-1, ...p, t0)],
    ql = [v(-1, ...q, b1), v(1, ...q, b1), v(1, ...q, t1), v(-1, ...q, t1)],
    quads = [
      [pl[1], ql[1], ql[2], pl[2]], // lado +n
      [ql[0], pl[0], pl[3], ql[3]], // lado -n
      [pl[3], pl[2], ql[2], ql[3]], // cima
      [pl[0], pl[1], pl[2], pl[3]], // extremo p
      [ql[1], ql[0], ql[3], ql[2]], // extremo q
    ];
  for (const quad of quads)
    for (const i of [0, 1, 2, 0, 2, 3]) {
      out.position.push(...quad[i]);
      out.color.push(color.r, color.g, color.b);
    }
}

// Malla metálica de las vallas: rombos de alambre sobre transparente, para alphaTest.
function meshTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  context.strokeStyle = '#ffffff';
  context.lineWidth = 2.2;
  for (const [x0, y0, x1, y1] of [
    [0, 0, 32, 32],
    [32, 0, 0, 32],
    [-16, 0, 16, 32],
    [16, 0, 48, 32],
    [16, 0, -16, 32],
    [48, 0, 16, 32],
  ]) {
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Vías de OSM en una rejilla de 25 m, para buscar las que cruzan un trazo.
function roadGrid() {
  const grid = new Map();
  for (const s of segments)
    for (
      let gx = Math.floor(Math.min(s.a[0], s.b[0]) / 25);
      gx <= Math.floor(Math.max(s.a[0], s.b[0]) / 25);
      gx++
    )
      for (
        let gz = Math.floor(Math.min(s.a[1], s.b[1]) / 25);
        gz <= Math.floor(Math.max(s.a[1], s.b[1]) / 25);
        gz++
      ) {
        const key = gx + ',' + gz;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(s);
      }
  return grid;
}

// Cruces de las vías con el tramo a→b: distancia desde a hasta el cruce y media anchura del hueco.
function crossings(a, b, grid, clearance) {
  const found = [],
    seen = new Set(),
    dx = b[0] - a[0],
    dz = b[1] - a[1];
  for (
    let gx = Math.floor(Math.min(a[0], b[0]) / 25);
    gx <= Math.floor(Math.max(a[0], b[0]) / 25);
    gx++
  )
    for (
      let gz = Math.floor(Math.min(a[1], b[1]) / 25);
      gz <= Math.floor(Math.max(a[1], b[1]) / 25);
      gz++
    )
      for (const s of grid.get(gx + ',' + gz) ?? []) {
        if (seen.has(s)) continue;
        seen.add(s);
        const ex = s.b[0] - s.a[0],
          ez = s.b[1] - s.a[1],
          den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((s.a[0] - a[0]) * ez - (s.a[1] - a[1]) * ex) / den,
          u = ((s.a[0] - a[0]) * dz - (s.a[1] - a[1]) * dx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        // El hueco se mide a lo largo del trazo: una vía que cruza en diagonal lo abre más.
        const sine = Math.abs(den) / (Math.hypot(dx, dz) * Math.hypot(ex, ez));
        found.push([t * Math.hypot(dx, dz), (s.width / 2 + clearance) / Math.max(sine, 0.3)]);
      }
  return found;
}

export function buildBarriers() {
  const layer = world.barriers,
    rules = world.cityDesign.barriers;
  if (!layer?.lines?.length) return;
  const solid = { position: [], color: [] },
    panels = { position: [], uv: [] },
    stats = { pieces: 0, gaps: 0, meters: 0 },
    color = (hex) => new THREE.Color(hex);
  const grid = roadGrid();
  for (const line of layer.lines) {
    const rule = rules[line.kind];
    if (!rule) continue; // muros de contención: V3
    const body = color(rule.color),
      cap = rule.cap && color(rule.cap);
    let along = 0,
      nextPost = 0;
    for (let i = 1; i < line.p.length; i++) {
      const a = line.p[i - 1],
        b = line.p[i],
        len = Math.hypot(b[0] - a[0], b[1] - a[1]),
        pieces = Math.max(1, Math.ceil(len / rules.pieceLength)),
        cuts = crossings(a, b, grid, rules.roadClearance);
      for (let k = 0; k < pieces; k++, along += len / pieces) {
        const p = [a[0] + ((b[0] - a[0]) * k) / pieces, a[1] + ((b[1] - a[1]) * k) / pieces],
          q = [
            a[0] + ((b[0] - a[0]) * (k + 1)) / pieces,
            a[1] + ((b[1] - a[1]) * (k + 1)) / pieces,
          ];
        const mid = (len * (k + 0.5)) / pieces,
          mx = (p[0] + q[0]) / 2,
          mz = (p[1] + q[1]) / 2;
        if (
          cuts.some(([at, half]) => Math.abs(at - mid) < half) ||
          layer.gates.some(([gx, gz]) => Math.hypot(gx - mx, gz - mz) < rules.gateGap / 2) ||
          inBuilding(mx, mz, 0)
        ) {
          stats.gaps++;
          continue;
        }
        const y0 = groundHeightAt(...p),
          y1 = groundHeightAt(...q);
        stats.pieces++;
        stats.meters += len / pieces;
        if (SOLID_KINDS.includes(line.kind)) {
          prism(
            solid,
            p,
            q,
            rule.thickness / 2,
            y0 - FOOT,
            y1 - FOOT,
            y0 + rule.height,
            y1 + rule.height,
            body,
          );
          // Albardilla: remate algo más ancho que el muro.
          if (cap)
            prism(
              solid,
              p,
              q,
              rule.thickness / 2 + 0.04,
              y0 + rule.height,
              y1 + rule.height,
              y0 + rule.height + 0.08,
              y1 + rule.height + 0.08,
              cap,
            );
          continue;
        }
        // Valla: paño de malla y un poste cada `postSpacing` m.
        const u0 = along,
          u1 = along + len / pieces;
        for (const [x, y, z, u, v] of [
          [p[0], y0 - FOOT, p[1], u0, 0],
          [q[0], y1 - FOOT, q[1], u1, 0],
          [q[0], y1 + rule.height, q[1], u1, rule.height + FOOT],
          [p[0], y0 - FOOT, p[1], u0, 0],
          [q[0], y1 + rule.height, q[1], u1, rule.height + FOOT],
          [p[0], y0 + rule.height, p[1], u0, rule.height + FOOT],
        ]) {
          panels.position.push(x, y, z);
          panels.uv.push(u / 0.12, v / 0.12);
        }
        if (nextPost < u0) nextPost = u0; // tras un hueco, el primer poste va en su borde
        while (nextPost <= u1) {
          const t = (nextPost - u0) / (u1 - u0 || 1),
            x = p[0] + (q[0] - p[0]) * t,
            z = p[1] + (q[1] - p[1]) * t,
            y = groundHeightAt(x, z),
            w = rule.postWidth / 2;
          prism(
            solid,
            [x - w, z],
            [x + w, z],
            w,
            y - FOOT,
            y - FOOT,
            y + rule.height + 0.05,
            y + rule.height + 0.05,
            body,
          );
          nextPost += rule.postSpacing;
        }
      }
    }
  }
  const meshes = [];
  if (solid.position.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(solid.position, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(solid.color, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
    );
    mesh.name = 'barriers';
    mesh.castShadow = mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  if (panels.position.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(panels.position, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(panels.uv, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: rules.fence.color,
        map: meshTexture(),
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.6,
        metalness: 0.3,
      }),
    );
    mesh.name = 'barrier-fences';
    meshes.push(mesh);
  }
  if (meshes.length) gfx.scene.add(...meshes);
  stats.meters = Math.round(stats.meters);
  streetEnvironment.barriers = stats;
}
