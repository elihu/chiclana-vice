// Medición CPU reproducible; ejecutar antes/después en la misma máquina y Node.
// node tools/bench-terrain-surfaces.mjs [raíz] [informe.json] [--compare referencia.json]
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { surfaceJunctions } from './surface-junctions.mjs';
const args = process.argv.slice(2),
  compareIndex = args.indexOf('--compare');
let comparison = null;
if (compareIndex >= 0) {
  const reference = args[compareIndex + 1];
  if (!reference || reference.startsWith('--'))
    throw Error('--compare requiere un informe de referencia');
  comparison = JSON.parse(fs.readFileSync(reference));
  if (!comparison.fingerprints)
    throw Error('Informe sin huellas: genera una referencia con esta versión de la herramienta');
  args.splice(compareIndex, 2);
}
if (args.length > 2 || args.some((arg) => arg.startsWith('--')))
  throw Error('Uso: [raíz] [informe.json] [--compare referencia.json]');
const root = path.resolve(args[0] || '.');
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const { createTerrain } = await load('web/js/world/terrain.js');
const modelPath = fs.existsSync(root + '/web/js/world/surface-model.js') ? 'world' : 'engine';
const { createSurfaceModel } = await load(`web/js/${modelPath}/surface-model.js`);
const { readWorld } = await load('tools/world-files.mjs');
const { applyCorrections } = await load('web/js/world/corrections.js');
const city = readWorld(root + '/web');
applyCorrections(city, JSON.parse(fs.readFileSync(root + '/web/map-corrections.json')));
const design = JSON.parse(fs.readFileSync(root + '/web/city-design.json')).terrainSurfaces;
const manifest = JSON.parse(fs.readFileSync(root + '/web/terrain.json'));
const bytes = fs.readFileSync(root + '/web/terrain.bin');
const terrain = createTerrain(
  manifest,
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  city,
);
let model;
const times = [];
for (let i = 0; i < 8; i++) {
  const start = performance.now();
  model = createSurfaceModel(city, terrain, design);
  if (i) times.push(performance.now() - start);
}
let seed = 12345;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const points = Array.from({ length: 100000 }, () => [
  (random() - 0.5) * 1300,
  (random() - 0.5) * 960,
]);
const queries = {};
for (const [name, fn] of [
  ['raw', terrain.heightAt],
  ['ground', model.groundHeightAt],
  ['surface', (x, z) => model.surfaceHeightAt(x, z, 0)],
  ['actor', (x, z) => model.actorHeightAt({ surfaceY: 0 }, x, z)],
  ['dry', (x, z) => model.drySurfaceAt(x, z, 0)],
]) {
  const start = performance.now();
  let sum = 0;
  for (const [x, z] of points) sum += +fn(x, z);
  queries[name] = {
    microseconds: ((performance.now() - start) * 1000) / points.length,
    checksum: sum,
  };
}
// Huellas para una comparación puntual de refactorización, nunca un test del diseño.
const { pInside } = await load('web/js/core/math.js');
const meshHash = createHash('sha256')
  .update(new Uint8Array(model.meshTerrain.data.buffer))
  .digest('hex');
const waterHash = createHash('sha256');
let waterSeed = 76,
  waterSamples = 0;
const waterRandom = () =>
  (waterSeed = (Math.imul(waterSeed, 1664525) + 1013904223) >>> 0) / 4294967296;
for (const area of city.areas.filter((a) => a.kind === 'water')) {
  const minX = Math.min(...area.p.map((p) => p[0])),
    minZ = Math.min(...area.p.map((p) => p[1])),
    width = Math.max(...area.p.map((p) => p[0])) - minX,
    depth = Math.max(...area.p.map((p) => p[1])) - minZ;
  let count = 0;
  // Límite de intentos para rechazar huellas degeneradas sin bloquear la herramienta.
  for (let attempts = 0; count < 2173 && attempts < 1000000; attempts++) {
    const x = minX + waterRandom() * width,
      z = minZ + waterRandom() * depth;
    if (!pInside(x, z, area.p)) continue;
    waterHash.update(JSON.stringify([x, z, model.waterHeightAt(x, z, area)]) + '\n');
    count++;
    waterSamples++;
  }
  if (count !== 2173)
    throw Error('Polígono de agua degenerado o demasiado estrecho para el muestreo de comparación');
}
const report = {
  node: process.version,
  creationMs: times,
  medianMs: [...times].sort((a, b) => a - b)[3],
  mesh: [model.meshTerrain.manifest.columns, model.meshTerrain.manifest.rows],
  queries,
  fingerprints: {
    mesh: meshHash,
    water: { samples: waterSamples, sha256: waterHash.digest('hex') },
  },
  junctions: surfaceJunctions(city, model),
};
if (comparison) {
  report.comparison = {
    mesh: comparison.fingerprints.mesh === report.fingerprints.mesh,
    water:
      comparison.fingerprints.water.samples === report.fingerprints.water.samples &&
      comparison.fingerprints.water.sha256 === report.fingerprints.water.sha256,
  };
}
if (args[1]) fs.writeFileSync(args[1], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

if (comparison && (!report.comparison.mesh || !report.comparison.water)) process.exitCode = 1;
