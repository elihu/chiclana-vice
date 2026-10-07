// Metadatos de la copia local o del terreno validado, sin reescribir edificios/vías.
// node tools/export-terrain-metadata.mjs DIRECTORIO [HUELLA]
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createTerrain } from '../web/js/world/terrain.js';

const directory = process.argv[2],
  baseline = process.argv[3];
if (!directory) throw Error('Indica el directorio con world.json y terrain.json');
const terrain = JSON.parse(fs.readFileSync(directory + '/terrain.json', 'utf8')),
  bytes = fs.readFileSync(directory + '/terrain.bin'),
  manifest = JSON.parse(fs.readFileSync(directory + '/world.json', 'utf8'));
if (createHash('sha256').update(bytes).digest('hex') !== terrain.sha256)
  throw Error('Checksum de terreno incorrecto');
createTerrain(
  terrain,
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  manifest,
);
manifest.meta.terrain = terrain.preview
  ? 'Relieve MDT provisional: superficies y accesos pendientes de validación.'
  : 'Relieve de juego derivado del MDT IGN; superficies y accesos aproximados.';
fs.writeFileSync(directory + '/world.json', JSON.stringify(manifest) + '\n');
if (baseline)
  fs.writeFileSync(
    baseline,
    JSON.stringify(
      {
        version: 1,
        sha256: terrain.sha256,
        sourceSha256: terrain.sourceSha256,
        origin: terrain.origin,
        size: terrain.size,
        preview: terrain.preview,
      },
      null,
      2,
    ) + '\n',
  );
