import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';
import { shareInstanceShader } from '../engine/materials.js';

// Todos los coches de un tipo se dibujan con una InstancedMesh por ranura de material (carrocería,
// cristal, aros…) en vez de un grupo de mallas por coche: las llamadas de dibujo dejan de crecer
// con el número de coches. Cada coche conserva su `mesh` (un Group vacío salvo la sirena) como
// ancla de posición y rumbo; antes de dibujar, `syncCarBatches` copia su matriz a las instancias
// de los coches que pueden verse. Las ranuras `tinted` llevan el color de cada coche como color
// de instancia (el material es blanco); las `cabin` se omiten con la primera persona.
const MARGIN = 20, // m: deja dentro la sombra de un coche justo fuera de campo
  RADIUS = 3,
  pools = new Map(),
  frustum = new THREE.Frustum(),
  projection = new THREE.Matrix4(),
  inverse = new THREE.Matrix4(),
  sphere = new THREE.Sphere(),
  white = new THREE.Color('#ffffff');
let hooked = false;

function buildMeshes(pool, capacity) {
  for (const old of pool.meshes) {
    gfx.scene.remove(old);
    old.dispose();
  }
  pool.capacity = capacity;
  pool.meshes = pool.slots.map(({ slot, material, geometry, receive, cast, tinted, cabin }) => {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = 'vehicles-' + pool.key + '-' + slot;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.frustumCulled = false; // solo se cargan los coches visibles
    mesh.count = 0;
    mesh.visible = false;
    mesh.userData.slot = { tinted, cabin };
    if (tinted) mesh.setColorAt(0, white);
    shareInstanceShader(mesh);
    gfx.scene.add(mesh);
    return mesh;
  });
}

// `makeSlots()`: [{ slot, material, geometry, receive, cast, tinted, cabin }] del tipo de coche,
// que solo se calcula al crear el primero.
export function registerCar(key, makeSlots, car) {
  if (!hooked) {
    gfx.scene.onBeforeRender = syncCarBatches;
    hooked = true;
  }
  let pool = pools.get(key);
  if (!pool) {
    pool = { key, slots: makeSlots(), cars: new Set(), meshes: [], capacity: 0 };
    pools.set(key, pool);
    buildMeshes(pool, 16);
  }
  pool.cars.add(car);
  if (pool.cars.size > pool.capacity) buildMeshes(pool, pool.capacity * 2);
}

export function releaseCar(car) {
  for (const pool of pools.values()) pool.cars.delete(car);
}

export function syncCarBatches(renderer, scene, camera) {
  if (camera !== gfx.camera) return;
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(
    projection.multiplyMatrices(camera.projectionMatrix, inverse.copy(camera.matrixWorld).invert()),
  );
  sphere.radius = RADIUS + MARGIN;
  for (const pool of pools.values()) {
    const visible = [];
    for (const car of pool.cars) {
      const group = car.mesh;
      if (!group.visible || group.parent !== gfx.scene) continue;
      group.updateMatrixWorld();
      sphere.center.setFromMatrixPosition(group.matrixWorld).y += 0.8;
      if (frustum.intersectsSphere(sphere)) visible.push(car);
    }
    for (const mesh of pool.meshes) {
      const { tinted, cabin } = mesh.userData.slot;
      let n = 0;
      for (const car of visible) {
        if (cabin && car.cabinHidden) continue;
        mesh.setMatrixAt(n, car.mesh.matrixWorld);
        if (tinted) mesh.setColorAt(n, car.paintColor);
        n++;
      }
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (tinted) mesh.instanceColor.needsUpdate = true;
    }
  }
}
