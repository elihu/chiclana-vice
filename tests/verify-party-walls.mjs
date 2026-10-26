// Muros compartidos: tramos ocultos y medianeras, sobre casos sintéticos y sobre el mapa real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { edgeKey, sharedWallSpans } from '../web/js/world/party-walls.js';

const square = (x0, z0, x1, z1) => ({
  p: [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ],
  holes: [],
});

// Dos casas pegadas por x = 10, la derecha más alta: arista 1 de A (x = 10, z 0→10) y
// arista 3 de B (x = 10, z 10→0).
{
  const spans = sharedWallSpans([square(0, 0, 10, 10), square(10, 0, 20, 10)], [6, 9]);
  assert.deepEqual(spans.get(edgeKey(0, 0, 1)), [{ t0: 0, t1: 10, cover: 9 }]);
  assert.deepEqual(spans.get(edgeKey(1, 0, 3)), [{ t0: 0, t1: 10, cover: 6 }]);
  assert.equal(spans.size, 2, 'solo las aristas compartidas');
}

// Vecino más corto, colineal y desplazado 5 cm: solape parcial en z 4→10.
{
  const spans = sharedWallSpans([square(0, 0, 10, 10), square(10.05, 4, 20, 14)], [6, 9]),
    a = spans
      .get(edgeKey(0, 0, 1))
      .map(({ t0, t1, cover }) => [+t0.toFixed(6), +t1.toFixed(6), cover]);
  assert.deepEqual(a, [
    [0, 4, -Infinity],
    [4, 10, 9],
  ]);
}

// Paralelos a 1 m (dos fachadas de un callejón): no se tocan.
assert.equal(sharedWallSpans([square(0, 0, 10, 10), square(11, 0, 20, 10)], [6, 9]).size, 0);

// Mapa real: el 63 % de las aristas tiene vecino (exacto o colineal).
{
  const { buildings } = JSON.parse(fs.readFileSync('web/buildings.json', 'utf8')),
    t = performance.now(),
    spans = sharedWallSpans(
      buildings,
      buildings.map((b) => b.h),
    ),
    ms = performance.now() - t;
  let edges = 0;
  for (const b of buildings) for (const ring of [b.p, ...b.holes]) edges += ring.length;
  const share = spans.size / edges;
  assert(share > 0.6, 'aristas con vecino ' + share);
  console.log(
    `Muros compartidos: ${spans.size} de ${edges} aristas (${(share * 100).toFixed(1)} %), ${ms.toFixed(0)} ms`,
  );
}
