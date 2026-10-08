export const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp = (a, b, t) => a + (b - a) * t,
  TAU = Math.PI * 2;

export function d(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function pInside(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    let a = poly[i],
      b = poly[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}

export function pointSeg(x, z, a, b) {
  let dx = b[0] - a[0],
    dz = b[1] - a[1],
    u = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return {
    x: a[0] + dx * u,
    z: a[1] + dz * u,
    d: Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u),
    u,
  };
}

// Case- and accent-insensitive search text ("jesus" finds "Jesús").
export const fold = (text) =>
  text
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export function boundaryDistance(x, z, polygon) {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return best;
}
