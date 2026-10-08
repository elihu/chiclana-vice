import { world } from '../core/state.js';

export function validBounds(bounds) {
  return (
    Array.isArray(bounds) &&
    bounds.length > 0 &&
    bounds.every(
      (r) =>
        Array.isArray(r) &&
        r.length === 4 &&
        r.every(Number.isFinite) &&
        r[0] < r[1] &&
        r[2] < r[3],
    )
  );
}

// Compatibilidad con las copias locales anteriores al formato de rectángulos.
export function worldBounds(city) {
  if (city.bounds !== undefined) return city.bounds;
  if (
    Array.isArray(city.size) &&
    city.size.length === 2 &&
    city.size.every((v) => Number.isFinite(v) && v > 0)
  ) {
    const [w, h] = city.size;
    return [[-w / 2, w / 2, -h / 2, h / 2]];
  }
  return null;
}

// pad positivo reserva un margen interior medido hasta el borde de la unión: la costura
// entre rectángulos contiguos no es borde. Negativo amplía cada rectángulo por separado.
export function insideBounds(x, z, pad = 0, bounds = world.city.bounds, inclusive = true) {
  if (
    bounds.some(([x0, x1, z0, z1]) =>
      inclusive
        ? x >= x0 + pad && x <= x1 - pad && z >= z0 + pad && z <= z1 - pad
        : x > x0 + pad && x < x1 - pad && z > z0 + pad && z < z1 - pad,
    )
  )
    return true;
  if (pad < 0 || bounds.length < 2 || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  return squareCovered(x - pad, x + pad, z - pad, z + pad, bounds, inclusive);
}

// ¿Cubre la unión el cuadrado cerrado (inclusive) o su interior lo contiene (estricto)?
// Las aristas de los rectángulos parten el cuadrado en celdas, aristas y vértices donde
// la respuesta es constante; basta un punto de cada pieza.
function squareCovered(sx0, sx1, sz0, sz1, bounds, inclusive) {
  const near = bounds.filter(
      ([x0, x1, z0, z1]) => x0 <= sx1 && x1 >= sx0 && z0 <= sz1 && z1 >= sz0,
    ),
    axis = (lo, hi, cuts) => {
      const v = [...new Set([lo, hi, ...cuts.filter((c) => c > lo && c < hi)])].sort(
        (a, b) => a - b,
      );
      return v.flatMap((c, i) => (i ? [(v[i - 1] + c) / 2, c] : [c]));
    },
    xs = axis(
      sx0,
      sx1,
      near.flatMap((r) => [r[0], r[1]]),
    ),
    zs = axis(
      sz0,
      sz1,
      near.flatMap((r) => [r[2], r[3]]),
    ),
    // Tramo [lo, hi] que contiene a por arriba (after) o por abajo.
    span = (a, lo, hi, after) => (after ? lo <= a && a < hi : lo < a && a <= hi),
    covered = inclusive
      ? (x, z) => near.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)
      : // Interior de la unión: cada cuadrante junto al punto cae en algún rectángulo.
        (x, z) =>
          QUADRANTS.every(([ax, az]) =>
            near.some(([x0, x1, z0, z1]) => span(x, x0, x1, ax) && span(z, z0, z1, az)),
          );
  return xs.every((x) => zs.every((z) => covered(x, z)));
}

const QUADRANTS = [
  [true, true],
  [true, false],
  [false, true],
  [false, false],
];

export function boundsBox(bounds = world.city.bounds) {
  return [
    Math.min(...bounds.map((r) => r[0])),
    Math.max(...bounds.map((r) => r[1])),
    Math.min(...bounds.map((r) => r[2])),
    Math.max(...bounds.map((r) => r[3])),
  ];
}

export function nearEdge(x, z, d, bounds = world.city.bounds) {
  return !insideBounds(x, z, d, bounds);
}
