import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';
import { boundaryDistance } from '../core/math.js';

const {
  attribute,
  uniform,
  vec2,
  vec3,
  vec4,
  float,
  mix,
  smoothstep,
  saturate,
  pow,
  dot,
  normalize,
  length,
  sin,
  cos,
  time,
  positionWorld,
  cameraPosition,
  cameraViewMatrix,
} = THREE.TSL;

// Agua del río Iro: marisma tranquila, verde oliva oscura, con ondas pequeñas que apenas se mueven y
// reflejo del cielo horneado (rugosidad baja). Sin transparencia ni pases extra. Cambia en vivo
// desde la consola con `(await import('./js/engine/water.js')).setWater({ roughness: 0.2 })`.
export const WATER = {
  // Color propio del agua: oscuro mirando hacia abajo y a poca distancia; más claro y verdoso
  // lejos (hacia el borde de la vista), donde mezcla con el cielo.
  deep: '#35402a',
  far: '#6c8468',
  farNear: 30, // m a los que empieza a aclararse
  farFar: 420, // m a los que alcanza el color lejano
  // Rugosidad del reflejo: baja para que se vea el cielo; las orillas la suben (ver `shore*`).
  roughness: 0.12,
  // Fuerza del reflejo especular (1 = el de un dielétrico normal): menos, y el color propio manda más.
  reflection: 0.4,
  // Cuánto se apaga el color propio a ángulo rasante, donde manda el reflejo (0 = nada).
  fresnelDim: 0.55,
  // Ondas: inclinación máxima de la normal de cada una de las cuatro capas (longitudes de onda
  // de 0,6 a 19 m, no conmensurables, con direcciones y velocidades lentas).
  slopes: [0.03, 0.055, 0.05, 0.04],
  waveSpeed: 1, // multiplica las velocidades (0 = agua quieta)
  // Mancha de viento: una onda muy larga (~90 m) que sube o baja la intensidad por zonas.
  windCalm: 0.35, // intensidad de las ondas en la zona más tranquila (1 = máxima)
  // Orilla: en los primeros `shoreWidth` metros desde el borde el agua se oscurece y refleja
  // menos, para que no parezca un espejo pegado al terreno. La malla se afina en esa franja al
  // construir (`shoreGeometry`): cambiar el ancho en vivo solo vale hasta ese ancho de partida.
  shoreWidth: 8,
  shoreDark: 0.4, // color propio que queda en el mismo borde (1 = sin oscurecer)
  shoreRoughness: 0.6, // rugosidad en el mismo borde (se funde con `roughness` hacia dentro)
  shoreReflection: 0.3, // reflejo en el mismo borde respecto a `reflection`
};

const SHORE_MAX = 24; // m: distancia al borde que se guarda en la geometría

// Capas de onda: [longitud (m), rumbo (rad), velocidad (m/s), distancia a la que se desvanece (m)].
// Las ondas pequeñas se apagan con la distancia para no dar muaré (parpadeo) lejos de la cámara.
const LAYERS = [
  [0.61, 0.35, 0.33, [20, 70]],
  [1.87, 2.2, 0.24, [50, 170]],
  [6.4, -0.95, 0.17, [160, 520]],
  [19.3, 1.25, 0.1, [400, 1400]],
];

const u = {
    deep: uniform(new THREE.Color(WATER.deep)),
    far: uniform(new THREE.Color(WATER.far)),
    farNear: uniform(WATER.farNear),
    farFar: uniform(WATER.farFar),
    roughness: uniform(WATER.roughness),
    reflection: uniform(WATER.reflection),
    fresnelDim: uniform(WATER.fresnelDim),
    waveSpeed: uniform(WATER.waveSpeed),
    windCalm: uniform(WATER.windCalm),
    shoreWidth: uniform(WATER.shoreWidth),
    shoreDark: uniform(WATER.shoreDark),
    shoreRoughness: uniform(WATER.shoreRoughness),
    shoreReflection: uniform(WATER.shoreReflection),
  },
  slopes = WATER.slopes.map((value) => uniform(value));

export function setWater(patch = {}) {
  Object.assign(WATER, patch);
  u.deep.value.set(WATER.deep);
  u.far.value.set(WATER.far);
  for (const key of [
    'farNear',
    'farFar',
    'roughness',
    'reflection',
    'fresnelDim',
    'waveSpeed',
    'windCalm',
  ])
    u[key].value = WATER[key];
  slopes.forEach((node, i) => (node.value = WATER.slopes[i]));
  gfx.needsRender = true;
}

