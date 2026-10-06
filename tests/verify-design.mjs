// Diseños desde datos: intérprete de expresiones y, más adelante, kit y compositor.
import assert from 'node:assert/strict';
import { compile, evaluate, freeNames } from '../web/js/engine/expr.js';

// Referencia: JavaScript. `==` y `!=` se traducen a la comparación estricta que implementa expr.js.
const reference = (text) => {
  const js = text.replaceAll('!=', '\u0001').replaceAll('==', '===').replaceAll('\u0001', '!==');
  return new Function('s', `with (s) return (${js})`);
};
const mathScope = {
  min: Math.min,
  max: Math.max,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  atan2: Math.atan2,
  hypot: Math.hypot,
  PI: Math.PI,
  TAU: Math.PI * 2,
};

const corpus = [
  'len / 2',
  'len + 0.5',
  'max(3, round(len / 5.15))',
  'len / bays',
  '(j + 0.5) * step',
  'min(2.8, step * 0.65)',
  'x - ww * 0.25',
  '-step / 2 + 0.35',
  'q < step / 2 - 0.25',
  'x - step * 0.3 + k * step * 0.3',
  'len > 60 && j % 5 != 2',
  '(round(y / 0.46) % 2) * 0.57',
  '1 - 2 - 3',
  '8 / 4 / 2',
  '7 % 4 % 3',
  '-2 * -3',
  '!0',
  '0.1 + 0.2',
  'round(-2.5)',
  'a ? b : c ? d : e',
  '2 * PI',
  'TAU / 12',
  'hypot(3, 4)',
  '.5e1 + 1e-3',
  'a == b || c != d',
  'len >= 60 && len <= 107.25',
  'sqrt(len) + abs(-y) + floor(y) + ceil(y)',
  'sin(j) * cos(k) + atan2(y, x)',
  'true && !false',
  '+len - -y',
  '2 + 3 * 4 - 6 / 3 % 2',
];

let checked = 0;
for (const len of [17.3, 59.99, 60, 107.25]) {
  const bays = Math.max(3, Math.round(len / 5.15)),
    step = len / bays;
  for (let j = 0; j <= 6; j++)
    for (const y of [0.45, 0.91, 2.75])
      for (let n = 0; n < 3; n++) {
        const scope = Object.create(null);
        Object.assign(scope, mathScope, {
          len,
          bays,
          step,
          j,
          k: j,
          y,
          x: (j + 0.5) * step,
          ww: Math.min(2.8, step * 0.65),
          q: -step / 2 + 0.35 + j * 0.17,
          a: n,
          b: (n + 1) % 3,
          c: (n + 2) % 3,
          d: n === 1 ? 2 : 0,
          e: n === 2 ? 1 : 2,
        });
        for (const text of corpus) {
          const expected = reference(text)(scope),
            got = compile(text)(scope);
          assert(
            Object.is(got, expected),
            `«${text}» con len=${len} j=${j}: ${got} != ${expected}`,
          );
          checked++;
        }
      }
}

// El ámbito se encadena con Object.create y la variable más cercana tapa a la del padre.
const parent = { x: 1, y: 2 },
  child = Object.create(parent);
child.x = 10;
assert.equal(evaluate('x + y', child), 12);
assert.equal(evaluate('x + y', parent), 3);
assert.equal(compile('x + y'), compile('x + y'), 'el árbol se analiza una sola vez por cadena');

assert.deepEqual(freeNames('max(3, round(len / 5.15)) + len * PI + step'), ['len', 'step']);
assert.deepEqual(freeNames('a ? b : c'), ['a', 'b', 'c']);

const fails = (text, scope, pattern) =>
  assert.throws(() => evaluate(text, scope), pattern, `«${text}» debe fallar`);
