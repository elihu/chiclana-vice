import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';

const { Fn, float, normalLocal, normalize, positionLocal, sin, smoothstep, time, uniform, vec3 } =
  THREE.TSL;

// Follaje de las copas: viento. Una brisa, no un temporal. Cambia en vivo desde la consola con
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
};

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
}
sync();

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

let material = null;

// Material único de las copas (grandes y pequeñas). El color de cada una llega por instancia.
export function foliageMaterial() {
  if (material) return material;
  material = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', roughness: 1 });
  material.positionNode = windOffset();
  return material;
}
