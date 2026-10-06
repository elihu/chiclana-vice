// Correcciones manuales sobre las capas de base (web/map-corrections.json). Función pura de
// datos: sin DOM ni Three, importable desde Node. Formato en docs/plan-modular/KIT-FACHADAS.md (K7).

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// SHA-256 síncrono de un texto ASCII. `crypto.subtle` no existe fuera de contextos seguros
// (por ejemplo, el juego servido por HTTP en la red local), así que no se usa.
export function sha256Hex(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i) & 0xff);
  const bits = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 0xff);
  const h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
      0x5be0cd19,
    ]),
    w = new Uint32Array(64),
    rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < bytes.length; o += 64) {
    for (let i = 0; i < 16; i++)
      w[i] =
        (bytes[o + i * 4] << 24) |
        (bytes[o + i * 4 + 1] << 16) |
        (bytes[o + i * 4 + 2] << 8) |
        bytes[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3),
        s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i],
        t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  return [...h].map((v) => v.toString(16).padStart(8, '0')).join('');
}

const same = (p, q) => Array.isArray(p) && p.length === q.length && p.every((v, i) => v === q[i]);
const show = (v) => JSON.stringify(v);

function findRoad(layers, ref) {
  const matches = layers.roads.filter((r) => String(r.id) === String(ref.id)),
    road = matches[ref.occurrence];
  if (!road) throw Error(`no existe la vía ${ref.id} (aparición ${ref.occurrence})`);
  return road;
}
function expectPoint(ring, index, expected, what) {
  if (!Number.isInteger(index) || index < 0 || index >= ring.length)
    throw Error(`${what} ${index} fuera de rango (0 a ${ring.length - 1})`);
  if (!same(ring[index], expected))
    throw Error(`${what} ${index} vale ${show(ring[index])}, se esperaba ${show(expected)}`);
}

const OPERATIONS = {
  'road.set'(layers, c) {
    const road = findRoad(layers, c.road);
    for (const [k, v] of Object.entries(c.expect))
      if (road[k] !== v) throw Error(`«${k}» vale ${show(road[k])}, se esperaba ${show(v)}`);
    Object.assign(road, c.set);
  },
  'road.movePoint'(layers, c) {
    const road = findRoad(layers, c.road);
    expectPoint(road.p, c.index, c.expect, 'el vértice');
    road.p[c.index] = [...c.to];
  },
  'road.insertPoint'(layers, c) {
    const road = findRoad(layers, c.road);
    expectPoint(road.p, c.after, c.expectAfter, 'el vértice');
    road.p.splice(c.after + 1, 0, [...c.at]);
  },
  'road.add'(layers, c) {
    if (layers.roads.some((r) => String(r.id) === String(c.add.id)))
      throw Error(`ya existe una vía con el id ${c.add.id}`);
    layers.roads.push({ ...c.add, p: c.add.p.map((p) => [...p]) });
  },
  'road.remove'(layers, c) {
    const road = findRoad(layers, c.road);
    if (road.name !== c.expect.name)
      throw Error(`«name» vale ${show(road.name)}, se esperaba ${show(c.expect.name)}`);
    layers.roads.splice(layers.roads.indexOf(road), 1);
  },
  'area.movePoint'(layers, c) {
    const area = layers.areas[c.area.index];
    if (!area) throw Error(`no existe el área ${c.area.index}`);
    if (!same(area.p[0], c.area.expectFirst))
      throw Error(
        `el primer punto del área vale ${show(area.p[0])}, se esperaba ${show(c.area.expectFirst)}`,
      );
    expectPoint(area.p, c.index, c.expect, 'el vértice');
    area.p[c.index] = [...c.to];
  },
  'building.moveVertex'(layers, c) {
    const b = layers.buildings[c.building.index];
    if (!b) throw Error(`no existe el edificio ${c.building.index}`);
    const sha = sha256Hex(JSON.stringify(b.p));
    if (sha !== c.building.footprintSha256)
      throw Error(
        `el contorno ha cambiado (huella ${sha}, se esperaba ${c.building.footprintSha256})`,
      );
    expectPoint(b.p, c.vertex, c.expect, 'el vértice');
    b.p[c.vertex] = [...c.to];
  },
};

// Aplica las correcciones en orden sobre `layers` ({ roads, areas, buildings }) y devuelve los
// ids aplicados. Cada una comprueba su guarda contra los datos de ese momento; si no coincide,
// lanza un error en lugar de aplicarla a ciegas.
export function applyCorrections(layers, file) {
  const applied = [];
  for (const c of file.corrections) {
    const operation = OPERATIONS[c.op];
    if (!operation) throw Error(`Corrección ${c.id} no aplicable: operación desconocida «${c.op}»`);
    try {
      operation(layers, c);
    } catch (e) {
      throw Error(`Corrección ${c.id} no aplicable: ${e.message}`, { cause: e });
    }
    applied.push(c.id);
  }
  return applied;
}
