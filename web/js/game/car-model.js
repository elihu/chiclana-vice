import * as THREE from '../../vendor/three.webgpu.min.js';

// Carrocería por secciones (loft) en vez de cajas. Adaptado de slop-newyork
// (https://github.com/mrdoob/slop-newyork, js/actor-models.js, MIT, Copyright (c) 2026 Mr.doob),
// que a su vez parte de LoftGeometry y CarGenerator del ejemplo webgpu_generator_city de
// three.js. Allí un material TSL pinta faros, cristales y matrículas; aquí, con WebGL y
// materiales estándar, esos detalles son piezas propias que se agrupan por material.
//
// Ejes del modelo: x a la izquierda del conductor (+x), y arriba, z hacia el frente (+z);
// origen en el suelo, en el centro del coche.

const _vector = new THREE.Vector3();

// Superficie por secciones transversales con el mismo número de puntos; `closed` cierra cada
// sección sobre sí misma y `capStart` / `capEnd` tapan los extremos.
export class LoftGeometry extends THREE.BufferGeometry {
  constructor(sections = [], { closed = true, capStart = false, capEnd = false } = {}) {
    super();
    if (!sections.length) return; // clone() construye vacío y copia después
    const rows = sections.length,
      columns = sections[0]?.length ?? 0;
    if (rows < 2 || sections.some((s) => s.length !== columns))
      throw Error('Secciones de loft incompatibles');
    const perRow = closed ? columns + 1 : columns,
      indices = [],
      vertices = [];
    for (const section of sections)
      for (let j = 0; j < perRow; j++) {
        const p = section[j % columns];
        vertices.push(p.x, p.y, p.z);
      }
    for (let i = 0; i < rows - 1; i++)
      for (let j = 0; j < perRow - 1; j++) {
        const a = i * perRow + j,
          b = a + 1,
          c = (i + 1) * perRow + j + 1,
          d = (i + 1) * perRow + j;
        indices.push(a, b, d, b, c, d);
      }
    const cap = (index) => {
      const section = sections[index],
        centroid = new THREE.Vector3(),
        normal = new THREE.Vector3();
      for (let i = 0; i < columns; i++) {
        const p = section[i],
          q = section[(i + 1) % columns];
        centroid.add(p);
        normal.x += (p.y - q.y) * (p.z + q.z);
        normal.y += (p.z - q.z) * (p.x + q.x);
        normal.z += (p.x - q.x) * (p.y + q.y);
      }
      centroid.divideScalar(columns);
      normal.normalize();
      const neighbor = sections[index === 0 ? 1 : rows - 2];
      _vector.set(0, 0, 0);
      for (const p of neighbor) _vector.add(p);
      _vector.divideScalar(columns).sub(centroid);
      if (normal.dot(_vector) > 0) normal.negate();
      const tangent = new THREE.Vector3(1, 0, 0);
      if (Math.abs(normal.x) > 0.9) tangent.set(0, 1, 0);
      const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
      tangent.crossVectors(bitangent, normal);
      let points = section.slice(),
        contour = points.map((p) => {
          _vector.subVectors(p, centroid);
          return new THREE.Vector2(_vector.dot(tangent), _vector.dot(bitangent));
        });
      if (THREE.ShapeUtils.isClockWise(contour)) {
        contour.reverse();
        points.reverse();
      }
      const offset = vertices.length / 3;
      for (const p of points) vertices.push(p.x, p.y, p.z);
      for (const f of THREE.ShapeUtils.triangulateShape(contour, []))
        indices.push(offset + f[0], offset + f[1], offset + f[2]);
    };
    if (capStart) cap(0);
    if (capEnd) cap(rows - 1);
    this.setIndex(indices);
    this.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    this.computeVertexNormals();
    if (closed) {
      // La costura de cada sección comparte normal.
      const normals = this.getAttribute('normal');
      for (let i = 0; i < rows; i++) {
        const a = i * perRow,
          b = a + perRow - 1;
        _vector
          .set(
            normals.getX(a) + normals.getX(b),
            normals.getY(a) + normals.getY(b),
            normals.getZ(a) + normals.getZ(b),
          )
          .normalize();
        normals.setXYZ(a, _vector.x, _vector.y, _vector.z);
        normals.setXYZ(b, _vector.x, _vector.y, _vector.z);
      }
    }
  }
}

