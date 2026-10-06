// Validador de los diseños de fachada: lo usan el juego (error claro al cargar) y
// tests/verify-world.mjs. Devuelve una lista de errores con la ruta JSON; vacía si todo cuadra.
// Referencia normativa: docs/plan-modular/KIT-FACHADAS.md (K3 y K5).
import { freeNames } from '../engine/expr.js';

// Argumentos de cada pieza tras el grupo `g`: [mínimo, máximo].
export const PIECE_ARITY = {
  pane: [4, 7],
  balcony: [3, 5],
  arch: [4, 4],
  pediment: [3, 3],
  sign: [5, 7],
  civicPane: [5, 5],
  cross: [2, 3],
  column: [5, 5],
  door: [4, 4],
  belfry: [4, 4],
  statue: [2, 3],
  spiralColumn: [1, 1],
};
// Parámetros de cada geometría permitida en el nodo `geo`: [mínimo, máximo].
export const GEOMETRY_ARITY = {
  CircleGeometry: [1, 4],
  TorusGeometry: [2, 5],
  CylinderGeometry: [3, 8],
  SphereGeometry: [1, 7],
  ConeGeometry: [2, 8],
  ArchShape: [3, 3],
  TriangleExtrude: [7, 7],
};
// Variables predefinidas en cada frente según el tipo de anclaje.
export const PREDEFINED = ['len'];
export const FRONT_PREDEFINED = ['h', 'floors', 'seed', 'commercialStreet'];

const NODE_TYPES = ['let', 'box', 'piece', 'geo', 'group', 'for', 'if', 'use', 'roof'];
const NODE_EXTRA = {
  let: [],
  box: ['color', 'rotation'],
  piece: ['args', 'rotation'],
  geo: ['at', 'color', 'rotation'],
  group: ['body'],
  for: ['from', 'while', 'step', 'in', 'body'],
  if: ['then', 'else'],
  use: ['with'],
  roof: [],
};
const ANCHORS = [
  { keys: ['a', 'b', 'outward'], type: 'segment' },
  { keys: ['a', 'b', 'outwardFrom'], type: 'segment' },
  { keys: ['ring', 'center'], type: 'ring' },
  { keys: ['landmarkRing'], type: 'landmarkRing' },
  { keys: ['front', 'footprintSha256'], type: 'front' },
  { keys: ['world'], type: 'world' },
];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/,
  IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/,
  HEX = /^#[0-9a-f]{6}$/,
  LOD = /^[0-4](\.[0-3])?$/,
  SHA = /^[0-9a-f]{64}$/,
  FRONT_ID = /^building-[0-9]+-edge-[0-9]+$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPoint = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);

