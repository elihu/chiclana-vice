import * as THREE from '../../vendor/three.module.min.js';
import { TAU, pInside } from '../core/math.js';
import { facadeWork, gfx, world } from '../core/state.js';
import { composeBuilding, composeFront } from './facade-composer.js';
import { createFacadeKit, outwardOf } from './facade-kit.js';
import { nearestRoad } from './spatial.js';

// Reference-led facade upgrade: civic landmarks and the streets listed in city-design.json.
export function prepareFacades() {
  const rules = world.cityDesign.frontages,
    [pilotMinX, pilotMaxX, pilotMinZ, pilotMaxZ] = world.cityDesign.zones.frontagePilot,
    [origMinX, origMaxX, origMinZ, origMaxZ] = world.cityDesign.zones.frontageOriginal;
  facadeWork.streetNames = [...rules.streets];
  const special = world.city.landmarks.filter((p) =>
    /Ayuntamiento de Chiclana|Mercado Municipal/.test(p.name),
  );
  const churches = world.facadeDesigns.buildings
    .filter((b) => b.detailType === 'church' && b.landmark)
    .map((b) => world.city.landmarks.find((p) => p.name.includes(b.landmark)))
    .filter(Boolean);
  for (const [buildingIndex, b] of world.city.buildings.entries()) {
    const cx = (b.minX + b.maxX) / 2,
      cz = (b.minZ + b.maxZ) / 2;
    let hit = special.find((p) => pInside(cx, cz, p.outline));
    if (hit) {
      b.detailType = hit.name.startsWith('Mercado') ? 'market' : 'townhall';
      continue;
    }
    if (churches.some((p) => pInside(cx, cz, p.outline))) {
      b.detailType = 'church';
      continue;
    }
    if (cx < pilotMinX || cx > pilotMaxX || cz < pilotMinZ || cz > pilotMaxZ) continue;
    for (let i = 0; i < b.p.length; i++) {
      let a = b.p[i],
        q = b.p[(i + 1) % b.p.length],
        len = Math.hypot(q[0] - a[0], q[1] - a[1]);
      if (len < rules.minimumEdge) continue;
      const out = outwardOf(b, i, rules.sideProbe);
      if (!out) continue;
      const [nx, nz] = out,
        mx = (a[0] + q[0]) / 2,
        mz = (a[1] + q[1]) / 2;
      let road = nearestRoad(mx + nx, mz + nz);
      if (
        !road ||
        road.d > rules.maximumRoadDistance ||
        !rules.streets.includes(road.s.name) ||
        (road.x - mx) * nx + (road.z - mz) * nz < rules.minimumSetback
      )
        continue;
      let original =
        cx >= origMinX &&
        cx <= origMaxX &&
        cz >= origMinZ &&
        cz <= origMaxZ &&
        rules.originalStreets.includes(road.s.name);
      if (!b.detailType) b.newDetailOnly = !original;
      else if (original) b.newDetailOnly = false;
      b.detailType = 'street';
      facadeWork.fronts.push({
        id: `building-${buildingIndex}-edge-${i}`,
        buildingIndex,
        baseY: b.baseY,
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
  for (const building of world.facadeDesigns.buildings)
    composeBuilding(kit, world.facadeDesigns, building.id, { landmarks: world.city.landmarks });

  // Nearby residential and commercial frontages: varied plaster, framed openings, shutters and balconies.
  const frontContext = { residentialStreets: world.cityDesign.frontages.residentialStreets };
  for (const f of facadeWork.fronts)
    composeFront(kit, world.facadeDesigns, world.cityDesign.frontages.recipe, f, frontContext);
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
