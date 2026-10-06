import * as THREE from '../../vendor/three.module.min.js';
import { gfx, streetEnvironment, world } from '../core/state.js';
import { inBuilding, nearestRoad } from './spatial.js';
import { mat } from '../engine/materials.js';

// Street signs: one canvas atlas, one material and one merged mesh; posts are instanced.
export function addSigns() {
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
