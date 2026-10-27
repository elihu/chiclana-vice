import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';

const {
  Fn,
  cameraPosition,
  float,
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
} = THREE.TSL;

// Follaje de las copas: viento y luz a contraluz. Una brisa, no un temporal. Cambia en vivo desde la consola con
// `(await import('./js/engine/foliage.js')).setFoliage({ sway: 0.3 })`.
export const FOLIAGE = {
  direction: [0.86, 0.5], // hacia dónde sopla el viento en el plano (x, z); se normaliza
  sway: 0.1, // m que se desplaza la copa con el balanceo lento
  swayPeriod: 5.5, // s que dura un balanceo
  gust: 1.1, // cuánto crece el balanceo con la ráfaga (0 = viento constante)
  gustLength: 140, // m entre ráfagas sucesivas en la dirección del viento
  gustSpeed: 9, // m/s a los que la ráfaga recorre la ciudad
  phaseLength: 17, // m de la onda que desfasa unos árboles de otros (que no vayan al unísono)
  backlight: 0.18, // luz translúcida en los bordes de la copa al mirar hacia el sol (0 = apagada)
  backlightColor: '#ffc46b', // color cálido de esa luz
  backlightFocus: 3, // cuánto hay que mirar de frente al sol para que aparezca (mayor = más estrecho)
  backlightRim: 2, // cuánto se concentra en el borde de la copa (mayor = borde más fino)
};

const u = {
  direction: uniform(new THREE.Vector2()),
  sway: uniform(FOLIAGE.sway),
  swayRate: uniform(0),
  gust: uniform(FOLIAGE.gust),
  gustRate: uniform(0),
  gustSpeed: uniform(FOLIAGE.gustSpeed),
  phaseRate: uniform(0),
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
  u.gust.value = FOLIAGE.gust;
  u.gustRate.value = (Math.PI * 2) / FOLIAGE.gustLength;
  u.gustSpeed.value = FOLIAGE.gustSpeed;
  u.phaseRate.value = (Math.PI * 2) / FOLIAGE.phaseLength;
  // Modo ligero: sin contraluz (el material no se recompila, solo cambia el uniforme).
  const low = gfx.quality === 'low';
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

// Desplazamiento del viento: cada copa se mece entera, sin deformarse. La fase cambia despacio
// en el espacio (`phaseLength`), así que todos los vértices de una copa se mueven casi igual; un
// temblor por vértice haría «burbujear» los icosaedros. `positionLocal` ya está en el mundo.
const windOffset = Fn(() => {
  const p = positionLocal,
    along = u.direction.x.mul(p.x).add(u.direction.y.mul(p.z)),
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
    push = slow.mul(u.sway).mul(gust);
  return p.add(vec3(u.direction.x.mul(push), push.mul(-0.15), u.direction.y.mul(push)));
});

// Contraluz: con la cámara mirando hacia el sol, las hojas de los bordes dejan pasar su luz.
// Depende de dot(vista, sol) y del fresnel; la intensidad sigue a la del sol.
const backlightEmissive = Fn(() => {
  const look = normalize(positionWorld.sub(cameraPosition)),
    facing = pow(saturate(look.dot(u.sunDirection)), u.backlightFocus),
    rim = pow(float(1).sub(saturate(normalWorld.dot(look.negate()))), u.backlightRim);
  return u.backlightColor.mul(facing.mul(rim).mul(u.backlight).mul(u.sunScale));
});

let material = null;

// Material único de las copas (grandes y pequeñas). El color de cada una llega por instancia.
export function foliageMaterial() {
  if (material) return material;
  material = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', roughness: 1 });
  material.positionNode = windOffset();
  material.emissiveNode = backlightEmissive();
  return material;
}
