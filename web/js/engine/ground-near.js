import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';

const {
  texture,
  uniform,
  positionWorld,
  smoothstep,
  mix,
  vec2,
  vec3,
  float,
  dot,
  max,
  min,
  materialReference,
} = THREE.TSL;

// Suelo de cerca sobre la ortofoto, solo dentro del alcance del grano cercano (el `fade` que
// recibe `groundNearColor`, de 1 a 0 entre `near` y `far` de `setGroundDetail`). Desde lejos y
// en vista aérea la ortofoto queda tal cual. Valores ajustables en vivo con `setGroundNear`
// (consola: `__luz({ near: { … } })` con el modo `?debug`).
export const GROUND_NEAR = {
  // Copas: bajo las copas conocidas (vegetation.json) se sustituye la foto por el entorno
  // muy desenfocado (ground-clean.js). 1 = sustitución completa, 0 = apagado.
  crownClean: 1,
  // Sombras horneadas: los oscuros de la ortofoto suben hacia `shadowFloor`. `shadowFloor` es la
  // luminancia lineal (0–1) a la que se levantan; `shadowSoftness` ensancha la transición.
  shadowStrength: 0.75,
  shadowFloor: 0.085,
  shadowSoftness: 1.6,
};

export const groundNearUniforms = {
  // Entorno sin copas (RGB) y máscara de copas (R, con borde suave), en coordenadas de mundo.
  uCleanMap: texture(new THREE.Texture()),
  uCleanMask: texture(new THREE.Texture()),
  // x0, z0, ancho y alto en metros de la caja de la ortofoto general.
  uCleanBox: uniform(new THREE.Vector4(0, 0, 1, 1)),
  uCrownClean: uniform(GROUND_NEAR.crownClean),
  uShadowStrength: uniform(GROUND_NEAR.shadowStrength),
  uShadowFloor: uniform(GROUND_NEAR.shadowFloor),
  uShadowSoftness: uniform(GROUND_NEAR.shadowSoftness),
};
// Mientras no haya entorno limpio (sin ortofoto o en ligero) la máscara no se aplica.
export const groundNearState = { cleanReady: false, buildClean: null };
const luma = vec3(0.2126, 0.7152, 0.0722);

// `photo`: color del material (ortofoto × tinte, lineal); `tint`: solo el tinte; `fade`: 1 cerca, 0 lejos.
export function groundNearColor(photo, tint, fade) {
  const u = groundNearUniforms,
    uv = vec2(
      positionWorld.x.sub(u.uCleanBox.x).div(u.uCleanBox.z),
      float(1).sub(positionWorld.z.sub(u.uCleanBox.y).div(u.uCleanBox.w)),
    ),
    mask = u.uCleanMask.sample(uv).r.mul(u.uCrownClean).mul(fade),
    clean = mix(photo, u.uCleanMap.sample(uv).rgb.mul(tint), mask);
  // Sombras: luminancia relativa al tinte; solo suben los oscuros por debajo del suelo.
  const relative = dot(clean, luma).div(max(dot(tint, luma), 0.001)),
    amount = float(1)
      .sub(smoothstep(u.uShadowFloor.mul(0.6), u.uShadowFloor.mul(u.uShadowSoftness), relative))
      .mul(u.uShadowStrength)
      .mul(fade),
    lifted = relative.add(amount.mul(max(u.uShadowFloor.sub(relative), 0)));
  return clean.mul(min(lifted.div(max(relative, 0.002)), 4));
}

export const groundTintNode = () => materialReference('color', 'color').rgb;

export function applyGroundNearQuality() {
  const off = gfx.quality === 'low' || !groundNearState.cleanReady;
  groundNearUniforms.uCrownClean.value = off ? 0 : GROUND_NEAR.crownClean;
  groundNearUniforms.uShadowStrength.value = gfx.quality === 'low' ? 0 : GROUND_NEAR.shadowStrength;
  if (gfx.quality !== 'low' && !groundNearState.cleanReady) groundNearState.buildClean?.();
}

export function setGroundNear(patch = {}) {
  const next = { ...GROUND_NEAR, ...patch };
  for (const key of Object.keys(patch))
    if (!(key in GROUND_NEAR)) throw Error('Ajuste de suelo cercano desconocido: ' + key);
  if (
    !Object.values(next).every(Number.isFinite) ||
    next.crownClean < 0 ||
    next.crownClean > 1 ||
    next.shadowStrength < 0 ||
    next.shadowStrength > 1 ||
    next.shadowFloor < 0 ||
    next.shadowFloor > 0.5 ||
    next.shadowSoftness < 1
  )
    throw Error('Suelo cercano inválido: intensidades entre 0 y 1, suelo ≤ 0,5, suavidad ≥ 1');
  Object.assign(GROUND_NEAR, next);
  groundNearUniforms.uShadowFloor.value = next.shadowFloor;
  groundNearUniforms.uShadowSoftness.value = next.shadowSoftness;
  applyGroundNearQuality();
  gfx.needsRender = true;
}