// Tablas de diseño (metros). Curvas: puntos de control [z, valor]; nose / tail: redondeos
// [longitud, valor en la punta, exponente de superelipse] hacia el frente y la trasera.
export const CAR_SPECS = {
  sedan: {
    zFront: 2.2,
    zRear: -2.2,
    wheelRadius: 0.33,
    wheelZ: 1.33,
    wheelX: 0.8,
    archGap: 0.06,
    archFlare: 0.02,
    tuck: 0.075,
    halfWidth: [
      [2.2, 0.88],
      [1.33, 0.892],
      [0, 0.898],
      [-1.33, 0.896],
      [-2.2, 0.885],
    ],
    sill: [
      [2.2, 0.28],
      [1.2, 0.255],
      [-1.2, 0.255],
      [-2.2, 0.29],
    ],
    shoulder: [
      [2.2, 0.64],
      [0, 0.68],
      [-2.2, 0.74],
    ],
    edge: [
      [2.05, 0.77],
      [1.45, 0.83],
      [0.85, 0.915],
      [0.55, 0.935],
      [-1.0, 0.965],
      [-1.6, 0.955],
      [-2.05, 0.89],
    ],
    crown: [
      [2.05, 0.035],
      [0.95, 0.03],
      [0.66, 0.004],
      [-1.52, 0.004],
      [-1.74, 0.016],
      [-2.2, 0.012],
    ],
    tumble: [
      [2.2, 0.11],
      [0.9, 0.09],
      [-1.6, 0.085],
      [-2.2, 0.105],
    ],
    nose: {
      halfWidth: [0.3, 0.68, 3],
      edge: [0.12, 0.75, 3],
      crown: [0.12, 0.01, 2],
      sill: [0.13, 0.32, 2],
      shoulder: [0.2, 0.57, 2.4],
    },
    tail: {
      halfWidth: [0.3, 0.7, 2.6],
      edge: [0.11, 0.885, 3],
      crown: [0.11, 0.008, 2],
      sill: [0.14, 0.34, 2],
      shoulder: [0.2, 0.67, 2.4],
    },
    cabin: {
      cowl: 0.84,
      roofFront: 0.0,
      roofRear: -0.98,
      deck: -1.64,
      roofY: [
        [0.0, 1.405],
        [-0.5, 1.425],
        [-0.98, 1.39],
      ],
      rail: [0.625, 0.605],
      inset: 0.035,
      bulge: 0.012,
      roofEdge: 0.05,
      roofCrown: 0.035,
      roofRound: 4,
      pillars: [-0.3],
    },
    // Faros y pilotos: [|x| del centro, y, semiancho, semialto]
    headlight: [0.57, 0.67, 0.22, 0.055],
    taillight: [0.56, 0.775, 0.24, 0.062],
    grille: [0.66, 0.3, 0.055],
    intake: [0.36, 0.44, 0.045],
    plates: [0.5, 0.62],
    bumpers: [
      [0.45, 0.03],
      [0.48, 0.035],
    ],
  },
};

const lerp = (a, b, t) => a + (b - a) * t;

// Interpolación cúbica monótona (Fritsch-Carlson): suave y sin sobrepasar los puntos.
function smoothCurve(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0]),
    n = pts.length,
    xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]),
    h = [],
    d = [];
  if (n === 1) return () => ys[0];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m.push(0);
    else {
      const w1 = 2 * h[i] + h[i - 1],
        w2 = h[i] + 2 * h[i - 1];
      m.push((w1 + w2) / (w1 / d[i - 1] + w2 / d[i]));
    }
  }
  m.push(d[n - 2]);
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i],
      t2 = t * t,
      t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h[i] * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h[i] * m[i + 1]
    );
  };
}

// 1 a lo largo del coche y 0 en la punta, por un cuarto de superelipse.
function endFactor(z, zTip, length, exponent = 2) {
  const u = zTip > 0 ? (z - (zTip - length)) / length : (zTip + length - z) / length;
  if (u <= 0) return 1;
  if (u >= 1) return 0;
  return Math.pow(1 - Math.pow(u, exponent), 1 / exponent);
}

