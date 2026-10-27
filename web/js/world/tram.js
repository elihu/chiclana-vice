import * as THREE from '../../vendor/three.webgpu.min.js';
import { mat } from '../engine/materials.js';
import { gfx, world } from '../core/state.js';
import { surfaceHeightAt } from '../engine/terrain-sampling.js';
import { inBuilding, nearestRoad } from './spatial.js';

// Vías del tranvía (capa web/tram.json, OSM): franja con dos raíles, postes y catenaria.
// Todo es visual: no cambia cotas ni transitabilidad. Parámetros en web/city-design.json
// (sección `tram`); ver docs/DESARROLLO.md («Tranvía»).
const CELL = 16;
const cellKey = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);

// Índice espacial de los ejes de vía (la capa es estática y pequeña).
let memo = null;
function index() {
  const layer = world.tram;
  if (!layer) return null;
  if (memo?.layer === layer) return memo;
  const grid = new Map();
  for (const track of layer.tracks)
    for (let i = 1; i < track.p.length; i++) {
      const a = track.p[i - 1],
        b = track.p[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]),
        segment = { a, b, length, bridge: track.bridge },
        n = Math.max(1, Math.ceil(length / (CELL / 2)));
      for (let k = 0; k <= n; k++) {
        const key = cellKey(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
        if (!grid.has(key)) grid.set(key, new Set());
        grid.get(key).add(segment);
      }
    }
  memo = { layer, grid };
  return memo;
}

// Distancia del punto al eje de vía más cercano (Infinity sin tranvía).
export function tramDistance(x, z) {
  const m = index();
  if (!m) return Infinity;
  let best = Infinity;
  const cx = Math.floor(x / CELL),
    cz = Math.floor(z / CELL);
  for (let i = cx - 1; i <= cx + 1; i++)
    for (let j = cz - 1; j <= cz + 1; j++)
      for (const s of m.grid.get(i + ',' + j) ?? []) {
        const ex = s.b[0] - s.a[0],
          ez = s.b[1] - s.a[1],
          u = Math.max(
            0,
            Math.min(1, ((x - s.a[0]) * ex + (z - s.a[1]) * ez) / (s.length * s.length || 1)),
          );
        best = Math.min(best, Math.hypot(x - s.a[0] - ex * u, z - s.a[1] - ez * u));
      }
  return best;
}

// Puntos de la polilínea con una separación máxima `step`, conservando los vértices.
function resample(points, step) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++)
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

// Normal horizontal (hacia la derecha del sentido de la vía) en cada punto.
function normals(points) {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  });
}

const quad = (out, a, b, c, d) => {
  for (const v of [a, b, c, a, c, d]) out.push(...v);
};

// Viga de sección rectangular a lo largo de `points`: cara superior y dos laterales.
// `base[i]` y `top[i]` son las cotas inferior y superior en cada punto.
function beam(out, points, normal, half, base, top) {
  const at = (i, side, y) => [
    points[i][0] + normal[i][0] * half * side,
    y,
    points[i][1] + normal[i][1] * half * side,
  ];
  for (let i = 1; i < points.length; i++) {
    const j = i - 1;
    quad(out, at(j, -1, top[j]), at(i, -1, top[i]), at(i, 1, top[i]), at(j, 1, top[j]));
    quad(out, at(j, -1, base[j]), at(i, -1, base[i]), at(i, -1, top[i]), at(j, -1, top[j]));
    quad(out, at(j, 1, top[j]), at(i, 1, top[i]), at(i, 1, base[i]), at(j, 1, base[j]));
  }
}

function addMesh(name, positions, material, receive = true) {
  if (!positions.length) return 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.receiveShadow = receive;
  gfx.scene.add(mesh);
  return positions.length / 9;
}

