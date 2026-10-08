// Auditoría de uniones con las capas reales, sin DOM ni WebGL.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { readWorld } from '../tools/world-files.mjs';
import { surfaceJunctions } from '../tools/surface-junctions.mjs';
import { applyCorrections } from '../web/js/world/corrections.js';
import { createTerrain } from '../web/js/world/terrain.js';
import { createSurfaceModel } from '../web/js/world/surface-model.js';
if (fs.existsSync('web/terrain.json')) {
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
  const waterSamples = JSON.parse(fs.readFileSync('source-data/auditoria-relieve/agua-antes.json'));
  assert.equal(waterSamples.length, 2173);
  for (const [x, z, y] of waterSamples)
    assert.equal(model.waterHeightAt(x, z), y, 'lámina del río invariable');
  const report = surfaceJunctions(city, model);
  console.log('Uniones reales: ', JSON.stringify(report));
  for (const group of [report.shared, report.tees])
    assert(group.maximum <= 0.05, 'salto máximo de unión <= 5 cm');
}
