// Intérprete de expresiones aritméticas para los diseños JSON. Sin eval ni Function.
// Misma precedencia y asociatividad que JavaScript para que la coma flotante coincida;
// `==` y `!=` se evalúan como `===` y `!==`. Detalle en docs/plan-modular/KIT-FACHADAS.md (K2).

const FUNCTIONS = {
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
};
const CONSTANTS = { PI: Math.PI, TAU: Math.PI * 2 };

const TOKEN =
  /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(&&|\|\||[=!]=|<=|>=|[-+*/%<>!?:(),]))/y;

function tokenize(text) {
  const tokens = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < text.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(text);
    if (!m) {
      if (/^\s*$/.test(text.slice(pos))) break;
      const bad = text.slice(pos).trimStart()[0];
      throw new Error(`Expresión no válida «${text}»: carácter no soportado «${bad}»`);
    }
    pos = TOKEN.lastIndex;
    if (m[1] !== undefined) tokens.push({ type: 'num', value: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ type: 'id', value: m[2] });
    else tokens.push({ type: 'op', value: m[3] });
  }
  return tokens;
}

// Analizador por precedencia; produce un árbol de nodos planos.
function parse(text) {
  const tokens = tokenize(text);
  let i = 0;
  const fail = (why) => {
    throw new Error(`Expresión no válida «${text}»: ${why}`);
  };
  const peek = () => tokens[i];
  const isOp = (...ops) => tokens[i]?.type === 'op' && ops.includes(tokens[i].value);
  const expect = (op) => {
    if (!isOp(op)) fail(`se esperaba «${op}»`);
    i++;
  };

  function expr() {
    const test = or();
    if (!isOp('?')) return test;
    i++;
    const yes = expr();
    expect(':');
    return { type: 'cond', test, yes, no: expr() };
  }
  function binary(next, ...ops) {
    return () => {
      let left = next();
      while (isOp(...ops)) left = { type: 'bin', op: tokens[i++].value, left, right: next() };
      return left;
    };
  }
  function unary() {
    if (isOp('-', '+', '!')) {
      const op = tokens[i++].value;
      return { type: 'un', op, arg: unary() };
    }
    return primary();
  }
  function primary() {
    const t = peek();
    if (!t) fail('termina antes de tiempo');
    i++;
    if (t.type === 'num') return { type: 'num', value: t.value };
    if (t.type === 'id') {
      if (isOp('(')) {
        if (!Object.hasOwn(FUNCTIONS, t.value)) fail(`función no permitida «${t.value}»`);
        i++;
        const args = [];
        if (!isOp(')')) {
          args.push(expr());
          while (isOp(',')) {
            i++;
            args.push(expr());
          }
        }
        expect(')');
        return { type: 'call', name: t.value, args };
      }
      if (t.value === 'true' || t.value === 'false')
        return { type: 'num', value: t.value === 'true' };
      if (Object.hasOwn(CONSTANTS, t.value)) return { type: 'num', value: CONSTANTS[t.value] };
      return { type: 'var', name: t.value };
    }
    if (t.value === '(') {
      const inner = expr();
      expect(')');
      return inner;
    }
    return fail(`símbolo inesperado «${t.value}»`);
  }
  const multiplicative = binary(unary, '*', '/', '%');
  const additive = binary(multiplicative, '+', '-');
  const relational = binary(additive, '<', '<=', '>', '>=');
  const equality = binary(relational, '==', '!=');
  const and = binary(equality, '&&');
  const or = binary(and, '||');

  const tree = expr();
  if (i < tokens.length) fail('sobra texto');
  return tree;
}

// Las variables se buscan en la cadena de ámbitos, sin llegar a Object.prototype.
function lookup(scope, name) {
  for (let s = scope; s && s !== Object.prototype; s = Object.getPrototypeOf(s))
    if (Object.hasOwn(s, name)) return s[name];
  throw new Error(`Variable desconocida: ${name}`);
}

function build(node) {
  switch (node.type) {
    case 'num': {
      const value = node.value;
      return () => value;
    }
    case 'var': {
      const name = node.name;
      return (scope) => lookup(scope, name);
    }
    case 'call': {
      const fn = FUNCTIONS[node.name],
        args = node.args.map(build);
      return (scope) => fn(...args.map((a) => a(scope)));
    }
    case 'cond': {
      const test = build(node.test),
        yes = build(node.yes),
        no = build(node.no);
      return (scope) => (test(scope) ? yes(scope) : no(scope));
    }
    case 'un': {
      const arg = build(node.arg);
      if (node.op === '-') return (scope) => -arg(scope);
      if (node.op === '+') return (scope) => +arg(scope);
      return (scope) => !arg(scope);
    }
    default: {
      const left = build(node.left),
        right = build(node.right);
      switch (node.op) {
        case '||':
          return (scope) => left(scope) || right(scope);
        case '&&':
          return (scope) => left(scope) && right(scope);
        case '==':
          return (scope) => left(scope) === right(scope);
        case '!=':
          return (scope) => left(scope) !== right(scope);
        case '<':
          return (scope) => left(scope) < right(scope);
        case '<=':
          return (scope) => left(scope) <= right(scope);
        case '>':
          return (scope) => left(scope) > right(scope);
        case '>=':
          return (scope) => left(scope) >= right(scope);
        case '+':
          return (scope) => left(scope) + right(scope);
        case '-':
          return (scope) => left(scope) - right(scope);
        case '*':
          return (scope) => left(scope) * right(scope);
        case '/':
          return (scope) => left(scope) / right(scope);
        default:
          return (scope) => left(scope) % right(scope);
      }
    }
  }
}

const cache = new Map();
function entry(text) {
  if (typeof text !== 'string') throw new Error('Expresión no válida: se esperaba texto');
  let e = cache.get(text);
  if (!e) {
    const tree = parse(text);
    e = { tree, fn: build(tree), names: null };
    cache.set(text, e);
  }
  return e;
}

// Devuelve una función (ámbito) => valor; el árbol se analiza una sola vez por cadena.
export function compile(text) {
  return entry(text).fn;
}

export function evaluate(text, scope) {
  return entry(text).fn(scope);
}

// Nombres de variable usados (sin funciones ni PI/TAU), en orden de aparición y sin repetir.
export function freeNames(text) {
  const e = entry(text);
  if (!e.names) {
    const found = new Set();
    const walk = (n) => {
      if (n.type === 'var') found.add(n.name);
      for (const k of ['arg', 'left', 'right', 'test', 'yes', 'no']) if (n[k]) walk(n[k]);
      for (const a of n.args || []) walk(a);
    };
    walk(e.tree);
    e.names = [...found];
  }
  return [...e.names];
}
