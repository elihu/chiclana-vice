import { validBounds, worldBounds } from '../web/js/world/bounds.js';
// Split the transformed snapshot; originals are never inputs to the browser.
// node tools/prepare-world.mjs [local city.json]
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { readWorld } from './world-files.mjs';

const input = process.argv[2];
const city = input ? JSON.parse(fs.readFileSync(input, 'utf8')) : readWorld();
const bounds = worldBounds(city);
if (!validBounds(bounds)) throw Error('Límites del mundo incompatibles');
const write = (name, data) => fs.writeFileSync(`web/${name}`, JSON.stringify(data) + '\n');
write('buildings.json', {
  version: 1,
  origin: city.origin,
  source: 'D.G. del Catastro INSPIRE BU, transformed game volumes, 2026-10-04',
  license: 'Catastro INSPIRE terms; see THIRD_PARTY_NOTICES.md',
  transformation:
    'Clipped, topology-preserving simplification 0.12 m, local metre coordinates rounded 0.01 m; floor-based volumes, not cadastral certification.',
  buildings: city.buildings,
});
write('osm-world.json', {
  version: 1,
  origin: city.origin,
  attribution: '© OpenStreetMap contributors',
  license: 'ODbL-1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  transformation:
    'Playable-area extraction, local coordinates, inferred widths and game categories; snapshot 2026-10-04.',
  roads: city.roads,
  areas: city.areas,
  landmarks: city.landmarks,
  trees: city.trees,
});
const sha = (name) =>
  createHash('sha256')
    .update(fs.readFileSync(`web/${name}`))
    .digest('hex');
write('world.json', {
  version: 1,
  origin: city.origin,
  bounds,
  meta: city.meta,
  files: { buildings: 'buildings.json', osm: 'osm-world.json' },
  checksums: { buildings: sha('buildings.json'), osm: sha('osm-world.json') },
  limits:
    'Separate provenance; conversion does not extinguish source obligations. Buildings and geography preserved.',
});
console.log(
  JSON.stringify({
    buildings: city.buildings.length,
    roads: city.roads.length,
    areas: city.areas.length,
    trees: city.trees.length,
    landmarks: city.landmarks.length,
  }),
);
