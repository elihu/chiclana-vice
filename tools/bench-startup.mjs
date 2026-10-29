// Arranque y actualización en CPU, con DOM y WebGL simulados; no mide GPU ni móvil.
// Uso, desde la raíz del repositorio que se quiere medir:
//   node tools/bench-startup.mjs --out /tmp/chiclana-bench/arranque-base.json
//   node tools/bench-startup.mjs --compare /tmp/chiclana-bench/arranque-base.json
//   node tools/bench-startup.mjs --out actual.json --compare referencia.json
// Ejecutar tres veces y comparar medianas en la misma máquina y versión de Node.
// Cada ejecución usa un proceso nuevo; el arnés se importa desde el directorio actual.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { out: { type: 'string' }, compare: { type: 'string' } },
});
const reference = values.compare ? JSON.parse(fs.readFileSync(values.compare, 'utf8')) : null;
if (reference)
  assert.equal(reference.node, process.version, 'Comparar con la misma versión de Node');

const { createRuntime } = await import(
  pathToFileURL(path.resolve('tests/runtime-harness.mjs')).href
);
const bootStarted = performance.now();
const { g } = await createRuntime();
const bootMs = performance.now() - bootStarted;
const stages = g.startupTimings();
assert(stages.length > 0, 'El arranque debe registrar etapas');
assert.equal(new Set(stages.map(({ name }) => name)).size, stages.length, 'Etapas únicas');
assert(stages.every(({ name, ms }) => typeof name === 'string' && Number.isFinite(ms) && ms >= 0));

g.start();
for (let i = 0; i < 60; i++) g.update(1 / 60);
const updateStarted = performance.now();
for (let i = 0; i < 1200; i++) g.update(1 / 60);
const updateMsPerFrame = (performance.now() - updateStarted) / 1200;
const result = { node: process.version, bootMs, stages, updateMsPerFrame };

if (values.out) {
  fs.mkdirSync(path.dirname(values.out), { recursive: true });
  fs.writeFileSync(values.out, JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify(result, null, 2));
if (reference) {
  const before = new Map(reference.stages.map(({ name, ms }) => [name, ms]));
  const after = new Map(stages.map(({ name, ms }) => [name, ms]));
  const difference = (name, base, current) => ({
    name,
    'referencia (ms)': base ?? null,
    'actual (ms)': current ?? null,
    'diferencia (ms)': base !== undefined && current !== undefined ? current - base : null,
    'diferencia (%)': base > 0 && current !== undefined ? ((current - base) / base) * 100 : null,
  });
  console.table([
    ...[...new Set([...before.keys(), ...after.keys()])].map((name) =>
      difference(name, before.get(name), after.get(name)),
    ),
    difference('bootMs', reference.bootMs, bootMs),
    difference('updateMsPerFrame', reference.updateMsPerFrame, updateMsPerFrame),
  ]);
}
