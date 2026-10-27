import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';
import { wallMaterial } from './wall-ao.js';

const {
  Fn,
  attribute,
  dot,
  float,
  floor,
  fract,
  mix,
  round,
  select,
  sin,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} = THREE.TSL;

// Ventanas de los muros genéricos: cristal que refleja el cielo y persianas. Cada edificio tiene un
// tono y un estado habitual de persiana; solo una parte de sus ventanas se sale de él.
// Cambia en vivo desde la consola con `(await import('./js/engine/windows.js')).setWindows({ glassRoughness: 0.3 })`.
// El rectángulo de cristal está en el lienzo de `facadeTexture()` (x 32–90, y 24–93 de 128 px).
export const WINDOWS = {
  glassRoughness: 0.1, // rugosidad del cristal (el resto del muro conserva la suya)
  glassMetalness: 0.35, // metal del cristal: sube el reflejo del cielo horneado
  shutterDown: 0.2, // fracción de edificios con la persiana habitual bajada del todo
  shutterHalf: 0.25, // fracción con la habitual a medias (el resto, subida)
  variety: 0.2, // fracción de ventanas que se salen del estado habitual de su edificio
  shutterHalfCover: 0.5, // parte del cristal que tapa la persiana «a medias»
  shutterUpCover: 0.1, // tira de persiana recogida arriba (cajón); 0 = nada
  slats: 16, // lamas por ventana
  slatShade: 0.22, // oscurecimiento de las lamas alternas
  tones: ['#52704d', '#6d4a33', '#d9d3c1'], // verde, marrón y blanco roto
  cornice: 0.28, // m de altura de la cornisa de los muros genéricos
  corniceOut: 0.12, // m que sobresale la cornisa
  corniceTint: 0.82, // oscurecimiento del color del muro para la cornisa (1 = igual)
};

const u = {
  glassRoughness: uniform(WINDOWS.glassRoughness),
  glassMetalness: uniform(WINDOWS.glassMetalness),
  shutterDown: uniform(WINDOWS.shutterDown),
  shutterHalf: uniform(WINDOWS.shutterHalf),
  variety: uniform(WINDOWS.variety),
  shutterHalfCover: uniform(WINDOWS.shutterHalfCover),
  shutterUpCover: uniform(WINDOWS.shutterUpCover),
  slats: uniform(WINDOWS.slats),
  slatShade: uniform(WINDOWS.slatShade),
};
const tones = WINDOWS.tones.map((hex) => uniform(new THREE.Color(hex)));

export function setWindows(patch = {}) {
  Object.assign(WINDOWS, patch);
  for (const key of Object.keys(u)) u[key].value = WINDOWS[key];
  WINDOWS.tones.forEach((hex, i) => tones[i].value.set(hex));
  gfx.needsRender = true;
}

// Hash estable en [0, 1) de una celda de ventana (`floor(uv)`) y una semilla por edificio.
// Reutilizable: las ventanas encendidas de noche usan el mismo (`windowHash(cell, seed, salt)`).
export const windowHash = Fn(([cell, seed, salt]) =>
  fract(
    sin(dot(cell.add(vec2(seed, seed.mul(1.7))), vec2(127.1, 311.7)).add(salt.mul(74.7))).mul(
      43758.5453,
    ),
  ),
);

// Semilla del edificio: sale del color de vértice, redondeado a 8 bits para que la interpolación
// no meta ruido por píxel (el hash amplifica cualquier diferencia mínima).
export const buildingSeed = () =>
  fract(dot(round(attribute('color', 'vec3').mul(255)), vec3(0.1031, 0.1137, 0.0973))).mul(37);

// Rectángulo de cristal en la celda de UV. El eje V va volteado respecto al lienzo.
const GLASS = { u0: 32 / 128, u1: 90 / 128, v0: 1 - 93 / 128, v1: 1 - 24 / 128 };

let nodes = null;

// Material de muros con ventanas: cristal reflectante y persianas por ventana.
export function windowWallMaterial(parameters) {
  const material = wallMaterial(parameters);
  nodes ??= (() => {
    const coord = uv(),
      cell = floor(coord),
      f = fract(coord),
      seed = buildingSeed(),
      inU = step(GLASS.u0, f.x).mul(step(f.x, GLASS.u1)),
      inV = step(GLASS.v0, f.y).mul(step(f.y, GLASS.v1)),
      inGlass = inU.mul(inV),
      t = f.y.sub(GLASS.v0).div(GLASS.v1 - GLASS.v0), // 0 abajo del cristal, 1 arriba
      whole = vec2(0),
      // Estado: el habitual del edificio, salvo `variety` de las ventanas, que eligen el suyo.
      r1 = select(
        windowHash(cell, seed, float(3)).lessThan(u.variety),
        windowHash(cell, seed, float(0)),
        windowHash(whole, seed, float(0)),
      ),
      r2 = windowHash(whole, seed, float(1)), // un solo tono por edificio
      cover = select(
        r1.lessThan(u.shutterDown),
        float(1),
        select(r1.lessThan(u.shutterDown.add(u.shutterHalf)), u.shutterHalfCover, u.shutterUpCover),
      ),
      covered = inGlass.mul(step(float(1).sub(cover), t)).mul(step(0.001, cover)),
      tone = select(r2.lessThan(0.4), tones[0], select(r2.lessThan(0.7), tones[1], tones[2])),
      slat = float(1).sub(step(0.5, fract(t.mul(u.slats))).mul(u.slatShade)),
      shutter = vec3(tone).mul(slat),
      base = texture(material.map, coord).rgb,
      glass = inGlass.mul(float(1).sub(covered));
    return {
      color: mix(base, shutter, covered),
      roughness: mix(float(material.roughness), u.glassRoughness, glass),
      metalness: glass.mul(u.glassMetalness),
    };
  })();
  material.colorNode = nodes.color;
  material.roughnessNode = nodes.roughness;
  material.metalnessNode = nodes.metalness;
  return material;
}
