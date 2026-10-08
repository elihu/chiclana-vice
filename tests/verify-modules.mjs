// Módulos del juego: importmap y versión común, evaluación sin DOM y grafo sin ciclos.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Paso 1.1: false. Desde el paso 1.2: true.
const STRICT_TOP_LEVEL = true;
// Se cargan solo bajo demanda (import dinámico); van en el importmap pero no se precargan.
const ON_DEMAND = new Set(['./js/debug/inspector.js']);

const html = fs.readFileSync('web/index.html', 'utf8');
const version = html.match(/game3d\.js\?v=([^"]+)"/)[1];
assert.equal(html.match(/style\.css\?v=([^"]+)"/)[1], version, 'CSS y JS comparten versión');
const mapText = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
assert(mapText, 'index.html declara un importmap');
assert(
  html.indexOf('type="importmap"') < html.indexOf('<script type="module"'),
  'el importmap va antes del primer módulo',
);
const imports = JSON.parse(mapText).imports;

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) =>
          e.isDirectory()
            ? walk(path.join(dir, e.name))
            : e.name.endsWith('.js')
              ? [path.join(dir, e.name)]
              : [],
        )
    : [];
const files = walk('web/js');
const key = (file) => './' + path.relative('web', file).split(path.sep).join('/');
const expected = [
  ...files.map(key),
  './vendor/three.module.min.js',
  './game-data.js',
  './progress.js',
].sort();
assert.deepEqual(Object.keys(imports).sort(), expected, 'el importmap lista todos los módulos');
for (const [k, v] of Object.entries(imports))
  assert.equal(v, k + '?v=' + version, 'versión común en ' + k);
const preload = [...html.matchAll(/<link\s+rel="modulepreload"\s+href="([^"]+)"/g)].map(
  (m) => './' + m[1],
);
assert.deepEqual(
  preload.sort(),
  Object.entries(imports)
    .filter(([k]) => !ON_DEMAND.has(k))
    .map(([, v]) => v)
    .sort(),
  'modulepreload coincide con el importmap',
);

// Grafo de imports estáticos: relativos, sin versión escrita a mano y sin ciclos.
const graph = new Map();
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  assert(
    !/(?:from\s*|import\()['"][^'"]*\?v=/.test(source),
    'sin ?v= escrito a mano en los imports de ' + file,
  );
  assert(!/^[^\s/*].*\bawait\b/m.test(source), 'sin await de nivel superior en ' + file);
  const deps = [];
  for (const [, spec] of source.matchAll(/^(?:import|export)\b[^;]*?\bfrom\s*'([^']+)'/gms)) {
    assert(spec.startsWith('.'), 'solo imports relativos en ' + file + ': ' + spec);
    deps.push(path.normalize(path.join(path.dirname(file), spec)));
  }
  graph.set(path.normalize(file), deps);
}
// Comprueba también imports dinámicos: las excepciones son archivos concretos.
const layers = new Map(
  ['core', 'engine', 'world', 'game', 'ui', 'debug'].map((name, rank) => [name, rank]),
);
const layerOf = (file) => layers.get(file.split(path.sep)[2]);
const allowedDependency = (file, dependency) => {
  const rank = layerOf(file),
    dependencyRank = layerOf(dependency);
  if (rank === undefined || dependencyRank === undefined || dependencyRank <= rank) return true;
  if (dependency === path.normalize('web/js/ui/feedback.js')) return true;
  return (
    file.startsWith(path.normalize('web/js/game/')) &&
    dependency === path.normalize('web/js/ui/hud.js')
  );
};
assert(
  !allowedDependency('web/js/engine/example.js', 'web/js/world/terrain.js'),
  'rechaza engine -> world',
);
assert(
  !allowedDependency('web/js/core/example.js', 'web/js/ui/hud.js'),
  'no amplía la excepción HUD a core',
);
for (const [file, dependencies] of graph) {
  const source = fs.readFileSync(file, 'utf8');
  const dynamic = [...source.matchAll(/import\(\s*'([^']+)'\s*\)/g)].map(([, spec]) =>
    path.normalize(path.join(path.dirname(file), spec)),
  );
  for (const dependency of [...dependencies, ...dynamic])
    assert(
      allowedDependency(file, dependency),
      'dirección de capas: ' + file + ' -> ' + dependency,
    );
  if (file === path.normalize('web/js/ui/feedback.js'))
    assert(
      dependencies.every((dep) => layerOf(dep) === 0),
      'feedback solo depende de core',
    );
}

const state = new Map();
const visit = (node, trail) => {
  if (state.get(node) === 'done') return;
  assert.notEqual(state.get(node), 'open', 'ciclo de imports: ' + [...trail, node].join(' -> '));
  state.set(node, 'open');
  for (const dep of graph.get(node) || []) visit(dep, [...trail, node]);
  state.set(node, 'done');
};
for (const node of graph.keys()) visit(node, []);

// Cada módulo se evalúa en un proceso sin DOM: ningún efecto de nivel superior.
if (STRICT_TOP_LEVEL) {
  const urls = files.map((f) => pathToFileURL(path.resolve(f)).href);
  const script = `for (const u of ${JSON.stringify(urls)}) await import(u);`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, 'módulos evaluables sin DOM:\n' + child.stderr);
}
console.log('Modules', files.length, 'versioned', version, 'acyclic, no top-level effects');
