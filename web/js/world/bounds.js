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

// pad positivo reserva un margen interior; negativo amplía cada rectángulo.
export function insideBounds(x, z, pad = 0, bounds = world.city.bounds, inclusive = true) {
  return bounds.some(([x0, x1, z0, z1]) =>
    inclusive
      ? x >= x0 + pad && x <= x1 - pad && z >= z0 + pad && z <= z1 - pad
      : x > x0 + pad && x < x1 - pad && z > z0 + pad && z < z1 - pad,
  );
}

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
