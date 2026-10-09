import './verify-building-variation.mjs';
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
  const { composeBuilding, composeFront } = await import('../web/js/world/facade-composer.js');
  const { validateCityDesign, validateFacadeDesigns } =
    await import('../web/js/world/design-validate.js');
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const palette = read('web/facade-profiles.json').palette,
    designs = read('web/facade-designs.json');

  // `sign` pinta un lienzo: un DOM mínimo basta para crear la malla.
  const noop = new Proxy({}, { get: () => () => {}, set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => noop }) };
  const newKit = () => createFacadeKit({ staging: new THREE.Group(), palette });
  const options = { kitPieces: KIT_PIECES, palette };

  const city = read('web/city-design.json');
  assert.deepEqual(
    validateFacadeDesigns(designs, { ...options, frontRecipes: [city.frontages.recipe] }),
    [],
    'web/facade-designs.json válido',
  );
  assert.deepEqual(
    validateCityDesign(city, { recipes: Object.keys(designs.recipes) }),
    [],
    'web/city-design.json válido',
  );

  // Mercado desde datos: cuatro muros con cientos de mallas, rótulo en los dos lados largos y
  // matrices finitas. La equivalencia exacta con el bucle anterior se comprobó al migrarlo.
  const market = newKit();
  const groups = composeBuilding(market, designs, 'mercado');
  assert.equal(groups.length, 4, 'cuatro muros del Mercado');
  assert.equal(market.staging.children.length, 4);
  market.staging.updateMatrixWorld(true);
  let meshes = 0,
    signs = 0;
  market.staging.traverse((o) => {
    assert(o.matrixWorld.elements.every(Number.isFinite), 'matriz finita');
    if (!o.isMesh) return;
    meshes++;
    if (o.material.map) signs++;
  });
  assert(meshes > 1000, 'el Mercado tiene cientos de mallas: ' + meshes);
  assert.equal(signs, 2, 'rótulo en los dos muros largos');

  // Piezas añadidas con las portadas: statue (cono, esfera y base) y spiralColumn (un tubo).
  {
    const k = newKit(),
      g = new THREE.Group();
    k.statue(g, 1, 2);
    assert.deepEqual(
      g.children.map((c) => c.geometry.type),
      ['ConeGeometry', 'SphereGeometry', 'BoxGeometry'],
    );
    assert.equal(k.spiralColumn(g, 3).geometry.type, 'TubeGeometry');
  }

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
  expectError(mini([{ piece: 'fantasma', args: [1, 1] }]), /pieza desconocida/);
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

  // outwardOf y el anclaje `front` de un frente que prepareFacades no ha seleccionado.
  {
    const { buildingGrid } = await import('../web/js/core/state.js');
    const { outwardOf } = await import('../web/js/world/facade-kit.js');
    const square = {
      p: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [],
      minX: 0,
      maxX: 10,
      minZ: 0,
      maxZ: 10,
      h: 9,
      floors: 3,
    };
    buildingGrid.set('0,0', [square]);
    assert.deepEqual(outwardOf(square, 0), [0, -1], 'la normal sale por el lado sin edificio');
    assert.deepEqual(outwardOf(square, 1), [1, -0]);
    const lone = {
      ...square,
      p: [
        [50, 50],
        [60, 50],
        [60, 60],
        [50, 60],
      ],
    };
    assert.equal(outwardOf(lone, 0), null, 'sin edificio a ningún lado no hay normal');
    const probe = {
      version: 1,
      kit: 1,
      recipes: {
        r: {
          body: [
            { box: ['len / 2', 0, 'h', 1, 1, 1], color: '$stone' },
            { box: ['len / 2', 0, 'floors', 1, 1, 1], color: '$stone' },
            { box: ['len / 2', 0, 'seed - hash', 1, 1, 1], color: '$stone' },
          ],
        },
      },
      buildings: [
        {
          id: 'f',
          name: 'f',
          fronts: [
            {
              anchor: { front: 'building-0-edge-0', footprintSha256: 'a'.repeat(64) },
              recipe: 'r',
            },
          ],
        },
      ],
    };
    assert.deepEqual(validateFacadeDesigns(probe, options), []);
    const k = newKit(),
      [g] = composeBuilding(k, probe, 'f', { fronts: [], buildings: [square] });
    assert.deepEqual(
      g.children.map((c) => c.position.z),
      [9, 3, 0],
      'h, floors y hash=seed del frente no seleccionado',
    );
    assert.throws(
      () => composeBuilding(k, probe, 'f', { fronts: [], buildings: [lone] }),
      /Frente no seleccionado/,
    );
    buildingGrid.clear();
  }

  // composeFront: variables del frente y regla `commercialStreet` desde la lista de calles residenciales.
  {
    const generic = {
      version: 1,
      kit: 1,
      recipes: {
        g: {
          body: [
            { let: { c: 'commercialStreet && hash % 3 != 0' } },
            {
              if: 'c',
              then: [{ box: ['len', 0, 1, 1, 1, 1], color: '#111111' }],
              else: [{ box: ['len', 0, 2, 1, 1, 1], color: '#222222' }],
            },
            { box: [0, 0, 'seed % 5', 1, 1, 1], color: '$stone' },
          ],
        },
      },
      buildings: [],
    };
    assert.deepEqual(validateFacadeDesigns(generic, { ...options, frontRecipes: ['g'] }), []);
    assert.notDeepEqual(
      validateFacadeDesigns(generic, options),
      [],
      'sin frontRecipes `commercialStreet` no existe',
    );
    const front = (street, seed) => ({
      id: `building-1-edge-1`,
      a: [0, 0],
      q: [3, 4],
      nx: 0,
      nz: 1,
      h: 9,
      floors: 3,
      street,
      seed,
    });
    const ctx = { residentialStreets: ['Calle A'] };
    const colorOf = (street, seed) => {
      const g = composeFront(newKit(), generic, 'g', front(street, seed), ctx);
      return g.children[0].material.color.getHexString();
    };
    assert.equal(colorOf('Calle B', 1), '111111', 'calle comercial');
    assert.equal(colorOf('Calle B', 3), '222222', 'hash % 3 == 0 descarta el comercio');
    assert.equal(colorOf('Calle A', 1), '222222', 'calle residencial');
    assert.throws(
      () => composeFront(newKit(), generic, 'nada', front('Calle A', 1)),
      /desconocida/,
    );
    assert.throws(
      () =>
        composeFront(
          newKit(),
          {
            ...generic,
            recipes: { g: { body: [{ box: ['zz', 0, 0, 1, 1, 1], color: '#111111' }] } },
          },
          'g',
          front('Calle A', 1),
        ),
      /Variable desconocida: zz/,
    );
  }

  // Reglas de ciudad: estructura y calles.
  {
    const base = {
      version: 1,
      zones: {
        frontagePilot: [-10, 10, -10, 10],
        frontageOriginal: [-5, 5, -5, 5],
        streetLamps: [-5, 5, -5, 5],
        pavedRoads: [-6, 6, -6, 6],
        pavedSquares: [-7, 7, -7, 7],
      },
      frontages: {
        streets: ['A', 'B'],
        originalStreets: ['A'],
        residentialStreets: ['B'],
        minimumEdge: 3.3,
        sideProbe: 0.45,
        maximumRoadDistance: 17,
        minimumSetback: 1,
        recipe: 'g',
      },
      furniture: {
        protectedPoints: [[1, 2]],
        protectedRadius: 5,
        streetLamps: {
          minimumSegment: 10,
          start: 7,
          spacing: 22,
          offset: 0.48,
          minimumSeparation: 14,
        },
        plazaLamps: {
          from: [0, 0],
          to: [4, 4],
          shift: [1, 1],
          count: 5,
          benchEvery: 2,
          bench: [2.5, -2, -0.7],
          bin: [4.4, -1.2],
        },
        benches: [[1, 2, 0.5]],
        binOffset: 2.3,
        bollards: {
          streets: ['A'],
          minimumSegment: 12,
          start: 3,
          endMargin: 3,
          spacing: 9,
          offset: 0.2,
        },
        fromOsm: { 'highway=street_lamp': 'lamp' },
      },
      pavements: {
        pedestrianTypes: ['pedestrian'],
        nonDrivableTypes: ['pedestrian', 'path'],
        minimumHalfWidth: 0.65,
        layerHeights: {
          asphalt: 0.028,
          stone: 0.05,
          slabs: 0.036,
          centerLine: 0.065,
          crossing: 0.082,
          water: 0.025,
          deck: 0.02,
          railing: 1,
        },
      },
      crossings: {
        maximumDistance: 8,
        minimumRoadWidth: 4,
        halfWidthFactor: 0.43,
        edgeStart: 0.25,
        edgeEnd: 0.2,
        stripeSpacing: 0.85,
        stripeWidth: 0.43,
        stripeHalfLength: 2,
      },
      centerLines: {
        minimumWidth: 7,
        minimumLength: 9,
        start: 1,
        endMargin: 2,
        spacing: 9,
        dash: 3,
        halfWidth: 0.07,
        color: '#e8dfbb',
        opacity: 0.55,
      },
      randomSeed: 7631,
      signs: { maximum: 91, offset: 0.5, minimumPoints: 3 },
      buildings: {
        variation: { seed: 7631 },
        palette: ['#eee7d7', '#f4ece1'],
        detailColors: {
          church: '#e9e1cd',
          townhall: '#d8b669',
          market: '#cfbfaa',
          street: '#eee9db',
        },
        minimumHeights: [
          { name: 'Arquillo', center: [1, 2], radius: 9, height: 17 },
          { name: 'Ayuntamiento', detailType: 'townhall', minimumFloors: 3, height: 15.1 },
        ],
        wallUvWidth: 4.8,
      },
      vegetation: {
        parkDensity: 105,
        parkMaximum: 100,
        spacing: 4.2,
        roadClearance: 2,
        buildingClearance: 1.8,
        marketTrees: {
          from: [0, 0],
          to: [4, 4],
          shift: [1, 1],
          count: 5,
          roadClearance: 1.2,
          buildingClearance: 1.8,
          colliderClearance: 2,
        },
        shrubEveryVertex: 3,
        shrubRoadClearance: 1,
        shrubBuildingClearance: 0.7,
      },
    };
    const check = (edit, pattern) => {
      const copy = structuredClone(base);
      edit(copy);
      const errors = validateCityDesign(copy, { recipes: ['g'] });
      assert(
        errors.some((e) => pattern.test(e)),
        `se esperaba ${pattern}: ${errors.join(' | ')}`,
      );
    };
    assert.deepEqual(validateCityDesign(base, { recipes: ['g'] }), []);
    check((c) => (c.version = 2), /^version/);
    check((c) => (c.extra = 1), /extra: clave desconocida/);
    check((c) => (c.zones.frontagePilot = [10, -10, 0, 1]), /el mínimo debe ser menor/);
    check((c) => delete c.zones.frontageOriginal, /zones\.frontageOriginal: falta/);
    check((c) => (c.frontages.originalStreets = ['Z']), /«Z» no está en streets/);
    check((c) => (c.frontages.streets = ['A', 'A']), /nombres repetidos/);
    check((c) => (c.frontages.minimumEdge = 0), /número positivo/);
    check((c) => (c.frontages.recipe = 'nada'), /receta desconocida/);
    check((c) => delete c.zones.streetLamps, /zones\.streetLamps: falta/);
    check((c) => delete c.furniture, /furniture: se esperaba un objeto/);
    check((c) => (c.furniture.extra = 1), /furniture\.extra: clave desconocida/);
    check((c) => (c.furniture.protectedPoints = [[1]]), /protectedPoints: se esperaba una lista/);
    check((c) => (c.furniture.streetLamps.spacing = 0), /streetLamps\.spacing: .*positivo/);
    check((c) => (c.furniture.plazaLamps.count = 2.5), /plazaLamps\.count: .*entero/);
    check((c) => (c.furniture.benches = [[1, 2]]), /benches\[0\]: se esperaba \[x, z, ángulo\]/);
    check((c) => delete c.furniture.bollards.endMargin, /bollards\.endMargin: falta/);
    check((c) => (c.furniture.fromOsm['amenity=bench'] = 'sofa'), /debe ser lamp o bench/);
    check((c) => (c.furniture.fromOsm.lamp = 'lamp'), /etiqueta no válida/);
    check((c) => delete c.zones.pavedRoads, /zones\.pavedRoads: falta/);
    check((c) => (c.pavements.pedestrianTypes = ['a', 'a']), /textos sin repetir/);
    check((c) => (c.pavements.layerHeights.deck = -1), /layerHeights\.deck: .*>= 0/);
    check((c) => delete c.pavements.layerHeights.railing, /layerHeights\.railing: falta/);
    check((c) => (c.crossings.stripeSpacing = 0), /crossings\.stripeSpacing: .*positivo/);
    check((c) => (c.centerLines.color = 'rojo'), /centerLines\.color: se esperaba #rrggbb/);
    check((c) => (c.centerLines.opacity = 2), /centerLines\.opacity: .*\(0, 1\]/);
    check((c) => (c.signs.maximum = 0), /signs\.maximum: .*entero/);
    check((c) => delete c.crossings, /crossings: se esperaba un objeto/);
    check((c) => (c.vegetation.parkDensity = 0), /vegetation\.parkDensity: .*positivo/);
    check((c) => (c.vegetation.parkMaximum = 1.5), /vegetation\.parkMaximum: .*entero/);
    check((c) => (c.vegetation.marketTrees.from = [1]), /marketTrees\.from: se esperaba \[x, z\]/);
    check((c) => delete c.vegetation.shrubEveryVertex, /vegetation\.shrubEveryVertex: falta/);
    check((c) => (c.vegetation.extra = 1), /vegetation\.extra: clave desconocida/);
    check((c) => (c.buildings.palette = []), /buildings\.palette: .*lista no vacía/);
    check((c) => (c.buildings.palette = ['rojo']), /buildings\.palette: .*#rrggbb/);
    check((c) => delete c.buildings.detailColors.market, /detailColors\.market: falta/);
    check(
      (c) => (c.buildings.minimumHeights[0].radius = 0),
      /minimumHeights\[0\]\.radius: .*positivo/,
    );
    check(
      (c) => (c.buildings.minimumHeights[1].detailType = 'casa'),
      /detailType: tipo de detalle/,
    );
    check((c) => (c.buildings.minimumHeights[1].minimumFloors = 0), /minimumFloors: .*entero/);
    check((c) => (c.randomSeed = -1), /randomSeed/);
    check((c) => (c.buildings.variation.seed = 4294967296), /variation.seed/);
    check((c) => (c.buildings.variation.paletteAssignments = {}), /clave desconocida/);
    check((c) => (c.buildings.wallUvWidth = 0), /wallUvWidth: .*positivo/);
  }
  delete globalThis.document;
}

// Correcciones manuales: operaciones, guardas y ejemplo del anexo.
{
  const fs = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { applyCorrections, sha256Hex } = await import('../web/js/world/corrections.js');
  const { validateCorrections } = await import('../web/js/world/design-validate.js');
  const { readWorld } = await import('../tools/world-files.mjs');
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

  // SHA-256 propio frente al de Node, con longitudes que cruzan los límites de bloque.
  for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 1000])
    assert.equal(
      sha256Hex('a'.repeat(n)),
      createHash('sha256').update('a'.repeat(n)).digest('hex'),
      `sha256 de ${n} caracteres`,
    );

  const sample = () => ({
    roads: [
      {
        id: '1',
        name: 'Calle A',
        type: 'residential',
        w: 5,
        oneway: false,
        bridge: false,
        p: [
          [0, 0],
          [10, 0],
        ],
      },
      {
        id: '2',
        name: 'Calle B',
        type: 'residential',
        w: 4,
        oneway: false,
        bridge: false,
        p: [
          [0, 5],
          [4, 5],
        ],
      },
      {
        id: '2',
        name: 'Calle B',
        type: 'residential',
        w: 4,
        oneway: false,
        bridge: false,
        p: [
          [4, 5],
          [9, 5],
        ],
      },
    ],
    areas: [
      {
        kind: 'park',
        p: [
          [0, 0],
          [5, 0],
          [5, 5],
        ],
      },
    ],
    buildings: [
      {
        p: [
          [0, 0],
          [3, 0],
          [3, 3],
          [0, 3],
        ],
        holes: [],
        h: 6,
        floors: 2,
      },
    ],
  });
  const meta = { reason: 'prueba', evidence: 'prueba', date: '2026-10-06' };
  let n = 0;
  const fix = (op, fields) => ({
    id: 'fix-' + String(++n).padStart(3, '0'),
    op,
    ...fields,
    ...meta,
  });
  const file = (...corrections) => ({
    version: 1,
    license: 'ODbL-1.0',
    attribution: 'x',
    corrections,
  });
  const ref = (id, occurrence = 0) => ({ id, occurrence });
  const ring = sample().buildings[0].p;
  const sha = sha256Hex(JSON.stringify(ring));
  const run = (...corrections) => {
    const layers = sample(),
      f = file(...corrections);
    assert.deepEqual(validateCorrections(f), [], 'corrección válida');
    return { layers, ids: applyCorrections(layers, f) };
  };
  const rejects = (pattern, ...corrections) =>
    assert.throws(() => applyCorrections(sample(), file(...corrections)), pattern);

  // Cada operación sobre el mundo sintético.
  let r = run(
    fix('road.set', {
      road: ref('1'),
      expect: { name: 'Calle A', w: 5 },
      set: { w: 5.5, oneway: true },
    }),
  );
  assert.equal(r.layers.roads[0].w, 5.5);
  assert.equal(r.layers.roads[0].oneway, true);
  r = run(fix('road.movePoint', { road: ref('1'), index: 1, expect: [10, 0], to: [11, 1] }));
  assert.deepEqual(r.layers.roads[0].p, [
    [0, 0],
    [11, 1],
  ]);
  r = run(fix('road.insertPoint', { road: ref('1'), after: 0, expectAfter: [0, 0], at: [5, 1] }));
  assert.deepEqual(r.layers.roads[0].p, [
    [0, 0],
    [5, 1],
    [10, 0],
  ]);
  r = run(
    fix('road.add', {
      add: {
        id: 'fix-004',
        name: '',
        type: 'footway',
        w: 2,
        oneway: false,
        bridge: false,
        p: [
          [1, 1],
          [2, 2],
        ],
      },
    }),
  );
  assert.equal(r.layers.roads.at(-1).id, 'fix-004');
  r = run(fix('road.remove', { road: ref('1'), expect: { name: 'Calle A' } }));
  assert.deepEqual(
    r.layers.roads.map((x) => x.id),
    ['2', '2'],
  );
  r = run(
    fix('area.movePoint', {
      area: { index: 0, expectFirst: [0, 0] },
      index: 2,
      expect: [5, 5],
      to: [6, 6],
    }),
  );
  assert.deepEqual(r.layers.areas[0].p[2], [6, 6]);
  r = run(
    fix('building.moveVertex', {
      building: { index: 0, footprintSha256: sha },
      vertex: 2,
      expect: [3, 3],
      to: [3.5, 3.5],
    }),
  );
  assert.deepEqual(r.layers.buildings[0].p[2], [3.5, 3.5]);

  // IDs repetidos: la ocurrencia elige el tramo.
  r = run(fix('road.movePoint', { road: ref('2', 1), index: 0, expect: [4, 5], to: [4, 6] }));
  assert.deepEqual(r.layers.roads[1].p[0], [0, 5], 'la primera aparición no cambia');
  assert.deepEqual(r.layers.roads[2].p[0], [4, 6], 'la segunda aparición cambia');
  rejects(
    /no existe la vía 2 \(aparición 2\)/,
    fix('road.remove', { road: ref('2', 2), expect: { name: 'Calle B' } }),
  );

  // Guardas que fallan, con el id de la corrección en el mensaje.
  rejects(
    /Corrección fix-\d+ no aplicable: «w» vale 5/,
    fix('road.set', { road: ref('1'), expect: { w: 9 }, set: { w: 6 } }),
  );
  rejects(
    /el vértice 1 vale \[10,0\]/,
    fix('road.movePoint', { road: ref('1'), index: 1, expect: [9, 9], to: [1, 1] }),
  );
  rejects(
    /fuera de rango/,
    fix('road.movePoint', { road: ref('1'), index: 5, expect: [9, 9], to: [1, 1] }),
  );
  rejects(
    /el primer punto del área/,
    fix('area.movePoint', {
      area: { index: 0, expectFirst: [1, 1] },
      index: 0,
      expect: [0, 0],
      to: [1, 1],
    }),
  );
  rejects(
    /el contorno ha cambiado/,
    fix('building.moveVertex', {
      building: { index: 0, footprintSha256: '0'.repeat(64) },
      vertex: 0,
      expect: [0, 0],
      to: [1, 1],
    }),
  );
  rejects(
    /ya existe una vía con el id 1/,
    fix('road.add', {
      add: {
        id: '1',
        name: '',
        type: 'path',
        w: 1,
        oneway: false,
        bridge: false,
        p: [
          [0, 0],
          [1, 1],
        ],
      },
    }),
  );

  // Aplicar dos veces la misma corrección falla por guarda: el valor de partida ya no está.
  const move = fix('road.movePoint', { road: ref('1'), index: 1, expect: [10, 0], to: [11, 1] });
  const layers = sample();
  applyCorrections(layers, file(move));
  assert.throws(() => applyCorrections(layers, file(move)), /no aplicable/);
  // Y una corrección posterior ve el resultado de la anterior.
  assert.deepEqual(
    run(move, fix('road.movePoint', { road: ref('1'), index: 1, expect: [11, 1], to: [12, 2] }))
      .layers.roads[0].p[1],
    [12, 2],
  );

  // Validación estructural.
  const invalid = (edit, pattern) => {
    const f = file(fix('road.set', { road: ref('1'), expect: { w: 5 }, set: { w: 6 } }));
    edit(f);
    const errors = validateCorrections(f);
    assert(
      errors.some((e) => pattern.test(e)),
      `se esperaba ${pattern}: ${errors.join(' | ')}`,
    );
  };
  invalid((f) => (f.license = 'MIT'), /^license/);
  invalid((f) => (f.corrections[0].id = 'x'), /id: debe ser fix-NNN/);
  invalid((f) => f.corrections.push({ ...f.corrections[0] }), /duplicado/);
  invalid((f) => (f.corrections[0].op = 'road.hide'), /operación desconocida/);
  invalid((f) => (f.corrections[0].date = '10/10/2026'), /fecha AAAA-MM-DD/);
  invalid((f) => delete f.corrections[0].reason, /reason: se esperaba un texto/);
  invalid((f) => (f.corrections[0].extra = 1), /extra: clave desconocida/);
  invalid((f) => delete f.corrections[0].set, /set: falta/);
  invalid((f) => (f.corrections[0].set = { color: 'rojo' }), /set\.color: campo no permitido/);
  invalid((f) => (f.corrections[0].road = { id: 1, occurrence: 0 }), /road\.id: se esperaba el id/);
  invalid((f) => (f.appliesTo = { osmSha256: 'abc' }), /appliesTo\.osmSha256/);

  // Ejemplo del anexo: válido; sobre los datos reales, fix-001 y fix-003 se aplican y
  // fix-002 y fix-004 fallan por guarda (sus valores son marcadores).
  const example = read('docs/plan-modular/map-corrections.example.json');
  assert.deepEqual(validateCorrections(example), [], 'ejemplo del anexo válido');
  const real = () => {
    const w = readWorld();
    return { roads: w.roads, areas: w.areas, buildings: w.buildings };
  };
  const byId = (id) => ({
    ...example,
    corrections: example.corrections.filter((c) => c.id === id),
  });
  for (const id of ['fix-001', 'fix-003']) {
    const l = real();
    assert.deepEqual(applyCorrections(l, byId(id)), [id], `${id} se aplica sobre los datos reales`);
  }
  for (const id of ['fix-002', 'fix-004'])
    assert.throws(
      () => applyCorrections(real(), byId(id)),
      new RegExp(`Corrección ${id} no aplicable`),
    );

  // El archivo publicado se aplica entero y solo cambia lo que corrige.
  const published = read('web/map-corrections.json');
  assert.deepEqual(validateCorrections(published), [], 'web/map-corrections.json válido');
  const base = real(),
    l = real();
  assert.deepEqual(
    applyCorrections(l, published),
    published.corrections.map((c) => c.id),
    'todas las correcciones publicadas se aplican',
  );
  const touched = new Set(published.corrections.map((c) => c.road?.id).filter(Boolean));
  assert(
    published.corrections.every((c) => c.op === 'road.set'),
    'ampliar esta comprobación si se publican otras operaciones',
  );
  assert.equal(JSON.stringify(l.areas), JSON.stringify(base.areas));
  assert.equal(JSON.stringify(l.buildings), JSON.stringify(base.buildings));
  l.roads.forEach((r, i) => {
    if (!touched.has(r.id)) assert.deepEqual(r, base.roads[i], 'vía sin corrección intacta');
  });
}

console.log('Facade kit, validator, composer and map corrections passed');
