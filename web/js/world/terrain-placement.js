import { gridX, gridZ, gridColumn, gridRow } from '../core/math.js';
import { pInside } from '../core/math.js';
import { world } from '../core/state.js';
import { groundHeightAt } from '../engine/terrain-sampling.js';
import { terrainEdge } from '../engine/terrain-drape.js';
import { createSurfaceModel } from './surface-model.js';

export function prepareTerrainPlacement() {
  world.surfaces = createSurfaceModel(world.city, world.terrain, world.cityDesign?.terrainSurfaces);
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
        let j = Math.max(0, Math.ceil(gridRow(m, b.minZ)));
        j <= Math.min(m.rows - 1, Math.floor(gridRow(m, b.maxZ)));
        j++
      )
        for (
          let i = Math.max(0, Math.ceil(gridColumn(m, b.minX)));
          i <= Math.min(m.columns - 1, Math.floor(gridColumn(m, b.maxX)));
          i++
        ) {
          const x = gridX(m, i),
            z = gridZ(m, j);
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
