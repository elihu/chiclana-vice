import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';
import { applyGroundNearQuality, groundNearColor, groundTintNode } from './ground-near.js';

const { texture, uniform, positionWorld, cameraPosition, smoothstep, mix, vec3, vec4, float, max } =
  THREE.TSL;

// Contraste de la ortofoto (suelo y tejados), en el shader para no recomprimir los JPEG del IGN.
// El vuelo PNOA 2025-07 es más plano que el de 2022; se estira alrededor de un gris medio lineal.
const orthoContrast = uniform(1.15),
  ORTHO_PIVOT = 0.2;
let orthoPhoto = null;

// Color del material (color × mapa) con el contraste aplicado; lo comparten suelo y tejados.
export function orthoPhotoNode() {
  orthoPhoto ??= max(
    THREE.TSL.materialColor.rgb.sub(ORTHO_PIVOT).mul(orthoContrast).add(ORTHO_PIVOT),
    vec3(0),
  );
  return orthoPhoto;
}

// Cambia en vivo desde la consola con `(await import('./js/engine/textures.js')).setOrthoContrast(1.25)`.
export function setOrthoContrast(value) {
  if (!Number.isFinite(value) || value <= 0) throw Error('Contraste de ortofoto inválido: > 0');
  orthoContrast.value = value;
  gfx.needsRender = true;
}

// Anisotropía máxima del equipo; WebGPURenderer la expone en el propio renderizador.
export const maxAnisotropy = () =>
  gfx.renderer?.getMaxAnisotropy?.() ?? gfx.renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;

// Un único juego de uniformes (nodos TSL con `.value`) para todo el suelo; los tejados no los
// usan. El color de detalle se construye una vez y lo comparten todos los materiales.
export const detailUniforms = {
  uDetailMap: texture(new THREE.Texture()),
  uDetailScale: uniform(8),
  uDetailNear: uniform(8),
  uDetailFar: uniform(60),
  uDetailStrength: uniform(1),
};
let detailStrength = 1,
  detailColor = null,
  orthoColor = null;

// Grano cercano sobre ortofoto y pavimento: color del material (color × mapa) por el gris del
// grano en coordenadas de mundo, que se apaga entre `near` y `far` metros de la cámara. Con
// `ortho` (teselas de ortofoto del terreno) además aplica el suelo cercano de ground-near.js:
// copas limpias y sombras suavizadas, con el mismo alcance.
export function groundDetailNode(ortho = false) {
  if (ortho ? orthoColor : detailColor) return ortho ? orthoColor : detailColor;
  detailUniforms.uDetailMap.value = groundDetailTexture();
  const u = detailUniforms,
    fade = float(1).sub(
      smoothstep(u.uDetailNear, u.uDetailFar, positionWorld.distance(cameraPosition)),
    ),
    grain = u.uDetailMap.sample(positionWorld.xz.div(u.uDetailScale)).rgb.mul(2),
    photo = ortho ? orthoPhotoNode() : THREE.TSL.materialColor.rgb,
    base = ortho ? groundNearColor(photo, groundTintNode(), fade) : photo,
    node = vec4(base.mul(mix(vec3(1), grain, fade.mul(u.uDetailStrength))), 1);
  if (ortho) orthoColor = node;
  else detailColor = node;
  return node;
}

export function applyGroundDetail(material, { ortho = false } = {}) {
  if (!material.isMeshStandardNodeMaterial)
    throw Error('El detalle del suelo necesita MeshStandardNodeMaterial');
  material.colorNode = groundDetailNode(ortho);
  material.userData.groundDetail = true;
  return material;
}

export function applyGroundDetailQuality() {
  detailUniforms.uDetailStrength.value = gfx.quality === 'low' ? 0 : detailStrength;
  applyGroundNearQuality();
}

