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
