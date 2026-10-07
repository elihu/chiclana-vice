import * as THREE from '../../vendor/three.module.min.js';
import { chunks, gfx, world } from '../core/state.js';
import { facadeTexture } from '../engine/textures.js';
import { loadProgress } from '../ui/feedback.js';
import { rnd } from '../core/random.js';
import { sleepFrame } from '../core/dom.js';
import { groundHeightAt } from '../engine/terrain-sampling.js';
import { terrainEdge } from '../engine/terrain-drape.js';

export async function buildBuildings() {
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
      groups.set(k, { w: [], wu: [], wc: [], dw: [], dwu: [], dwc: [], r: [], ru: [] });
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
    let paletteIndex = !b.detailType || b.newDetailOnly ? Math.floor(rnd() * palette.length) : 0;
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
    for (const tr of tris)
      for (const i of tr) {
        let p = all[i];
        g.r.push(p.x, b.baseY + h + 0.02, p.y);
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
