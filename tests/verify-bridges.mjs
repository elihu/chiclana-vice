// Continuidad de cotas en los puentes de prueba (Reyes Católicos / Remedios y VII Centenario)
// y sus accesos, con las capas reales y sin DOM ni WebGL. Las vías se localizan por la
// configuración de autor (plataformas) y por la marca `bridge` de OSM, sin IDs en el código.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { readWorld } from '../tools/world-files.mjs';
import { applyCorrections } from '../web/js/world/corrections.js';
import { createTerrain } from '../web/js/world/terrain.js';
import { createSurfaceModel } from '../web/js/world/surface-model.js';
import { pInside, boundaryDistance } from '../web/js/core/math.js';

const JUMP = 0.05, // mismo umbral que verify-surface-junctions.mjs
  STEP = 0.3, // desnivel máximo en 1 m de recorrido (como surfaceSteps)
  ACCESS_RADIUS = 40; // alcance de los accesos desde el puente, por el grafo de vías

const heightOf = (p, x, z) => (p.heightAt ? p.heightAt(x, z) : p.y);

export function measureBridges(options = {}) {
  const city = readWorld();
  applyCorrections(city, JSON.parse(fs.readFileSync('web/map-corrections.json')));
  const manifest = JSON.parse(fs.readFileSync('web/terrain.json'));
  const bytes = fs.readFileSync('web/terrain.bin');
  const terrain = createTerrain(
    manifest,
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    city,
  );
  const design = JSON.parse(fs.readFileSync('web/city-design.json')).terrainSurfaces;
  const model = createSurfaceModel(city, terrain, design);
  const roads = new Map(city.roads.map((r) => [r.id, r]));
  const length = (r) =>
    r.p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - r.p[i][0], q[1] - r.p[i][1]), 0);
  // Grupos: cada plataforma con roadAnchor (tablero + pasos inferiores) y cada puente OSM que
  // no pertenece a una plataforma. Los accesos son las vías que llegan hasta ACCESS_RADIUS.
  const groups = [];
  const inPlatform = new Set();
  for (const p of model.platforms) {
    for (const id of [...p.deckRoads, ...p.lowerRoads]) inPlatform.add(id);
    if (p.roadAnchor) groups.push({ name: p.id, seeds: p.deckRoads, platform: p });
  }
  for (const r of city.roads)
    if (r.bridge && !inPlatform.has(r.id)) groups.push({ name: 'puente ' + r.id, seeds: [r.id] });
  const vertexRoads = new Map();
  for (const r of city.roads)
    for (const q of r.p) {
      const k = q.join(',');
      if (!vertexRoads.has(k)) vertexRoads.set(k, []);
      vertexRoads.get(k).push(r);
    }
  const report = [];
  for (const group of groups) {
    // Búsqueda por distancia acumulada sobre el grafo de vértices compartidos.
    const reach = new Map(group.seeds.map((id) => [id, 0]));
    const queue = [...group.seeds];
    while (queue.length) {
      const id = queue.shift(),
        r = roads.get(id),
        base = reach.get(id);
      for (const q of r.p)
        for (const o of vertexRoads.get(q.join(',')))
          if (!reach.has(o.id) && base + length(o) <= ACCESS_RADIUS) {
            reach.set(o.id, base + length(o));
            queue.push(o.id);
          }
    }
    for (const id of group.platform?.lowerRoads ?? []) reach.set(id, 0);
    const ids = [...reach.keys()].filter((id) => model.profiles.get(id)?.length);
    let junction = { jump: 0 },
      step = { step: 0 };
    for (const id of ids) {
      const r = roads.get(id);
      for (let i = 0; i < r.p.length; i++) {
        const q = r.p[i],
          y = model.roadAt(...q, id)?.y;
        for (const o of vertexRoads.get(q.join(',')))
          if (o.id !== id && ids.includes(o.id)) {
            const jump = Math.abs(y - model.roadAt(...q, o.id).y);
            if (jump > junction.jump) junction = { jump, point: q, roads: [id, o.id] };
          }
      }
      // Muestreo cada 0,25 m por la polilínea; escalón en 1 m de recorrido.
      const samples = [];
      let along = 0;
      for (let i = 1; i < r.p.length; i++) {
        const a = r.p[i - 1],
          b = r.p[i],
          len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = 0; d < len; d += 0.25) {
          const x = a[0] + ((b[0] - a[0]) * d) / len,
            z = a[1] + ((b[1] - a[1]) * d) / len;
          samples.push({ s: along + d, y: model.surfaceHeightAt(x, z, null, id), p: [x, z] });
        }
        along += len;
      }
      for (let i = 0; i < samples.length; i++)
        for (let j = i + 1; j < samples.length && samples[j].s - samples[i].s <= 1; j++) {
          const d = Math.abs(samples[j].y - samples[i].y);
          if (d > step.step) step = { step: d, roadId: id, point: samples[i].p };
        }
    }
    // Altura libre sobre cada paso inferior y coincidencia del perfil del tablero.
    let clearance = { margin: Infinity },
      deckGap = { gap: 0 };
    for (const p of model.platforms.filter((q) => q === group.platform)) {
      for (const id of p.lowerRoads) {
        const r = roads.get(id);
        for (let i = 1; i < r.p.length; i++) {
          const a = r.p[i - 1],
            b = r.p[i],
            len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let d = 0; d <= len; d += 0.5) {
            const x = a[0] + ((b[0] - a[0]) * d) / len,
              z = a[1] + ((b[1] - a[1]) * d) / len;
            if (!pInside(x, z, p.polygon) && boundaryDistance(x, z, p.polygon) > 1e-6) continue;
            const margin =
              heightOf(p, x, z) - p.thickness - model.surfaceHeightAt(x, z, null, id) - p.clearance;
            if (margin < clearance.margin) clearance = { margin, point: [x, z], roadId: id };
          }
        }
      }
      for (const id of p.deckRoads) {
        const r = roads.get(id);
        for (let i = 1; i < r.p.length; i++) {
          const a = r.p[i - 1],
            b = r.p[i],
            len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let d = 0; d <= len; d += 0.5) {
            const x = a[0] + ((b[0] - a[0]) * d) / len,
              z = a[1] + ((b[1] - a[1]) * d) / len;
            if (!pInside(x, z, p.polygon) && boundaryDistance(x, z, p.polygon) > 1e-6) continue;
            const gap = Math.abs(model.surfaceHeightAt(x, z, null, id) - heightOf(p, x, z));
            if (gap > deckGap.gap) deckGap = { gap, point: [x, z], roadId: id };
          }
        }
      }
    }
    // Extremos del tablero (lados cortos del corredor): caída medio metro hacia fuera, sobre
    // tierra. Es informativa: junto a las bocas de los pasos inferiores la caída es real. El
    // polígono es un lado y el otro invertido.
    let endDrop = { drop: 0 };
    if (group.platform) {
      const p = group.platform,
        n = p.polygon.length / 2,
        cx = p.polygon.reduce((s, q) => s + q[0], 0) / p.polygon.length,
        cz = p.polygon.reduce((s, q) => s + q[1], 0) / p.polygon.length;
      for (const [i, j] of [
        [n - 1, n],
        [2 * n - 1, 0],
      ]) {
        const a = p.polygon[i],
          b = p.polygon[j],
          len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let nx = -(b[1] - a[1]) / len,
          nz = (b[0] - a[0]) / len;
        if (nx * ((a[0] + b[0]) / 2 - cx) + nz * ((a[1] + b[1]) / 2 - cz) < 0) {
          nx = -nx;
          nz = -nz;
        }
        for (let d = 0.25; d < len - 0.25; d += 0.25) {
          const ex = a[0] + ((b[0] - a[0]) * d) / len,
            ez = a[1] + ((b[1] - a[1]) * d) / len,
            x = ex + nx * 0.5,
            z = ez + nz * 0.5;
          if (
            pInside(x, z, p.polygon) ||
            city.areas.some((w) => w.kind === 'water' && pInside(x, z, w.p))
          )
            continue;
          const drop = heightOf(p, ex, ez) - model.surfaceHeightAt(x, z);
          if (drop > endDrop.drop) endDrop = { drop, point: [x, z] };
        }
      }
    }
    report.push({ name: group.name, roads: ids, junction, step, clearance, deckGap, endDrop });
  }
  return { report, model, city };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!fs.existsSync('web/terrain.json')) {
    console.log('Sin terreno real: verificador de puentes omitido');
  } else {
    const { report } = measureBridges();
    for (const g of report)
      console.log(
        g.name + ':',
        JSON.stringify({
          roads: g.roads.length,
          junction: +g.junction.jump.toFixed(3),
          step: +g.step.step.toFixed(3),
          clearanceMargin: g.clearance.margin === Infinity ? null : +g.clearance.margin.toFixed(3),
          deckGap: +g.deckGap.gap.toFixed(3),
          endDrop: +g.endDrop.drop.toFixed(3),
        }),
      );
    assert(report.length >= 2, 'se encontraron los dos puentes de prueba');
    for (const g of report) {
      assert(g.junction.jump <= JUMP, `${g.name}: salto de unión ${g.junction.jump.toFixed(3)} m`);
      assert(g.step.step <= STEP, `${g.name}: escalón ${g.step.step.toFixed(3)} m en 1 m`);
      assert(g.clearance.margin >= -1e-3, `${g.name}: altura libre incumplida`);
      assert(g.deckGap.gap <= JUMP, `${g.name}: perfil de calzada y tablero difieren`);
    }
  }
}
