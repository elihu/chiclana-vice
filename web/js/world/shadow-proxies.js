import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';

// Sustitutos de sombra. El mapa de sombras del sol solo necesita la silueta de lo que bloquea
// la luz, no el detalle que se ve en el pase principal. Aquí se copian los proyectores
// estáticos grandes (muros, tejados, fachadas) a geometría solo de posición, un material por
// cara visible y una malla por celda de unos 160 m, y las copas de los árboles a una esfera de
// 20 triángulos que comparte las matrices de instancia con la original. Los sustitutos están
// en una capa que solo ve la cámara de sombra; las originales dejan de proyectar.
export const SHADOW_LAYER = 1;
const CELL = 160,
  // Facetas de fachada por debajo de este área (m²) quedan por debajo del texel del mapa
  // (unos 15 cm) y suponen ~1 % del área proyectada.
  MIN_FACADE_AREA = 0.02,
  CROWN_SCALE = 0.92,
  STATIC =
    /^building-(plain-)?walls$|^building-roofs$|^facade-cell-|^urban-furniture$|^street-sign-posts$|^bridge-decks$/;

function isStatic(object) {
  for (let o = object; o; o = o.parent) if (STATIC.test(o.name)) return true;
  return false;
}

export function buildShadowProxies() {
  const scene = gfx.scene,
    sun = gfx.sun,
    group = new THREE.Group(),
    materials = new Map(),
    cells = new Map(),
    sources = [],
    crowns = [];
  group.name = 'shadow-proxies';
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || !o.castShadow || o.isSkinnedMesh) return;
    if (o.isInstancedMesh) {
      if (o.name.startsWith('vegetation-crowns-') && !o.name.startsWith('vegetation-crowns-small'))
        crowns.push(o);
    } else if (isStatic(o)) sources.push(o);
  });
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    stats = {
      sourceMeshes: sources.length,
      sourceTriangles: 0,
      triangles: 0,
      crowns: crowns.length,
    };
  for (const mesh of sources) {
    const position = mesh.geometry.getAttribute('position'),
      index = mesh.geometry.index,
      count = (index ? index.count : position.count) / 3,
      minArea = mesh.name.startsWith('facade-cell-') ? MIN_FACADE_AREA : 0,
      side = mesh.material.side;
    for (let t = 0; t < count; t++) {
      const at = (k) => (index ? index.getX(t * 3 + k) : t * 3 + k);
      a.fromBufferAttribute(position, at(0)).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, at(1)).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, at(2)).applyMatrix4(mesh.matrixWorld);
      stats.sourceTriangles++;
      if (minArea && ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() < 2 * minArea)
        continue;
      const key =
        side +
        '|' +
        Math.floor((a.x + b.x + c.x) / 3 / CELL) +
        ',' +
        Math.floor((a.z + b.z + c.z) / 3 / CELL);
      let cell = cells.get(key);
      if (!cell) cells.set(key, (cell = []));
      cell.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      stats.triangles++;
    }
  }
  const proxyMaterial = (side) => {
    if (!materials.has(side)) materials.set(side, new THREE.MeshBasicMaterial({ side }));
    return materials.get(side);
  };
  for (const [key, values] of cells) {
    const [side, cell] = key.split('|'),
      geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(values), 3));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, proxyMaterial(Number(side)));
    mesh.name = 'shadow-proxy-' + side + '@' + cell;
    mesh.layers.set(SHADOW_LAYER);
    mesh.castShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  for (const source of sources) source.castShadow = false;
  // Copas: icosaedro de 20 triángulos con las mismas matrices que la malla de 80.
  if (crowns.length) {
    const geometry = new THREE.IcosahedronGeometry(CROWN_SCALE, 0),
      material = proxyMaterial(crowns[0].material.side);
    for (const source of crowns) {
      const mesh = new THREE.InstancedMesh(geometry, material, source.count);
      mesh.instanceMatrix = source.instanceMatrix;
      mesh.name = 'shadow-proxy-' + source.name.replace('vegetation-', '');
      mesh.layers.set(SHADOW_LAYER);
      mesh.castShadow = true;
      mesh.frustumCulled = source.frustumCulled;
      if (!source.boundingSphere) source.computeBoundingSphere();
      mesh.boundingSphere = source.boundingSphere.clone();
      mesh.boundingBox = (
        source.boundingBox ?? (source.computeBoundingBox(), source.boundingBox)
      ).clone();
      group.add(mesh);
      source.castShadow = false;
    }
  }
  group.userData.stats = stats;
  scene.add(group);
  sun.shadow.camera.layers.enable(SHADOW_LAYER);
  return stats;
}
