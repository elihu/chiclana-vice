import { insideBounds } from './bounds.js';
import { surfaceHeightAt } from '../engine/terrain-sampling.js';
import * as THREE from '../../vendor/three.webgpu.min.js';
import { TAU, clamp, lerp, pInside } from '../core/math.js';
import { detailCells, gfx, streetEnvironment, world } from '../core/state.js';
import { addCollider, someCollider, inBuilding, nearestRoad } from './spatial.js';
import { mat, mergeParts, shareInstanceShader } from '../engine/materials.js';
import { foliageMaterial } from '../engine/foliage.js';
import { createRoadSpace } from './road-space.js';
import { rnd } from '../core/random.js';

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
    shareInstanceShader(mesh);
    root.add(mesh);
    const sphere = mesh.boundingSphere;
    detailCells.push({
      object: mesh,
      x: sphere.center.x,
      z: sphere.center.z,
      radius: sphere.radius,
      kind: 'vegetation',
    });
  }
  source.dispose();
}

export function buildTrees() {
  const started = performance.now();
  let vegetation = new THREE.Group();
  vegetation.name = 'vegetation-cells';
  gfx.scene.add(vegetation);
  // Densidad, separaciones y árboles de la plaza en web/city-design.json (sección `vegetation`).
  const rules = world.cityDesign.vegetation;
  const layer = world.vegetation;
  if (layer && (layer.version !== 1 || !Array.isArray(layer.trees)))
    throw Error('Capa de vegetación incompatible');
  let points = (layer?.trees ?? []).map((p) => {
    if (p.length !== 3 || !p.every(Number.isFinite) || p[2] <= 0) throw Error('Copa incompatible');
    return p;
  });
  const counts = { layer: points.length, osm: 0, market: 0, park: 0 };
  const nearTree = (x, z) =>
    points.some((p) => Math.hypot(x - p[0], z - p[1]) < Math.max(rules.spacing, p[2] ?? 0));
  for (const p of world.city.trees) {
    if (layer && nearTree(...p)) continue;
    points.push(p);
    counts.osm++;
  }
  // Con la capa de copas, los parques ya tienen sus árboles: no se rellenan al azar.
  for (const a of layer ? [] : world.city.areas) {
    if (a.kind !== 'park' || a.p.length < 3) continue;
    let xs = a.p.map((p) => p[0]),
      zs = a.p.map((p) => p[1]),
      mnx = Math.min(...xs),
      mxx = Math.max(...xs),
      mnz = Math.min(...zs),
      mxz = Math.max(...zs);
    for (
      let i = 0;
      i < Math.min(rules.parkMaximum, ((mxx - mnx) * (mxz - mnz)) / rules.parkDensity);
      i++
    ) {
      let x = lerp(mnx, mxx, rnd()),
        z = lerp(mnz, mxz, rnd()),
        near = nearestRoad(x, z);
      if (
        !insideBounds(x, z) ||
        !pInside(x, z, a.p) ||
        inBuilding(x, z, rules.buildingClearance) ||
        !near ||
        near.d < near.s.width / 2 + rules.roadClearance ||
        nearTree(x, z)
      )
        continue;
      points.push([x, z]);
      counts.park++;
    }
  }
  // Street trees at the market plaza, kept off the carriageway and facades.
  const market = rules.marketTrees;
  for (let i = 0; i < market.count; i++) {
    let x = lerp(market.from[0], market.to[0], i / (market.count - 1)) + market.shift[0],
      z = lerp(market.from[1], market.to[1], i / (market.count - 1)) + market.shift[1];
    let near = nearestRoad(x, z);
    if (
      (!layer || !nearTree(x, z)) &&
      !inBuilding(x, z, market.buildingClearance) &&
      near &&
      near.d > near.s.width / 2 + market.roadClearance &&
      !someCollider(
        x,
        z,
        market.colliderClearance,
        (p) => Math.hypot(x - p.x, z - p.z) < market.colliderClearance,
      )
    ) {
      points.push([x, z]);
      counts.market++;
    }
  }
  // También las calles peatonales y caminos tienen pavimento transitable.
  const roadSpace = createRoadSpace(world.city.roads, []);
  counts.removedOnRoad = 0;
  let woodK = 0;
  const branchGeometry = new THREE.CylinderGeometry(0.045, 0.09, 2, 5),
    trunkGeometry = new THREE.CylinderGeometry(0.13, 0.23, 3.3, 7),
    parts = [{ geometry: trunkGeometry, matrix: new THREE.Matrix4() }],
    branch = new THREE.Object3D();
  // Transformación de cada rama relativa al centro del tronco, antes de aplicar size.
  for (let j = 0; j < 3; j++) {
    const a = (j * TAU) / 3;
    branch.position.set(0.5 * Math.cos(a), 3.3 * 0.84 - 3.3 / 2, 0.5 * Math.sin(a));
    branch.rotation.set(0.55 * Math.cos(a), 0, 0.55 * Math.sin(a));
    branch.updateMatrix();
    parts.push({ geometry: branchGeometry, matrix: branch.matrix.clone() });
  }
  const woodGeometry = mergeParts(parts);
  trunkGeometry.dispose();
  branchGeometry.dispose();
  let wood = new THREE.InstancedMesh(woodGeometry, mat('#786d57'), points.length),
    crowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      foliageMaterial(),
      points.length * 5,
    ),
    smallCrowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      crowns.material,
      points.filter((p) => p.length === 3 && p[2] <= 2).length * 5,
    ),
    dummy = new THREE.Object3D(),
    color = new THREE.Color();
  let k = 0,
    smallK = 0;
  points.forEach((p) => {
    const keep = !roadSpace.covers(p[0], p[1], 0.25);
    if (!keep) counts.removedOnRoad++;
    let randomSize = 0.8 + rnd() * 0.55,
      size = p.length === 3 ? clamp(p[2] / 1.6, 0.6, 1.8) : randomSize,
      h = 3.3 * size,
      baseY = surfaceHeightAt(p[0], p[1]);
    dummy.position.set(p[0], baseY + h / 2, p[1]);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(size, size, size);
    dummy.updateMatrix();
    if (keep) wood.setMatrixAt(woodK++, dummy.matrix);
    const small = p.length === 3 && p[2] <= 2,
      crownMesh = small ? smallCrowns : crowns;
    for (let j = 0; j < 5; j++) {
      let angle = (j * TAU) / 5 + rnd() * 0.3,
        rad = j === 4 ? 0 : 1.05 * size;
      dummy.position.set(
        p[0] + Math.cos(angle) * rad,
        baseY + h + 0.7 * size + (j === 4 ? 0.9 : 0),
        p[1] + Math.sin(angle) * rad,
      );
      dummy.rotation.set(rnd(), rnd(), rnd());
      dummy.scale.set(
        (1.4 + rnd() * 0.35) * size,
        (1.4 + rnd() * 0.4) * size,
        (1.4 + rnd() * 0.35) * size,
      );
      dummy.updateMatrix();
      // Consumir el mismo azar incluso en árboles retirados conserva los demás actores.
      color.setHSL(0.23 + rnd() * 0.08, 0.18 + rnd() * 0.13, 0.24 + rnd() * 0.13);
      if (keep) {
        const index = small ? smallK++ : k++;
        crownMesh.setMatrixAt(index, dummy.matrix);
        crownMesh.setColorAt(index, color);
      }
    }
    if (keep && !someCollider(p[0], p[1], 1, (o) => Math.hypot(o.x - p[0], o.z - p[1]) < 1))
      addCollider({
        x: p[0],
        z: p[1],
        r: 0.23 * size,
        y: baseY,
      });
  });
  wood.count = woodK;
  crowns.count = k;
  smallCrowns.count = smallK;
  wood.castShadow = crowns.castShadow = smallCrowns.castShadow = true;
  crowns.receiveShadow = smallCrowns.receiveShadow = true;
  addVegetationCells(vegetation, wood, 'wood');
  addVegetationCells(vegetation, crowns, 'crowns');
  addVegetationCells(vegetation, smallCrowns, 'crowns-small');
  streetEnvironment.trees = woodK;
  // Low shrubs use the same compact instancing approach in mapped green areas.
  // Copas bajas de la capa (ver tools/export-vegetation.mjs): arbustos a su tamaño.
  const layerShrubs = (layer?.shrubs ?? []).map((p) => {
    if (p.length !== 3 || !p.every(Number.isFinite) || p[2] <= 0)
      throw Error('Arbusto incompatible');
    return p;
  });
  const shrubs = [];
  for (const a of world.city.areas) {
    if (a.kind !== 'park') continue;
    for (let i = 0; i < a.p.length; i += rules.shrubEveryVertex) {
      let p = a.p[i],
        near = nearestRoad(...p);
      if (
        !insideBounds(p[0], p[1]) ||
        inBuilding(...p, rules.shrubBuildingClearance) ||
        !near ||
        near.d < near.s.width / 2 + rules.shrubRoadClearance
      )
        continue;
      shrubs.push(p);
    }
  }
  let leaves = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    mat('#667f51'),
    shrubs.length + layerShrubs.length,
  );
  shrubs.forEach((p, i) => {
    dummy.position.set(p[0], surfaceHeightAt(...p) + 0.42, p[1]);
    dummy.rotation.set(0, i, 0);
    dummy.scale.set(0.8, 0.55, 0.75);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  });
  layerShrubs.forEach(([x, z, r], i) => {
    const w = clamp(r * 0.8, 0.6, 2.4),
      h = clamp(r * 0.45, 0.45, 1.2);
    dummy.position.set(x, surfaceHeightAt(x, z) + h * 0.75, z);
    dummy.rotation.set(0, i, 0);
    dummy.scale.set(w, h, w * 0.92);
    dummy.updateMatrix();
    leaves.setMatrixAt(shrubs.length + i, dummy.matrix);
  });
  // Arbustos de menos de 1,2 m: su sombra sobre el césped no se distingue.
  leaves.castShadow = false;
  addVegetationCells(vegetation, leaves, 'shrubs');
  streetEnvironment.treeSources = counts;
  streetEnvironment.treeBuildMs = performance.now() - started;
}
