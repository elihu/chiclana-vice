import { boundsBox } from './bounds.js';
import { gridX, gridZ } from '../core/math.js';
import * as THREE from '../../vendor/three.module.min.js';
import { groundHeightAt } from '../engine/terrain-sampling.js';
import { world } from '../core/state.js';

export function terrainGeometry(terrain) {
  if (terrain.kind === 'flat') {
    const [x0, x1, z0, z1] = boundsBox(),
      geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    geo.rotateX(-Math.PI / 2);
    if (x0 + x1 !== 0 || z0 + z1 !== 0) geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const [ax0, ax1, az0, az1] = world.aerialBox;
    if (ax0 !== x0 || ax1 !== x1 || az0 !== z0 || az1 !== z1) {
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < uv.count; i++)
        uv.setXY(
          i,
          (x0 + uv.getX(i) * (x1 - x0) - ax0) / (ax1 - ax0),
          1 - (z0 + (1 - uv.getY(i)) * (z1 - z0) - az0) / (az1 - az0),
        );
    }
    return geo;
  }
  terrain = world.surfaces?.meshTerrain ?? terrain;
  const [x0, x1, z0, z1] = world.aerialBox,
    m = terrain.manifest,
    positions = [],
    uv = [],
    indices = [];
  for (let j = 0; j < m.rows; j++)
    for (let i = 0; i < m.columns; i++) {
      positions.push(gridX(m, i), terrain.data[j * m.columns + i], gridZ(m, j));
      uv.push((gridX(m, i) - x0) / (x1 - x0), 1 - (gridZ(m, j) - z0) / (z1 - z0));
      if (i + 1 < m.columns && j + 1 < m.rows) {
        const a = j * m.columns + i,
          b = a + 1,
          c = a + m.columns,
          d = c + 1;
        indices.push(a, d, b, a, c, d);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// Las normales proceden de la malla completa: duplicar vértices de borde no cambia
// su posición ni su iluminación. Cada triángulo pertenece a una única tesela.
export function terrainTiles(terrain) {
  const size = world.aerialIndex?.tile ?? 255;
  if (terrain.kind === 'flat') {
    const [x0, x1, z0, z1] = boundsBox(),
      tiles = [];
    const [ax0, ax1, az0, az1] = world.aerialBox;
    for (let j = Math.floor(z0 / size); j < Math.ceil(z1 / size); j++)
      for (let i = Math.floor(x0 / size); i < Math.ceil(x1 / size); i++) {
        const left = Math.max(x0, i * size),
          right = Math.min(x1, (i + 1) * size);
        const top = Math.max(z0, j * size),
          bottom = Math.min(z1, (j + 1) * size);
        const geometry = new THREE.PlaneGeometry(right - left, bottom - top);
        geometry.rotateX(-Math.PI / 2);
        geometry.translate((left + right) / 2, 0, (top + bottom) / 2);
        const pos = geometry.getAttribute('position'),
          uv = geometry.getAttribute('uv');
        for (let k = 0; k < pos.count; k++)
          uv.setXY(k, (pos.getX(k) - ax0) / (ax1 - ax0), 1 - (pos.getZ(k) - az0) / (az1 - az0));
        geometry.computeBoundingSphere();
        tiles.push({ i, j, geometry });
      }
    return tiles;
  }
  const full = terrainGeometry(terrain),
    groups = new Map();
  const position = full.getAttribute('position'),
    index = full.index;
  for (let k = 0; k < index.count; k += 3) {
    const vertices = [index.getX(k), index.getX(k + 1), index.getX(k + 2)];
    const i = Math.floor(vertices.reduce((s, v) => s + position.getX(v), 0) / 3 / size);
    const j = Math.floor(vertices.reduce((s, v) => s + position.getZ(v), 0) / 3 / size);
    const key = `${i}_${j}`;
    if (!groups.has(key)) groups.set(key, { i, j, vertices: [] });
    groups.get(key).vertices.push(...vertices);
  }
  const tiles = [];
  for (const { i, j, vertices } of groups.values()) {
    const geometry = new THREE.BufferGeometry(),
      remap = new Map(),
      indices = [];
    for (const v of vertices) {
      if (!remap.has(v)) remap.set(v, remap.size);
      indices.push(remap.get(v));
    }
    for (const name of ['position', 'normal', 'uv']) {
      const attribute = full.getAttribute(name),
        values = [];
      for (const v of remap.keys())
        for (let component = 0; component < attribute.itemSize; component++)
          values.push(attribute.array[v * attribute.itemSize + component]);
      geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
    }
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    tiles.push({ i, j, geometry });
  }
  full.dispose();
  return tiles;
}

export function terrainExterior(terrain) {
  const g = new THREE.BufferGeometry(),
    positions = [],
    indices = [],
    m = terrain.manifest,
    perimeter = [];
  if (!m) return null;
  for (let i = 0; i < m.columns; i++) perimeter.push([gridX(m, i), m.bounds[2]]);
  for (let j = 1; j < m.rows; j++) perimeter.push([m.bounds[1], gridZ(m, j)]);
  for (let i = m.columns - 2; i >= 0; i--) perimeter.push([gridX(m, i), m.bounds[3]]);
  for (let j = m.rows - 2; j > 0; j--) perimeter.push([m.bounds[0], gridZ(m, j)]);
  for (const [x, z] of perimeter) {
    positions.push(x, groundHeightAt(x, z) - 0.01, z, x * 8, 0, z * 8);
  }
  for (let i = 0; i < perimeter.length; i++) {
    const a = i * 2,
      b = ((i + 1) % perimeter.length) * 2;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
