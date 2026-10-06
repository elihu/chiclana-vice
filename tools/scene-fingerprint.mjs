// Huella de la escena y del comportamiento en CPU (DOM y WebGL simulados; no prueba GPU).
// Uso, desde la raíz del repositorio que se quiere medir:
//   node tools/scene-fingerprint.mjs --out /tmp/chiclana-fp/base.json
//   node tools/scene-fingerprint.mjs --compare /tmp/chiclana-fp/base.json
//   node tools/scene-fingerprint.mjs --compare base.json --ignore resources  (omite claves de primer nivel)
//   node tools/scene-fingerprint.mjs --dump /tmp/chiclana-fp/objetos.txt  (una línea por objeto)
// El arnés se importa desde el directorio actual, así que el mismo script mide otra copia
// (por ejemplo, un worktree en el commit base) si se ejecuta con esa copia como cwd.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const { createRuntime } = await import(
  pathToFileURL(path.resolve('tests/runtime-harness.mjs')).href
);
const { g, els, requested } = await createRuntime();
const sha = () => createHash('sha256');
const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const hashArray = (a) => sha().update(bytes(a)).digest('hex');
const color = (c) => (c?.isColor ? c.getHexString() : (c ?? null));

function materialSignature(m) {
  const keys = [
    'type',
    'side',
    'transparent',
    'opacity',
    'depthWrite',
    'vertexColors',
    'roughness',
    'metalness',
    'emissiveIntensity',
    'flatShading',
  ];
  const out = Object.fromEntries(keys.map((k) => [k, m[k] ?? null]));
  out.color = color(m.color);
  out.emissive = color(m.emissive);
  out.map = m.map
    ? [m.map.constructor.name, m.map.wrapS, m.map.wrapT, m.map.colorSpace, m.map.anisotropy]
    : null;
  return out;
}
function geometrySignature(geometry) {
  const h = sha();
  for (const name of Object.keys(geometry.attributes).sort()) {
    h.update(name);
    h.update(bytes(geometry.attributes[name].array));
  }
  if (geometry.index) h.update(bytes(geometry.index.array));
  return h.digest('hex');
}

// 1. Escena: orden de recorrido, transformaciones, geometría, materiales e instancias.
const counts = {
  objects: 0,
  meshes: 0,
  instancedMeshes: 0,
  instances: 0,
  triangles: 0,
  trianglesWithoutInstancing: 0,
};
const materials = new Set(),
  textures = new Set(),
  geometries = new Set(),
  lines = [];
g.scene.updateMatrixWorld(true);
g.scene.traverse((o) => {
  counts.objects++;
  const record = [
    o.type,
    o.name,
    o.visible,
    o.castShadow,
    o.receiveShadow,
    o.renderOrder,
    o.frustumCulled,
    [...o.matrixWorld.elements],
  ];
  if (o.isLight)
    record.push(color(o.color), o.intensity, o.castShadow, o.shadow?.bias, o.shadow?.normalBias);
  if (o.isMesh) {
    counts.meshes++;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      materials.add(m);
      if (m.map) textures.add(m.map);
    }
    geometries.add(o.geometry);
    const position = o.geometry.getAttribute('position'),
      triangles = (o.geometry.index ? o.geometry.index.count : position.count) / 3;
    counts.trianglesWithoutInstancing += triangles;
    record.push(geometrySignature(o.geometry), list.map(materialSignature));
    if (o.isInstancedMesh) {
      counts.instancedMeshes++;
      counts.instances += o.count;
      counts.triangles += triangles * o.count;
      record.push(
        o.count,
        hashArray(o.instanceMatrix.array),
        o.instanceColor ? hashArray(o.instanceColor.array) : null,
      );
    } else counts.triangles += triangles;
  }
  lines.push(JSON.stringify(record));
});
const scene = {
  ...counts,
  materials: materials.size,
  textures: textures.size,
  geometries: geometries.size,
  strict: sha().update(lines.join('\n')).digest('hex'),
  unordered: sha()
    .update(
      lines
        .map((l) => sha().update(l).digest('hex'))
        .sort()
        .join(),
    )
    .digest('hex'),
};

// 2. Render: ajustes del renderizador simulado, niebla y fondo.
const r = g.renderer;
const render = {
  pixelRatio: r.pixelRatio,
  shadows: r.shadowMap.enabled,
  shadowType: r.shadowMap.type,
  toneMapping: r.toneMapping,
  exposure: r.toneMappingExposure,
  colorSpace: r.outputColorSpace,
  fog: [color(g.scene.fog.color), g.scene.fog.near, g.scene.fog.far],
  background: color(g.scene.background),
};

// 3. Rutas del grafo: entre cada par de lugares, a pie y en coche.
const routes = sha();
for (const a of g.pois)
  for (const b of g.pois)
    for (const drive of [false, true])
      routes.update(
        JSON.stringify(
          g.findRoute(g.nearestNode(a.x, a.z, drive), g.nearestNode(b.x, b.z, drive), drive),
        ),
      );

// 4. Recursos de datos pedidos (los módulos .js se comprueban aparte, en el importmap).
const resources = requested.filter((u) => !u.split('?')[0].endsWith('.js'));

// 5. Comportamiento: 600 pasos de 1/60 s con entrada fija y DOM resultante.
const dom = () =>
  sha()
    .update(
      JSON.stringify(
        Object.keys(els)
          .filter((id) => !id.startsWith('created'))
          .sort()
          .map((id) => [
            id,
            els[id].textContent ?? null,
            els[id].innerHTML ?? null,
            ['hidden', 'show', 'pressed'].map((c) => els[id].classList.contains(c)),
            els[id].style,
            els[id].attributes ?? null,
          ]),
      ),
    )
    .digest('hex');
const domAfterInit = dom();
g.start();
const trace = sha();
g.input.gas = true;
for (let i = 0; i < 600; i++) {
  g.input.right = i % 120 < 30;
  g.update(1 / 60);
  if (i % 30 === 0)
    trace.update(
      JSON.stringify([
        g.player.x,
        g.player.z,
        g.player.a,
        g.state,
        [...g.state.found],
        g.traffic.map((c) => [c.x, c.z, c.a, c.node, c.next]),
        g.people.map((p) => [p.u, p.dir, p.mesh.visible]),
        g.view.position,
      ]),
    );
}
const behaviour = { trace: trace.digest('hex'), domAfterInit, domAfterTrace: dom() };
const result = { scene, render, routes: routes.digest('hex'), resources, behaviour };

const dump = arg('--dump');
if (dump) fs.writeFileSync(dump, lines.join('\n') + '\n');
const out = arg('--out'),
  compare = arg('--compare');
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify(result, null, 2));
if (compare) {
  const base = JSON.parse(fs.readFileSync(compare, 'utf8'));
  const diffs = [];
  const walk = (a, b, at) => {
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
        walk(a[k], b[k], at ? at + '.' + k : k);
    } else if (JSON.stringify(a) !== JSON.stringify(b))
      diffs.push(at + ': ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b));
  };
  const ignored = (arg('--ignore') || '').split(',').filter(Boolean);
  for (const key of ignored) (delete base[key], delete result[key]);
  walk(base, result, '');
  if (diffs.length) {
    console.error('HUELLA DISTINTA de ' + compare + ':\n' + diffs.join('\n'));
    process.exit(1);
  }
  console.error('Huella idéntica a ' + compare);
}
