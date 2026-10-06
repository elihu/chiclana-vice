// Catálogo canónico publicado: IDs de aristas, alturas y referencias aproximadas.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRuntime } from '../tests/runtime-harness.mjs';

const { g } = await createRuntime();
const catalogue = {
  version: 1,
  buildingsSha256: createHash('sha256').update(fs.readFileSync('web/buildings.json')).digest('hex'),
  origin: g.city.origin,
  sources: {
    footprints: 'D.G. del Catastro INSPIRE BU; see MAP_SOURCES.md',
    heights: 'IGN / PNOA first coverage; CC BY 4.0; or floor-count estimates',
    streetNames: 'OpenStreetMap contributors, ODbL 1.0',
  },
  limits:
    'IDs belong to this city snapshot; geometry is simplified. Generic frontages are not photo-mapped. Civic/church custom geometry is separate.',
  fronts: g.facadeWork.fronts.map((f) => ({
    id: f.id,
    buildingIndex: f.buildingIndex,
    edgeIndex: f.edgeIndex,
    footprintSha256: createHash('sha256')
      .update(JSON.stringify(g.city.buildings[f.buildingIndex].p))
      .digest('hex'),
    a: f.a,
    b: f.q,
    outward: [f.nx, f.nz],
    width: f.len,
    height: f.h,
    heightSource: g.city.buildings[f.buildingIndex].heightSource || 'Catastro floor-count estimate',
    floors: f.floors,
    street: f.street,
    status: 'approximate',
    reference: null,
  })),
};
const destination = process.argv[2] || 'web/frontages.json';
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(catalogue, null, 2) + '\n');
console.log(JSON.stringify({ destination, fronts: catalogue.fronts.length }));
