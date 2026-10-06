import fs from 'node:fs';
import { createHash } from 'node:crypto';

const heights = JSON.parse(fs.readFileSync('web/height-samples.json', 'utf8'));
fs.copyFileSync('source-data/facade-catalog.json', 'web/frontages.json');
fs.copyFileSync('THIRD_PARTY_NOTICES.md', 'web/THIRD_PARTY_NOTICES.md');
fs.copyFileSync('LICENSE', 'web/LICENSE');
const hash = (file) =>
  createHash('sha256')
    .update(fs.readFileSync('web/' + file))
    .digest('hex');
const records = [
  {
    files: ['buildings.json'],
    source: 'D.G. del Catastro INSPIRE BU, municipality 11015',
    date: '2026-10-04',
    conditions: 'Catastro INSPIRE transformed-product terms; no cadastral validity',
    licenseUrl: 'https://www.catastro.hacienda.gob.es/webinspire/documentos/Licencia.pdf',
    transformation:
      'Clipping, 0.12m topology-preserving simplification, local coordinates, game volume reconstruction and floor-based heights',
  },
  {
    files: ['osm-world.json', 'roads-osm.json', 'street-objects.json'],
    source: '© OpenStreetMap contributors',
    date: '2026-10-04',
    conditions: 'ODbL-1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    transformation:
      'Local game extraction; all used roads/areas/landmarks/trees/objects made available',
  },
  {
    files: ['aerial.jpg'],
    source: '© IGN / PNOA / SCNE',
    date: '2026-10-04',
    conditions: 'CC-BY-4.0 compatible IGN terms',
    licenseUrl: 'https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf',
    sourceUrl: 'https://www.ign.es/wms-inspire/pnoa-ma',
    attribution: 'Obra derivada de PNOA 2022-07 CC-BY 4.0 IGN / PNOA / SCNE (scne.es)',
    acquisitionDate: '2022-07',
    acquisitionDateEvidence:
      'WMS OI.MosaicElement GetFeatureInfo at playable-area centre on 2026-10-06; current GetMap SHA256 equals distributed aerial.jpg',
    transformation: '4096x3072 playable-area orthophoto crop used for ground and roofs',
  },
  {
    files: ['height-samples.json'],
    source: heights.source,
    date: heights.accessDate,
    attribution: heights.attribution,
    sourcePeriod: heights.sourcePeriod,
    conditions: heights.license,
    licenseUrl: heights.licenseUrl,
    sourceUrls: heights.sourceUrls,
    transformation: heights.method,
    limits: heights.limits,
    sourceSha256: heights.sourceSha256,
  },
  {
    files: ['facade-profiles.json'],
    source: 'Authored approximate procedural building parameters',
    conditions:
      'Original parameters; external reference rights not granted. See notices for photo/architecture references.',
    transformation:
      'Building features interpreted as primitives; no photographic textures, plans or photographic composition distributed',
  },
  {
    files: ['frontages.json'],
    source: 'Catastro contours + OSM street associations + IGN or floor-based heights',
    conditions:
      'Mixed provenance; Catastro terms, ODbL for OSM associations, IGN CC BY for measurements; not blanket MIT/CC0',
    transformation:
      'Cadastral edge identifiers, frontage normals/dimensions, approximate profile selection; references not photo-mapped',
  },
];
for (const record of records)
  record.sha256 = Object.fromEntries(record.files.map((file) => [file, hash(file)]));
fs.writeFileSync(
  'web/data-sources.json',
  JSON.stringify(
    {
      version: 1,
      codeLicense: 'MIT; THIRD_PARTY_NOTICES.md excludes third-party resources',
      credits: 'THIRD_PARTY_NOTICES.md',
      records,
    },
    null,
    2,
  ) + '\n',
);
console.log('Published provenance and license copies updated');
