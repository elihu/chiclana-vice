// Medición CPU reproducible; ejecutar antes/después en la misma máquina y Node.
// node tools/bench-terrain-surfaces.mjs [raíz] [informe.json]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { surfaceJunctions } from './surface-junctions.mjs';
const root = path.resolve(process.argv[2] || '.');
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
const report = {
  node: process.version,
  creationMs: times,
  medianMs: [...times].sort((a, b) => a - b)[3],
  mesh: [model.meshTerrain.manifest.columns, model.meshTerrain.manifest.rows],
  queries,
  junctions: surfaceJunctions(city, model),
};
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
