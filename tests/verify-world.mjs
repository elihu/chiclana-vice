import './verify-bounds.mjs';
import { insideBounds, validBounds } from '../web/js/world/bounds.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { geographicHash } from '../tools/geographic-fingerprint.mjs';
import './verify-geography.mjs';
import { readWorld } from '../tools/world-files.mjs';
import { validateSurfaceDesign } from '../web/js/world/surface-model.js';
import { KIT_PIECES } from '../web/js/world/facade-kit.js';
import {
  validateCityDesign,
  validateCorrections,
  validateFacadeDesigns,
} from '../web/js/world/design-validate.js';
import { applyCorrections } from '../web/js/world/corrections.js';
import { createTerrain } from '../web/js/world/terrain.js';

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = read('web/world.json'),
  world = readWorld();
assert.equal(manifest.version, 1);
assert(validBounds(manifest.bounds), 'rectángulos válidos');
// Teselas derivadas: cobertura exacta, dimensiones JPEG y bytes publicados.
{
  const aerial = read('web/aerial/index.json');
  assert.equal(aerial.version, 1);
  assert.equal(aerial.tile, 255);
  assert.equal(aerial.margin, 20.5);
  assert.deepEqual(aerial.levels, { hi: [1184, 0.25], lo: [592, 0.5] });
  assert.equal(aerial.acquisition, '2022-07');
  const expected = new Set();
  for (const [x0, x1, z0, z1] of manifest.bounds)
    for (let i = Math.floor(x0 / 255); i < Math.ceil(x1 / 255); i++)
      for (let j = Math.floor(z0 / 255); j < Math.ceil(z1 / 255); j++) expected.add(`${i}_${j}`);
  assert.equal(aerial.tiles.length, expected.size);
  assert.deepEqual(new Set(aerial.tiles.map(([i, j]) => `${i}_${j}`)), expected);
  const box = [
    Math.min(...manifest.bounds.map((b) => b[0])),
    Math.max(...manifest.bounds.map((b) => b[1])),
    Math.min(...manifest.bounds.map((b) => b[2])),
    Math.max(...manifest.bounds.map((b) => b[3])),
  ];
  assert.deepEqual(aerial.general.box, box);
  const scale = Math.max(1, (box[1] - box[0]) / 2048, (box[3] - box[2]) / 2048);
  assert.deepEqual(aerial.general.size, [
    Math.ceil((box[1] - box[0]) / scale),
    Math.ceil((box[3] - box[2]) / scale),
  ]);
  const files = { [aerial.general.file]: aerial.general.size };
  for (const [i, j] of aerial.tiles)
    for (const [level, [size]] of Object.entries(aerial.levels))
      files[`${level}/${i}_${j}.jpg`] = [size, size];
  assert.deepEqual(Object.keys(aerial.sha256).sort(), Object.keys(files).sort());
  for (const [file, size] of Object.entries(files)) {
    const bytes = fs.readFileSync(`web/aerial/${file}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), aerial.sha256[file]);
    assert.equal(bytes.readUInt16BE(0), 0xffd8, 'JPEG');
    let dimensions;
    for (let offset = 2; offset < bytes.length;) {
      assert.equal(bytes[offset++], 0xff);
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        dimensions = [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
        break;
      }
      offset += bytes.readUInt16BE(offset);
    }
    assert.deepEqual(dimensions, size, file);
  }
}
for (const [key, name] of Object.entries(manifest.files)) {
  assert(!name.includes('/') && name.endsWith('.json'), 'local layer filename');
  assert.equal(
    createHash('sha256')
      .update(fs.readFileSync(`web/${name}`))
      .digest('hex'),
    manifest.checksums[key],
    'layer checksum',
  );
}
// Fixed fingerprint of the real geography (footprints, courtyards, floors, roads), independent
// of metadata and checksums. A deliberate geometry change updates it in its own commit:
// node tests/verify-world.mjs --print-geometry
const geometryHash = geographicHash(world);
if (process.argv.includes('--print-geometry')) console.log(geometryHash);
assert.equal(
  geometryHash,
  read('source-data/geometry-baseline.json').sha256,
  'geography and floors preserved (source-data/geometry-baseline.json)',
);
assert(world.buildings.length > 0 && world.roads.length > 0, 'nonempty map');
for (const r of world.roads) {
  assert(r.p.length >= 2 && Number.isFinite(r.w) && r.w > 0, 'valid road');
  for (const p of r.p) assert(p.length === 2 && p.every(Number.isFinite));
}
const policy = read('source-data/height-policy.json');
assert.deepEqual(read('web/facade-profiles.json').heightPolicy, policy, 'height policy generated');
for (const b of world.buildings) {
  assert(Number.isInteger(b.floors) && b.floors > 0);
  assert(b.p.length >= 3, 'closed footprint');
  assert.equal(b.h, Math.round((b.floors * policy.floorHeight + policy.baseOffset) * 100) / 100);
  for (const ring of [b.p, ...b.holes])
    for (const p of ring) assert(p.length === 2 && p.every(Number.isFinite));
}
const heights = read('web/height-samples.json');
assert.equal(
  heights.buildingsSha256,
  manifest.checksums.buildings,
  'overlay targets this building snapshot',
);
assert(heights.source.startsWith('IGN /'));
assert(heights.sourceUrls.MDSnE.startsWith('https://wcs-mds.idee.es/'));
assert.equal(heights.license, 'CC BY 4.0 scne.es');
// CC BY 4.0 requires attribution: generated by tools/audit-ign-heights.py, copied to provenance.
assert.match(heights.attribution, /PNOA-LiDAR.*CC-BY 4\.0 scne\.es/);
assert.equal(
  read('web/data-sources.json').records.find((r) => r.files.includes('height-samples.json'))
    .attribution,
  heights.attribution,
);
assert(!fs.existsSync('web/roads-osm.json'), 'osm-world.json is the only ODbL road download');
const catalog = read('web/frontages.json');
assert.equal(catalog.buildingsSha256, manifest.checksums.buildings);
assert(catalog.fronts.length > 0, 'frontage catalogue nonempty');
assert.equal(new Set(catalog.fronts.map((f) => f.id)).size, catalog.fronts.length, 'unique fronts');
for (const f of catalog.fronts) {
  const b = world.buildings[f.buildingIndex];
  assert(b && Number.isInteger(f.edgeIndex) && f.edgeIndex >= 0 && f.edgeIndex < b.p.length);
  assert.deepEqual(f.a, b.p[f.edgeIndex]);
  assert.deepEqual(f.b, b.p[(f.edgeIndex + 1) % b.p.length]);
  const measured = heights.entries.find((s) => s.index === f.buildingIndex);
  assert.equal(f.height, measured?.height ?? b.h, 'front uses current independent height');
}
// Diseños de fachada: validación estructural y comprobaciones cruzadas con las capas.
{
  const designs = read('web/facade-designs.json'),
    palette = read('web/facade-profiles.json').palette,
    city = read('web/city-design.json'),
    cityErrors = validateCityDesign(city, { recipes: Object.keys(designs.recipes) }),
    errors = validateFacadeDesigns(designs, {
      kitPieces: KIT_PIECES,
      palette,
      frontRecipes: [city.frontages.recipe],
    });
  assert.deepEqual(cityErrors, [], 'city design valid:\n' + cityErrors.join('\n'));
  assert.deepEqual(
    validateSurfaceDesign(city.terrainSurfaces, readWorld()),
    [],
    'anclajes verticales vigentes',
  );
  assert.deepEqual(errors, [], 'facade designs valid:\n' + errors.join('\n'));
  const inside = (p) => insideBounds(...p, 0, manifest.bounds);
  const landmarks = world.landmarks || [];
  // Zonas y calles de city-design.json: dentro del mundo y con vías reales en OSM.
  for (const [name, [x0, x1, z0, z1]] of Object.entries(city.zones))
    for (const p of [
      [x0, z0],
      [x1, z1],
    ])
      assert(inside(p), `zone ${name} corner inside the world`);
  const roadNames = new Set(world.roads.map((r) => r.name));
  for (const street of city.frontages.streets)
    assert(roadNames.has(street), `frontage street ${street} exists in OSM roads`);
  // Mobiliario: puntos dentro del mundo y calles de los pivotes con vías reales.
  const furniture = city.furniture;
  for (const p of [
    ...furniture.protectedPoints,
    furniture.plazaLamps.from,
    furniture.plazaLamps.to,
    ...furniture.benches.map((b) => b.slice(0, 2)),
    city.vegetation.marketTrees.from,
    city.vegetation.marketTrees.to,
  ])
    assert(inside(p), `furniture point ${p} inside the world`);
  for (const street of furniture.bollards.streets)
    assert(roadNames.has(street), `bollard street ${street} exists in OSM roads`);
  for (const m of city.buildings.minimumHeights.filter((x) => x.center))
    assert(inside(m.center), `minimum height ${m.name} inside the world`);
  // Tipos de vía de city-design.json: existen en OSM y los peatonales no son circulables.
  const roadTypes = new Set(world.roads.map((r) => r.type));
  for (const type of city.pavements.nonDrivableTypes)
    assert(roadTypes.has(type), `non-drivable type ${type} exists in OSM roads`);
  for (const type of city.pavements.pedestrianTypes)
    assert(city.pavements.nonDrivableTypes.includes(type), `pedestrian type ${type} not drivable`);
  const claimed = new Map();
  for (const b of designs.buildings) {
    if (b.landmark)
      assert(
        landmarks.some((l) => l.name.includes(b.landmark)),
        `landmark ${b.landmark} exists`,
      );
    for (const f of b.fronts) {
      const a = f.anchor;
      for (const p of [a.a, a.b, a.center, ...(a.ring || [])].filter(Boolean))
        assert(inside(p), `anchor point inside the world in ${b.id}`);
      if (a.landmarkRing)
        assert(
          landmarks.some((l) => l.name.includes(a.landmarkRing)),
          `landmarkRing ${a.landmarkRing}`,
        );
      if (a.front) {
        const entry = catalog.fronts.find((x) => x.id === a.front);
        assert(entry, `front ${a.front} exists in frontages.json`);
        assert.equal(entry.footprintSha256, a.footprintSha256, `footprint hash of ${a.front}`);
        assert(
          !claimed.has(a.front),
          `front ${a.front} anchored by ${claimed.get(a.front)} and ${b.id}`,
        );
        claimed.set(a.front, b.id);
      }
    }
  }
}
// Correcciones manuales: archivo válido y aplicable sobre las capas de base, sin tocarlas.
{
  const file = read('web/map-corrections.json'),
    errors = validateCorrections(file);
  assert.deepEqual(errors, [], 'map corrections valid:\n' + errors.join('\n'));
  const layers = structuredClone({
      roads: world.roads,
      areas: world.areas,
      buildings: world.buildings,
    }),
    applied = applyCorrections(layers, file);
  assert.equal(applied.length, file.corrections.length, 'every published correction applies');
  for (const r of layers.roads) {
    assert(r.p.length >= 2 && Number.isFinite(r.w) && r.w > 0, 'valid road after corrections');
    for (const p of r.p) assert(p.length === 2 && p.every(Number.isFinite));
  }
  for (const c of file.corrections)
    if (c.add) assert.equal(c.add.id, c.id, 'road.add id equals the correction id');
  // Un contorno corregido cambia su huella: frontages.json se regenera en el mismo commit.
  for (const front of catalog.fronts)
    assert.equal(
      createHash('sha256')
        .update(JSON.stringify(layers.buildings[front.buildingIndex].p))
        .digest('hex'),
      front.footprintSha256,
      `frontages.json matches the corrected footprint of ${front.id}`,
    );
  if (file.appliesTo?.osmSha256)
    assert.equal(
      createHash('sha256').update(fs.readFileSync('web/osm-world.json')).digest('hex'),
      file.appliesTo.osmSha256,
      'corrections apply to the current osm-world.json',
    );
  if (file.appliesTo?.buildingsSha256)
    assert.equal(
      createHash('sha256').update(fs.readFileSync('web/buildings.json')).digest('hex'),
      file.appliesTo.buildingsSha256,
      'corrections apply to the current buildings.json',
    );
}
for (const file of [
  'game3d.js',
  'index.html',
  'height-samples.json',
  'world.json',
  'facade-profiles.json',
  'facade-designs.json',
  'city-design.json',
  'map-corrections.json',
]) {
  assert(
    !/REDIAM|portalrediam/i.test(fs.readFileSync(`web/${file}`, 'utf8')),
    'runtime has no REDIAM dependency',
  );
}
const sources = read('web/data-sources.json');
if (fs.existsSync('web/terrain.json')) {
  const terrain = read('web/terrain.json'),
    bytes = fs.readFileSync('web/terrain.bin');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), terrain.sha256);
  createTerrain(
    terrain,
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    world,
  );
  const record = sources.records.find((r) => r.files.includes('terrain.json'));
  assert(record && record.files.includes('terrain.bin'), 'both terrain files registered');
  assert.equal(record.attribution, terrain.attribution);
  assert.equal(
    read('source-data/terrain-baseline.json').sha256,
    terrain.sha256,
    'independent terrain fingerprint',
  );
}
for (const record of sources.records)
  for (const file of record.files) {
    assert.equal(
      createHash('sha256')
        .update(fs.readFileSync(`web/${file}`))
        .digest('hex'),
      record.sha256[file],
      'provenance file checksum',
    );
  }
assert.equal(
  fs.readFileSync('web/THIRD_PARTY_NOTICES.md', 'utf8'),
  fs.readFileSync('THIRD_PARTY_NOTICES.md', 'utf8'),
  'web credits current',
);
assert.equal(
  fs.readFileSync('web/LICENSE', 'utf8'),
  fs.readFileSync('LICENSE', 'utf8'),
  'web code license current',
);
for (const file of ['web/licenses/ODbL-1.0.txt', 'web/licenses/IGN-conditions.pdf'])
  assert(fs.statSync(file).size > 1000, 'license bundled');
console.log('World layers, geographic preservation, provenance and frontage heights passed');
