import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readWorld} from './world-files.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = read('dist/world.json'), world = readWorld();
assert.equal(manifest.version, 1);
for (const [key, name] of Object.entries(manifest.files)) {
  assert(!name.includes('/') && name.endsWith('.json'), 'local layer filename');
  assert.equal(createHash('sha256').update(fs.readFileSync(`dist/${name}`)).digest('hex'), manifest.checksums[key], 'layer checksum');
}
if (fs.existsSync('dist/city.json')) assert.deepEqual(world, read('dist/city.json'), 'geography, floors and capabilities preserved from legacy snapshot');
assert.equal(world.buildings.length, 7448);
assert.equal(world.roads.length, 616);
for (const b of world.buildings) {
  assert.equal(b.h, Math.round((b.floors*3.05+.4)*100)/100);
  for (const ring of [b.p, ...b.holes]) for (const p of ring) assert(p.length === 2 && p.every(Number.isFinite));
}
const heights = read('dist/height-samples.json');
assert.equal(heights.buildingsSha256, manifest.checksums.buildings, 'overlay targets this building snapshot');
assert(heights.source.startsWith('IGN /'));
assert(heights.sourceUrls.MDSnE.startsWith('https://wcs-mds.idee.es/'));
assert.equal(heights.license, 'CC BY 4.0 scne.es');
const catalog = read('source-data/facade-catalog.json');
assert.equal(catalog.buildingsSha256, manifest.checksums.buildings);
assert.equal(catalog.fronts.length, 276);
for (const f of catalog.fronts) {
  const b = world.buildings[f.buildingIndex];
  assert.deepEqual(f.a, b.p[f.edgeIndex]);
  assert.deepEqual(f.b, b.p[(f.edgeIndex+1)%b.p.length]);
  const measured = heights.entries.find(s=>s.index === f.buildingIndex);
  assert.equal(f.height, measured?.height ?? b.h, 'front uses current independent height');
}
for (const file of ['game3d.js','index.html','height-samples.json','world.json','facade-profiles.json']) {
  assert(!/REDIAM|portalrediam/i.test(fs.readFileSync(`dist/${file}`, 'utf8')), 'runtime has no REDIAM dependency');
}
const sources = read('dist/data-sources.json');
for (const record of sources.records) for (const file of record.files) {
  assert.equal(createHash('sha256').update(fs.readFileSync(`dist/${file}`)).digest('hex'), record.sha256[file], 'provenance file checksum');
}
assert.deepEqual(read('dist/frontages.json'), catalog, 'downloadable frontage catalogue current');
assert.equal(fs.readFileSync('dist/THIRD_PARTY_NOTICES.md','utf8'),fs.readFileSync('THIRD_PARTY_NOTICES.md','utf8'),'web credits current');
assert.equal(fs.readFileSync('dist/LICENSE','utf8'),fs.readFileSync('LICENSE','utf8'),'web code license current');
for (const file of ['dist/licenses/ODbL-1.0.txt','dist/licenses/IGN-conditions.pdf']) assert(fs.statSync(file).size > 1000, 'license bundled');
console.log('World layers, geographic preservation, provenance and 276 frontage heights passed');
