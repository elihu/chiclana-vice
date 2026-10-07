import { pInside } from '../core/math.js';
import { world } from '../core/state.js';
import { groundHeightAt } from '../engine/terrain-sampling.js';
import { terrainEdge } from '../engine/terrain-drape.js';

export function prepareTerrainPlacement() {
  const bridges = new Map();
  world.bridgeGrid = bridges;
  for (const r of world.city.roads) {
    if (!r.bridge) continue;
    // Perfil de aproximación: une cotas de ambos accesos, sin inventar profundidad del río.
    const lengths = r.p.slice(1).map((b, i) => Math.hypot(b[0] - r.p[i][0], b[1] - r.p[i][1])),
      total = lengths.reduce((a, b) => a + b, 0),
      y0 = groundHeightAt(...r.p[0]),
      y1 = groundHeightAt(...r.p.at(-1));
    let along = 0;
    r.bridgeProfile = [];
    for (let i = 1; i < r.p.length; i++) {
      const a = r.p[i - 1],
        b = r.p[i],
        length = lengths[i - 1];
      if (!length) continue;
      const s = {
        a,
        b,
        dx: b[0] - a[0],
        dz: b[1] - a[1],
        length,
        width: r.w,
        y0: y0 + ((y1 - y0) * along) / total,
        y1: y0 + ((y1 - y0) * (along + length)) / total,
      };
      along += length;
      r.bridgeProfile.push(s);
      for (
        let x = Math.floor((Math.min(a[0], b[0]) - r.w) / 25);
        x <= Math.floor((Math.max(a[0], b[0]) + r.w) / 25);
        x++
      )
        for (
          let z = Math.floor((Math.min(a[1], b[1]) - r.w) / 25);
          z <= Math.floor((Math.max(a[1], b[1]) + r.w) / 25);
          z++
        ) {
          const key = x * 65536 + z;
          if (!bridges.has(key)) bridges.set(key, []);
          bridges.get(key).push(s);
        }
    }
  }
  for (const b of world.city.buildings) {
    let high = -Infinity,
      low = Infinity;
    const sample = (x, z) => {
      const y = groundHeightAt(x, z);
      high = Math.max(high, y);
      low = Math.min(low, y);
    };
    for (const ring of [b.p, ...b.holes])
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          q = ring[(i + 1) % ring.length],
          n = Math.max(1, Math.ceil(Math.hypot(q[0] - a[0], q[1] - a[1]) / 2));
        for (let k = 0; k <= n; k++)
          sample(a[0] + ((q[0] - a[0]) * k) / n, a[1] + ((q[1] - a[1]) * k) / n);
        for (const p of terrainEdge(a, q)) sample(...p);
      }
    const m = world.terrain.manifest;
    if (m)
      for (
        let j = Math.max(0, Math.ceil((b.minZ + m.size[1] / 2) / m.step[1]));
        j <= Math.min(m.rows - 1, Math.floor((b.maxZ + m.size[1] / 2) / m.step[1]));
        j++
      )
        for (
          let i = Math.max(0, Math.ceil((b.minX + m.size[0] / 2) / m.step[0]));
          i <= Math.min(m.columns - 1, Math.floor((b.maxX + m.size[0] / 2) / m.step[0]));
          i++
        ) {
          const x = -m.size[0] / 2 + i * m.step[0],
            z = -m.size[1] / 2 + j * m.step[1];
          if (pInside(x, z, b.p) && !b.holes.some((h) => pInside(x, z, h))) sample(x, z);
        }
    b.baseY = high;
    b.terrainSpread = high - low;
  }
  // Partes del mismo conjunto monumental: una base para nave, portada y anexos.
  for (const l of world.city.landmarks) {
    if (!Array.isArray(l.outline)) continue;
    const parts = world.city.buildings.filter((b) =>
      pInside((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, l.outline),
    );
    if (!parts.length) continue;
    l.baseY = Math.max(...parts.map((b) => b.baseY));
    for (const b of parts) b.baseY = l.baseY;
  }
}
