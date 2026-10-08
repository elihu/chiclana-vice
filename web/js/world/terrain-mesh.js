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
