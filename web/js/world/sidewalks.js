import * as THREE from '../../vendor/three.webgpu.min.js';
import { mat } from '../engine/materials.js';
import { gfx, segments, waterAreas, world } from '../core/state.js';
import { groundHeightAt, surfaceHeightAt } from '../engine/terrain-sampling.js';
import { pInside } from '../core/math.js';
import { inBuilding } from './spatial.js';

// Aceras con bordillo y faldones de las calzadas. Todo es visual: no cambia las cotas que
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
    stats = { sidewalkMeters: 0, sidewalkTriangles: 0, curbTriangles: 0, skirtTriangles: 0 };

  const close = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.05;
  // Tramos vecinos que continúan la misma calle (comparten extremo y casi colineales): no
  // cuentan como calzada ajena. Todo lo demás, incluida la propia vía en tramos paralelos,
  // puentes, peatonales y servicio, sí.
  const continues = (s, a, b, len) =>
    (close(s.a, a) || close(s.a, b) || close(s.b, a) || close(s.b, b)) &&
    Math.abs((s.b[0] - s.a[0]) * (b[0] - a[0]) + (s.b[1] - s.a[1]) * (b[1] - a[1])) >
      0.9 * s.length * len;
  const halfOf = (s) => Math.max(paved.minimumHalfWidth, s.width / 2);
  // Calzadas ajenas cuyo eje queda a menos de medio ancho + margen del punto.
  const nearOther = (x, z, a, b, len, reach = 0) => {
    const cx = Math.floor(x / CELL),
      cz = Math.floor(z / CELL);
    for (let i = cx - 1; i <= cx + 1; i++)
      for (let j = cz - 1; j <= cz + 1; j++)
        for (const s of grid.get(i + ',' + j) ?? []) {
          if (continues(s, a, b, len)) continue;
          const ex = s.b[0] - s.a[0],
            ez = s.b[1] - s.a[1],
            u = Math.max(
              0,
              Math.min(1, ((x - s.a[0]) * ex + (z - s.a[1]) * ez) / (s.length * s.length)),
            ),
            qx = s.a[0] + ex * u,
            qz = s.a[1] + ez * u;
          if (Math.hypot(x - qx, z - qz) < halfOf(s) + cfg.junctionMargin + reach)
            return { x: qx, z: qz };
        }
    return null;
  };
  const free = (x, z, a, b, len) =>
    !inBuilding(x, z, cfg.buildingMargin) &&
    !nearOther(x, z, a, b, len) &&
    !platforms.some((p) => pInside(x, z, p.polygon)) &&
    !waterAreas.some((w) => pInside(x, z, w.p));

  const quad = (out, a, b, c, d) => {
    for (const v of [a, b, c, a, c, d]) out.push(...v);
  };

  for (const road of world.city.roads) {
    if (road.bridge || !include(road)) continue;
    let roadLength = 0;
    for (let i = 1; i < road.p.length; i++)
      roadLength += Math.hypot(road.p[i][0] - road.p[i - 1][0], road.p[i][1] - road.p[i - 1][1]);
    const walk = cfg.roadTypes.includes(road.type) && roadLength >= cfg.minimumRoadLength,
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
        centerY = [],
        // Lado con otra calzada pegada a lo largo de buena parte del tramo (dobles calzadas,
        // glorietas): sin acera por ese lado.
        crowded = { 1: 0, '-1': 0 };
      for (let n = 0; n < 6; n++) {
        const px = a[0] + (dx0 * (n + 0.5)) / 6,
          pz = a[1] + (dz0 * (n + 0.5)) / 6,
          hit = nearOther(px, pz, a, b, len, half + cfg.width - cfg.junctionMargin);
        if (hit) crowded[(hit.x - px) * -dz + (hit.z - pz) * dx >= 0 ? 1 : -1]++;
      }
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
            // Esquinas, bordes y centro de la pieza entre la calzada y `off`.
            testEdge = (off) => {
              const pts = [];
              for (const o of [half, (half + off) / 2, off])
                for (const kk of [k, k + 0.5, k + 1]) pts.push(at(kk, o, side));
              return pts.every((p) => free(p[0], p[1], a, b, len));
            };
          // Faldón: cara vertical bajo el borde (de la calzada o de la acera) hasta un poco
          // por debajo del terreno, solo donde el terreno queda por debajo.
          const skirt = (off, top0, top1) => {
            const q = [at(k, off, side), at(k + 1, off, side)],
              tops = [y0 + top0, y1 + top1],
              bottoms = q.map((p, n) => {
                const gap = tops[n] - groundHeightAt(p[0], p[1]);
                return gap > cfg.skirtMinGap
                  ? Math.max(tops[n] - cfg.skirtMaxDepth, tops[n] - gap - cfg.skirtTerrainMargin)
                  : tops[n];
              });
            if (bottoms[0] === tops[0] && bottoms[1] === tops[1]) return;
            quad(
              curb,
              [q[0][0], tops[0], q[0][1]],
              [q[1][0], tops[1], q[1][1]],
              [q[1][0], bottoms[1], q[1][1]],
              [q[0][0], bottoms[0], q[0][1]],
            );
            stats.skirtTriangles += 2;
          };
          let width = 0;
          if (walk && crowded[side] < 3 && testEdge(half))
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
            skirt(outer, cfg.curbHeight, cfg.curbHeight);
            stats.curbTriangles += 4;
            stats.sidewalkTriangles += 2;
            stats.sidewalkMeters += len / count;
          } else if (testEdge(half)) skirt(half, edgeTop, edgeTop);
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