// Sección de carrocería en z: W semiancho, yB bajos, yS hombro, yE / xE arista superior,
// yT bombeo del capó, xB semiancho de los bajos.
function bodyProfile(spec) {
  if (spec._body) return spec._body;
  const W0 = smoothCurve(spec.halfWidth),
    B0 = smoothCurve(spec.sill),
    S0 = smoothCurve(spec.shoulder),
    E0 = smoothCurve(spec.edge),
    C0 = smoothCurve(spec.crown),
    T0 = smoothCurve(spec.tumble),
    archR = spec.wheelRadius + spec.archGap,
    axles = [spec.wheelZ, -spec.wheelZ];
  const rounded = (z, value, key) => {
    const nose = spec.nose[key],
      tail = spec.tail[key];
    if (nose && z > 0)
      value = nose[1] + (value - nose[1]) * endFactor(z, spec.zFront, nose[0], nose[2]);
    if (tail && z < 0)
      value = tail[1] + (value - tail[1]) * endFactor(z, spec.zRear, tail[0], tail[2]);
    return value;
  };
  spec._body = (z) => {
    let flare = 0;
    for (const axle of axles) {
      const d = (z - axle) / (archR + 0.4);
      if (Math.abs(d) < 1) flare = Math.max(flare, (1 - d * d) ** 2);
    }
    const W = rounded(z, W0(z) + spec.archFlare * flare, 'halfWidth');
    let yB = rounded(z, B0(z), 'sill');
    // Pasos de rueda circulares
    for (const axle of axles) {
      const d = Math.abs(z - axle);
      if (d < archR) yB = Math.max(yB, spec.wheelRadius + Math.sqrt(archR * archR - d * d));
    }
    const yE = rounded(z, E0(z), 'edge'),
      yT = yE + Math.max(0, rounded(z, C0(z), 'crown')),
      yS = Math.min(Math.max(rounded(z, S0(z), 'shoulder'), yB + 0.035), yE - 0.035),
      xE = Math.max(W - T0(z), W * 0.55);
    return { z, W, yB, yS, yE, yT, xE, xB: W - spec.tuck };
  };
  return spec._body;
}

// Habitáculo: base del cristal lateral (belt), arista del techo (rail) y bombeo (h) en z.
function carLayout(spec) {
  if (spec._layout) return spec._layout;
  const body = bodyProfile(spec),
    cab = spec.cabin,
    roofY = smoothCurve(cab.roofY),
    H = cab.roofEdge + cab.roofCrown,
    belt = (z) => {
      const s = body(z);
      return { x: s.xE - cab.inset, y: s.yE - 0.004 };
    },
    bc = belt(cab.cowl),
    bd = belt(cab.deck),
    railF = { x: cab.rail[0], y: roofY(cab.roofFront) - H },
    railR = { x: cab.rail[1], y: roofY(cab.roofRear) - H },
    // En el salpicadero y el maletero el cristal nace bajo el bombeo de la chapa.
    hCowl = Math.max(0.006, body(cab.cowl).yT - bc.y - 0.008),
    hDeck = Math.max(0.006, body(cab.deck).yT - bd.y - 0.008);
  const cabin = (z) => {
    const b = belt(z);
    let railX, railY, h;
    if (z >= cab.roofFront) {
      const t = (cab.cowl - z) / (cab.cowl - cab.roofFront);
      railX = lerp(bc.x, railF.x, t);
      railY = lerp(bc.y, railF.y, t);
      h = lerp(hCowl, H, Math.min(1, t * 1.6));
    } else if (z <= cab.roofRear) {
      const t = (z - cab.deck) / (cab.roofRear - cab.deck);
      railX = lerp(bd.x, railR.x, t);
      railY = lerp(bd.y, railR.y, t);
      h = lerp(hDeck, H, Math.min(1, t * 1.6));
    } else {
      railX = lerp(railF.x, railR.x, (cab.roofFront - z) / (cab.roofFront - cab.roofRear));
      railY = roofY(z) - H;
      h = H;
    }
    return { z, beltX: Math.max(b.x, railX), beltY: Math.min(b.y, railY), railX, railY, h };
  };
  spec._layout = { body, cabin };
  return spec._layout;
}

// Punto del cristal lateral (s: 0 base, 1 arista) y del techo (f: 0 arista, 1 centro).
const sidePoint = (c, s, bulge) => [
  lerp(c.beltX, c.railX, s) + bulge * 4 * s * (1 - s),
  lerp(c.beltY, c.railY, s),
];
const topPoint = (c, f, n) => {
  const th = (f * Math.PI) / 2;
  return [c.railX * Math.pow(Math.cos(th), 2 / n), c.railY + c.h * Math.pow(Math.sin(th), 2 / n)];
};

