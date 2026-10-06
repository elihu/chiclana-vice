// Explicit allowlist: a fresh public snapshot, never the local .git/history.
// node tools/export-public.mjs /absolute/path/to/new-directory
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = fs.realpathSync('.');
if (!process.argv[2]) throw Error('Provide a new export directory outside this repository.');
const destination = path.resolve(process.argv[2]);
if (destination === root || destination.startsWith(root + path.sep))
  throw Error('Export must be outside the local repository.');
if (fs.existsSync(destination))
  throw Error('Destination already exists; no files will be overwritten.');
execFileSync(process.execPath, ['tests/verify-world.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/verify3d.mjs'], { stdio: 'inherit' });

const files = [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'README.md',
  'AGENTS.md',
  'docs/README.md',
  'docs/ESTRUCTURA.md',
  'docs/DESARROLLO.md',
  'docs/CONTINUAR-CODEX.md',
  'docs/MAP_SOURCES.md',
  'docs/DATOS_PUBLICOS.md',
  'docs/PUBLICACION.md',
  'docs/GIT_WORKFLOW.md',
  'docs/ALTURAS_PILOTO.md',
  '.gitattributes',
  '.github/workflows/pages.yml',
  'package.json',
  'package-lock.json',
  'eslint.config.mjs',
  '.prettierrc.json',
  '.prettierignore',
  '.editorconfig',
  'tests/verify3d.mjs',
  'tests/verify-world.mjs',
  'tools/world-files.mjs',
  'tools/prepare-world.mjs',
  'tools/export-provenance.mjs',
  'tools/audit-ign-heights.py',
  'tools/export-facades.mjs',
  'tools/export-public.mjs',
  'extras/rebuild-map.py',
  'extras/README.md',
  'source-data/facade-catalog.json',
  'source-data/height-audit-ign.json',
];
files.push(
  ...[
    'index.html',
    'style.css',
    'game3d.js',
    'favicon.svg',
    'measure.js',
    'world.json',
    'buildings.json',
    'osm-world.json',
    'facade-profiles.json',
    'height-samples.json',
    'roads-osm.json',
    'street-objects.json',
    'aerial.jpg',
    'data-sources.json',
    'frontages.json',
    'THIRD_PARTY_NOTICES.md',
    'LICENSE',
    'licenses/ODbL-1.0.txt',
    'licenses/IGN-conditions.pdf',
    'vendor/three.module.js',
    'vendor/LICENSE-three.txt',
    'arcade/index.html',
    'arcade/style.css',
    'arcade/game.js',
    'arcade/favicon.svg',
  ].map((file) => 'web/' + file),
);
for (const file of files) {
  if (!fs.lstatSync(file).isFile()) throw Error('Not a regular file: ' + file);
}
fs.mkdirSync(destination, { recursive: true });
for (const file of files) {
  const output = path.join(destination, file);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(file, output, fs.constants.COPYFILE_EXCL);
}
fs.writeFileSync(
  path.join(destination, '.gitignore'),
  '.env\n.env.*\n.venv/\n__pycache__/\nnode_modules/\n*.log\n*.zip\n*.tif\n*.tiff\n*.laz\n*.las\nrebuilt-city.json\ntests/qa3d-runtime.mjs\n',
);
console.log(
  JSON.stringify({ destination, files: files.length, historyCopied: false, published: false }),
);
