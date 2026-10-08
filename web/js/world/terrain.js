import { boundsBox, validBounds, worldBounds } from './bounds.js';
export { gridX, gridZ, gridColumn, gridRow } from '../core/math.js';
import { gridColumn, gridRow } from '../core/math.js';
// Muestreo puro; diagonal NW→SE compartida con el dibujo.
export const flatTerrain = Object.freeze({
  kind: 'flat',
  heightAt() {
    return 0;
  },
});

export function heightAt(terrain, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw Error('Consulta de terreno no finita');
  return terrain ? terrain.heightAt(x, z) : 0;
}

export function createTerrain(m, buffer, city) {
  const bounds = worldBounds(city);
  if (!validBounds(bounds)) throw Error('Capa de terreno incompatible');
  const box = boundsBox(bounds),
    size = [box[1] - box[0], box[3] - box[2]];
  const pair = (a) => Array.isArray(a) && a.length === 2 && a.every(Number.isFinite);
  if (
    !m ||
    m.version !== 1 ||
    !pair(m.origin) ||
    !pair(m.size) ||
    !Array.isArray(m.bounds) ||
    m.bounds.length !== 4 ||
    !m.bounds.every(Number.isFinite) ||
    m.bounds[0] > box[0] ||
    m.bounds[1] < box[1] ||
    m.bounds[2] > box[2] ||
    m.bounds[3] < box[3] ||
    m.origin.some((v, i) => v !== city.origin[i]) ||
    m.size.some((v, i) => v !== size[i]) ||
    !Number.isInteger(m.columns) ||
    !Number.isInteger(m.rows) ||
    m.columns < 2 ||
    m.rows < 2 ||
    m.columns * m.rows > 1000000 ||
    m.encoding !== 'int16-le' ||
    m.scale !== 0.1 ||
    m.rowOrder !== 'north-to-south' ||
    m.diagonal !== 'nw-se' ||
    m.file !== 'terrain.bin' ||
    !/^[a-f0-9]{64}$/.test(m.sha256 || '') ||
    !Number.isFinite(m.referenceElevation) ||
    !pair(m.step) ||
    m.step[0] !== (m.bounds[1] - m.bounds[0]) / (m.columns - 1) ||
    m.step[1] !== (m.bounds[3] - m.bounds[2]) / (m.rows - 1) ||
    m.step.some((v) => v <= 0) ||
    !Number.isInteger(m.bounds[0] / m.step[0]) ||
    !Number.isInteger(m.bounds[2] / m.step[1]) ||
    !(buffer instanceof ArrayBuffer) ||
    buffer.byteLength !== m.columns * m.rows * 2
  )
    throw Error('Capa de terreno incompatible');
  const data = new Float32Array(m.columns * m.rows),
    view = new DataView(buffer);
  for (let i = 0; i < data.length; i++) data[i] = view.getInt16(i * 2, true) * m.scale;
  return {
    kind: 'grid',
    manifest: m,
    data,
    heightAt(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) throw Error('Consulta de terreno no finita');
      return gridHeightAt(m, data, x, z);
    },
  };
}

export function gridHeightAt(m, data, x, z) {
  const gx = Math.max(0, Math.min(m.columns - 1, gridColumn(m, x))),
    gz = Math.max(0, Math.min(m.rows - 1, gridRow(m, z))),
    i = Math.min(m.columns - 2, Math.floor(gx)),
    j = Math.min(m.rows - 2, Math.floor(gz)),
    u = gx - i,
    v = gz - j,
    k = j * m.columns + i,
    a = data[k],
    b = data[k + 1],
    c = data[k + m.columns],
    d = data[k + m.columns + 1];
  return u >= v ? a * (1 - u) + b * (u - v) + d * v : a * (1 - v) + d * u + c * (v - u);
}

export async function loadTerrain(read, city, digest) {
  let response;
  try {
    response = await read('terrain.json');
  } catch {
    return { terrain: flatTerrain, warning: 'Terreno no disponible: modo plano' };
  }
  if (response.status === 404) return { terrain: flatTerrain, warning: null };
  if (!response.ok) return { terrain: flatTerrain, warning: 'Terreno no disponible: modo plano' };
  let manifest;
  try {
    manifest = await response.json();
  } catch {
    throw Error('Manifiesto de terreno inválido');
  }
  if (!manifest || manifest.file !== 'terrain.bin') throw Error('Archivo de terreno incompatible');
  let binary;
  try {
    binary = await read(manifest.file);
  } catch {
    return { terrain: flatTerrain, warning: 'Red de terreno no disponible: modo plano' };
  }
  if (!binary.ok) throw Error('Falta el binario de terreno');
  const bytes = await binary.arrayBuffer();
  if ((await digest(bytes)) !== manifest.sha256) throw Error('Checksum de terreno incorrecto');
  return { terrain: createTerrain(manifest, bytes, city), warning: null };
}
