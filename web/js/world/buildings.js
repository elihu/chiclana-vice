import * as THREE from '../../vendor/three.module.min.js';
import { chunks, gfx, world } from '../core/state.js';
import { facadeTexture } from '../engine/textures.js';
import { loadProgress } from '../ui/feedback.js';
import { rnd } from '../core/random.js';
import { sleepFrame } from '../core/dom.js';

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
