import { gridX, gridZ } from '../core/math.js';
import * as THREE from '../../vendor/three.module.min.js';
import { groundHeightAt } from '../engine/terrain-sampling.js';
import { world } from '../core/state.js';

export function terrainGeometry(terrain) {
  if (terrain.kind === 'flat') {
    const geo = new THREE.PlaneGeometry(world.worldW, world.worldH);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }
  terrain = world.surfaces?.meshTerrain ?? terrain;
  const m = terrain.manifest,
    positions = [],
    uv = [],
    indices = [];
  for (let j = 0; j < m.rows; j++)
    for (let i = 0; i < m.columns; i++) {
      positions.push(gridX(m, i), terrain.data[j * m.columns + i], gridZ(m, j));
      uv.push(i / (m.columns - 1), 1 - j / (m.rows - 1));
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