// Orden de todas las secciones: abajo a la izquierda (-x), por encima, abajo a la derecha.
function mirrorSection(right, center, z) {
  const pts = right.map(([x, y]) => new THREE.Vector3(-x, y, z));
  if (center) pts.push(new THREE.Vector3(center[0], center[1], z));
  for (let i = right.length - 1; i >= 0; i--)
    pts.push(new THREE.Vector3(right[i][0], right[i][1], z));
  return pts;
}

function bodyHalfProfile(s) {
  const right = [];
  for (const a of [0, 0.32, 0.64, 1]) {
    const th = (a * Math.PI) / 2;
    right.push([
      s.xB + (s.W - s.xB) * Math.pow(Math.sin(th), 2 / 2.8),
      s.yS - (s.yS - s.yB) * Math.pow(Math.cos(th), 2 / 2.8),
    ]);
  }
  for (const a of [0.38, 0.72, 1]) {
    const th = (a * Math.PI) / 2;
    right.push([
      s.xE + (s.W - s.xE) * Math.pow(Math.cos(th), 2 / 3.2),
      s.yS + (s.yE - s.yS) * Math.pow(Math.sin(th), 2 / 3.2),
    ]);
  }
  for (const f of [0.66, 0.33]) right.push([s.xE * f, s.yE + (s.yT - s.yE) * (1 - f * f)]);
  return right;
}

// Estaciones a lo largo del coche: más densas en las puntas y en los pasos de rueda.
function bodyStations(spec) {
  const zs = [],
    add = (z) => zs.push(Math.min(spec.zFront, Math.max(spec.zRear, z)));
  for (let z = spec.zRear; z < spec.zFront; z += 0.28) add(z);
  add(spec.zFront);
  const noseLen = Math.max(...Object.values(spec.nose).map((v) => v[0])),
    tailLen = Math.max(...Object.values(spec.tail).map((v) => v[0]));
  for (const u of [0, 0.3, 0.52, 0.7, 0.83, 0.92, 0.97, 0.993]) {
    add(spec.zFront - noseLen * (1 - u));
    add(spec.zRear + tailLen * (1 - u));
  }
  const archR = spec.wheelRadius + spec.archGap;
  for (const axle of [spec.wheelZ, -spec.wheelZ]) {
    for (let i = 0; i <= 8; i++) add(axle + archR * Math.cos((i / 8) * Math.PI));
    add(axle + archR + 0.006);
    add(axle - archR - 0.006);
  }
  add(spec.cabin.cowl);
  add(spec.cabin.deck);
  zs.sort((a, b) => b - a);
  const out = [];
  for (const z of zs) if (!out.length || out[out.length - 1] - z > 0.004) out.push(z);
  out[0] = spec.zFront;
  out[out.length - 1] = spec.zRear;
  return out;
}

// Semiancho exterior de la carrocería a la altura y de la sección z.
function halfWidthAt(spec, z, y) {
  const s = bodyProfile(spec)(z),
    pts = [];
  for (let i = 0; i <= 16; i++) {
    const th = ((i / 16) * Math.PI) / 2;
    pts.push([
      s.xB + (s.W - s.xB) * Math.pow(Math.sin(th), 2 / 2.8),
      s.yS - (s.yS - s.yB) * Math.pow(Math.cos(th), 2 / 2.8),
    ]);
  }
  for (let i = 1; i <= 16; i++) {
    const th = ((i / 16) * Math.PI) / 2;
    pts.push([
      s.xE + (s.W - s.xE) * Math.pow(Math.cos(th), 2 / 3.2),
      s.yS + (s.yE - s.yS) * Math.pow(Math.sin(th), 2 / 3.2),
    ]);
  }
  if (y <= pts[0][1]) return pts[0][0];
  for (let i = 1; i < pts.length; i++)
    if (y <= pts[i][1]) {
      const t = (y - pts[i - 1][1]) / Math.max(pts[i][1] - pts[i - 1][1], 1e-6);
      return lerp(pts[i - 1][0], pts[i][0], t);
    }
  return s.xE;
}

