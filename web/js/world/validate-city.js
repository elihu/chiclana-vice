import { createValidationKit } from './validate-kit.js';
import { validateSurfaceDesign } from './surface-validate.js';
const DETAIL_TYPES = ['market', 'townhall', 'church', 'street'];
const HEX = /^#[0-9a-f]{6}$/;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPoint = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);

// Validador de web/city-design.json (reglas de calle, zonas, mobiliario y edificios genéricos).
// `recipes`: nombres de las recetas de facade-designs.json. Referencia para el editor:
// schemas/city-design.schema.json.
export function validateCityDesign(json, { recipes = [] } = {}) {
  const errors = [];
  const fail = (path, message) => errors.push(`${path}: ${message}`);
  const kit = createValidationKit(errors);
  if (!kit.object('$', json)) return [...errors];
  const onlyKeys = (obj, allowed, path) => kit.object(path, obj, { keys: allowed });
  // Rectángulo [minX, maxX, minZ, maxZ] en metros locales.
  const rect = (v, path) => {
    if (!Array.isArray(v) || v.length !== 4 || !v.every(Number.isFinite))
      return fail(path, 'se esperaba [minX, maxX, minZ, maxZ]');
    if (v[0] >= v[1] || v[2] >= v[3]) fail(path, 'el mínimo debe ser menor que el máximo');
  };
  const names = (v, path) => {
    if (!Array.isArray(v) || !v.every((n) => typeof n === 'string' && n))
      return void fail(path, 'se esperaba una lista de nombres de calle');
    if (new Set(v).size !== v.length) fail(path, 'nombres repetidos');
    return v;
  };
  // Tipos: pos (> 0), nonneg (>= 0), num, int (entero >= 1), point, rect, color, names,
  // points ([x, z]…) y objetos anidados como especificación. Todas las claves son obligatorias.
  const TYPES = {
    uint32: (v, p) =>
      kit.number(p, v, {
        min: 0,
        max: 0xffffffff,
        integer: true,
        message: 'se esperaba un entero de 32 bits sin signo',
      }),
    pos: (v, p) =>
      kit.number(p, v, { min: 0, exclusiveMin: true, message: 'se esperaba un número positivo' }),
    nonneg: (v, p) => kit.number(p, v, { min: 0, message: 'se esperaba un número >= 0' }),
    num: (v, p) => kit.number(p, v),
    int: (v, p) =>
      kit.number(p, v, { min: 1, integer: true, message: 'se esperaba un entero >= 1' }),
    point: (v, p) => (isPoint(v) ? 0 : fail(p, 'se esperaba [x, z]')),
    rect,
    color: (v, p) => (typeof v === 'string' && HEX.test(v) ? 0 : fail(p, 'se esperaba #rrggbb')),
    names,
    strings: (v, p) =>
      Array.isArray(v) && v.every((n) => typeof n === 'string' && n) && new Set(v).size === v.length
        ? 0
        : fail(p, 'se esperaba una lista de textos sin repetir'),
    opacity: (v, p) =>
      kit.number(p, v, {
        min: 0,
        exclusiveMin: true,
        max: 1,
        message: 'se esperaba un número en (0, 1]',
      }),
    colors: (v, p) =>
      Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === 'string' && HEX.test(c))
        ? 0
        : fail(p, 'se esperaba una lista no vacía de #rrggbb'),
    // Reglas de altura mínima: un círculo (center, radius) o un tipo de detalle con plantas mínimas.
    heightRules: (v, p) => {
      if (!kit.array(p, v, { message: 'se esperaba una lista' })) return;
      v.forEach((m, i) => {
        const at = `${p}[${i}]`;
        if (!kit.object(at, m)) return;
        const circle = 'center' in m;
        check(
          m,
          circle
            ? { name: 'text', center: 'point', radius: 'pos', height: 'pos' }
            : { name: 'text', detailType: 'detail', minimumFloors: 'int', height: 'pos' },
          at,
        );
      });
    },
    text: (v, p) => (typeof v === 'string' && v ? 0 : fail(p, 'se esperaba texto')),
    detail: (v, p) => kit.oneOf(p, v, DETAIL_TYPES, 'tipo de detalle desconocido'),
    // Banco: [x, z, ángulo] o, en plazaLamps, [dx, dz, ángulo].
    bench: (v, p) =>
      Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
        ? 0
        : fail(p, 'se esperaba [x, z, ángulo]'),
    benches: (v, p) => {
      if (!kit.array(p, v, { message: 'se esperaba una lista' })) return;
      v.forEach((b, i) => TYPES.bench(b, `${p}[${i}]`));
    },
    // Etiqueta OSM «clave=valor» → tipo de mobiliario.
    fromOsm: (v, p) => {
      if (!kit.object(p, v)) return;
      for (const [tag, kind] of Object.entries(v)) {
        if (!/^[a-z_]+=[a-z_]+$/.test(tag)) fail(`${p}.${tag}`, 'etiqueta no válida (clave=valor)');
        kit.oneOf(`${p}.${tag}`, kind, ['lamp', 'bench'], 'debe ser lamp o bench');
      }
    },
    points: (v, p) =>
      Array.isArray(v) && v.every(isPoint) ? 0 : fail(p, 'se esperaba una lista de [x, z]'),
  };
  function check(obj, spec, path) {
    if (!kit.object(path, obj)) return;
    onlyKeys(obj, Object.keys(spec), path);
    for (const [k, type] of Object.entries(spec)) {
      if (!(k in obj)) fail(`${path}.${k}`, 'falta');
      else if (isObject(type)) check(obj[k], type, `${path}.${k}`);
      else TYPES[type](obj[k], `${path}.${k}`);
    }
  }
  const sections = [
    'zones',
    'frontages',
    'groundFloors',
    'furniture',
    'pavements',
    'crossings',
    'centerLines',
    'signs',
    'tram',
    'vegetation',
    'buildings',
  ];
  onlyKeys(
    json,
    [
      '$schema',
      'version',
      'description',
      'license',
      'attribution',
      'terrainSurfaces',
      'randomSeed',
      ...sections,
    ],
    '$',
  );
  kit.oneOf('version', json.version, [1], 'debe ser 1');
  TYPES.uint32(json.randomSeed, 'randomSeed');
  for (const k of ['description', 'license', 'attribution'])
    if (k in json && typeof json[k] !== 'string') fail(k, 'se esperaba texto');

  check(
    json.zones,
    {
      frontagePilot: 'rect',
      frontageOriginal: 'rect',
      streetLamps: 'rect',
      pavedRoads: 'rect',
      pavedSquares: 'rect',
    },
    'zones',
  );

  const f = json.frontages;
  if (kit.object('frontages', f)) {
    onlyKeys(
      f,
      [
        'streets',
        'originalStreets',
        'residentialStreets',
        'minimumEdge',
        'sideProbe',
        'maximumRoadDistance',
        'minimumSetback',
        'recipe',
      ],
      'frontages',
    );
    const streets = names(f.streets, 'frontages.streets');
    for (const k of ['originalStreets', 'residentialStreets']) {
      const list = names(f[k], `frontages.${k}`);
      if (streets && list)
        for (const n of list)
          if (!streets.includes(n)) fail(`frontages.${k}`, `«${n}» no está en streets`);
    }
    for (const k of ['minimumEdge', 'sideProbe', 'maximumRoadDistance', 'minimumSetback'])
      TYPES.pos(f[k], `frontages.${k}`);
    if (typeof f.recipe !== 'string' || !recipes.includes(f.recipe))
      fail('frontages.recipe', `receta desconocida «${f.recipe}»`);
  }

  check(
    json.groundFloors,
    {
      shopDistance: 'pos',
      shopBehind: 'nonneg',
      shopMargin: 'nonneg',
      commercialUses: 'strings',
      blockMinimumDwellings: 'int',
      blockMinimumFloors: 'int',
      extraUnits: 'int',
      mainRoadTypes: 'strings',
      buildingKinds: {
        maximumFloors: 'int',
        industrialUses: 'strings',
        industrialMinimumArea: 'pos',
        bigRetailUses: 'strings',
        bigRetailMinimumArea: 'pos',
        zoneExcludedUses: 'strings',
        cellarZone: 'text',
      },
    },
    'groundFloors',
  );
  const cellarZone = json.groundFloors?.buildingKinds?.cellarZone;
  if (typeof cellarZone === 'string' && !(cellarZone in (json.zones ?? {})))
    fail('groundFloors.buildingKinds.cellarZone', `zona desconocida «${cellarZone}»`);

  check(
    json.furniture,
    {
      protectedPoints: 'points',
      protectedRadius: 'pos',
      streetLamps: {
        minimumSegment: 'pos',
        start: 'nonneg',
        spacing: 'pos',
        offset: 'nonneg',
        minimumSeparation: 'nonneg',
      },
      plazaLamps: {
        from: 'point',
        to: 'point',
        shift: 'point',
        count: 'int',
        benchEvery: 'int',
        bench: 'bench',
        bin: 'point',
      },
      benches: 'benches',
      binOffset: 'num',
      bollards: {
        streets: 'names',
        minimumSegment: 'pos',
        start: 'nonneg',
        endMargin: 'nonneg',
        spacing: 'pos',
        offset: 'nonneg',
      },
      fromOsm: 'fromOsm',
    },
    'furniture',
  );
  check(
    json.pavements,
    {
      pedestrianTypes: 'strings',
      nonDrivableTypes: 'strings',
      minimumHalfWidth: 'pos',
      sidewalks: {
        roadTypes: 'strings',
        width: 'pos',
        minimumWidth: 'pos',
        curbWidth: 'pos',
        curbHeight: 'pos',
        curbColor: 'color',
        step: 'pos',
        junctionMargin: 'nonneg',
        buildingMargin: 'nonneg',
        minimumRoadLength: 'nonneg',
        skirtMaxDepth: 'pos',
        skirtTerrainMargin: 'nonneg',
        skirtMinGap: 'nonneg',
        minimumRun: 'nonneg',
      },
      layerHeights: {
        asphalt: 'nonneg',
        stone: 'nonneg',
        slabs: 'nonneg',
        centerLine: 'nonneg',
        crossing: 'nonneg',
        water: 'nonneg',
        deck: 'nonneg',
        railing: 'nonneg',
      },
    },
    'pavements',
  );
  check(
    json.crossings,
    {
      maximumDistance: 'pos',
      minimumRoadWidth: 'pos',
      halfWidthFactor: 'pos',
      edgeStart: 'nonneg',
      edgeEnd: 'nonneg',
      stripeSpacing: 'pos',
      stripeWidth: 'pos',
      stripeHalfLength: 'pos',
    },
    'crossings',
  );
  check(
    json.centerLines,
    {
      minimumWidth: 'pos',
      minimumLength: 'pos',
      start: 'nonneg',
      endMargin: 'nonneg',
      spacing: 'pos',
      dash: 'pos',
      halfWidth: 'pos',
      color: 'color',
      opacity: 'opacity',
    },
    'centerLines',
  );
  check(json.signs, { maximum: 'int', offset: 'nonneg', minimumPoints: 'int' }, 'signs');
  check(
    json.vegetation,
    {
      parkDensity: 'pos',
      parkMaximum: 'int',
      spacing: 'pos',
      roadClearance: 'nonneg',
      buildingClearance: 'nonneg',
      marketTrees: {
        from: 'point',
        to: 'point',
        shift: 'point',
        count: 'int',
        roadClearance: 'nonneg',
        buildingClearance: 'nonneg',
        colliderClearance: 'nonneg',
      },
      shrubEveryVertex: 'int',
      shrubRoadClearance: 'nonneg',
      shrubBuildingClearance: 'nonneg',
    },
    'vegetation',
  );
  check(
    json.tram,
    {
      stripWidth: 'pos',
      sampleStep: 'pos',
      bedHeight: 'nonneg',
      pavedColor: 'color',
      grassColor: 'color',
      pavedDistance: 'nonneg',
      laneColor: 'color',
      laneLineColor: 'color',
      laneLineWidth: 'pos',
      laneMargin: 'nonneg',
      crossingClearance: 'nonneg',
      minimumGrassRun: 'nonneg',
      rails: { width: 'pos', height: 'pos', color: 'color' },
      catenary: {
        poleSpacing: 'pos',
        poleOffset: 'nonneg',
        poleWidth: 'pos',
        poleHeight: 'pos',
        armHeight: 'pos',
        armWidth: 'pos',
        wireHeight: 'pos',
        wireWidth: 'pos',
        wireStep: 'pos',
        buildingClearance: 'nonneg',
        color: 'color',
      },
      stop: {
        platformHeight: 'pos',
        platformColor: 'color',
        edgeColor: 'color',
        tactileColor: 'color',
        tactileWidth: 'pos',
        shelter: {
          length: 'pos',
          depth: 'pos',
          height: 'pos',
          backMargin: 'nonneg',
          roofThickness: 'pos',
          postWidth: 'pos',
          frameColor: 'color',
          glassColor: 'color',
          glassOpacity: 'opacity',
        },
        sign: {
          alongOffset: 'num',
          backMargin: 'nonneg',
          poleHeight: 'pos',
          poleWidth: 'pos',
          poleColor: 'color',
          plateWidth: 'pos',
          plateHeight: 'pos',
          plateBase: 'nonneg',
          background: 'color',
          foreground: 'color',
        },
      },
    },
    'tram',
  );
  check(
    json.buildings,
    {
      palette: 'colors',
      variation: { seed: 'uint32' },
      detailColors: Object.fromEntries(DETAIL_TYPES.map((t) => [t, 'color'])),
      minimumHeights: 'heightRules',
      wallUvWidth: 'pos',
      partyWall: { color: 'color', blend: 'opacity' },
    },
    'buildings',
  );
  errors.push(...validateSurfaceDesign(json.terrainSurfaces));
  return errors;
}
