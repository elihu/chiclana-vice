import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';

const {
  Fn,
  cameraPosition,
  cameraViewMatrix,
  float,
  normalLocal,
  normalWorld,
  normalize,
  pow,
  positionLocal,
  positionWorld,
  saturate,
  sin,
  smoothstep,
  time,
  uniform,
  vec3,
  vec4,
} = THREE.TSL;

// Follaje de las copas: viento, manchas de hojas y luz a contraluz. Una brisa, no un temporal. Cambia en vivo desde la consola con
// `(await import('./js/engine/foliage.js')).setFoliage({ sway: 0.3 })`.
export const FOLIAGE = {
  direction: [0.86, 0.5], // hacia dónde sopla el viento en el plano (x, z); se normaliza
  sway: 0.16, // m que se inclina la parte alta de la copa con el balanceo lento
  swayPeriod: 5.5, // s que dura un balanceo
  flutter: 0.035, // m de temblor fino de las hojas
  flutterSpeed: 5.5, // rad/s del temblor
  gust: 1.1, // cuánto crece el balanceo con la ráfaga (0 = viento constante)
  gustLength: 140, // m entre ráfagas sucesivas en la dirección del viento
  gustSpeed: 9, // m/s a los que la ráfaga recorre la ciudad
  phaseLength: 17, // m de la onda que desfasa unos árboles de otros (que no vayan al unísono)
  leafSize: 1, // m de las manchas de hojas más claras y más oscuras (entre 0,3 y 1)
  leafContrast: 0.22, // cuánto se aclaran u oscurecen las manchas (0 = color liso)
  leafNormal: 0.3, // cuánto se agita la normal para que no se lean las caras del icosaedro
  backlight: 0.3, // luz translúcida en los bordes de la copa al mirar hacia el sol (0 = apagada)
  backlightColor: '#ffc46b', // color cálido de esa luz
  backlightFocus: 3, // cuánto hay que mirar de frente al sol para que aparezca (mayor = más estrecho)
  backlightRim: 2, // cuánto se concentra en el borde de la copa (mayor = borde más fino)
};

const u = {
  direction: uniform(new THREE.Vector2()),
  sway: uniform(FOLIAGE.sway),
  swayRate: uniform(0),
  flutter: uniform(FOLIAGE.flutter),
  flutterSpeed: uniform(FOLIAGE.flutterSpeed),
  gust: uniform(FOLIAGE.gust),
  gustRate: uniform(0),
  gustSpeed: uniform(FOLIAGE.gustSpeed),
  phaseRate: uniform(0),
  leafRate: uniform(0),
  leafContrast: uniform(FOLIAGE.leafContrast),
  leafNormal: uniform(FOLIAGE.leafNormal),
  backlight: uniform(FOLIAGE.backlight),
  backlightColor: uniform(new THREE.Color(FOLIAGE.backlightColor)),
  backlightFocus: uniform(FOLIAGE.backlightFocus),
  backlightRim: uniform(FOLIAGE.backlightRim),
  // Dirección al sol y su intensidad respecto a la de la tarde (se leen de la luz del sol en cada dibujo).
  sunDirection: uniform(new THREE.Vector3()),
  sunScale: uniform(1),
};

u.sunDirection.onRenderUpdate(() => {
  const sun = gfx.sun;
  if (!sun) return;
  u.sunDirection.value.subVectors(sun.position, sun.target.position).normalize();
  u.sunScale.value = sun.intensity / 3.5;
});

function sync() {
  const [x, z] = FOLIAGE.direction,
    length = Math.hypot(x, z) || 1;
  u.direction.value.set(x / length, z / length);
  u.sway.value = FOLIAGE.sway;
  u.swayRate.value = (Math.PI * 2) / FOLIAGE.swayPeriod;
  u.flutter.value = FOLIAGE.flutter;
  u.flutterSpeed.value = FOLIAGE.flutterSpeed;
  u.gust.value = FOLIAGE.gust;
  u.gustRate.value = (Math.PI * 2) / FOLIAGE.gustLength;
  u.gustSpeed.value = FOLIAGE.gustSpeed;
  u.phaseRate.value = (Math.PI * 2) / FOLIAGE.phaseLength;
  u.leafRate.value = (Math.PI * 2) / FOLIAGE.leafSize;
  // Modo ligero: sin manchas ni normal agitada (el material no se recompila, solo cambia el uniforme).
  const low = gfx.quality === 'low';
  u.leafContrast.value = low ? 0 : FOLIAGE.leafContrast;
  u.leafNormal.value = low ? 0 : FOLIAGE.leafNormal;
  u.backlight.value = low ? 0 : FOLIAGE.backlight;
  u.backlightColor.value.set(FOLIAGE.backlightColor);
  u.backlightFocus.value = FOLIAGE.backlightFocus;
  u.backlightRim.value = FOLIAGE.backlightRim;
}
sync();

export const applyFoliageQuality = sync;

export function setFoliage(patch = {}) {
  Object.assign(FOLIAGE, patch);
  sync();
  gfx.needsRender = true;
}