// z de la chapa en el frente (front) o la trasera a la altura y y a |x|.
function surfaceZ(spec, x, y, front) {
  const step = 0.002;
  for (let k = 0; k < 400; k++) {
    const z = front ? spec.zFront - k * step : spec.zRear + k * step,
      s = bodyProfile(spec)(z);
    if (y >= s.yB && y <= s.yT && halfWidthAt(spec, z, y) >= x) return z;
  }
  return front ? spec.zFront - 0.4 : spec.zRear + 0.4;
}

function roundedBox(hw, hh, depth, r, bevel = 0.012) {
  const w = hw - bevel,
    h = hh - bevel,
    rr = Math.max(0.002, r - bevel),
    s = new THREE.Shape();
  s.moveTo(-w + rr, -h);
  s.lineTo(w - rr, -h);
  s.quadraticCurveTo(w, -h, w, -h + rr);
  s.lineTo(w, h - rr);
  s.quadraticCurveTo(w, h, w - rr, h);
  s.lineTo(-w + rr, h);
  s.quadraticCurveTo(-w, h, -w, h - rr);
  s.lineTo(-w, -h + rr);
  s.quadraticCurveTo(-w, -h, -w + rr, -h);
  return new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, depth - 2 * bevel),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 2,
  }).translate(0, 0, -(depth - 2 * bevel) / 2);
}

