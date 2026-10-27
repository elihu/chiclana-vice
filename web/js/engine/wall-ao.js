import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';

const { attribute, float, mix, smoothstep, uniform } = THREE.TSL;

// Oclusión ambiental falsa de los muros: oscurece solo la luz ambiente (cielo y entorno), no el sol.
// Usa el atributo `hag` (altura sobre el suelo en metros, interpolada por el muro). Cambia en vivo
// desde la consola con `(await import('./js/engine/wall-ao.js')).setWallAO({ base: 0.2 })`.
export const WALL_AO = {
  base: 0.3, // luz ambiente que queda al pie del muro (1 = sin oscurecer)
  height: 2, // m sobre el suelo en los que la base recupera la luz completa
  lowFloors: 0.72, // luz ambiente de las plantas bajas respecto a las altas (1 = igual)
  lowFloorsHeight: 14, // m hasta los que se nota la diferencia entre plantas
};

const u = {
  base: uniform(WALL_AO.base),
  height: uniform(WALL_AO.height),
  lowFloors: uniform(WALL_AO.lowFloors),
  lowFloorsHeight: uniform(WALL_AO.lowFloorsHeight),
};

export function setWallAO(patch = {}) {
  Object.assign(WALL_AO, patch);
  for (const key of Object.keys(u)) u[key].value = WALL_AO[key];
  gfx.needsRender = true;
}

let node = null;

// Material de muro con la oclusión falsa. Los datos de la geometría deben llevar `hag`.
export function wallMaterial(parameters) {
  const material = new THREE.MeshStandardNodeMaterial(parameters);
  node ??= (() => {
    const hag = attribute('hag', 'float'),
      foot = mix(u.base, float(1), smoothstep(0, u.height, hag)),
      floors = mix(u.lowFloors, float(1), smoothstep(u.height, u.lowFloorsHeight, hag));
    return foot.mul(floors);
  })();
  material.aoNode = node;
  return material;
}