export function setGroundDetail({ scale, near, far, strength } = {}) {
  const next = {
    scale: scale ?? detailUniforms.uDetailScale.value,
    near: near ?? detailUniforms.uDetailNear.value,
    far: far ?? detailUniforms.uDetailFar.value,
    strength: strength ?? detailStrength,
  };
  if (
    !Object.values(next).every(Number.isFinite) ||
    next.scale <= 0 ||
    next.near < 0 ||
    next.far <= next.near ||
    next.strength < 0 ||
    next.strength > 1
  )
    throw Error(
      'Detalle de suelo inválido: escala > 0, 0 ≤ cerca < lejos e intensidad entre 0 y 1',
    );
  detailUniforms.uDetailScale.value = next.scale;
  detailUniforms.uDetailNear.value = next.near;
  detailUniforms.uDetailFar.value = next.far;
  detailStrength = next.strength;
  applyGroundDetailQuality();
  gfx.needsRender = true;
}

// Dato gris reproducible: no consume el azar compartido del mundo.
export function groundDetailTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  let seed = 1949;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      seed = (seed * 16807) % 2147483647;
      const value = 128 + (seed % 37) - 18;
      context.fillStyle = `rgb(${value},${value},${value})`;
      context.fillRect(x, y, 1, 1);
    }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy());
  return texture;
}

export function facadeTexture() {
  let c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  let a = c.getContext('2d');
  a.fillStyle = '#dedbcf';
  a.fillRect(0, 0, 128, 128);
  let seed = 31;
  for (let i = 0; i < 2000; i++) {
    seed = (seed * 16807) % 2147483647;
    a.fillStyle = seed % 2 ? '#ffffff0a' : '#3e372b09';
    a.fillRect(seed % 128, Math.floor(seed / 128) % 128, 1, 1);
  }
  a.fillStyle = '#c2bcae';
  a.fillRect(30, 22, 70, 83);
  a.fillStyle = '#faf3df';
  a.fillRect(26, 18, 70, 82);
  a.fillStyle = '#4c6766';
  a.fillRect(32, 24, 58, 69);
  a.fillStyle = '#26484f';
  a.fillRect(39, 27, 21, 59);
  a.fillStyle = '#88a1a0';
  a.fillRect(42, 28, 17, 25);
  a.fillStyle = '#566b5b';
  a.fillRect(64, 26, 21, 62);
  a.fillStyle = '#e8dbc2';
  a.fillRect(25, 94, 74, 8);
  a.fillStyle = '#303b37';
  a.fillRect(25, 80, 75, 3);
  for (let x = 28; x < 99; x += 11) a.fillRect(x, 79, 2, 18);
  let tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Street-level materials and lightweight instanced urban detail.
export function surfaceTexture(kind) {
  let c = document.createElement('canvas');
  c.width = c.height = 256;
  let a = c.getContext('2d'),
    seed = 711;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  a.fillStyle = kind === 'asphalt' ? '#727775' : '#a5a294';
  a.fillRect(0, 0, 256, 256);
  if (kind === 'asphalt') {
    for (let i = 0; i < 19000; i++) {
      let v = Math.floor(92 + r() * 59);
      a.fillStyle = `rgb(${v},${v + 3},${v + 1})`;
      let x = r() * 256,
        y = r() * 256;
      a.fillRect(x, y, r() > 0.85 ? 2 : 1, 1);
    }
  } else {
    let step = kind === 'stone' ? 32 : 64;
    for (let y = 0; y < 256; y += step)
      for (let x = -step; x < 256; x += step) {
        let xx = x + ((Math.floor(y / step) % 2) * step) / 2,
          v = Math.floor(165 + r() * 25);
        a.fillStyle =
          kind === 'stone' ? `rgb(${v},${v - 2},${v - 10})` : `rgb(${v + 11},${v + 7},${v - 6})`;
        a.fillRect(xx + 1, y + 1, step - 2, step - 2);
        a.fillStyle = '#ffffff1b';
        a.fillRect(xx + 2, y + 2, step - 4, 1);
      }
    for (let i = 0; i < 5000; i++) {
      a.fillStyle = r() > 0.5 ? '#ffffff08' : '#403c340c';
      a.fillRect(r() * 256, r() * 256, 1, 1);
    }
  }
  let tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy());
  return tex;
}
