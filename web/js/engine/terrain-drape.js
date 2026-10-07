// Corta triángulos de pavimento contra cada triángulo del MDT: evita interiores enterrados.
import { world } from '../core/state.js';
import { surfaceHeightAt } from './terrain-sampling.js';

export function terrainEdge(a, b) {
  const m = world.terrain?.manifest;
  if (!m) return [a, b];
  const ts = [0, 1],
    dx = b[0] - a[0],
    dz = b[1] - a[1];
  const firstX = Math.max(0, Math.ceil((Math.min(a[0], b[0]) + m.size[0] / 2) / m.step[0])),
    lastX = Math.min(m.columns - 1, Math.floor((Math.max(a[0], b[0]) + m.size[0] / 2) / m.step[0])),
    firstZ = Math.max(0, Math.ceil((Math.min(a[1], b[1]) + m.size[1] / 2) / m.step[1])),
    lastZ = Math.min(m.rows - 1, Math.floor((Math.max(a[1], b[1]) + m.size[1] / 2) / m.step[1]));
  for (let i = firstX; i <= lastX; i++) {
    const t = (-m.size[0] / 2 + i * m.step[0] - a[0]) / dx;
    if (t > 0 && t < 1) ts.push(t);
  }
  for (let j = firstZ; j <= lastZ; j++) {
    const t = (-m.size[1] / 2 + j * m.step[1] - a[1]) / dz;
    if (t > 0 && t < 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const extra = [];
  for (let k = 1; k < ts.length; k++) {
    const t0 = ts[k - 1],
      t1 = ts[k],
      mid = (t0 + t1) / 2,
      gx = (a[0] + dx * mid + m.size[0] / 2) / m.step[0],
      gz = (a[1] + dz * mid + m.size[1] / 2) / m.step[1],
      constant =
        (a[0] + m.size[0] / 2) / m.step[0] -
        Math.floor(gx) -
        ((a[1] + m.size[1] / 2) / m.step[1] - Math.floor(gz)),
      t = -constant / (dx / m.step[0] - dz / m.step[1]);
    if (t > t0 && t < t1) extra.push(t);
  }
  return [...ts, ...extra].sort((x, y) => x - y).map((t) => [a[0] + dx * t, a[1] + dz * t]);
}

function clip(poly, a, b) {
  const side = (p) => (b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length],
      dp = side(p),
      dq = side(q);
    if (dp >= -1e-8) out.push(p);
    if (dp < 0 !== dq < 0) {
      const t = dp / (dp - dq);
      out.push(p.map((v, k) => v + (q[k] - v) * t));
    }
  }
  return out;
}

export function drapeTriangles(position, uv = null, heightSampler = surfaceHeightAt) {
  if (world.terrain?.kind !== 'grid') return { position, uv };
  const m = world.terrain.manifest,
    result = [],
    tex = uv ? [] : null;
  for (let k = 0; k < position.length; k += 9) {
    const polygon = [0, 1, 2].map((i) => [
        position[k + i * 3],
        position[k + i * 3 + 1],
        position[k + i * 3 + 2],
        ...(uv ? uv.slice((k / 3) * 2 + i * 2, (k / 3) * 2 + i * 2 + 2) : []),
      ]),
      xs = polygon.map((p) => p[0]),
      zs = polygon.map((p) => p[2]),
      ix = (x) => Math.max(0, Math.min(m.columns - 2, Math.floor((x + m.size[0] / 2) / m.step[0]))),
      jz = (z) => Math.max(0, Math.min(m.rows - 2, Math.floor((z + m.size[1] / 2) / m.step[1])));
    for (let j = jz(Math.min(...zs)); j <= jz(Math.max(...zs)); j++)
      for (let i = ix(Math.min(...xs)); i <= ix(Math.max(...xs)); i++) {
        const x = -m.size[0] / 2 + i * m.step[0],
          z = -m.size[1] / 2 + j * m.step[1],
          a = [x, z],
          b = [x + m.step[0], z],
          c = [x, z + m.step[1]],
          d = [x + m.step[0], z + m.step[1]];
        for (const cell of [
          [a, b, d],
          [a, d, c],
        ]) {
          let p = polygon;
          for (let edge = 0; edge < 3 && p.length; edge++)
            p = clip(p, cell[edge], cell[(edge + 1) % 3]);
          for (let n = 1; n + 1 < p.length; n++)
            for (const v of [p[0], p[n], p[n + 1]]) {
              result.push(v[0], v[1] + heightSampler(v[0], v[2]), v[2]);
              if (tex) tex.push(v[3], v[4]);
            }
        }
      }
  }
  return { position: result, uv: tex };
}
