// Local catalogue for selecting a cadastral edge and attaching a photo/profile.
// Uses the existing CPU scene setup; does not render WebGL or alter the game.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chiclana-fronts-'));
try {
  const verifier = fs.readFileSync('tests/verify3d.mjs', 'utf8');
  const marker = "assert(!g.blocked(g.player.x";
  if (!verifier.includes(marker)) throw Error('Revisar setup de verify3d.');
  const setup = verifier.slice(0, verifier.indexOf(marker))
    .replace("'../web/vendor/three.module.js'", JSON.stringify(pathToFileURL(path.resolve('web/vendor/three.module.js')).href))
    .replace("'tests/qa3d-runtime.mjs'", JSON.stringify(path.join(temp, 'runtime.mjs')))
    .replace("'./qa3d-runtime.mjs'", "'./runtime.mjs'") + '\nexport { g };\n';
  fs.writeFileSync(path.join(temp, 'setup.mjs'), setup);
  const { g } = await import(pathToFileURL(path.join(temp, 'setup.mjs')));
  const catalogue = {
    version: 1,
    buildingsSha256: createHash('sha256').update(fs.readFileSync('web/buildings.json')).digest('hex'),
    origin: g.city.origin,
    sources: { footprints: 'D.G. del Catastro INSPIRE BU; see MAP_SOURCES.md', heights: 'IGN / PNOA first coverage; CC BY 4.0; or floor-count estimates', streetNames: 'OpenStreetMap contributors, ODbL 1.0' },
    limits: 'IDs belong to this city snapshot; geometry is simplified. Generic frontages are not photo-mapped. Civic/church custom geometry is separate.',
    fronts: g.facadeWork.fronts.map(f => ({
      id: f.id, buildingIndex: f.buildingIndex, edgeIndex: f.edgeIndex,
      footprintSha256: createHash('sha256').update(JSON.stringify(g.city.buildings[f.buildingIndex].p)).digest('hex'),
      a: f.a, b: f.q, outward: [f.nx,f.nz], width: f.len,
      height: f.h, heightSource: g.city.buildings[f.buildingIndex].heightSource || 'Catastro floor-count estimate', floors: f.floors, street: f.street,
      status: 'approximate', reference: null,
    })),
  };
  const destination = process.argv[2] || 'source-data/facade-catalog.json';
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(catalogue, null, 2) + '\n');
  console.log(JSON.stringify({ destination, fronts: catalogue.fronts.length }));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