// Lámina que sigue la chapa del frente o la trasera (faros, pilotos, calandra), 8 mm por fuera.
function lamp(spec, x, y, hw, hh, front, columns = 10, rows = 3) {
  const dir = front ? 1 : -1,
    positions = [],
    indices = [];
  for (let j = 0; j <= rows; j++) {
    const yy = y - hh + (2 * hh * j) / rows;
    for (let i = 0; i <= columns; i++) {
      const xx = x - hw + (2 * hw * i) / columns;
      positions.push(xx, yy, surfaceZ(spec, Math.abs(xx), yy, front) + dir * 0.008);
      if (i < columns && j < rows) {
        const a = j * (columns + 1) + i,
          b = a + 1,
          c = a + columns + 1,
          d = c + 1;
        // De frente, +x y +y giran hacia +z; detrás, al revés.
        if (front) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
const mirrorX = (g) => {
  // Reflejo en x con el giro de los triángulos corregido.
  g = g.clone().scale(-1, 1, 1);
  const index = g.index;
  if (index)
    for (let i = 0; i < index.count; i += 3) {
      const t = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, t);
    }
  else {
    const pos = g.attributes.position,
      nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i += 3)
      for (const a of [pos, nor]) {
        const t = [a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)];
        a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
        a.setXYZ(i + 2, ...t);
      }
  }
  g.computeVertexNormals();
  return g;
};
const pair = (g) => [g, mirrorX(g)];

function wheel(spec, side, z) {
  const r = spec.wheelRadius,
    rim = r * 0.64,
    width = r * 0.68,
    x = side * spec.wheelX,
    profile = [
      [rim + 0.014, -width * 0.44],
      [r * 0.96, -width * 0.33],
      [r, -width * 0.05],
      [r, width * 0.05],
      [r * 0.96, width * 0.33],
      [rim + 0.014, width * 0.44],
    ].map(([a, b]) => new THREE.Vector2(a, b)),
    lathe = (points) =>
      new THREE.LatheGeometry(points, 20).rotateZ(-side * Math.PI * 0.5).translate(x, r, z),
    hub = (dir) => {
      const g = new THREE.CircleGeometry(rim, 20);
      g.attributes.position.setZ(0, -0.015);
      g.computeVertexNormals();
      return g.rotateY(dir * Math.PI * 0.5).translate(x + dir * width * 0.29, r, z);
    },
    well = (dir) =>
      new THREE.CircleGeometry(r + spec.archGap + 0.01, 10, 0, Math.PI)
        .rotateY(dir * Math.PI * 0.5)
        .translate(side * (spec.wheelX - (width * 0.5 + 0.02)), r, z);
  return {
    tyre: [lathe(profile)],
    alloy: [
      lathe([new THREE.Vector2(rim + 0.014, width * 0.44), new THREE.Vector2(rim, width * 0.29)]),
      lathe([new THREE.Vector2(rim, -width * 0.29), new THREE.Vector2(rim + 0.014, -width * 0.44)]),
      hub(side),
      hub(-side),
    ],
    // Fondo oscuro del paso de rueda: no se ve el otro lado del coche.
    trim: [well(side), well(-side)],
  };
}

// Banda fina pegada al lateral de la carrocería entre z0 y z1, y0 e y1 (rotulación).
function sidePatch(spec, side, z0, z1, y0, y1, nz = 12, ny = 4) {
  const positions = [],
    indices = [];
  for (let j = 0; j <= ny; j++) {
    const y = lerp(y0, y1, j / ny);
    for (let i = 0; i <= nz; i++) {
      const z = side > 0 ? lerp(z1, z0, i / nz) : lerp(z0, z1, i / nz);
      positions.push(side * (halfWidthAt(spec, z, y) + 0.004), y, z);
      if (i < nz && j < ny) {
        const a = j * (nz + 1) + i,
          b = a + 1,
          c = a + nz + 1,
          d = c + 1;
        if (side > 0) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Geometrías del coche por pieza, en coordenadas del modelo; se calculan una vez por tipo.
 * paint: chapa; frame: techo, marcos y pilares (se ocultan en primera persona con el cristal);
 * glass, tyre, alloy, trim (negro), head, tail, plate, plateBand, livery (bandas laterales).
 */
const cache = new Map();
export function carModel(name = 'sedan') {
  if (cache.has(name)) return cache.get(name);
  const spec = CAR_SPECS[name],
    { body, cabin } = carLayout(spec),
    cab = spec.cabin,
    n = cab.roofRound,
    lift = 0.005,
    slots = {
      paint: [],
      frame: [],
      glass: [],
      tyre: [],
      alloy: [],
      trim: [],
      head: [],
      tail: [],
      plate: [],
      plateBand: [],
      livery: [],
    };

  // Carrocería cerrada
  slots.paint.push(
    new LoftGeometry(
      bodyStations(spec).map((z) => {
        const s = body(z);
        return mirrorSection(bodyHalfProfile(s), [0, s.yT], z);
      }),
      { capStart: true, capEnd: true },
    ),
  );

  // Cristales: parabrisas, laterales y luneta en una sola superficie abierta.
  const cabinZs = [
    ...[0, 0.1, 0.24, 0.42, 0.62, 0.82].map((t) => lerp(cab.cowl, cab.roofFront, t)),
    ...[0, 0.25, 0.5, 0.75].map((t) => lerp(cab.roofFront, cab.roofRear, t)),
    ...[1, 0.8, 0.6, 0.4, 0.22, 0.1, 0].map((t) => lerp(cab.deck, cab.roofRear, t)),
  ];
  slots.glass.push(
    new LoftGeometry(
      cabinZs.map((z) => {
        const c = cabin(z),
          right = [
            [c.beltX, c.beltY],
            sidePoint(c, 1 / 3, cab.bulge),
            sidePoint(c, 2 / 3, cab.bulge),
          ];
        right.push([c.railX, c.railY]);
        for (const f of [0.2, 0.42, 0.68]) right.push(topPoint(c, f, n));
        return mirrorSection(right, [0, c.railY + c.h], z);
      }),
      { closed: false },
    ),
  );

  // Techo en color de carrocería, unos milímetros por encima del cristal.
  slots.frame.push(
    new LoftGeometry(
      [0, 0.15, 0.35, 0.55, 0.75, 0.9, 1].map((t) => {
        const z = lerp(cab.roofFront + 0.03, cab.roofRear - 0.03, t),
          c = cabin(z),
          right = [0.06, 0.2, 0.42, 0.68].map((f) => {
            const [x, y] = topPoint(c, f, n);
            return [x + lift, y + lift];
          });
        return mirrorSection(right, [0, c.railY + c.h + lift], z);
      }),
      { closed: false },
    ),
  );
  // Marcos de las ventanillas a lo largo de la arista (pilares A y C incluidos) y pilar B.
  const frameZs = [
    ...[0.04, 0.2, 0.4, 0.6, 0.8, 1].map((t) => lerp(cab.cowl, cab.roofFront, t)),
    ...[0.25, 0.5, 0.75].map((t) => lerp(cab.roofFront, cab.roofRear, t)),
    ...[1, 0.8, 0.6, 0.4, 0.2, 0.04].map((t) => lerp(cab.deck, cab.roofRear, t)),
  ];
  const rail = (z) => {
    const c = cabin(z),
      pts = [
        topPoint(c, 0.1, n),
        topPoint(c, 0.04, n),
        [c.railX, c.railY],
        sidePoint(c, 0.86, cab.bulge),
      ];
    return pts.map(([x, y], i) => [x + lift, y + (i < 2 ? lift : 0)]);
  };
  const railRight = new LoftGeometry(
    frameZs.map((z) => rail(z).map(([x, y]) => new THREE.Vector3(x, y, z))),
    { closed: false },
  );
  slots.frame.push(...pair(railRight));
  for (const p of cab.pillars) {
    const pillar = new LoftGeometry(
      [p + 0.05, p - 0.05].map((z) => {
        const c = cabin(z);
        return [1, 0.75, 0.5, 0.25, 0].map((s) => {
          const [x, y] = sidePoint(c, s, cab.bulge);
          return new THREE.Vector3(x + lift * 1.5, y, z);
        });
      }),
      { closed: false },
    );
    slots.frame.push(...pair(pillar));
  }

  // Retrovisores
  {
    const z = cab.cowl - 0.17,
      c = cabin(z),
      housing = roundedBox(0.1, 0.06, 0.085, 0.035, 0.014)
        .rotateY(0.12)
        .translate(c.beltX + 0.15, c.beltY + 0.085, z - 0.02),
      arm = new THREE.BoxGeometry(0.12, 0.035, 0.06)
        .rotateZ(0.35)
        .translate(c.beltX + 0.04, c.beltY + 0.045, z);
    slots.paint.push(...pair(housing));
    slots.trim.push(...pair(arm));
  }

  // Paragolpes: banda negra que abraza el frente y la trasera.
  spec.bumpers.forEach(([y, h], end) => {
    const direction = end === 0 ? 1 : -1,
      tip = end === 0 ? spec.zFront : spec.zRear,
      sections = [];
    for (const side of [-1, 1])
      for (const setback of side < 0 ? [0.3, 0.07, 0] : [0, 0.07, 0.3]) {
        const z = tip - direction * setback,
          x = side * (halfWidthAt(spec, z, y) + 0.012),
          innerX = x - side * 0.05,
          section = [
            new THREE.Vector3(x, y - h, z + direction * 0.025),
            new THREE.Vector3(innerX, y - h, z - direction * 0.105),
            new THREE.Vector3(innerX, y + h, z - direction * 0.105),
            new THREE.Vector3(x, y + h, z + direction * 0.025),
          ];
        sections.push(direction > 0 ? section : section.reverse());
      }
    slots.trim.push(new LoftGeometry(sections, { capStart: true, capEnd: true }));
  });

  // Ruedas con llanta y fondo del paso de rueda
  for (const side of [-1, 1])
    for (const z of [-spec.wheelZ, spec.wheelZ]) {
      const w = wheel(spec, side, z);
      slots.tyre.push(...w.tyre);
      slots.alloy.push(...w.alloy);
      slots.trim.push(...w.trim);
    }

  // Faros, pilotos, calandra, toma inferior y matrículas europeas (banda azul a la izquierda
  // de quien la mira).
  const [hx, hy, hhw, hhh] = spec.headlight,
    [tx, ty, thw, thh] = spec.taillight;
  slots.head.push(...pair(lamp(spec, hx, hy, hhw, hhh, true)));
  slots.tail.push(...pair(lamp(spec, tx, ty, thw, thh, false)));
  slots.trim.push(lamp(spec, 0, spec.grille[0], spec.grille[1], spec.grille[2], true));
  slots.trim.push(lamp(spec, 0, spec.intake[0], spec.intake[1], spec.intake[2], true));
  spec.plates.forEach((y, end) => {
    const front = end === 0,
      z = surfaceZ(spec, 0.2, y, front) + (front ? 0.03 : -0.03),
      band = (front ? -1 : 1) * 0.24;
    slots.plate.push(new THREE.BoxGeometry(0.52, 0.11, 0.012).translate(0, y, z));
    slots.plateBand.push(
      new THREE.BoxGeometry(0.04, 0.11, 0.014).translate(band, y, z + (front ? 0.001 : -0.001)),
    );
  });

  // Rotulación lateral (patrulla)
  for (const side of [-1, 1]) slots.livery.push(sidePatch(spec, side, -1.75, 1.7, 0.47, 0.66));

  const mid = (cab.roofFront + cab.roofRear) / 2,
    top = cabin(mid);
  const model = { slots, roofY: top.railY + top.h + lift, length: spec.zFront - spec.zRear };
  cache.set(name, model);
  return model;
}