export function validateFacadeDesigns(json, { kitPieces = [], palette = {} } = {}) {
  const errors = new Set();
  const fail = (path, message) => errors.add(`${path}: ${message}`);
  if (!isObject(json)) return ['$: se esperaba un objeto'];
  const pieces = new Set(kitPieces);

  const onlyKeys = (obj, allowed, path) => {
    for (const k of Object.keys(obj))
      if (!allowed.includes(k)) fail(`${path}.${k}`, 'clave desconocida');
  };

  // Una expresión compila y solo usa nombres definidos en ese punto.
  function checkExpr(text, path, names) {
    if (typeof text !== 'string' || /^[#$]/.test(text))
      return fail(path, 'se esperaba una expresión');
    try {
      for (const n of freeNames(text)) if (!names.has(n)) fail(path, `variable no definida «${n}»`);
    } catch (e) {
      fail(path, e.message);
    }
  }
  function checkColor(text, path) {
    if (HEX.test(text)) return;
    if (/^\$[a-z]+$/.test(text) && Object.hasOwn(palette, text.slice(1))) return;
    fail(path, `color no válido «${text}» (#rrggbb o $nombre de la paleta)`);
  }
  // kind: 'number' (número, expresión o pick), 'color' o 'value' (además booleano, texto y color).
  function checkValue(v, path, names, kind = 'value') {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) fail(path, 'número no finito');
      else if (kind === 'color') fail(path, 'se esperaba un color');
      return;
    }
    if (typeof v === 'boolean') {
      if (kind !== 'value') fail(path, 'no se admite un booleano');
      return;
    }
    if (typeof v === 'string') {
      if (/^[#$]/.test(v)) {
        if (kind === 'number') fail(path, 'se esperaba un número o una expresión');
        else checkColor(v, path);
      } else if (kind === 'color') fail(path, 'se esperaba un color');
      else checkExpr(v, path, names);
      return;
    }
    if (isObject(v) && 'text' in v) {
      onlyKeys(v, ['text'], path);
      if (kind !== 'value' || typeof v.text !== 'string') fail(path, 'texto no admitido aquí');
      return;
    }
    if (isObject(v) && 'pick' in v) {
      onlyKeys(v, ['pick', 'index'], path);
      if (!Array.isArray(v.pick) || v.pick.length === 0) fail(`${path}.pick`, 'lista vacía');
      else v.pick.forEach((item, i) => checkValue(item, `${path}.pick[${i}]`, names, kind));
      checkExpr(v.index, `${path}.index`, names);
      return;
    }
    fail(path, 'valor no válido');
  }
  function checkVec(v, size, path, names) {
    if (!Array.isArray(v) || v.length !== size) return fail(path, `se esperaban ${size} valores`);
    v.forEach((item, i) => checkValue(item, `${path}[${i}]`, names, 'number'));
  }

  // `ctx`: { loops: variables de bucle de los ancestros, anchor: tipo de anclaje, stack: recetas en curso }
  function checkBody(body, path, names, ctx) {
    if (!Array.isArray(body)) return fail(path, 'se esperaba una lista de nodos');
    body.forEach((node, i) => checkNode(node, `${path}[${i}]`, names, ctx));
  }
  function checkNode(node, path, names, ctx) {
    if (!isObject(node)) return fail(path, 'se esperaba un nodo');
    const types = NODE_TYPES.filter((t) => t in node);
    if (types.length !== 1) return fail(path, 'un nodo tiene exactamente una clave de tipo');
    const type = types[0],
      at = `${path}.${type}`;
    onlyKeys(node, [type, ...NODE_EXTRA[type]], path);
    const rotation = () =>
      'rotation' in node && checkVec(node.rotation, 3, `${path}.rotation`, names);
    switch (type) {
      case 'let': {
        if (!isObject(node.let)) return fail(at, 'se esperaba un objeto');
        for (const [k, v] of Object.entries(node.let)) {
          if (!IDENT.test(k)) fail(`${at}.${k}`, 'identificador no válido');
          else if (ctx.loops.has(k))
            fail(`${at}.${k}`, 'no se puede reasignar la variable de un bucle');
          checkValue(v, `${at}.${k}`, names);
          names.add(k);
        }
        return;
      }
      case 'box':
        checkVec(node.box, 6, at, names);
        if (!('color' in node)) fail(`${path}.color`, 'falta el color');
        else checkValue(node.color, `${path}.color`, names, 'color');
        return rotation();
      case 'piece': {
        const arity = PIECE_ARITY[node.piece];
        if (!arity || !pieces.has(node.piece)) fail(at, `pieza desconocida «${node.piece}»`);
        if (!Array.isArray(node.args)) fail(`${path}.args`, 'faltan los argumentos');
        else {
          if (arity && (node.args.length < arity[0] || node.args.length > arity[1]))
            fail(`${path}.args`, `${node.piece} admite de ${arity[0]} a ${arity[1]} argumentos`);
          node.args.forEach((a, i) => checkValue(a, `${path}.args[${i}]`, names));
        }
        return rotation();
      }
      case 'geo': {
        if (!Array.isArray(node.geo) || typeof node.geo[0] !== 'string')
          return fail(at, 'se esperaba [nombre, parámetros…]');
        const arity = GEOMETRY_ARITY[node.geo[0]];
        if (!arity) fail(`${at}[0]`, `geometría no permitida «${node.geo[0]}»`);
        else if (node.geo.length - 1 < arity[0] || node.geo.length - 1 > arity[1])
          fail(at, `${node.geo[0]} admite de ${arity[0]} a ${arity[1]} parámetros`);
        node.geo.slice(1).forEach((p, i) => checkValue(p, `${at}[${i + 1}]`, names, 'number'));
        if ('at' in node) checkVec(node.at, 3, `${path}.at`, names);
        else fail(`${path}.at`, 'falta la posición');
        if (!('color' in node)) fail(`${path}.color`, 'falta el color');
        else checkValue(node.color, `${path}.color`, names, 'color');
        return rotation();
      }
      case 'group': {
        if (!isObject(node.group)) fail(at, 'se esperaba un objeto');
        else {
          onlyKeys(node.group, ['at', 'rotation'], at);
          for (const k of ['at', 'rotation'])
            if (k in node.group) checkVec(node.group[k], 3, `${at}.${k}`, names);
        }
        return checkBody(node.body, `${path}.body`, new Set(names), ctx);
      }
      case 'for': {
        if (typeof node.for !== 'string' || !IDENT.test(node.for))
          return fail(at, 'identificador no válido');
        if (ctx.loops.has(node.for)) fail(at, 'variable de bucle ya usada por un ancestro');
        const inner = new Set(names),
          loops = new Set(ctx.loops).add(node.for);
        inner.add(node.for);
        if ('in' in node) {
          for (const k of ['from', 'while', 'step'])
            if (k in node) fail(`${path}.${k}`, 'no se combina con «in»');
          if (!Array.isArray(node.in)) fail(`${path}.in`, 'se esperaba una lista');
          else node.in.forEach((v, i) => checkValue(v, `${path}.in[${i}]`, names));
        } else {
          for (const k of ['from', 'while', 'step'])
            if (!(k in node)) fail(`${path}.${k}`, 'falta');
          if ('from' in node) checkValue(node.from, `${path}.from`, names, 'number');
          if ('step' in node) checkValue(node.step, `${path}.step`, names, 'number');
          if ('while' in node) checkExpr(node.while, `${path}.while`, inner);
        }
        return checkBody(node.body, `${path}.body`, inner, { ...ctx, loops });
      }
      case 'if':
        checkExpr(node.if, at, names);
        checkBody(node.then, `${path}.then`, new Set(names), ctx);
        if ('else' in node) checkBody(node.else, `${path}.else`, new Set(names), ctx);
        return;
      case 'use': {
        const recipe = isObject(json.recipes) ? json.recipes[node.use] : null;
        if (!isObject(recipe)) return fail(at, `receta desconocida «${node.use}»`);
        if (ctx.stack.includes(node.use))
          return fail(at, `recursión: ${[...ctx.stack, node.use].join(' → ')}`);
        const params = isObject(recipe.params) ? recipe.params : {};
        const inner = new Set(names);
        for (const k of Object.keys(params)) inner.add(k);
        if ('with' in node) {
          if (!isObject(node.with)) fail(`${path}.with`, 'se esperaba un objeto');
          else
            for (const [k, v] of Object.entries(node.with)) {
              if (!Object.hasOwn(params, k)) fail(`${path}.with.${k}`, 'parámetro no declarado');
              checkValue(v, `${path}.with.${k}`, names);
            }
        }
        return checkBody(recipe.body, `recipes.${node.use}.body`, inner, {
          ...ctx,
          stack: [...ctx.stack, node.use],
        });
      }
      default: // roof
        if (ctx.anchor !== 'landmarkRing' && ctx.anchor !== 'any')
          fail(at, 'solo se admite con un anclaje landmarkRing');
        if (!isObject(node.roof)) return fail(at, 'se esperaba un objeto');
        onlyKeys(node.roof, ['y', 'color'], at);
        checkValue(node.roof.y, `${at}.y`, names, 'number');
        if (typeof node.roof.color !== 'string') fail(`${at}.color`, 'falta el color');
        else checkValue(node.roof.color, `${at}.color`, names, 'color');
    }
  }

  // Receta aplicada a un frente: variables predefinidas, parámetros y cuerpo.
  function checkRecipe(name, front, predefined, anchor, withPath) {
    const recipe = json.recipes[name],
      names = new Set(predefined),
      ctx = { loops: new Set(), anchor, stack: [name] },
      path = `recipes.${name}`;
    const params = isObject(recipe.params) ? recipe.params : {};
    for (const [k, v] of Object.entries(params)) {
      if (!IDENT.test(k)) fail(`${path}.params.${k}`, 'identificador no válido');
      checkValue(v, `${path}.params.${k}`, names);
      names.add(k);
    }
    if (front?.with !== undefined) {
      if (!isObject(front.with)) fail(`${withPath}.with`, 'se esperaba un objeto');
      else
        for (const [k, v] of Object.entries(front.with)) {
          if (!Object.hasOwn(params, k)) fail(`${withPath}.with.${k}`, 'parámetro no declarado');
          checkValue(v, `${withPath}.with.${k}`, names);
        }
    }
    checkBody(recipe.body, `${path}.body`, names, ctx);
    return names;
  }

  onlyKeys(
    json,
    ['$schema', 'version', 'kit', 'description', 'license', 'attribution', 'recipes', 'buildings'],
    '$',
  );
  if (json.version !== 1) fail('version', 'debe ser 1');
  if (json.kit !== 1) fail('kit', 'debe ser 1');
  for (const k of ['description', 'license', 'attribution'])
    if (k in json && typeof json[k] !== 'string') fail(k, 'se esperaba texto');
  if (!isObject(json.recipes)) fail('recipes', 'se esperaba un objeto');
  if (!Array.isArray(json.buildings)) fail('buildings', 'se esperaba una lista');
  if (errors.size) return [...errors];

  for (const [name, recipe] of Object.entries(json.recipes)) {
    const path = `recipes.${name}`;
    if (!ID.test(name)) fail(path, 'nombre no válido (minúsculas, números y guiones)');
    if (!isObject(recipe)) {
      fail(path, 'se esperaba un objeto');
      continue;
    }
    onlyKeys(recipe, ['description', 'params', 'body'], path);
    if (!Array.isArray(recipe.body)) fail(`${path}.body`, 'falta el cuerpo');
  }
  if (errors.size) return [...errors];
  // Una receta que nadie usa se comprueba sola; las demás, desde sus frentes y sus `use`.
  const referenced = new Set();
  const scan = (body) => {
    for (const node of Array.isArray(body) ? body : []) {
      if (!isObject(node)) continue;
      if (typeof node.use === 'string') referenced.add(node.use);
      for (const k of ['body', 'then', 'else']) scan(node[k]);
    }
  };
  for (const recipe of Object.values(json.recipes)) scan(recipe.body);
  for (const b of json.buildings)
    for (const f of Array.isArray(b?.fronts) ? b.fronts : [])
      if (typeof f?.recipe === 'string') referenced.add(f.recipe);
  for (const name of Object.keys(json.recipes))
    if (!referenced.has(name)) checkRecipe(name, null, PREDEFINED, 'any', `recipes.${name}`);

  const ids = new Set();
  json.buildings.forEach((b, i) => {
    const path = `buildings[${i}]`;
    if (!isObject(b)) return fail(path, 'se esperaba un objeto');
    onlyKeys(
      b,
      ['id', 'name', 'landmark', 'detailType', 'lod', 'status', 'references', 'fronts'],
      path,
    );
    if (typeof b.id !== 'string' || !ID.test(b.id)) fail(`${path}.id`, 'identificador no válido');
    else if (ids.has(b.id)) fail(`${path}.id`, `duplicado «${b.id}»`);
    else ids.add(b.id);
    if (typeof b.name !== 'string') fail(`${path}.name`, 'falta el nombre');
    if ('landmark' in b && (typeof b.landmark !== 'string' || !b.landmark))
      fail(`${path}.landmark`, 'se esperaba texto');
    if ('detailType' in b && !['market', 'townhall', 'church', 'street'].includes(b.detailType))
      fail(`${path}.detailType`, 'tipo de detalle desconocido');
    if ('lod' in b && !(typeof b.lod === 'string' && LOD.test(b.lod)))
      fail(`${path}.lod`, 'LoD no válido');
    if ('status' in b && b.status !== 'approximate')
      fail(`${path}.status`, 'debe ser «approximate»');
    if (
      'references' in b &&
      !(Array.isArray(b.references) && b.references.every((r) => typeof r === 'string'))
    )
      fail(`${path}.references`, 'se esperaba una lista de textos');
    if (!Array.isArray(b.fronts) || b.fronts.length === 0)
      return fail(`${path}.fronts`, 'se esperaba al menos un frente');
    b.fronts.forEach((f, j) => {
      const fp = `${path}.fronts[${j}]`;
      if (!isObject(f)) return fail(fp, 'se esperaba un objeto');
      onlyKeys(f, ['anchor', 'recipe', 'with', 'scaleY'], fp);
      const anchor = checkAnchor(f.anchor, `${fp}.anchor`);
      if (typeof f.recipe !== 'string' || !isObject(json.recipes[f.recipe]))
        return fail(`${fp}.recipe`, `receta desconocida «${f.recipe}»`);
      if (!anchor) return;
      const predefined = anchor === 'world' ? [] : [...PREDEFINED];
      if (anchor === 'front') predefined.push(...FRONT_PREDEFINED);
      const names = checkRecipe(f.recipe, f, predefined, anchor, fp);
      if ('scaleY' in f) checkValue(f.scaleY, `${fp}.scaleY`, new Set(predefined), 'number');
      return names;
    });
  });

  function checkAnchor(a, path) {
    if (!isObject(a)) return void fail(path, 'se esperaba un objeto');
    const keys = Object.keys(a),
      found = ANCHORS.find(
        (k) => k.keys.length === keys.length && k.keys.every((key) => keys.includes(key)),
      );
    if (!found)
      return void fail(
        path,
        'anclaje no válido; claves permitidas: ' + ANCHORS.map((k) => k.keys.join('+')).join(' | '),
      );
    if (found.type === 'segment') {
      if (!isPoint(a.a)) fail(`${path}.a`, 'se esperaba [x, z]');
      if (!isPoint(a.b)) fail(`${path}.b`, 'se esperaba [x, z]');
      const out = a.outward ?? a.outwardFrom;
      if (!isPoint(out))
        fail(`${path}.${'outward' in a ? 'outward' : 'outwardFrom'}`, 'se esperaba [x, z]');
    } else if (found.type === 'ring') {
      if (!Array.isArray(a.ring) || a.ring.length < 3 || !a.ring.every(isPoint))
        fail(`${path}.ring`, 'se esperaban al menos 3 puntos [x, z]');
      if (!isPoint(a.center)) fail(`${path}.center`, 'se esperaba [x, z]');
    } else if (found.type === 'landmarkRing') {
      if (typeof a.landmarkRing !== 'string' || !a.landmarkRing)
        fail(`${path}.landmarkRing`, 'se esperaba un nombre de hito');
    } else if (found.type === 'front') {
      if (typeof a.front !== 'string' || !FRONT_ID.test(a.front))
        fail(`${path}.front`, 'ID de frente no válido');
      if (typeof a.footprintSha256 !== 'string' || !SHA.test(a.footprintSha256))
        fail(`${path}.footprintSha256`, 'se esperaba un SHA-256 en hexadecimal');
    } else if (a.world !== true) fail(`${path}.world`, 'debe ser true');
    return found.type;
  }

  return [...errors];
}