// Normal del agua en el mundo: suma de ondas senoidales en xz (con derivada exacta) por una mancha
// de viento de baja frecuencia.
function waveNormal(distance) {
  const t = time.mul(u.waveSpeed),
    // Las ondas se calculan sobre una posición deformada con senos lentos: rompe las rayas rectas.
    warp = vec2(
      sin(positionWorld.z.mul(0.23).add(t.mul(0.1))),
      sin(positionWorld.x.mul(0.19).sub(t.mul(0.08))),
    ).mul(3),
    xz = vec2(positionWorld.x, positionWorld.z).add(warp),
    // Dos senos de periodos largos no conmensurables: zonas de viento y de calma.
    gust = sin(dot(xz, vec2(0.0113, 0.0071)).add(t.mul(0.05)))
      .mul(sin(dot(xz, vec2(-0.0059, 0.0127)).sub(t.mul(0.03))))
      .mul(0.5)
      .add(0.5),
    wind = mix(u.windCalm, float(1), smoothstep(0.15, 0.85, gust));
  let slope = vec2(0);
  LAYERS.forEach(([wavelength, heading, speed, fade], i) => {
    const dir = vec2(Math.cos(heading), Math.sin(heading)),
      k = (Math.PI * 2) / wavelength,
      phase = dot(xz, dir)
        .mul(k)
        .add(t.mul(speed * k));
    slope = slope.add(
      dir.mul(
        cos(phase)
          .mul(slopes[i])
          .mul(float(1).sub(smoothstep(fade[0], fade[1], distance))),
      ),
    );
  });
  slope = slope.mul(wind);
  return normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
}

// Divide los triángulos de una lámina de agua hasta tener vértices dentro de la franja de orilla y
// guarda en cada vértice `shore`: distancia en metros al contorno `polygon` (con tope). La franja
// se afina a la mitad de `shoreWidth`; el interior se queda con los triángulos originales. Los
// vértices nuevos se interpolan sobre la lámina existente (también sobre la lámina ajustada al
// terreno), sin mallas ni llamadas de dibujo nuevas.
export function shoreGeometry(geometry, polygon) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry,
    input = source.getAttribute('position').array,
    width = WATER.shoreWidth,
    step = width / 2,
    distances = new Map(),
    distance = (x, z) => {
      const key = x + ',' + z;
      if (!distances.has(key))
        distances.set(key, Math.min(boundaryDistance(x, z, polygon), SHORE_MAX));
      return distances.get(key);
    },
    out = [],
    stack = [];
  for (let i = input.length - 9; i >= 0; i -= 9) stack.push(Array.from(input.subarray(i, i + 9)));
  while (stack.length) {
    const t = stack.pop(),
      vertex = (n) => t.slice(n * 3, n * 3 + 3);
    let longest = 0,
      edge = 0,
      near = false;
    for (let n = 0; n < 3; n++) {
      const a = vertex(n),
        b = vertex((n + 1) % 3),
        d = Math.hypot(a[0] - b[0], a[2] - b[2]);
      if (d > longest) [longest, edge] = [d, n];
      near ||= distance(a[0], a[2]) < width;
    }
    if (!near || longest <= step) {
      out.push(...t);
      continue;
    }
    const a = vertex(edge),
      b = vertex((edge + 1) % 3),
      c = vertex((edge + 2) % 3),
      m = a.map((v, i) => (v + b[i]) / 2);
    stack.push([...a, ...m, ...c], [...m, ...b, ...c]);
  }
  const position = new Float32Array(out),
    shore = new Float32Array(position.length / 3);
  for (let i = 0; i < shore.length; i++) shore[i] = distance(position[i * 3], position[i * 3 + 2]);
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(position, 3));
  result.setAttribute('shore', new THREE.BufferAttribute(shore, 1));
  result.computeVertexNormals();
  geometry.dispose();
  if (source !== geometry) source.dispose();
  return result;
}

let material = null;

// Material único de todas las láminas de agua (compartido, sin transparencia).
export function waterMaterial() {
  if (material) return material;
  material = new THREE.MeshPhysicalNodeMaterial({ color: WATER.deep, metalness: 0 });
  const toCamera = cameraPosition.sub(positionWorld),
    distance = length(toCamera),
    normalWorld = waveNormal(distance),
    view = toCamera.div(distance),
    // Fresnel aproximado: 0 mirando hacia abajo, 1 a ángulo rasante.
    fresnel = pow(float(1).sub(saturate(dot(normalWorld, view))), 4),
    body = mix(u.deep, u.far, smoothstep(u.farNear, u.farFar, distance));
  // `normalNode` va en el espacio de la cámara.
  material.normalNode = normalize(cameraViewMatrix.mul(vec4(normalWorld, 0)).xyz);
  // Orilla (atributo `shore`: metros al borde): 0 en el borde, 1 desde `shoreWidth` hacia dentro.
  const inland = smoothstep(0, u.shoreWidth, attribute('shore', 'float'));
  material.colorNode = body
    .mul(float(1).sub(fresnel.mul(u.fresnelDim)))
    .mul(mix(u.shoreDark, float(1), inland));
  material.roughnessNode = mix(u.shoreRoughness, u.roughness, inland);
  material.specularIntensityNode = u.reflection.mul(mix(u.shoreReflection, float(1), inland));
  return material;
}