export function buildTram() {
  const layer = world.tram,
    cfg = world.cityDesign.tram;
  if (!layer?.tracks.length) return null;
  const half = cfg.stripWidth / 2,
    cat = cfg.catenary,
    paved = [],
    grass = [],
    rails = [],
    wires = [],
    stats = { meters: 0, tracks: layer.tracks.length, poles: 0, triangles: 0 };
  const level = layer.crossings.filter((c) => c.kind === 'level');

  for (const track of layer.tracks) {
    const points = resample(track.p, cfg.sampleStep),
      normal = normals(points),
      side = (i, offset) => [
        points[i][0] + normal[i][0] * offset,
        points[i][1] + normal[i][1] * offset,
      ],
      // Empotrada (pavimentada) en puentes, junto a calzadas y en cruces a nivel; si no, césped.
      isPaved = points.map(([x, z]) => {
        if (track.bridge) return true;
        if (level.some((c) => Math.hypot(c.x - x, c.z - z) < half + cfg.pavedDistance + 2))
          return true;
        const near = nearestRoad(x, z, true);
        return !!near && near.d - near.s.width / 2 <= half + cfg.pavedDistance;
      }),
      floor = (p) => surfaceHeightAt(p[0], p[1]) + cfg.bedHeight;

    // Franja: un cuadrilátero por muestra. Pavimentada: cota del eje en ambos lados (sigue a la
    // calzada, que es plana en sentido transversal); de césped: cota de cada esquina.
    for (let i = 1; i < points.length; i++) {
      const centre = [i - 1, i].map((k) => surfaceHeightAt(points[k][0], points[k][1])),
        flat = isPaved[i - 1],
        corner = (k, s) => {
          const p = side(k, half * s);
          return [
            p[0],
            flat ? centre[k - (i - 1)] + cfg.bedHeight : Math.max(floor(p), centre[k - (i - 1)]),
            p[1],
          ];
        };
      quad(flat ? paved : grass, corner(i - 1, -1), corner(i, -1), corner(i, 1), corner(i - 1, 1));
      stats.meters += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    }

    // Raíles: separación igual al ancho de vía de OSM.
    for (const s of [-1, 1]) {
      const line = points.map((_, i) => side(i, (track.gauge / 2) * s)),
        base = line.map(floor);
      beam(
        rails,
        line,
        normal,
        cfg.rails.width / 2,
        base,
        base.map((y) => y + cfg.rails.height),
      );
    }

    // Hilo de contacto: tramos rectos de `wireStep` sobre el eje.
    const wire = resample(track.p, cat.wireStep),
      wireNormal = normals(wire),
      wireY = wire.map((p) => floor(p) + cat.wireHeight);
    beam(
      wires,
      wire,
      wireNormal,
      cat.wireWidth / 2,
      wireY.map((y) => y - cat.wireWidth),
      wireY,
    );

    // Postes cada `poleSpacing` metros, por el lado con más sitio libre y fuera de edificios.
    let distance = cat.poleSpacing / 2,
      walked = 0;
    for (let i = 1; i < points.length; i++) {
      const segment = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      while (distance <= walked + segment) {
        const t = (distance - walked) / (segment || 1),
          x = points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
          z = points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
          n = [(normal[i - 1][0] + normal[i][0]) / 2, (normal[i - 1][1] + normal[i][1]) / 2],
          offset = half + cat.poleOffset,
          choices = [1, -1]
            .map((s) => {
              const p = [x + n[0] * offset * s, z + n[1] * offset * s],
                road = nearestRoad(p[0], p[1], true);
              return {
                p,
                clear: road ? road.d - road.s.width / 2 : 99,
                blocked: inBuilding(p[0], p[1], cat.buildingClearance),
              };
            })
            .filter((c) => !c.blocked)
            .sort((a, b) => b.clear - a.clear);
        distance += cat.poleSpacing;
        if (!choices.length) continue;
        const [px, pz] = choices[0].p,
          y0 = surfaceHeightAt(px, pz),
          w = cat.poleWidth / 2;
        // Poste: cuatro caras y tapa; brazo horizontal hasta el eje de la vía.
        const corners = [
          [px - w, pz - w],
          [px + w, pz - w],
          [px + w, pz + w],
          [px - w, pz + w],
        ].map(([cx, cz]) => [
          [cx, y0, cz],
          [cx, y0 + cat.poleHeight, cz],
        ]);
        for (let k = 0; k < 4; k++) {
          const a = corners[k],
            b = corners[(k + 1) % 4];
          quad(wires, a[0], b[0], b[1], a[1]);
        }
        quad(wires, corners[0][1], corners[1][1], corners[2][1], corners[3][1]);
        const arm = [
            [px, pz],
            [x, z],
          ],
          dx = x - px,
          dz = z - pz,
          length = Math.hypot(dx, dz) || 1,
          an = [
            [-dz / length, dx / length],
            [-dz / length, dx / length],
          ],
          armEnd = floor([x, z]) + cat.armHeight;
        beam(
          wires,
          arm,
          an,
          cat.armWidth / 2,
          [y0 + cat.armHeight - cat.armWidth, armEnd - cat.armWidth],
          [y0 + cat.armHeight, armEnd],
        );
        stats.poles++;
      }
      walked += segment;
    }
  }

  stats.triangles +=
    addMesh(
      'tram-bed-paved',
      paved,
      mat(cfg.pavedColor, { side: THREE.DoubleSide, roughness: 0.95 }),
    ) +
    addMesh(
      'tram-bed-grass',
      grass,
      mat(cfg.grassColor, { side: THREE.DoubleSide, roughness: 1 }),
    ) +
    addMesh(
      'tram-rails',
      rails,
      mat(cfg.rails.color, { side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 }),
    ) +
    addMesh(
      'tram-catenary',
      wires,
      mat(cat.color, { side: THREE.DoubleSide, roughness: 0.7 }),
      false,
    );
  world.tramStats = stats;
  return stats;
}