// Desplazamiento del viento. Se evalúa tras aplicar la matriz de la instancia, así que
// `positionLocal` es ya la posición en el mundo y `normalLocal` apunta desde el centro de la
// mancha de copa hacia el vértice: su componente vertical sirve de altura dentro de la copa.
const windOffset = Fn(() => {
  const p = positionLocal,
    along = u.direction.x.mul(p.x).add(u.direction.y.mul(p.z)),
    // Altura dentro de la copa: la parte baja se mueve poco, la alta, todo.
    top = normalize(normalLocal).y.mul(0.5).add(0.5),
    weight = float(0.25).add(top.mul(0.75)),
    // Fase por posición, con dos ondas de longitud no conmensurable.
    phase = sin(p.x.mul(u.phaseRate).add(p.z.mul(u.phaseRate.mul(0.43))))
      .mul(1.7)
      .add(sin(p.z.mul(u.phaseRate.mul(0.71)).sub(p.x.mul(u.phaseRate.mul(0.29)))).mul(1.1)),
    // Ráfaga: franjas que avanzan con el viento; el balanceo crece al pasar por ellas.
    gustWave = sin(along.mul(u.gustRate).sub(time.mul(u.gustSpeed).mul(u.gustRate)))
      .mul(0.5)
      .add(0.5),
    gust = float(1).add(u.gust.mul(smoothstep(0.55, 1, gustWave))),
    slow = sin(time.mul(u.swayRate).add(phase))
      .mul(0.7)
      .add(sin(time.mul(u.swayRate.mul(2.3)).add(phase.mul(1.9))).mul(0.3))
      .mul(0.5)
      .add(0.55),
    push = slow.mul(u.sway).mul(gust).mul(weight.mul(weight)),
    // Temblor fino: tres senos con frecuencias propias por eje.
    jitter = vec3(
      sin(time.mul(u.flutterSpeed).add(p.x.mul(2.1)).add(p.y.mul(3.3))),
      sin(time.mul(u.flutterSpeed.mul(1.31)).add(p.z.mul(2.7)).add(p.y.mul(1.7))),
      sin(time.mul(u.flutterSpeed.mul(0.87)).add(p.x.mul(1.9)).add(p.z.mul(2.3))),
    ).mul(u.flutter.mul(weight).mul(float(0.6).add(gust.mul(0.4))));
  return p.add(vec3(u.direction.x.mul(push), push.mul(-0.15), u.direction.y.mul(push))).add(jitter);
});

// Ruido de hojas en el mundo: senos con frecuencias no conmensurables, sin texturas.
const leafPoint = () => positionWorld.mul(u.leafRate);

// Mancha de -1 (hojas oscuras) a 1 (hojas claras): una octava gruesa y otra fina.
const leafPatch = Fn(() => {
  const q = leafPoint(),
    coarse = sin(q.x.add(sin(q.z.mul(1.3))))
      .add(sin(q.y.mul(1.7).add(sin(q.x.mul(0.9)))))
      .add(
        sin(
          q.z
            .mul(1.1)
            .add(q.y.mul(0.7))
            .add(sin(q.y.mul(1.9))),
        ),
      ),
    fine = sin(
      q.x
        .mul(2.9)
        .add(q.z.mul(2.3))
        .add(sin(q.y.mul(3.1))),
    )
      .add(
        sin(
          q.z
            .mul(3.3)
            .sub(q.x.mul(1.7))
            .add(sin(q.x.mul(2.7))),
        ),
      )
      .add(sin(q.y.mul(3.7).add(q.x.mul(1.3)))),
    value = coarse.mul(0.2).add(fine.mul(0.07));
  return smoothstep(-0.55, 0.55, value).mul(2).sub(1);
});

// Multiplica el color de cada copa: más luz y algo más amarillo en las manchas claras.
const leafColor = Fn(() => {
  const patch = leafPatch().mul(u.leafContrast);
  return vec3(1, 1, 1).add(vec3(patch.mul(1.1), patch, patch.mul(0.55)));
});

// Normal agitada en espacio de mundo y pasada a espacio de cámara (como en water.js).
const leafNormal = Fn(() => {
  const q = leafPoint(),
    shake = vec3(
      sin(q.y.mul(1.9).add(q.z.mul(1.3))),
      sin(q.z.mul(2.1).add(q.x.mul(1.7))),
      sin(q.x.mul(1.5).add(q.y.mul(2.3))),
    ),
    n = normalize(normalWorld.add(shake.mul(u.leafNormal)));
  return normalize(cameraViewMatrix.mul(vec4(n, 0)).xyz);
});

// Contraluz: con la cámara mirando hacia el sol, las hojas de los bordes dejan pasar su luz.
// Depende de dot(vista, sol) y del fresnel; la intensidad sigue a la del sol.
const backlightEmissive = Fn(() => {
  const look = normalize(positionWorld.sub(cameraPosition)),
    facing = pow(saturate(look.dot(u.sunDirection)), u.backlightFocus),
    rim = pow(float(1).sub(saturate(normalWorld.dot(look.negate()))), u.backlightRim),
    // Más luz en las manchas claras: ahí las hojas son más finas.
    thin = leafPatch().mul(0.25).add(0.75);
  return u.backlightColor.mul(facing.mul(rim).mul(thin).mul(u.backlight).mul(u.sunScale));
});

let material = null;

// Material único de las copas (grandes y pequeñas). El color de cada una llega por instancia.
export function foliageMaterial() {
  if (material) return material;
  material = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', roughness: 1 });
  material.positionNode = windOffset();
  material.colorNode = leafColor();
  material.normalNode = leafNormal();
  material.emissiveNode = backlightEmissive();
  return material;
}
