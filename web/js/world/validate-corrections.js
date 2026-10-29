import { createValidationKit } from './validate-kit.js';
const SHA = /^[0-9a-f]{64}$/;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPoint = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
const FIX_ID = /^fix-[0-9]{3,}$/,
  DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const ROAD_FIELDS = {
  name: (v) => typeof v === 'string',
  type: (v) => typeof v === 'string' && v !== '',
  w: (v) => Number.isFinite(v) && v > 0,
  oneway: (v) => typeof v === 'boolean',
  bridge: (v) => typeof v === 'boolean',
};

// Validador de web/map-corrections.json: solo estructura. Las guardas (`expect`…) se comprueban
// al aplicar cada corrección (world/corrections.js). Referencia para el editor:
// schemas/map-corrections.schema.json.
export function validateCorrections(json) {
  const errors = [];
  const fail = (path, message) => errors.push(`${path}: ${message}`);
  const kit = createValidationKit(errors);
  if (!kit.object('$', json)) return [...errors];
  const onlyKeys = (obj, allowed, path) => kit.object(path, obj, { keys: allowed });
  const required = (obj, keys, path) => {
    for (const k of keys) if (!(k in obj)) fail(`${path}.${k}`, 'falta');
  };
  onlyKeys(
    json,
    ['$schema', 'version', 'license', 'licenseUrl', 'attribution', 'appliesTo', 'corrections'],
    '$',
  );
  kit.oneOf('version', json.version, [1], 'debe ser 1');
  kit.oneOf('license', json.license, ['ODbL-1.0'], 'debe ser ODbL-1.0');
  if ('licenseUrl' in json && typeof json.licenseUrl !== 'string')
    fail('licenseUrl', 'se esperaba texto');
  if (typeof json.attribution !== 'string' || !json.attribution)
    fail('attribution', 'se esperaba la atribución');
  if ('appliesTo' in json) {
    if (kit.object('appliesTo', json.appliesTo)) {
      onlyKeys(json.appliesTo, ['osmSha256', 'buildingsSha256'], 'appliesTo');
      for (const [k, v] of Object.entries(json.appliesTo))
        if (typeof v !== 'string' || !SHA.test(v)) fail(`appliesTo.${k}`, 'se esperaba un SHA-256');
    }
  }
  if (!kit.array('corrections', json.corrections)) {
    return errors;
  }

  const point = (v, path) => isPoint(v) || fail(path, 'se esperaba [x, z]');
  const roadRef = (v, path) => {
    if (!kit.object(path, v, { message: 'se esperaba {id, occurrence}' })) return;
    onlyKeys(v, ['id', 'occurrence'], path);
    if (typeof v.id !== 'string' || !v.id)
      fail(`${path}.id`, 'se esperaba el id de la vía (texto)');
    kit.number(`${path}.occurrence`, v.occurrence, {
      min: 0,
      integer: true,
      message: 'se esperaba un entero >= 0',
    });
  };
  const roadFields = (v, path) => {
    if (!isObject(v) || Object.keys(v).length === 0)
      return fail(path, 'se esperaba un objeto con algún campo');
    for (const [k, value] of Object.entries(v))
      if (!ROAD_FIELDS[k])
        fail(`${path}.${k}`, 'campo no permitido (name, type, w, oneway, bridge)');
      else if (!ROAD_FIELDS[k](value)) fail(`${path}.${k}`, 'valor no válido');
  };
  const index = (v, path) =>
    kit.number(path, v, { min: 0, integer: true, message: 'se esperaba un entero >= 0' });

  // Campos propios de cada operación.
  const OPS = {
    'road.set': (c, p) => {
      roadRef(c.road, `${p}.road`);
      roadFields(c.expect, `${p}.expect`);
      roadFields(c.set, `${p}.set`);
    },
    'road.movePoint': (c, p) => {
      roadRef(c.road, `${p}.road`);
      index(c.index, `${p}.index`);
      point(c.expect, `${p}.expect`);
      point(c.to, `${p}.to`);
    },
    'road.insertPoint': (c, p) => {
      roadRef(c.road, `${p}.road`);
      index(c.after, `${p}.after`);
      point(c.expectAfter, `${p}.expectAfter`);
      point(c.at, `${p}.at`);
    },
    'road.add': (c, p) => {
      const a = c.add;
      if (!kit.object(`${p}.add`, a)) return false;
      onlyKeys(a, ['id', 'name', 'type', 'w', 'oneway', 'bridge', 'p'], `${p}.add`);
      required(a, ['id', 'name', 'type', 'w', 'oneway', 'bridge', 'p'], `${p}.add`);
      if ('id' in a && !(typeof a.id === 'string' && FIX_ID.test(a.id)))
        fail(`${p}.add.id`, 'debe ser fix-NNN');
      for (const k of ['name', 'type', 'w', 'oneway', 'bridge'])
        if (k in a && !ROAD_FIELDS[k](a[k])) fail(`${p}.add.${k}`, 'valor no válido');
      if ('p' in a && !(Array.isArray(a.p) && a.p.length >= 2 && a.p.every(isPoint)))
        fail(`${p}.add.p`, 'se esperaban al menos 2 puntos [x, z]');
    },
    'road.remove': (c, p) => {
      roadRef(c.road, `${p}.road`);
      if (!isObject(c.expect) || typeof c.expect.name !== 'string')
        fail(`${p}.expect`, 'se esperaba {name}');
      else onlyKeys(c.expect, ['name'], `${p}.expect`);
    },
    'area.remove': (c, p) => {
      if (kit.object(p + '.area', c.area, { message: 'se esperaba {index, expectFirst}' })) {
        onlyKeys(c.area, ['index', 'expectFirst'], p + '.area');
        index(c.area.index, p + '.area.index');
        point(c.area.expectFirst, p + '.area.expectFirst');
      }
      if (typeof c.expectKind !== 'string' || !c.expectKind)
        fail(p + '.expectKind', 'se esperaba el tipo del área');
    },
    'area.movePoint': (c, p) => {
      if (kit.object(`${p}.area`, c.area, { message: 'se esperaba {index, expectFirst}' })) {
        onlyKeys(c.area, ['index', 'expectFirst'], `${p}.area`);
        index(c.area.index, `${p}.area.index`);
        point(c.area.expectFirst, `${p}.area.expectFirst`);
      }
      index(c.index, `${p}.index`);
      point(c.expect, `${p}.expect`);
      point(c.to, `${p}.to`);
    },
    'building.moveVertex': (c, p) => {
      if (
        kit.object(`${p}.building`, c.building, { message: 'se esperaba {index, footprintSha256}' })
      ) {
        onlyKeys(c.building, ['index', 'footprintSha256'], `${p}.building`);
        index(c.building.index, `${p}.building.index`);
        if (typeof c.building.footprintSha256 !== 'string' || !SHA.test(c.building.footprintSha256))
          fail(`${p}.building.footprintSha256`, 'se esperaba un SHA-256');
      }
      index(c.vertex, `${p}.vertex`);
      point(c.expect, `${p}.expect`);
      point(c.to, `${p}.to`);
    },
  };
  // Claves de cada operación además de las comunes.
  const OP_KEYS = {
    'road.set': ['road', 'expect', 'set'],
    'road.movePoint': ['road', 'index', 'expect', 'to'],
    'road.insertPoint': ['road', 'after', 'expectAfter', 'at'],
    'road.add': ['add'],
    'road.remove': ['road', 'expect'],
    'area.remove': ['area', 'expectKind'],
    'area.movePoint': ['area', 'index', 'expect', 'to'],
    'building.moveVertex': ['building', 'vertex', 'expect', 'to'],
  };
  const ids = new Set();
  json.corrections.forEach((c, i) => {
    const p = `corrections[${i}]`;
    if (!kit.object(p, c)) return false;
    if (typeof c.id !== 'string' || !FIX_ID.test(c.id)) fail(`${p}.id`, 'debe ser fix-NNN');
    else if (ids.has(c.id)) fail(`${p}.id`, `duplicado «${c.id}»`);
    else ids.add(c.id);
    for (const k of ['reason', 'evidence'])
      if (typeof c[k] !== 'string' || c[k].length < 3) fail(`${p}.${k}`, 'se esperaba un texto');
    if (typeof c.date !== 'string' || !DATE.test(c.date) || Number.isNaN(Date.parse(c.date)))
      fail(`${p}.date`, 'se esperaba una fecha AAAA-MM-DD');
    if (!OPS[c.op]) return fail(`${p}.op`, `operación desconocida «${c.op}»`);
    onlyKeys(c, ['id', 'op', 'reason', 'evidence', 'date', ...OP_KEYS[c.op]], p);
    required(c, OP_KEYS[c.op], p);
    OPS[c.op](c, p);
  });
  return errors;
}
