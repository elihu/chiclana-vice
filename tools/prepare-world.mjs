// Split the transformed snapshot; originals are never inputs to the browser.
// node tools/prepare-world.mjs [local city.json]
import { validBounds, worldBounds } from '../web/js/world/bounds.js';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { readWorld } from './world-files.mjs';
import { resolveBuildingVariation } from './building-variation.mjs';

const input = process.argv[2];
const previousBytes = fs.existsSync('web/buildings.json')
  ? fs.readFileSync('web/buildings.json')
  : null;
const previous = previousBytes ? JSON.parse(previousBytes) : null;
const city = input ? JSON.parse(fs.readFileSync(input, 'utf8')) : readWorld();
const design = JSON.parse(fs.readFileSync('web/city-design.json', 'utf8'));
const variation = JSON.parse(fs.readFileSync('source-data/building-variation.json', 'utf8'));
city.buildings = resolveBuildingVariation(city.buildings, design.buildings, variation);
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
// Una migración solo de apariencia puede renovar las referencias de los derivados.
// Si cambian contornos, alturas o plantas, se exige su regeneración habitual.
const withoutAppearance = (parts) => parts.map(({ paletteIndex, ...part }) => part);
if (
  previous &&
  JSON.stringify(previous.origin) === JSON.stringify(city.origin) &&
  JSON.stringify(withoutAppearance(previous.buildings)) ===
    JSON.stringify(withoutAppearance(city.buildings))
) {
  const oldHash = createHash('sha256').update(previousBytes).digest('hex');
  const newHash = sha('buildings.json');
  for (const file of [
    'web/height-samples.json',
    'web/frontages.json',
    'source-data/height-audit-ign.json',
  ]) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8'),
      payload = JSON.parse(text);
    if (payload.buildingsSha256 === oldHash && oldHash !== newHash)
      fs.writeFileSync(
        file,
        text.replace(
          /("buildingsSha256"\s*:\s*")[0-9a-f]{64}(")/,
          (_, prefix, suffix) => prefix + newHash + suffix,
        ),
      );
  }
}
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
