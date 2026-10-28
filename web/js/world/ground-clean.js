import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx, world } from '../core/state.js';
import {
  groundNearState,
  groundNearUniforms,
  applyGroundNearQuality,
} from '../engine/ground-near.js';

// Datos para el suelo cercano (ver engine/ground-near.js), generados al cargar sin tocar las
// teselas de ortofoto publicadas. A partir de la vista general (world.groundTexture):
//  - máscara de copas (R): círculos de vegetation.json con borde suave;
//  - zona de sombra (G): círculo más amplio y desplazado hacia donde cae la sombra en la foto;
//    dentro, ground-near.js solo sustituye lo que sea claramente más oscuro que el entorno;
//  - entorno sin copas: la misma foto con las copas descartadas y rellenada con el promedio
//    ponderado de los píxeles vecinos (desenfoque por cajas normalizado).
// Ambos van en coordenadas de la caja de la ortofoto general (world.aerialBox).
export const GROUND_CLEAN = {
  maskPixel: 1.5, // m por píxel de la máscara
  fillPixel: 3, // m por píxel del entorno rellenado
  fillRadius: 5, // radio de cada pasada de desenfoque, en píxeles del entorno (dos pasadas)
  crownGrow: 1.12, // la máscara cubre la copa por este factor...
  crownMargin: 0.9, // ...más estos metros, para tapar la sombra y el borde de la copa
  edge: 0.45, // fracción del radio de la máscara en que baja de 1 a 0
  // Zona de sombra: en la ortofoto (PNOA 2022-07) el oscuro de cada árbol llega a unas dos veces
  // el radio detectado y se alarga hacia el norte y el noroeste (medido sobre todas las copas).
  zoneGrow: 2.2,
  zoneMargin: 1.5,
  zoneShift: [-0.25, -0.5], // desplazamiento del centro en radios de copa (x, z; z negativa = norte)
};

function boxBlur(plane, width, height, radius, tmp) {
  const norm = 1 / (2 * radius + 1);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += plane[row + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum * norm;
      sum +=
        plane[row + Math.min(width - 1, x + radius + 1)] - plane[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++)
      sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      plane[y * width + x] = sum * norm;
      sum +=
        tmp[Math.min(height - 1, y + radius + 1) * width + x] -
        tmp[Math.max(0, y - radius) * width + x];
    }
  }
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function buildGroundClean() {
  // Sin lienzo legible (navegador restringido, pruebas con DOM simulado) el suelo queda con la
  // ortofoto tal cual: es una mejora opcional, no debe impedir arrancar.
  try {
    buildMaps();
  } catch (error) {
    console.warn('Suelo cercano sin copas limpias:', error.message);
  }
}

function buildMaps() {
  const image = world.groundTexture?.image,
    layer = world.vegetation;
  if (groundNearState.cleanReady || gfx.quality === 'low' || !image || !world.aerialBox) return;
  const [x0, x1, z0, z1] = world.aerialBox,
    c = GROUND_CLEAN,
    crowns = [...(layer?.trees ?? []), ...(layer?.shrubs ?? [])];
  if (!crowns.length) return;
  // Máscara de copas (blanco = copa) en el sistema de la ortofoto: arriba = z0.
  const mw = Math.ceil((x1 - x0) / c.maskPixel),
    mh = Math.ceil((z1 - z0) / c.maskPixel),
    maskCanvas = canvasOf(mw, mh),
    mask = maskCanvas.getContext('2d', { willReadFrequently: true });
  mask.fillStyle = '#000';
  mask.fillRect(0, 0, mw, mh);
  mask.globalCompositeOperation = 'lighten';
  const disc = (px, pz, r, color) => {
    const gradient = mask.createRadialGradient(px, pz, r * (1 - c.edge), px, pz, r);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, '#000');
    mask.fillStyle = gradient;
    mask.fillRect(px - r, pz - r, 2 * r, 2 * r);
  };
  for (const [x, z, radius] of crowns) {
    disc(
      (x - x0) / c.maskPixel,
      (z - z0) / c.maskPixel,
      (radius * c.crownGrow + c.crownMargin) / c.maskPixel,
      '#f00',
    );
    disc(
      (x + c.zoneShift[0] * radius - x0) / c.maskPixel,
      (z + c.zoneShift[1] * radius - z0) / c.maskPixel,
      (radius * c.zoneGrow + c.zoneMargin) / c.maskPixel,
      '#0f0',
    );
  }
  // Entorno sin copas: foto y máscara a menor resolución, peso 0 donde hay copa.
  const fw = Math.ceil((x1 - x0) / c.fillPixel),
    fh = Math.ceil((z1 - z0) / c.fillPixel),
    photoCanvas = canvasOf(fw, fh),
    photo = photoCanvas.getContext('2d', { willReadFrequently: true }),
    small = canvasOf(fw, fh).getContext('2d', { willReadFrequently: true });
  photo.drawImage(image, 0, 0, fw, fh);
  small.drawImage(maskCanvas, 0, 0, fw, fh);
  const pixels = photo.getImageData(0, 0, fw, fh),
    weights = small.getImageData(0, 0, fw, fh).data,
    count = fw * fh,
    planes = [0, 1, 2, 3].map(() => new Float32Array(count)),
    tmp = new Float32Array(count),
    average = [0, 0, 0];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const w = weights[i * 4] < 40 ? 1 : 0;
    for (let k = 0; k < 3; k++) {
      const v = pixels.data[i * 4 + k] * w;
      planes[k][i] = v;
      average[k] += v;
    }
    planes[3][i] = w;
    total += w;
  }
  for (const plane of planes) {
    boxBlur(plane, fw, fh, c.fillRadius, tmp);
    boxBlur(plane, fw, fh, c.fillRadius, tmp);
  }
  for (let i = 0; i < count; i++) {
    const w = planes[3][i];
    for (let k = 0; k < 3; k++)
      pixels.data[i * 4 + k] = w > 0.01 ? planes[k][i] / w : average[k] / Math.max(1, total);
    pixels.data[i * 4 + 3] = 255;
  }
  photo.putImageData(pixels, 0, 0);
  const make = (canvas, colorSpace) => {
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = colorSpace;
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.generateMipmaps = false;
    map.minFilter = THREE.LinearFilter;
    return map;
  };
  groundNearUniforms.uCleanMap.value = make(photoCanvas, THREE.SRGBColorSpace);
  groundNearUniforms.uCleanMask.value = make(maskCanvas, THREE.NoColorSpace);
  groundNearUniforms.uCleanBox.value.set(x0, z0, x1 - x0, z1 - z0);
  groundNearState.cleanReady = true;
  applyGroundNearQuality();
}

// Registra la construcción (también al pasar de ligero a normal) y la ejecuta si procede.
export function prepareGroundClean() {
  groundNearState.buildClean = buildGroundClean;
  buildGroundClean();
}