fails('foo(1)', {}, /función no permitida/);
fails('eval(1)', {}, /función no permitida/);
fails('zz + 1', {}, /Variable desconocida: zz/);
fails('constructor', {}, /Variable desconocida: constructor/);
fails('__proto__', {}, /Variable desconocida: __proto__/);
fails('1 +', {}, /Expresión no válida/);
fails('(1', {}, /Expresión no válida/);
fails('1 2', {}, /Expresión no válida/);
fails('a = 1', { a: 0 }, /Expresión no válida/);
fails('x.y', { x: {} }, /Expresión no válida/);
fails('', {}, /Expresión no válida/);
fails('1 ? 2', {}, /Expresión no válida/);
assert.throws(() => compile(7), /se esperaba texto/);

console.log('Design expressions: ' + checked + ' evaluations match JavaScript; errors reported');

// Kit, validador y compositor.
{
  const fs = await import('node:fs');
  const THREE = await import('../web/vendor/three.module.min.js');
  const { createFacadeKit, KIT_PIECES } = await import('../web/js/world/facade-kit.js');
  const { composeBuilding } = await import('../web/js/world/facade-composer.js');
  const { validateFacadeDesigns } = await import('../web/js/world/design-validate.js');
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const palette = read('web/facade-profiles.json').palette,
    designs = read('web/facade-designs.json');

  // `sign` pinta un lienzo: un DOM mínimo basta para crear la malla.
  const noop = new Proxy({}, { get: () => () => {}, set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => noop }) };
  const newKit = () => createFacadeKit({ staging: new THREE.Group(), palette });
  const options = { kitPieces: KIT_PIECES, palette };

  assert.deepEqual(validateFacadeDesigns(designs, options), [], 'web/facade-designs.json válido');

  // Copia literal del bucle del Mercado de buildDetailedFacades en main 5666928; se borra al cerrar la fase 2.
  function referenceMarket(kit, mp, center) {
    const { cube, pane, wall, sign } = kit;
    for (let i = 0; i < 4; i++) {
      let a = mp[i],
        b = mp[(i + 1) % 4],
        mx = (a[0] + b[0]) / 2,
        mz = (a[1] + b[1]) / 2,
        { g, len } = wall(a, b, [mx - center[0], mz - center[1]]);
      cube(g, len / 2, 4.77, 0.055, len, 9.5, 0.09, palette.stone);
      cube(g, len / 2, 1.46, 0.115, len, 2.92, 0.15, palette.base);
      cube(g, len / 2, 9.3, 0.37, len + 0.5, 0.24, 0.85, '#ded9c9');
      cube(g, len / 2, 9.62, 0.1, len + 0.2, 0.3, 0.3, '#d9d1bf');
      let bays = Math.max(3, Math.round(len / 5.15)),
        step = len / bays;
      for (let j = 0; j < bays; j++) {
        let x = (j + 0.5) * step,
          ww = Math.min(2.8, step * 0.65);
        cube(g, x, 5.32, 0.135, ww + 0.23, 2.48, 0.12, '#a79782');
        pane(g, x, 5.32, ww, 2.23, 0.14);
        cube(g, x, 5.88, 0.28, ww, 0.075, 0.045, palette.iron);
        cube(g, x - ww * 0.25, 5.32, 0.28, 0.045, 2.23, 0.04, palette.iron);
        cube(g, x + ww * 0.25, 5.32, 0.28, 0.045, 2.23, 0.04, palette.iron);
        cube(g, x, 8.08, 0.15, step - 0.42, 1.7, 0.08, '#768580');
        for (let q = -step / 2 + 0.35; q < step / 2 - 0.25; q += 0.17)
          cube(g, x + q, 8.08, 0.28, 0.057, 1.75, 0.23, '#e6dfcb');
        cube(g, x, 1.36, 0.2, step - 0.63, 2.57, 0.055, '#303b3c');
        for (let k = 0; k < 3; k++)
          cube(g, x - step * 0.3 + k * step * 0.3, 1.38, 0.25, 0.055, 2.55, 0.05, '#9a9485');
        if (len > 60 && j % 5 !== 2) {
          let aw = cube(g, x, 2.94, 0.93, step - 0.19, 0.1, 1.72, '#d8bf83');
          aw.rotation.x = 0.13;
          cube(g, x, 2.8, 1.77, step - 0.16, 0.3, 0.055, '#d8bf83');
          cube(g, x, 3.06, 0.34, step - 0.1, 0.085, 0.12, '#645949');
        }
      }
      for (let y = 0.45; y < 2.8; y += 0.46) {
        cube(g, len / 2, y, 0.198, len, 0.018, 0.02, '#a78770');
        for (let x = (Math.round(y / 0.46) % 2) * 0.57; x < len; x += 1.14)
          cube(g, x, y - 0.23, 0.198, 0.018, 0.44, 0.02, '#a78770');
      }
      for (let x = 0; x < len; x += 1.35) cube(g, x, 5.1, 0.13, 0.016, 4.0, 0.018, '#b5a78f');
      for (let y = 3.35; y < 7.1; y += 0.76)
        cube(g, len / 2, y, 0.131, len, 0.015, 0.02, '#b5a78f');
      if (len > 60) sign(g, 'MERCADO DE ABASTOS', len / 2, 3.42, 13, 0.46, '#e7deca', '#988571');
    }
  }
  // Descripción de cada malla: orden, geometría, color, textura y matriz de mundo exacta.
  const describe = (staging) => {
    staging.updateMatrixWorld(true);
    const rows = [];
    staging.traverse((o) => {
      if (!o.isMesh)
        return rows.push(['group', ...o.matrixWorld.elements, o.children.length].join(','));
      const m = o.material;
      rows.push(
        [
          o.geometry.type,
          m.color.getHexString(),
          m.map ? 'map' : '-',
          ...o.matrixWorld.elements,
        ].join(','),
      );
    });
    return rows;
  };

  const market = designs.buildings.find((b) => b.id === 'mercado').fronts[0].anchor;
  const fromData = newKit(),
    original = newKit();
  const groups = composeBuilding(fromData, designs, 'mercado');
  referenceMarket(original, market.ring, market.center);
  assert.equal(groups.length, 4, 'cuatro muros del Mercado');
  assert.equal(fromData.staging.children.length, 4);
  const a = describe(fromData.staging),
    b = describe(original.staging);
  assert(a.length > 1000, 'el Mercado tiene cientos de mallas: ' + a.length);
  assert.equal(a.length, b.length, 'mismo número de mallas');
  const byColor = (rows) =>
    rows.reduce((t, r) => ((t[r.split(',')[1]] = (t[r.split(',')[1]] || 0) + 1), t), {});
  assert.deepEqual(byColor(a), byColor(b), 'mismas mallas por color');
  for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i], 'malla ' + i + ' idéntica');

  // El compositor ejecuta todos los tipos de nodo (los usarán las recetas siguientes).
  const synthetic = {
    version: 1,
    kit: 1,
    recipes: {
      leaf: { params: { n: 2 }, body: [{ box: ['n', 0, 0, 1, 1, 1], color: '$stone' }] },
      all: {
        params: { tint: '$ochre', dark: '#101010' },
        body: [
          { let: { half: 'len / 2' } },
          {
            group: { at: [1, 2, 3], rotation: [0, 0.5, 0] },
            body: [
              {
                box: [0, 0, 0, 1, 1, 1],
                color: { pick: ['#112233', '#445566'], index: 'floor(len) % 2' },
              },
            ],
          },
          { for: 'k', in: [1, 2, 3], body: [{ use: 'leaf', with: { n: 'k * 2' } }] },
          {
            for: 'x',
            from: 0,
            while: 'x < 3',
            step: 1.5,
            body: [{ box: ['x', 0, 5, 1, 1, 1], color: '#000000' }],
          },
          {
            if: 'half > 2',
            then: [{ geo: ['CircleGeometry', 0.5, 8], at: ['half', 1, 0], color: '#ffffff' }],
            else: [],
          },
          { geo: ['ArchShape', 2, 3, 6], at: [0, 0, 0], color: '#ffffff', rotation: [0, 0, 1] },
          { geo: ['TriangleExtrude', 0, 0, 2, 0, 1, 1, 0.3], at: [0, 0, 0], color: '#ffffff' },
          { piece: 'cross', args: [1, 1] },
          { box: [0, 0, 7, 1, 1, 1], color: 'tint' },
          { box: [0, 0, 8, 1, 1, 1], color: '=len > 5 ? tint : dark' },
        ],
      },
    },
    buildings: [
      {
        id: 'prueba',
        name: 'Prueba',
        fronts: [
          {
            anchor: { landmarkRing: 'Plaza' },
            recipe: 'all',
            with: { dark: '#202020' },
            scaleY: 1.5,
          },
        ],
        roof: { y: 'floor(4.5)', color: '=dark' },
      },
    ],
  };
  assert.deepEqual(validateFacadeDesigns(synthetic, options), []);
  const plaza = {
    name: 'Plaza',
    p: [5, 5],
    outline: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  };
  const kit = newKit(),
    walls = composeBuilding(kit, synthetic, 'prueba', { landmarks: [plaza] });
  assert.equal(walls.length, 4, 'un muro por arista del anillo');
  assert.equal(kit.staging.children.length, 5, 'cuatro muros y una sola cubierta');
  assert(kit.staging.children[4].isMesh, 'la cubierta va después de los muros');
  assert.equal(
    kit.staging.children[4].material.color.getHexString(),
    '202020',
    'color de la cubierta',
  );
  for (const g of walls) {
    assert.equal(g.scale.y, 1.5, 'scaleY del frente');
    const meshes = [];
    g.traverse((o) => o.isMesh && meshes.push(o));
    assert.equal(meshes.length, 13, 'mallas por muro');
    for (const z of [7, 8])
      assert.equal(
        g.children.find((c) => c.position.z === z).material.color.getHexString(),
        palette.ochre.slice(1),
        'color por parámetro o expresión',
      );
    const sub = g.children.find((c) => c.isGroup);
    assert.deepEqual(sub.position.toArray(), [1, 2, 3]);
    assert.equal(sub.rotation.y, 0.5);
    assert.equal(sub.children[0].material.color.getHexString(), '112233', 'pick por índice');
    assert.deepEqual(
      g.children
        .filter(
          (c) => c.geometry?.type === 'BoxGeometry' && c.position.y === 0 && c.position.z === 0,
        )
        .map((c) => c.position.x),
      [2, 4, 6],
      'use con parámetro y for-in',
    );
    assert.deepEqual(
      g.children.filter((c) => c.position.y === 0 && c.position.z === 5).map((c) => c.position.x),
      [0, 1.5],
      'for con paso acumulado',
    );
  }
  assert.throws(() => composeBuilding(kit, synthetic, 'no-existe'), /desconocido/);
  const badColor = JSON.parse(JSON.stringify(synthetic));
  badColor.recipes.all.params.tint = '$nada';
  assert.throws(
    () => composeBuilding(newKit(), badColor, 'prueba', { landmarks: [plaza] }),
    /Color de paleta desconocido/,
  );
  badColor.recipes.all.params.tint = 'len';
  assert.throws(
    () => composeBuilding(newKit(), badColor, 'prueba', { landmarks: [plaza] }),
    /Se esperaba un color/,
  );
  const orphan = {
    ...synthetic,
    buildings: [
      {
        id: 'p',
        name: 'p',
        fronts: [
          {
            anchor: { front: 'building-1-edge-1', footprintSha256: 'a'.repeat(64) },
            recipe: 'leaf',
          },
        ],
      },
    ],
  };
  assert.throws(() => composeBuilding(kit, orphan, 'p', { fronts: [] }), /Frente no seleccionado/);

  // El validador rechaza lo que el compositor no sabría ejecutar.
  const ring = {
    ring: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    center: [0, 0],
  };
  const mini = (body, extra = {}, anchor = ring) => ({
    version: 1,
    kit: 1,
    recipes: { r: { params: { p: 1 }, body }, ...extra },
    buildings: [{ id: 'b', name: 'b', fronts: [{ anchor, recipe: 'r' }] }],
  });
  const errorsOf = (design) => validateFacadeDesigns(design, options);
  const expectError = (design, pattern) => {
    const errors = errorsOf(design);
    assert(
      errors.some((e) => pattern.test(e)),
      `se esperaba ${pattern}: ${errors.join(' | ')}`,
    );
  };
  const box = ['len', 0, 0, 1, 1, 1];
  assert.deepEqual(errorsOf(mini([{ box, color: '$stone' }])), []);
  expectError({ ...mini([]), version: 2 }, /^version/);
  expectError({ ...mini([]), extra: 1 }, /extra: clave desconocida/);
  expectError(mini([{ box, color: '$nada' }]), /body\[0\]\.color/);
  expectError(
    mini([{ box: ['lenx', 0, 0, 1, 1, 1], color: '#000000' }]),
    /variable no definida «lenx»/,
  );
  expectError(mini([{ box: box.slice(1), color: '#000000' }]), /se esperaban 6 valores/);
  expectError(mini([{ box: ['1 +', 0, 0, 1, 1, 1], color: '#000000' }]), /Expresión no válida/);
  expectError(mini([{ box, color: '#000000', let: {} }]), /exactamente una clave de tipo/);
  expectError(mini([{ piece: 'statue', args: [1, 1] }]), /pieza desconocida/);
  expectError(mini([{ piece: 'pane', args: [1] }]), /admite de 4 a 7 argumentos/);
  expectError(
    mini([{ geo: ['BoxGeometry', 1], at: [0, 0, 0], color: '#000000' }]),
    /geometría no permitida/,
  );
  expectError(mini([{ use: 'r' }]), /recursión/);
  expectError(
    mini([{ use: 'otra', with: { q: 1 } }], { otra: { params: {}, body: [] } }),
    /parámetro no declarado/,
  );
  expectError(mini([{ use: 'falta' }]), /receta desconocida/);
  expectError(
    { ...mini([]), buildings: [{ ...mini([]).buildings[0], roof: { y: 1, color: '#000000' } }] },
    /roof: requiere exactamente un frente con landmarkRing/,
  );
  expectError(mini([{ box, color: 'rojo claro' }]), /se esperaba un color/);
  expectError(mini([{ box, color: 'nada' }]), /variable no definida «nada»/);
  expectError(mini([{ box, color: '=nada + 1' }]), /variable no definida «nada»/);
  expectError(mini([{ roof: { y: 1, color: '#000000' } }]), /clave de tipo/);
  expectError(
    mini([{ for: 'i', from: 0, while: 'i < 3', step: 1, body: [{ let: { i: 5 } }] }]),
    /variable de un bucle/,
  );
  expectError(
    mini([{ for: 'i', from: 0, while: 'j < 3', step: 1, body: [] }]),
    /variable no definida «j»/,
  );
  expectError(mini([{ let: { a: 'b', b: 1 } }]), /variable no definida «b»/);
  expectError(mini([{ box: ['h', 0, 0, 1, 1, 1], color: '#000000' }]), /variable no definida «h»/);
  expectError(mini([], {}, { world: true, ring: [] }), /anclaje no válido/);
  expectError(
    mini(
      [],
      {},
      {
        ring: [
          [0, 0],
          [1, 1],
        ],
        center: [0, 0],
      },
    ),
    /al menos 3 puntos/,
  );
  expectError(mini([], {}, { front: 'x', footprintSha256: 'y' }), /ID de frente no válido/);
  const twice = mini([]);
  twice.buildings.push(structuredClone(twice.buildings[0]));
  expectError(twice, /duplicado/);
  // Con un anclaje de frente existen h, floors, seed y commercialStreet.
  const front = { front: 'building-1-edge-1', footprintSha256: 'a'.repeat(64) };
  assert.deepEqual(
    errorsOf(
      mini(
        [{ box: ['h', 'floors', 'seed', 'commercialStreet', 0, 0], color: '#000000' }],
        {},
        front,
      ),
    ),
    [],
  );
  delete globalThis.document;
}

console.log('Facade kit, validator and composer: Mercado matches the original loop mesh by mesh');
