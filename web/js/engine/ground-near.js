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
  // Materiales propios: según el color de la foto se mezcla textura procedural de césped, tierra
  // o pavimento (multiplicativa, de media 1: el color medio de la foto se conserva).
  materialStrength: 0.85,
  materialScale: 3, // m por repetición de la textura base (la segunda es 0,37 veces menor)
  // Clases por color (lineal, sin tinte): `green` = [desde, hasta] de predominio del verde;
  // `earth` = saturación mínima para tierra; `pavement` = saturación máxima para pavimento;
  // `minLight` = luminancia mínima del pavimento (el asfalto oscuro no se toca).
  green: [0.12, 0.3],
  earth: [0.35, 0.6],
  pavement: [0.2, 0.4],
  minLight: [0.12, 0.25],
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
  uMaterialMap: texture(new THREE.Texture()),
  uMaterialStrength: uniform(GROUND_NEAR.materialStrength),
  uMaterialScale: uniform(GROUND_NEAR.materialScale),
  uGreen: uniform(new THREE.Vector2(...GROUND_NEAR.green)),
  uEarth: uniform(new THREE.Vector2(...GROUND_NEAR.earth)),
  uPavement: uniform(new THREE.Vector2(...GROUND_NEAR.pavement)),
  uMinLight: uniform(new THREE.Vector2(...GROUND_NEAR.minLight)),
};
// Mientras no haya entorno limpio (sin ortofoto o en ligero) la máscara no se aplica.
export const groundNearState = { cleanReady: false, buildClean: null };
const luma = vec3(0.2126, 0.7152, 0.0722);

// Texturas procedurales de los tres materiales en un solo RGBA de datos (R césped, G tierra,
// B pavimento), 256 px que se repiten cada `materialScale` m. Cada canal tiene media 0,5.
// Reproducible y sin imágenes: no consume el azar compartido del mundo.
export function groundMaterialTexture() {
  const size = 256,
    channels = [0, 1, 2].map(() => new Float32Array(size * size));
  let seed = 4721;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // Ruido de valor con envoltura: rejilla de `cells` celdas interpolada, para manchas.
  const clumps = (cells) => {
    const grid = Float32Array.from({ length: cells * cells }, random),
      out = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const fx = (x * cells) / size,
          fy = (y * cells) / size,
          x0 = Math.floor(fx),
          y0 = Math.floor(fy),
          tx = fx - x0,
          ty = fy - y0,
          at = (i, j) => grid[(j % cells) * cells + (i % cells)];
        out[y * size + x] =
          (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) +
          (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
      }
    return out;
  };
  const patchesA = clumps(16),
    patchesB = clumps(48);
  for (let i = 0; i < size * size; i++) {
    const fine = random();
    // Césped: manchas anchas y grano fino. Tierra: grano grueso con motas oscuras.
    channels[0][i] = 0.5 + 0.34 * (patchesA[i] - 0.5) + 0.3 * (fine - 0.5);
    channels[1][i] =
      0.5 + 0.2 * (patchesB[i] - 0.5) + 0.36 * (fine - 0.5) - (fine < 0.04 ? 0.18 : 0);
  }
  // Pavimento: baldosas de 4 × 4 con tono propio, juntas oscuras y grano suave.
  const slab = size / 4,
    tones = Array.from({ length: 16 }, () => (random() - 0.5) * 0.14);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const joint = x % slab < 2 || y % slab < 2,
        tone = tones[Math.floor(y / slab) * 4 + Math.floor(x / slab)];
      channels[2][y * size + x] = joint ? 0.2 : 0.55 + tone + 0.06 * (random() - 0.5);
    }
  const data = new Uint8Array(size * size * 4);
  for (const [k, channel] of channels.entries()) {
    let mean = 0;
    for (const v of channel) mean += v;
    mean /= channel.length;
    for (let i = 0; i < channel.length; i++)
      data[i * 4 + k] = Math.round(Math.max(0, Math.min(1, (channel[i] * 0.5) / mean)) * 255);
  }
  for (let i = 0; i < size * size; i++) data[i * 4 + 3] = 255;
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.NoColorSpace;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

