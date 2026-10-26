import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';

export function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...extra });
}

// three.js 0.186 declara las matrices de un InstancedMesh como un búfer uniforme con su
// nombre dentro del shader mientras `instanceMatrix.count * 64` cabe en el límite del
// dispositivo, y entonces cada malla instanciada tiene su propio programa. Por encima del
// límite las lee de un atributo instanciado y el shader se comparte. Para no reservar memoria
// que no se usa, se declara a la matriz una capacidad mayor que ese límite: el atributo
// conserva su `array` real (el búfer instanciado sale de él) y `mesh.count` sigue mandando en
// las instancias que se dibujan. Llamar antes del primer render.
export function shareInstanceShader(mesh) {
  const limit = gfx.renderer?.backend?.capabilities?.getUniformBufferLimit?.() ?? 1 << 16;
  mesh.instanceMatrix.count = Math.max(mesh.instanceMatrix.count, Math.floor(limit / 64) + 1);
  return mesh;
}

export function flatGeometry(p, holes = []) {
  let shape = new THREE.Shape(p.map((v) => new THREE.Vector2(v[0], -v[1])));
  shape.holes = holes.map((h) => new THREE.Path(h.map((v) => new THREE.Vector2(v[0], -v[1]))));
  let geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function flatPolygon(p, y, material, holes = []) {
  let mesh = new THREE.Mesh(flatGeometry(p, holes), material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

// Model geometry/materials are immutable and shared; transforms stay on each mesh.
const modelGeometryCache = new Map(),
  modelMaterialCache = new Map();

export function modelGeometry(key, create) {
  if (!modelGeometryCache.has(key)) modelGeometryCache.set(key, create());
  return modelGeometryCache.get(key);
}

export function modelMaterial(color, extra = {}) {
  let key = JSON.stringify([color, extra]);
  if (!modelMaterialCache.has(key)) modelMaterialCache.set(key, mat(color, extra));
  return modelMaterialCache.get(key);
}

export function modelCylinder(top, bottom, height, segments) {
  return modelGeometry(
    'cylinder:' + top + ',' + bottom + ',' + height + ',' + segments,
    () => new THREE.CylinderGeometry(top, bottom, height, segments),
  );
}

export function modelBox(w, h, l, material, x = 0, y = 0, z = 0) {
  let g = modelGeometry('box:' + w + ',' + h + ',' + l, () => new THREE.BoxGeometry(w, h, l)),
    m = new THREE.Mesh(g, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function bevelGeometry(w, h, l, bevel) {
  return modelGeometry('bevel:' + w + ',' + h + ',' + l + ',' + bevel, () => {
    let shape = new THREE.Shape();
    shape.moveTo(-w / 2 + bevel, -l / 2 + bevel);
    shape.lineTo(w / 2 - bevel, -l / 2 + bevel);
    shape.lineTo(w / 2 - bevel, l / 2 - bevel);
    shape.lineTo(-w / 2 + bevel, l / 2 - bevel);
    shape.closePath();
    let g = new THREE.ExtrudeGeometry(shape, {
      depth: h - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 1,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -h / 2 + bevel, 0);
    return g;
  });
}

export function sculptedBox(w, h, l, material, x, y, z, bevel = 0.06) {
  let mesh = new THREE.Mesh(bevelGeometry(w, h, l, bevel), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

// Merge transformed parts (position + normal) into one indexed geometry; mirrored parts keep winding.
export function mergeParts(parts) {
  let vertices = 0,
    indices = 0;
  for (const { geometry } of parts) {
    vertices += geometry.attributes.position.count;
    indices += geometry.index ? geometry.index.count : geometry.attributes.position.count;
  }
  const position = new Float32Array(vertices * 3),
    normal = new Float32Array(vertices * 3),
    index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
    v = new THREE.Vector3(),
    normalMatrix = new THREE.Matrix3();
  let base = 0,
    at = 0;
  for (const { geometry, matrix } of parts) {
    const pos = geometry.attributes.position,
      nor = geometry.attributes.normal,
      source = geometry.index,
      count = source ? source.count : pos.count,
      order = matrix.determinant() < 0 ? [0, 2, 1] : [0, 1, 2];
    normalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
        .applyMatrix4(matrix)
        .toArray(position, (base + i) * 3);
      v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      v.toArray(normal, (base + i) * 3);
    }
    for (let i = 0; i < count; i += 3)
      for (let j = 0; j < 3; j++) {
        let k = i + order[j];
        index[at + i + j] = base + (source ? source.getX(k) : k);
      }
    base += pos.count;
    at += count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// Static pieces of a model are grouped by slot (one material each) and merged once per key;
// all instances share the cached geometry, keeping one draw call per material.
export function modelParts() {
  const slots = new Map(),
    euler = new THREE.Euler(),
    quaternion = new THREE.Quaternion(),
    offset = new THREE.Vector3(),
    size = new THREE.Vector3();
  return {
    add(slot, material, geometry, x = 0, y = 0, z = 0, rotation = [0, 0, 0], scale = [1, 1, 1]) {
      if (!slots.has(slot)) slots.set(slot, { material, parts: [] });
      quaternion.setFromEuler(euler.set(...rotation));
      slots.get(slot).parts.push({
        geometry,
        matrix: new THREE.Matrix4().compose(offset.set(x, y, z), quaternion, size.set(...scale)),
      });
    },
    box(slot, material, w, h, l, x, y, z) {
      this.add(
        slot,
        material,
        modelGeometry('box:' + w + ',' + h + ',' + l, () => new THREE.BoxGeometry(w, h, l)),
        x,
        y,
        z,
      );
    },
    // Una pieza fusionada por ranura, con la geometría compartida en caché por `key`.
    slotMeshes(key) {
      return [...slots].map(([slot, { material, parts }]) => ({
        slot,
        material,
        geometry: modelGeometry('merged:' + key + ':' + slot, () => mergeParts(parts)),
      }));
    },
    // `noCast`: ranuras demasiado pequeñas o pegadas a la carrocería para dar sombra visible.
    attach(parent, key, receive = [], noCast = []) {
      for (const { slot, material, geometry } of this.slotMeshes(key)) {
        const m = new THREE.Mesh(geometry, material);
        m.castShadow = !noCast.includes(slot);
        m.receiveShadow = receive.includes(slot);
        parent.add(m);
      }
    },
  };
}
