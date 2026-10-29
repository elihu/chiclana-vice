import { pInside } from '../core/math.js';
import { segments, world } from '../core/state.js';
import { partArea } from './ground-floors.js';

// Gasolineras de OSM (C4 de PLAN-COMERCIOS, datos de ground-floors.json → fuel). El Catastro ya
// recoge la marquesina (con la tienda) como una parte de una planta: es la mayor parte de una planta
// que contiene el punto de OSM, o la que está a menos de `reach` m, o cuyo centro cae en el área de
// OSM. Esa parte se dibuja sin paredes, con su cubierta y un canto de color (buildings.js); la
// receta `gasolinera` pone debajo pilares e islas de surtidores, orientados hacia la calle
// principal más cercana (sin vías de servicio). Contorno y altura son los del Catastro.
export const FUEL = {
  reach: 10, // m entre el punto de OSM y la parte del Catastro
  areaRange: [60, 1500], // m² de la parte que puede ser la marquesina
  fascia: 0.7, // m del canto de color bajo la cubierta
  streetTypes: ['service'], // tipos de vía que no orientan la gasolinera
  tones: ['#2e6f9e', '#3f7d4a', '#b5532c'], // canto: azul, verde y teja (los de la receta)
};

function ringDistance(ring, x, z) {
  let best = Infinity;
  ring.forEach((a, i) => {
    const q = ring[(i + 1) % ring.length],
      dx = q[0] - a[0],
      dz = q[1] - a[1],
      u = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u));
  });
  return best;
}

// Punto más cercano de una vía rodada que no sea de servicio.
function mainRoad(x, z) {
  let best = null;
  for (const s of segments) {
    if (!s.drive || FUEL.streetTypes.includes(s.type)) continue;
    const dx = s.b[0] - s.a[0],
      dz = s.b[1] - s.a[1],
      u = Math.min(
        1,
        Math.max(0, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / (dx * dx + dz * dz || 1)),
      ),
      px = s.a[0] + dx * u,
      pz = s.a[1] + dz * u,
      d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { x: px, z: pz, d };
  }
  return best;
}

export function fuelStations() {
  if (world.fuelStations && world.fuelSource === world.groundFloors) return world.fuelStations;
  const stations = [],
    skipped = [],
    used = new Set(),
    buildings = world.city.buildings;
  (world.groundFloors?.fuel ?? []).forEach((f, k) => {
    let index = -1,
      area = 0;
    buildings.forEach((b, i) => {
      if (b.floors !== 1 || b.detailType || used.has(i)) return;
      const cx = b.p.reduce((s, p) => s + p[0], 0) / b.p.length,
        cz = b.p.reduce((s, p) => s + p[1], 0) / b.p.length;
      if (Math.hypot(cx - f.x, cz - f.z) > 80) return;
      const a = partArea(b),
        near = f.outline
          ? pInside(cx, cz, f.outline)
          : pInside(f.x, f.z, b.p) || ringDistance(b.p, f.x, f.z) <= FUEL.reach;
      if (near && a >= FUEL.areaRange[0] && a <= FUEL.areaRange[1] && a > area) {
        index = i;
        area = a;
      }
    });
    const b = buildings[index];
    if (!b) return void skipped.push(f.name);
    const cx = b.p.reduce((s, p) => s + p[0], 0) / b.p.length,
      cz = b.p.reduce((s, p) => s + p[1], 0) / b.p.length,
      road = mainRoad(cx, cz);
    if (!road || road.d < 0.5) return void skipped.push(f.name);
    used.add(index);
    // u: hacia la calle principal; t: a lo largo de ella. El marco es la caja de la parte en esos
    // ejes: el muro de la receta va por su fondo y z crece hacia la calle.
    const u = [(road.x - cx) / road.d, (road.z - cz) / road.d],
      t = [u[1], -u[0]],
      along = b.p.map(([x, z]) => (x - cx) * t[0] + (z - cz) * t[1]),
      out = b.p.map(([x, z]) => (x - cx) * u[0] + (z - cz) * u[1]),
      [t0, t1, u0, u1] = [
        Math.min(...along),
        Math.max(...along),
        Math.min(...out),
        Math.max(...out),
      ],
      point = (s, r) => [cx + t[0] * s + u[0] * r, cz + t[1] * s + u[1] * r],
      len = t1 - t0,
      depth = u1 - u0,
      top = b.baseY + (b.renderH ?? b.h),
      front = point((t0 + t1) / 2, u1);
    stations.push({
      id: `fuel-${k}`,
      name: f.name,
      part: index,
      a: point(t0, u0),
      q: point(t1, u0),
      nx: u[0],
      nz: u[1],
      len,
      depth,
      baseY: b.baseY,
      // Altura libre bajo el canto, relativa a la base; la receta pone ahí los pilares.
      clearance: top - FUEL.fascia - b.baseY,
      seed: Math.abs(Math.round(cx * 7 + cz * 13)),
      islands: Math.min(4, Math.max(1, Math.floor((len * 0.8) / 8))),
      // Canto hacia la calle, para el rótulo con el nombre (la caja puede salirse un poco del
      // contorno si la parte no es rectangular).
      sign: {
        x: front[0],
        z: front[1],
        y: top - FUEL.fascia / 2,
        nx: u[0],
        nz: u[1],
        width: len,
      },
    });
  });
  world.fuelStations = stations;
  world.fuelSource = world.groundFloors;
  world.fuelSkipped = skipped;
  return stations;
}