// Mezcla las texturas procedurales según la clase del color de la foto (césped, tierra,
// pavimento); lo que no encaja (asfalto, agua, sombras) queda como estaba.
function materialsNode(color, tint, fade) {
  const u = groundNearUniforms,
    raw = color.div(max(tint, vec3(0.001))),
    top = max(raw.r, max(raw.g, raw.b)),
    low = min(raw.r, min(raw.g, raw.b)),
    light = dot(raw, luma),
    green = smoothstep(u.uGreen.x, u.uGreen.y, raw.g.sub(max(raw.r, raw.b)).div(light.add(0.03))),
    saturation = top.sub(low).div(top.add(0.02)),
    earth = smoothstep(u.uEarth.x, u.uEarth.y, saturation)
      .mul(smoothstep(0.03, 0.08, light))
      .mul(float(1).sub(green)),
    pavement = float(1)
      .sub(smoothstep(u.uPavement.x, u.uPavement.y, saturation))
      .mul(smoothstep(u.uMinLight.x, u.uMinLight.y, light))
      .mul(float(1).sub(green)),
    plain = float(1).sub(green).sub(earth).sub(pavement),
    xz = positionWorld.xz,
    first = u.uMaterialMap.sample(xz.div(u.uMaterialScale)).rgb,
    second = u.uMaterialMap.sample(xz.yx.div(u.uMaterialScale.mul(0.37))).rgb,
    multiplier = green
      .mul(first.r.mul(second.r).mul(4))
      .add(earth.mul(first.g.mul(second.g).mul(4)))
      .add(pavement.mul(first.b.mul(2)))
      .add(max(plain, 0));
  return color.mul(mix(vec3(1), vec3(multiplier), fade.mul(u.uMaterialStrength)));
}

// `photo`: color del material (ortofoto × tinte, lineal); `tint`: solo el tinte; `fade`: 1 cerca, 0 lejos.
export function groundNearColor(photo, tint, fade) {
  groundNearUniforms.uMaterialMap.value = groundMaterialTexture();
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
  return materialsNode(clean.mul(min(lifted.div(max(relative, 0.002)), 4)), tint, fade);
}

export const groundTintNode = () => materialReference('color', 'color').rgb;

export function applyGroundNearQuality() {
  const low = gfx.quality === 'low';
  groundNearUniforms.uCrownClean.value =
    low || !groundNearState.cleanReady ? 0 : GROUND_NEAR.crownClean;
  groundNearUniforms.uShadowStrength.value = low ? 0 : GROUND_NEAR.shadowStrength;
  groundNearUniforms.uMaterialStrength.value = low ? 0 : GROUND_NEAR.materialStrength;
  if (!low && !groundNearState.cleanReady) groundNearState.buildClean?.();
}

const RANGES = ['green', 'earth', 'pavement', 'minLight'];

export function setGroundNear(patch = {}) {
  for (const key of Object.keys(patch))
    if (!(key in GROUND_NEAR)) throw Error('Ajuste de suelo cercano desconocido: ' + key);
  const next = { ...GROUND_NEAR, ...patch },
    unit = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
  if (
    !['crownClean', 'shadowStrength', 'materialStrength'].every((k) => unit(next[k])) ||
    !(next.shadowFloor >= 0 && next.shadowFloor <= 0.5) ||
    !(next.shadowSoftness >= 1) ||
    !(next.materialScale > 0) ||
    !RANGES.every(
      (k) =>
        Array.isArray(next[k]) &&
        next[k].length === 2 &&
        next[k].every(Number.isFinite) &&
        next[k][1] > next[k][0],
    )
  )
    throw Error(
      'Suelo cercano inválido: intensidades entre 0 y 1, suelo ≤ 0,5, suavidad ≥ 1, escala > 0 y rangos [desde, hasta] crecientes',
    );
  Object.assign(GROUND_NEAR, next);
  const u = groundNearUniforms;
  u.uShadowFloor.value = next.shadowFloor;
  u.uShadowSoftness.value = next.shadowSoftness;
  u.uMaterialScale.value = next.materialScale;
  u.uGreen.value.set(...next.green);
  u.uEarth.value.set(...next.earth);
  u.uPavement.value.set(...next.pavement);
  u.uMinLight.value.set(...next.minLight);
  applyGroundNearQuality();
  gfx.needsRender = true;
}
