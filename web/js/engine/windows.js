import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';
import { wallMaterial } from './wall-ao.js';

const { float, fract, mix, step, uniform, uv } = THREE.TSL;

// Ventanas de los muros genéricos: cristal que refleja el cielo.
// Cambia en vivo desde la consola con `(await import('./js/engine/windows.js')).setWindows({ glassRoughness: 0.3 })`.
// El rectángulo de cristal está en el lienzo de `facadeTexture()` (x 32–90, y 24–93 de 128 px).
export const WINDOWS = {
  glassRoughness: 0.1, // rugosidad del cristal (el resto del muro conserva la suya)
  glassMetalness: 0.35, // metal del cristal: sube el reflejo del cielo horneado
};

const u = {
  glassRoughness: uniform(WINDOWS.glassRoughness),
  glassMetalness: uniform(WINDOWS.glassMetalness),
};

export function setWindows(patch = {}) {
  Object.assign(WINDOWS, patch);
  for (const key of Object.keys(u)) u[key].value = WINDOWS[key];
  gfx.needsRender = true;
}

// Rectángulo de cristal en la celda de UV. El eje V va volteado respecto al lienzo.
const GLASS = { u0: 32 / 128, u1: 90 / 128, v0: 1 - 93 / 128, v1: 1 - 24 / 128 };

let nodes = null;

// Material de muros con ventanas: cristal reflectante.
export function windowWallMaterial(parameters) {
  const material = wallMaterial(parameters);
  nodes ??= (() => {
    const coord = uv(),
      f = fract(coord),
      inU = step(GLASS.u0, f.x).mul(step(f.x, GLASS.u1)),
      inV = step(GLASS.v0, f.y).mul(step(f.y, GLASS.v1)),
      glass = inU.mul(inV);
    return {
      roughness: mix(float(material.roughness), u.glassRoughness, glass),
      metalness: glass.mul(u.glassMetalness),
    };
  })();
  material.roughnessNode = nodes.roughness;
  material.metalnessNode = nodes.metalness;
  return material;
}
