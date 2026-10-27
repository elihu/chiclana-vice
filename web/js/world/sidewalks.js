import * as THREE from '../../vendor/three.webgpu.min.js';
import { mat } from '../engine/materials.js';
import { gfx, segments, waterAreas, world } from '../core/state.js';
import { surfaceHeightAt } from '../engine/terrain-sampling.js';
import { pInside } from '../core/math.js';
import { inBuilding } from './spatial.js';

// Aceras con bordillo de las calzadas. Todo es visual: no cambia las cotas que
// devuelve surfaceHeightAt ni la transitabilidad. Las reglas están en
// web/city-design.json (`pavements.sidewalks`); ver docs/DESARROLLO.md («Aceras»).
const CELL = 16;
const cellKey = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);

// Índice espacial de tramos: cada tramo se registra cada CELL / 2 metros, y la consulta mira
// las 3x3 celdas vecinas.
function indexSegments() {
  const grid = new Map();
  for (const s of segments) {
    const n = Math.max(1, Math.ceil(s.length / (CELL / 2)));
    for (let i = 0; i <= n; i++) {
      const k = cellKey(s.a[0] + ((s.b[0] - s.a[0]) * i) / n, s.a[1] + ((s.b[1] - s.a[1]) * i) / n);
      if (!grid.has(k)) grid.set(k, new Set());
      grid.get(k).add(s);
    }
  }
  return grid;
}

// `slabs`: grupo {p, uv} con la cota final de cada vértice (sin ajuste posterior).
// `include(road)`: decide qué vías se dibujan (misma regla que la calzada).
export function buildSidewalks(slabs, paved, include) {
  const cfg = paved.sidewalks,
    heights = paved.layerHeights,
    grid = indexSegments(),
    platforms = world.surfaces?.platforms ?? [],
    curb = [],
    stats = { sidewalkMeters: 0, sidewalkTriangles: 0, curbTriangles: 0 };

  const nearOther = (x, z, road, dx, dz) => {
    const cx = Math.floor(x / CELL),
      cz = Math.floor(z / CELL);
    for (let i = cx - 1; i <= cx + 1; i++)
      for (let j = cz - 1; j <= cz + 1; j++)
        for (const s of grid.get(i + ',' + j) ?? []) {
          if (s.roadId === road.id) continue;
          // Dos vías con el mismo nombre casi paralelas son la misma calle partida.
          if (
            s.name === road.name &&
            Math.abs((s.b[0] - s.a[0]) * dx + (s.b[1] - s.a[1]) * dz) > 0.9 * s.length
          )
            continue;
          const ex = s.b[0] - s.a[0],
            ez = s.b[1] - s.a[1],
            u = Math.max(
              0,
              Math.min(1, ((x - s.a[0]) * ex + (z - s.a[1]) * ez) / (s.length * s.length)),
            ),
            d = Math.hypot(x - s.a[0] - ex * u, z - s.a[1] - ez * u);
          if (d < Math.max(paved.minimumHalfWidth, s.width / 2) + cfg.junctionMargin) return true;
        }
    return false;
  };
  const free = (x, z, road, dx, dz) =>
    !inBuilding(x, z, cfg.buildingMargin) &&
    !nearOther(x, z, road, dx, dz) &&
    !platforms.some((p) => pInside(x, z, p.polygon)) &&
    !waterAreas.some((a) => pInside(x, z, a.p));

  const quad = (out, a, b, c, d) => {
    for (const v of [a, b, c, a, c, d]) out.push(...v);
  };

  for (const road of world.city.roads) {
    if (road.bridge || !include(road)) continue;
    const walk = cfg.roadTypes.includes(road.type),
      half = Math.max(paved.minimumHalfWidth, road.w / 2),
      pedestrian = paved.pedestrianTypes.includes(road.type),
      edgeTop = pedestrian ? heights.stone : heights.asphalt;
    for (let i = 1; i < road.p.length; i++) {
      const a = road.p[i - 1],
        b = road.p[i],
        dx0 = b[0] - a[0],
        dz0 = b[1] - a[1],
        len = Math.hypot(dx0, dz0);
      if (len < 0.1) continue;
      const dx = dx0 / len,
        dz = dz0 / len,
        count = Math.max(1, Math.ceil(len / cfg.step)),
        at = (k, off, side) => [
          a[0] + (dx0 * k) / count - dz * off * side,
          a[1] + (dz0 * k) / count + dx * off * side,
        ],
        centerY = [];
      for (let k = 0; k <= count; k++) {
        const c = at(k, 0, 1);
        centerY.push(surfaceHeightAt(c[0], c[1], null, road.id));
      }
      for (let k = 0; k < count; k++)
        for (const side of [1, -1]) {
          const y0 = centerY[k],
            y1 = centerY[k + 1],
            pointAt = (kk, off, y) => {
              const p = at(kk, off, side);
              return [p[0], y, p[1]];
            },
            testEdge = (off) => {
              const p = at(k, off, side),
                q = at(k + 1, off, side);
              return (
                free(p[0], p[1], road, dx, dz) &&
                free(q[0], q[1], road, dx, dz) &&
                free((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, road, dx, dz)
              );
            };
          let width = 0;
          if (walk && testEdge(half))
            for (const f of [1, 0.66, 0.33]) {
              const w = cfg.width * f;
              if (w >= cfg.minimumWidth && testEdge(half + w)) {
                width = w;
                break;
              }
            }
          if (width) {
            const top0 = y0 + cfg.curbHeight,
              top1 = y1 + cfg.curbHeight,
              lip = half + cfg.curbWidth,
              outer = half + width;
            // Cara vertical del bordillo hacia la calzada, tapa del bordillo y baldosa.
            quad(
              curb,
              pointAt(k, half, y0 + edgeTop),
              pointAt(k + 1, half, y1 + edgeTop),
              pointAt(k + 1, half, top1),
              pointAt(k, half, top0),
            );
            quad(
              curb,
              pointAt(k, half, top0),
              pointAt(k + 1, half, top1),
              pointAt(k + 1, lip, top1),
              pointAt(k, lip, top0),
            );
            const s = [
              pointAt(k, lip, top0),
              pointAt(k + 1, lip, top1),
              pointAt(k + 1, outer, top1),
              pointAt(k, outer, top0),
            ];
            quad(slabs.p, ...s);
            for (const v of [s[0], s[1], s[2], s[0], s[2], s[3]])
              slabs.uv.push(v[0] / 4, -v[2] / 4);
            stats.curbTriangles += 4;
            stats.sidewalkTriangles += 2;
            stats.sidewalkMeters += len / count;
          }
        }
    }
  }
  if (!curb.length) return stats;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(curb, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat(cfg.curbColor, { side: THREE.DoubleSide, roughness: 0.95 }));
  mesh.name = 'street-curbs';
  mesh.receiveShadow = true;
  mesh.userData.stats = stats;
  gfx.scene.add(mesh);
  return stats;
}
