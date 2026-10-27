// Muros compartidos entre partes catastrales vecinas.
//
// Dos partes que se tocan comparten arista (exacta o colineal y solapada en parte). Por debajo
// del tejado más bajo de las dos, ese muro queda dentro del volumen y no se ve; por encima es
// una medianera expuesta, sin huecos. Este módulo no depende de Three.js: devuelve, para cada
// arista con vecino, los tramos a lo largo de la arista y la cota del vecino que la tapa.

// Separación perpendicular admitida entre aristas colineales (m). El catastro simplificado a
// 0,12 m deja aristas vecinas a pocos centímetros.
export const PARTY_TOLERANCE = 0.12;
// Tramos de solape más cortos se ignoran (m).
const MIN_OVERLAP = 0.1;
// Paralelismo mínimo: |cos| entre direcciones (≈ 2,6°).
const MIN_COS = 0.999;
const CELL = 8;

export const edgeKey = (building, ring, index) => building + ':' + ring + ':' + index;

/**
 * @param {{p: number[][], holes: number[][][]}[]} buildings
 * @param {number[]} tops cota absoluta del tejado de cada edificio (misma longitud)
 * @returns {Map<string, {t0: number, t1: number, cover: number}[]>} por arista con vecino, tramos
 *   ordenados que la cubren entera; `cover` es la cota más alta de los vecinos en ese tramo o
 *   -Infinity si no hay vecino.
 */
export function sharedWallSpans(buildings, tops) {
  const edges = [],
    grid = new Map();
  buildings.forEach((b, bi) =>
    [b.p, ...b.holes].forEach((ring, ri) => {
      for (let k = 0; k < ring.length; k++) {
        const [ax, az] = ring[k],
          [bx, bz] = ring[(k + 1) % ring.length],
          len = Math.hypot(bx - ax, bz - az);
        if (len < MIN_OVERLAP) continue;
        const e = {
          bi,
          key: edgeKey(bi, ri, k),
          ax,
          az,
          ux: (bx - ax) / len,
          uz: (bz - az) / len,
          len,
        };
        const id = edges.push(e) - 1,
          x0 = Math.floor((Math.min(ax, bx) - PARTY_TOLERANCE) / CELL),
          x1 = Math.floor((Math.max(ax, bx) + PARTY_TOLERANCE) / CELL),
          z0 = Math.floor((Math.min(az, bz) - PARTY_TOLERANCE) / CELL),
          z1 = Math.floor((Math.max(az, bz) + PARTY_TOLERANCE) / CELL);
        for (let x = x0; x <= x1; x++)
          for (let z = z0; z <= z1; z++) {
            const cell = x + ',' + z;
            if (!grid.has(cell)) grid.set(cell, []);
            grid.get(cell).push(id);
          }
      }
    }),
  );

  const result = new Map();
  for (const e of edges) {
    const seen = new Set(),
      overlaps = [],
      x0 = Math.floor((Math.min(e.ax, e.ax + e.ux * e.len) - PARTY_TOLERANCE) / CELL),
      x1 = Math.floor((Math.max(e.ax, e.ax + e.ux * e.len) + PARTY_TOLERANCE) / CELL),
      z0 = Math.floor((Math.min(e.az, e.az + e.uz * e.len) - PARTY_TOLERANCE) / CELL),
      z1 = Math.floor((Math.max(e.az, e.az + e.uz * e.len) + PARTY_TOLERANCE) / CELL);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        for (const id of grid.get(x + ',' + z) ?? []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const o = edges[id];
          if (o.bi === e.bi || Math.abs(e.ux * o.ux + e.uz * o.uz) < MIN_COS) continue;
          // Los dos extremos del vecino deben caer sobre la recta de esta arista.
          const bx = o.ax + o.ux * o.len,
            bz = o.az + o.uz * o.len,
            da = (o.ax - e.ax) * -e.uz + (o.az - e.az) * e.ux,
            db = (bx - e.ax) * -e.uz + (bz - e.az) * e.ux;
          if (Math.abs(da) > PARTY_TOLERANCE || Math.abs(db) > PARTY_TOLERANCE) continue;
          const ta = (o.ax - e.ax) * e.ux + (o.az - e.az) * e.uz,
            tb = (bx - e.ax) * e.ux + (bz - e.az) * e.uz,
            lo = Math.max(0, Math.min(ta, tb)),
            hi = Math.min(e.len, Math.max(ta, tb));
          if (hi - lo >= MIN_OVERLAP) overlaps.push({ lo, hi, top: tops[o.bi] });
        }
    if (!overlaps.length) continue;
    // Cortes en los extremos de cada solape; cada tramo toma el vecino más alto que lo cubre.
    const cuts = [...new Set([0, e.len, ...overlaps.flatMap((o) => [o.lo, o.hi])])].sort(
        (a, b) => a - b,
      ),
      spans = [];
    for (let n = 1; n < cuts.length; n++) {
      const t0 = cuts[n - 1],
        t1 = cuts[n];
      if (t1 - t0 < 1e-6) continue;
      const mid = (t0 + t1) / 2;
      let cover = -Infinity;
      for (const o of overlaps) if (o.lo <= mid && mid <= o.hi) cover = Math.max(cover, o.top);
      const last = spans[spans.length - 1];
      if (last && last.cover === cover) last.t1 = t1;
      else spans.push({ t0, t1, cover });
    }
    result.set(e.key, spans);
  }
  return result;
}
