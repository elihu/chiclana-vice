// Audita la rejilla derivada y la integración en planta, sin DOM ni WebGL.
// node tools/audit-terrain-surfaces.mjs /tmp/chiclana-terrain-export
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { readWorld } from './world-files.mjs';
import { createTerrain } from '../web/js/world/terrain.js';
import { world } from '../web/js/core/state.js';
import { applyCorrections } from '../web/js/world/corrections.js';
import { prepareTerrainPlacement } from '../web/js/world/terrain-placement.js';
import { groundHeightAt, surfaceHeightAt } from '../web/js/engine/terrain-sampling.js';

const directory = process.argv[2],
  out = process.argv[3] || 'source-data/terrain-surface-audit.json';
if (!directory) throw Error('Indica el directorio de la rejilla derivada');
const manifest = JSON.parse(fs.readFileSync(directory + '/terrain.json', 'utf8')),
  bytes = fs.readFileSync(directory + '/terrain.bin');
if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256)
  throw Error('Checksum de terreno incorrecto');
world.city = readWorld();
world.cityDesign = JSON.parse(fs.readFileSync('web/city-design.json', 'utf8'));
applyCorrections(world.city, JSON.parse(fs.readFileSync('web/map-corrections.json', 'utf8')));
world.terrain = createTerrain(
  manifest,
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  world.city,
);
for (const b of world.city.buildings) {
  b.minX = Math.min(...b.p.map((p) => p[0]));
  b.maxX = Math.max(...b.p.map((p) => p[0]));
  b.minZ = Math.min(...b.p.map((p) => p[1]));
  b.maxZ = Math.max(...b.p.map((p) => p[1]));
}
prepareTerrainPlacement();
const bridges = [],
  steep = [],
  rawSteep = [];
for (const r of world.city.roads) {
  if (r.bridge) {
    let minimumDeckClearance = Infinity,
      maximumSlope = 0;
    for (const s of world.surfaces.profiles.get(r.id) ?? []) {
      maximumSlope = Math.max(maximumSlope, Math.abs(s.y1 - s.y0) / s.length);
      for (let k = 0; k <= Math.ceil(s.length); k++) {
        const u = k / Math.ceil(s.length),
          x = s.a[0] + s.dx * u,
          z = s.a[1] + s.dz * u,
          y = s.y0 + (s.y1 - s.y0) * u;
        for (const side of [-1, 0, 1])
          minimumDeckClearance = Math.min(
            minimumDeckClearance,
            y -
              groundHeightAt(
                x - (((s.dz / s.length) * r.w) / 2) * side,
                z + (((s.dx / s.length) * r.w) / 2) * side,
              ),
          );
      }
    }
    bridges.push({
      id: r.id,
      name: r.name,
      type: r.type,
      p: r.p,
      minimumDeckClearance,
      maximumSlope,
    });
  }
  for (let i = 1; i < r.p.length; i++) {
    const a = r.p[i - 1],
      b = r.p[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      n = Math.max(1, Math.ceil(length / 2));
    let previous = surfaceHeightAt(...a, null, r.id),
      rawPrevious = world.terrain.heightAt(...a);
    for (let k = 1; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n,
        z = a[1] + ((b[1] - a[1]) * k) / n,
        y = surfaceHeightAt(x, z, null, r.id),
        slope = Math.abs(y - previous) / (length / n);
      previous = y;
      const rawY = world.terrain.heightAt(x, z),
        rawSlope = Math.abs(rawY - rawPrevious) / (length / n);
      rawPrevious = rawY;
      if (rawSlope > 0.2) rawSteep.push({ id: r.id, x, z, slope: rawSlope });
      if (slope > 0.2)
        steep.push({ id: r.id, name: r.name, type: r.type, bridge: r.bridge, x, z, slope });
    }
  }
}
steep.sort((a, b) => b.slope - a.slope);
const buildings = world.city.buildings
  .map((b, index) => ({ index, baseY: b.baseY, spread: b.terrainSpread }))
  .sort((a, b) => b.spread - a.spread);
const terrainAudit = JSON.parse(fs.readFileSync('source-data/terrain-audit.json', 'utf8'));
if (!manifest.preview && terrainAudit.decision !== 'validado para el juego')
  throw Error('Terreno sin --preview y auditoría del MDT sin validar');
const report = {
  version: 1,
  terrainSha256: manifest.sha256,
  sourceSha256: manifest.sourceSha256,
  accessDate: manifest.accessDate,
  // La decisión procede de la auditoría del MDT; una copia provisional no la hereda.
  decision: manifest.preview
    ? 'provisional; perfiles y plataformas de autor generalizables; revisión visual y móvil pendientes'
    : `${terrainAudit.decision} (${terrainAudit.decisionDate}); defectos visuales menores y móvil físico pendientes`,
  reviewSlope: 0.2,
  steepSamples: steep.length,
  rawSteepSamples: rawSteep.length,
  steepest: steep.slice(0, 100),
  bridges,
  authoredPlatforms: world.surfaces.platforms.map((p) => ({
    id: p.id,
    height: p.y,
    clearance: p.clearance,
    lowerRoads: p.lowerRoads,
    evidence: p.evidence,
  })),
  designSha256: createHash('sha256').update(fs.readFileSync('web/city-design.json')).digest('hex'),
  largestBuildingSpreads: buildings.slice(0, 100),
  limits:
    'Umbral 20% sirve para revisión, no es límite físico. MDT original inmutable; calzadas filtradas solo en corredores, plataformas y gálibos son aproximaciones de autor, no cotas medidas.',
};
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    steepSamples: steep.length,
    bridges: bridges.length,
    largestSpread: buildings[0],
  }),
);
