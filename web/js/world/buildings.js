import { aerialMaterial, tileKey } from './aerial-tiles.js';
import * as THREE from '../../vendor/three.module.min.js';
import { chunks, gfx, world } from '../core/state.js';
import { facadeTexture } from '../engine/textures.js';
import { loadProgress } from '../ui/feedback.js';
import { randomForKey } from '../core/random.js';
import { sha256Hex } from './corrections.js';
import { sleepFrame } from '../core/dom.js';
import { groundHeightAt } from '../engine/terrain-sampling.js';
import { terrainEdge } from '../engine/terrain-drape.js';

// Identidad geométrica: independiente de orden, orientación, plantas y diseño de fachada.
export function buildingIdentity(b) {
  const canonicalRing = (ring) => {
    const points = ring.slice();
    if (points.length > 1 && JSON.stringify(points[0]) === JSON.stringify(points.at(-1)))
      points.pop();
    // Solo un vértice mínimo puede iniciar el anillo canónico; evita crear n rotaciones.
    const labels = points.map((point) => JSON.stringify(point));
    const minimum = labels.reduce((a, b) => (a < b ? a : b));
    const rotations = [];
    for (const direction of [points, [...points].reverse()])
      for (let i = 0; i < direction.length; i++)
        if (JSON.stringify(direction[i]) === minimum)
          rotations.push(JSON.stringify([...direction.slice(i), ...direction.slice(0, i)]));
    return rotations.sort()[0];
  };
  return sha256Hex(JSON.stringify([canonicalRing(b.p), b.holes.map(canonicalRing).sort()]));
}

export function buildingPaletteIndex(b, rules) {
  const key = buildingIdentity(b);
  return (
    rules.variation.paletteAssignments[key] ??
    Math.floor(randomForKey(key, rules.variation.seed) * rules.palette.length)
  );
}

export async function buildBuildings() {
  // UV de tejados en el recuadro de la ortofoto.
  const [ax0, ax1, az0, az1] = world.aerialBox,
    aw = ax1 - ax0,
    ah = az1 - az0;
  const roofMaterials = new Map(),
    overflow = { r: [], ru: [], parts: 0 };
  const { tile: tileSize, margin } = world.aerialIndex ?? { tile: 255, margin: 20.5 };
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
  // Paleta, colores por tipo, alturas mínimas y escala UV en web/city-design.json (`buildings`).
  const rules = world.cityDesign.buildings,
    palette = rules.palette;
  function bucket(b) {
    let cx = (b.minX + b.maxX) / 2,
      cz = (b.minZ + b.maxZ) / 2,
      k = Math.floor(cx / 85) + ',' + Math.floor(cz / 85);
    if (!groups.has(k))
      groups.set(k, {
        w: [],
        wu: [],
        wc: [],
        dw: [],
        dwu: [],
        dwc: [],
        r: [],
        ru: [],
        i: Math.floor(Math.floor(cx / 85) / 3),
        j: Math.floor(Math.floor(cz / 85) / 3),
      });
    return groups.get(k);
  }
  let count = 0;
  for (const b of world.city.buildings) {
    let g = bucket(b),
      h = b.visualH ?? b.h,
      cx = (b.minX + b.maxX) / 2,
      cz = (b.minZ + b.maxZ) / 2;
    for (const m of rules.minimumHeights)
      if (
        m.center
          ? Math.hypot(cx - m.center[0], cz - m.center[1]) < m.radius
          : b.detailType === m.detailType && b.floors >= m.minimumFloors
      )
        h = Math.max(h, m.height);
    b.renderH = h;
    let paletteIndex = !b.detailType || b.newDetailOnly ? buildingPaletteIndex(b, rules) : 0;
    let col = new THREE.Color(
      b.detailType ? rules.detailColors[b.detailType] : palette[paletteIndex],
    );
    for (const ring of [b.p, ...b.holes])
      for (let i = 0; i < ring.length; i++) {
        const edge = terrainEdge(ring[i], ring[(i + 1) % ring.length]);
        for (let k = 1; k < edge.length; k++) {
          let a = edge[k - 1],
            q = edge[k],
            len = Math.hypot(q[0] - a[0], q[1] - a[1]);
          if (len < 0.1) continue;
          const vertices = [
              [a[0], groundHeightAt(...a) + (world.terrain.kind === 'flat' ? 0.02 : -0.08), a[1]],
              [q[0], groundHeightAt(...q) + (world.terrain.kind === 'flat' ? 0.02 : -0.08), q[1]],
              [q[0], b.baseY + h, q[1]],
              [a[0], b.baseY + h, a[1]],
            ],
            uvs = [
              [0, 0],
              [len / rules.wallUvWidth, 0],
              [len / rules.wallUvWidth, h / world.facadeProfiles.heightPolicy.floorHeight],
              [0, h / world.facadeProfiles.heightPolicy.floorHeight],
            ];
          for (const j of [0, 1, 2, 0, 2, 3]) {
            (b.detailType ? g.dw : g.w).push(...vertices[j]);
            (b.detailType ? g.dwu : g.wu).push(...uvs[j]);
            (b.detailType ? g.dwc : g.wc).push(col.r, col.g, col.b);
          }
        }
      }
    let outer = b.p.map((p) => new THREE.Vector2(...p)),
      holes = b.holes.map((r) => r.map((p) => new THREE.Vector2(...p))),
      all = [...outer, ...holes.flat()],
      tris = THREE.ShapeUtils.triangulateShape(outer, holes);
    const fits =
      b.minX >= g.i * tileSize - margin &&
      b.maxX <= (g.i + 1) * tileSize + margin &&
      b.minZ >= g.j * tileSize - margin &&
      b.maxZ <= (g.j + 1) * tileSize + margin;
    const roofs = fits ? g : overflow;
    if (!fits) overflow.parts++;
    for (const tr of tris)
      for (const i of tr) {
        let p = all[i];
        roofs.r.push(p.x, b.baseY + h + 0.02, p.y);
        roofs.ru.push((p.x - ax0) / aw, 1 - (p.y - az0) / ah);
      }
    if (++count % 900 === 0) {
      loadProgress(
        'Reconstruyendo las manzanas y los patios…',
        30 + (count / world.city.buildings.length) * 25,
      );
      await sleepFrame();
    }
  }
  for (const g of [...groups.values(), overflow]) {
    const key = tileKey(g.i, g.j);
    if (g !== overflow && !roofMaterials.has(key))
      roofMaterials.set(
        key,
        aerialMaterial(g.i, g.j, { roughness: 0.98, side: THREE.DoubleSide }, '#b4a58f'),
      );
    let group = new THREE.Group();
    for (const [pos, uv, colors, material] of [
      [g.w, g.wu, g.wc, wallMat],
      [g.dw, g.dwu, g.dwc, plainWallMat],
      [g.r, g.ru, null, g === overflow ? roofMat : roofMaterials.get(key)],
    ]) {
      if (!pos?.length) continue;
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
    if (g === overflow) {
      group.name = 'aerial-roofs-general';
      group.userData.parts = overflow.parts;
    }
    gfx.scene.add(group);
    chunks.push(group);
  }
}
