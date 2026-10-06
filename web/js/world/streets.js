import * as THREE from '../../vendor/three.module.min.js';
import { flatGeometry, mat, mergeParts, modelMaterial } from '../engine/materials.js';
import { gfx, segments, streetEnvironment, waterAreas, world } from '../core/state.js';
import { nearestRoad } from './spatial.js';
import { surfaceTexture } from '../engine/textures.js';

export function buildRoadDetails() {
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

export function buildStreetSurfaces() {
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
