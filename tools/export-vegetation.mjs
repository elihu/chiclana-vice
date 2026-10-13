// Publica únicamente copas aceptadas de una instantánea revisada.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { validateTreeReview, treeCandidateStatus } from '../web/js/debug/inspector.js';

const bytes = fs.readFileSync('source-data/tree-candidates.json');
const candidates = JSON.parse(bytes);
const review = validateTreeReview(
  JSON.parse(fs.readFileSync('source-data/tree-review.json', 'utf8')),
  candidates.candidates,
  createHash('sha256').update(bytes).digest('hex'),
);
const trees = candidates.candidates
  .filter((c) => treeCandidateStatus(c, review) === 'aceptado')
  .map(({ x, z, r }) => {
    if (![x, z, r].every(Number.isFinite) || r <= 0) throw Error('Copa inválida');
    return [x, z, r].map((n) => Math.round(n * 100) / 100);
  });
const layer = {
  version: 1,
  source: 'PNOA 2022-07 + MDSnV 2008–2015; detección y tamaños estimados por el proyecto',
  license: 'CC-BY-4.0',
  attribution:
    'Obra derivada de PNOA 2022-07 CC-BY 4.0 IGN / PNOA / SCNE (scne.es) y de MDSNV 2008-2015 CC-BY 4.0 scne.es; detección de copas y tamaños estimados por el proyecto, posiciones aproximadas, no un inventario de arbolado',
  trees,
};
fs.writeFileSync('web/vegetation.json', JSON.stringify(layer) + '\n');
console.log('Copas publicadas:', trees.length);
