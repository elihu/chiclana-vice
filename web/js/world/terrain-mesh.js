import * as THREE from '../../vendor/three.module.min.js';
import { groundHeightAt } from '../engine/terrain-sampling.js';
import { world } from '../core/state.js';

export function terrainGeometry(terrain) {
  if (terrain.kind === 'flat') {
    const geo = new THREE.PlaneGeometry(world.worldW, world.worldH);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }
  if (world.surfaces) return surfaceGroundGeometry(terrain);
  const m = terrain.manifest,
    positions = [],
    uv = [],
    indices = [];
  for (let j = 0; j < m.rows; j++)
    for (let i = 0; i < m.columns; i++) {
      positions.push(
        -m.size[0] / 2 + i * m.step[0],
        terrain.data[j * m.columns + i],
        -m.size[1] / 2 + j * m.step[1],
      );
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

// Refina solo celdas con corredores, cauce o estructuras; bordes compartidos sin grietas.
function surfaceGroundGeometry(terrain) {
  const m = terrain.manifest,
    nx = m.columns - 1,
    nz = m.rows - 1,
    sub = world.surfaces.meshSubdivisions,
    fine = new Uint8Array(nx * nz),
    positions = [],
    uv = [],
    indices = [],
    vertices = new Map();
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = -m.size[0] / 2 + (i + 0.5) * m.step[0],
        z = -m.size[1] / 2 + (j + 0.5) * m.step[1];
      fine[j * nx + i] = world.surfaces.affectedAt(x, z) ? 1 : 0;
    }
  const vertex = (i, j) => {
    const key = i + ',' + j;
    if (vertices.has(key)) return vertices.get(key);
    const x = -m.size[0] / 2 + (i * m.step[0]) / sub,
      z = -m.size[1] / 2 + (j * m.step[1]) / sub,
      k = positions.length / 3;
    positions.push(x, groundHeightAt(x, z), z);
    uv.push(i / (nx * sub), 1 - j / (nz * sub));
    vertices.set(key, k);
    return k;
  };
  const isFine = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && fine[j * nx + i];
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      if (isFine(i, j)) {
        for (let y = 0; y < sub; y++)
          for (let x = 0; x < sub; x++) {
            const a = vertex(i * sub + x, j * sub + y),
              b = vertex(i * sub + x + 1, j * sub + y),
              c = vertex(i * sub + x, j * sub + y + 1),
              d = vertex(i * sub + x + 1, j * sub + y + 1);
            indices.push(a, d, b, a, c, d);
          }
      } else {
        const boundary = [],
          edges = [
            [[0, 0], [sub, 0], isFine(i, j - 1)],
            [[sub, 0], [sub, sub], isFine(i + 1, j)],
            [[sub, sub], [0, sub], isFine(i, j + 1)],
            [[0, sub], [0, 0], isFine(i - 1, j)],
          ];
        for (const [a, b, split] of edges)
          for (let k = 0, count = split ? sub : 1; k < count; k++)
            boundary.push(
              vertex(
                i * sub + a[0] + ((b[0] - a[0]) * k) / count,
                j * sub + a[1] + ((b[1] - a[1]) * k) / count,
              ),
            );
        const center = vertex((i + 0.5) * sub, (j + 0.5) * sub);
        for (let k = 0; k < boundary.length; k++)
          indices.push(center, boundary[(k + 1) % boundary.length], boundary[k]);
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

// Anillo exterior: conserva cotas reales en el borde y transiciona a una cota decorativa.
export function terrainExterior(terrain) {
  const g = new THREE.BufferGeometry(),
    positions = [],
    indices = [],
    m = terrain.manifest,
    perimeter = [];
  if (!m) return null;
  for (let i = 0; i < m.columns; i++)
    perimeter.push([-m.size[0] / 2 + i * m.step[0], -m.size[1] / 2]);
  for (let j = 1; j < m.rows; j++) perimeter.push([m.size[0] / 2, -m.size[1] / 2 + j * m.step[1]]);
  for (let i = m.columns - 2; i >= 0; i--)
    perimeter.push([-m.size[0] / 2 + i * m.step[0], m.size[1] / 2]);
  for (let j = m.rows - 2; j > 0; j--)
    perimeter.push([-m.size[0] / 2, -m.size[1] / 2 + j * m.step[1]]);
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
