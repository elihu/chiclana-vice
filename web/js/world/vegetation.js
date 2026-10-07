import * as THREE from '../../vendor/three.module.min.js';
import { TAU, lerp, pInside } from '../core/math.js';
import { gfx, streetEnvironment, world } from '../core/state.js';
import { inBuilding, nearestRoad } from './spatial.js';
import { mat } from '../engine/materials.js';
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
    root.add(mesh);
  }
  source.dispose();
}

export function buildTrees() {
  let vegetation = new THREE.Group();
  vegetation.name = 'vegetation-cells';
  gfx.scene.add(vegetation);
  // Densidad, separaciones y árboles de la plaza en web/city-design.json (sección `vegetation`).
  const rules = world.cityDesign.vegetation;
  let points = [...world.city.trees];
  for (const a of world.city.areas) {
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
        Math.abs(x) > world.worldW / 2 ||
        Math.abs(z) > world.worldH / 2 ||
        !pInside(x, z, a.p) ||
        inBuilding(x, z, rules.buildingClearance) ||
        !near ||
        near.d < near.s.width / 2 + rules.roadClearance ||
        points.some((p) => Math.hypot(x - p[0], z - p[1]) < rules.spacing)
      )
        continue;
      points.push([x, z]);
    }
  }
  // Street trees at the market plaza, kept off the carriageway and facades.
  const market = rules.marketTrees;
  for (let i = 0; i < market.count; i++) {
    let x = lerp(market.from[0], market.to[0], i / (market.count - 1)) + market.shift[0],
      z = lerp(market.from[1], market.to[1], i / (market.count - 1)) + market.shift[1];
    let near = nearestRoad(x, z);
    if (
      !inBuilding(x, z, market.buildingClearance) &&
      near &&
      near.d > near.s.width / 2 + market.roadClearance &&
      !streetEnvironment.colliders.some(
        (p) => Math.hypot(x - p.x, z - p.z) < market.colliderClearance,
      )
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
    for (let i = 0; i < a.p.length; i += rules.shrubEveryVertex) {
      let p = a.p[i],
        near = nearestRoad(...p);
      if (
        Math.abs(p[0]) > world.worldW / 2 ||
        Math.abs(p[1]) > world.worldH / 2 ||
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
