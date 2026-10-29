import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx, streetEnvironment, world } from '../core/state.js';
import { createGroundFloors, partArea, shopFamily } from './ground-floors.js';

// Rótulos con el nombre de los comercios de OSM (C3 de PLAN-COMERCIOS): un atlas de canvas, un
// material y una malla fusionada. Cada comercio con nombre busca el frente que tiene delante con el
// mismo criterio que la clase del bajo (groundFloors: shopDistance, shopBehind, shopMargin); en cada
// frente queda solo el comercio más cercano. El rótulo va sobre el escaparate (la banda de rótulo
// de windows.js), delante del relieve en las calles con fachada detallada y en lo alto de la
// entrada en las grandes superficies. Texto genérico: sin logotipos ni colores de marca (D4).
export const SHOP_SIGNS = {
  height: 0.42, // m del rótulo de un local
  bottom: 2.36, // m sobre la base del edificio (banda de rótulo del bajo: 0,76–0,92 de planta)
  offset: 0.06, // m delante del muro genérico
  reliefOffset: 0.34, // m delante del muro con relieve (por delante del rótulo de la receta)
  reliefBottom: 2.72, // m sobre la base en las calles con relieve
  bigHeight: 1.1, // m del rótulo de una gran superficie, en lo alto de la fachada
  bigTop: 0.25, // m desde lo alto del muro hasta el borde superior del rótulo
  minimumEdge: 2, // m de frente mínimo
  background: '#2b3a40', // fondo de los comercios sin tipo de local
  text: '#f2eedc',
};

// Celdas del atlas: proporción fija (el rótulo mide `height` × ASPECT) y un atlas de 8 columnas que
// no pasa de 2048 px de alto, el máximo garantizado por WebGL 2 (hasta 8 × 42 = 336 rótulos).
const CELL_W = 224,
  CELL_H = 40,
  GUTTER = 4,
  COLS = 8,
  MAX_ROWS = Math.floor(2048 / (CELL_H + GUTTER * 2)),
  ASPECT = CELL_W / CELL_H;

// Frentes exteriores de los edificios (no los monumentos) en una rejilla de 25 m.
function edgeGrid() {
  const CELL = 25,
    grid = new Map();
  world.city.buildings.forEach((b, index) => {
    if (b.detailType && b.detailType !== 'street') return;
    const ring = b.p,
      signed = ring.reduce((sum, [x0, z0], i) => {
        const [x1, z1] = ring[(i + 1) % ring.length];
        return sum + x0 * z1 - x1 * z0;
      }, 0),
      outward = signed > 0 ? 1 : -1;
    ring.forEach((a, i) => {
      const q = ring[(i + 1) % ring.length],
        len = Math.hypot(q[0] - a[0], q[1] - a[1]);
      if (len < SHOP_SIGNS.minimumEdge) return;
      const edge = {
        index,
        i,
        a,
        q,
        len,
        nx: ((q[1] - a[1]) / len) * outward,
        nz: (-(q[0] - a[0]) / len) * outward,
      };
      const key = Math.floor((a[0] + q[0]) / 2 / CELL) + ',' + Math.floor((a[1] + q[1]) / 2 / CELL);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(edge);
    });
  });
  return { CELL, grid };
}

// Ajusta el cuerpo de letra al ancho de la celda; si ni con el mínimo cabe, corta con «…».
function fitText(context, text, width) {
  for (let size = 26; size >= 18; size -= 2) {
    context.font = `bold ${size}px Arial`;
    if (context.measureText(text).width <= width) return text;
  }
  let cut = text;
  while (cut.length > 1 && context.measureText(cut + '…').width > width) cut = cut.slice(0, -1);
  return cut.trimEnd() + '…';
}

export function addShopSigns() {
  const layer = world.groundFloors,
    rules = world.cityDesign.groundFloors;
  if (!layer?.shops?.length) return;
  const groundFloors = createGroundFloors(layer, rules, world.cityDesign.zones),
    { CELL, grid } = edgeGrid(),
    byEdge = new Map();
  // Frente de cada comercio con nombre: el más cercano de los que lo tienen delante.
  for (const shop of layer.shops) {
    const [x, z, type, name] = shop;
    if (!name) continue;
    let best = null,
      bestDistance = Infinity;
    for (let gx = Math.floor(x / CELL) - 1; gx <= Math.floor(x / CELL) + 1; gx++)
      for (let gz = Math.floor(z / CELL) - 1; gz <= Math.floor(z / CELL) + 1; gz++)
        for (const e of grid.get(gx + ',' + gz) ?? []) {
          const t = ((x - e.a[0]) * (e.q[0] - e.a[0]) + (z - e.a[1]) * (e.q[1] - e.a[1])) / e.len,
            s = (x - e.a[0]) * e.nx + (z - e.a[1]) * e.nz;
          if (
            s > rules.shopDistance ||
            s < -rules.shopBehind ||
            t < -rules.shopMargin ||
            t > e.len + rules.shopMargin
          )
            continue;
          const distance = Math.hypot(s, Math.max(0, -t, t - e.len));
          if (distance < bestDistance) {
            best = { e, t, name, type };
            bestDistance = distance;
          }
        }
    const key = best && best.e.index + ':' + best.e.i;
    if (best && (!byEdge.has(key) || bestDistance < byEdge.get(key).distance))
      byEdge.set(key, { ...best, distance: bestDistance });
  }
  const signs = [...byEdge.values()].slice(0, COLS * MAX_ROWS);
  if (!signs.length) return;

  const atlas = document.createElement('canvas');
  atlas.width = COLS * (CELL_W + GUTTER * 2);
  atlas.height = Math.ceil(signs.length / COLS) * (CELL_H + GUTTER * 2);
  const context = atlas.getContext('2d'),
    families = rules.families;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const position = [],
    uv = [],
    index = [];
  signs.forEach((sign, i) => {
    const ox = (i % COLS) * (CELL_W + GUTTER * 2),
      oy = Math.floor(i / COLS) * (CELL_H + GUTTER * 2),
      family = shopFamily(families, sign.type);
    // El fondo cubre también el margen: el mipmap no mezcla el texto con la celda vecina.
    context.fillStyle = family ? families[family - 1].tone : SHOP_SIGNS.background;
    context.fillRect(ox, oy, CELL_W + GUTTER * 2, CELL_H + GUTTER * 2);
    context.fillStyle = SHOP_SIGNS.text;
    context.fillText(
      fitText(context, sign.name, CELL_W - 16),
      ox + GUTTER + CELL_W / 2,
      oy + GUTTER + CELL_H / 2 + 1,
    );

    const { e } = sign,
      b = world.city.buildings[e.index],
      big =
        groundFloors.building(
          e.index,
          b.floors,
          partArea(b),
          (b.minX + b.maxX) / 2,
          (b.minZ + b.maxZ) / 2,
        ) === 'bigRetail',
      relief = b.detailType === 'street',
      top = b.baseY + (b.renderH ?? b.h);
    let height = big ? SHOP_SIGNS.bigHeight : SHOP_SIGNS.height,
      width = height * ASPECT;
    // En frentes cortos el rótulo se reduce entero para no salirse de la fachada.
    if (width > e.len * 0.9) {
      height *= (e.len * 0.9) / width;
      width = e.len * 0.9;
    }
    const y0 = big
        ? top - SHOP_SIGNS.bigTop - height
        : Math.min(
            b.baseY + (relief ? SHOP_SIGNS.reliefBottom : SHOP_SIGNS.bottom),
            top - height - 0.1,
          ),
      offset = relief ? SHOP_SIGNS.reliefOffset : SHOP_SIGNS.offset,
      along = Math.min(Math.max(sign.t, width / 2), e.len - width / 2),
      dx = (e.q[0] - e.a[0]) / e.len,
      dz = (e.q[1] - e.a[1]) / e.len,
      cx = e.a[0] + dx * along + e.nx * offset,
      cz = e.a[1] + dz * along + e.nz * offset,
      base = position.length / 3;
    // Derecha de quien mira la fachada desde fuera (hacia -n): (nz, -nx). Así el texto se lee
    // de izquierda a derecha sea cual sea el sentido de la arista.
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      const l = (u - 0.5) * width;
      position.push(cx + e.nz * l, y0 + v * height, cz - e.nx * l);
      uv.push(
        (ox + GUTTER + u * CELL_W) / atlas.width,
        1 - (oy + GUTTER + (1 - v) * CELL_H) / atlas.height,
      );
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const texture = new THREE.CanvasTexture(atlas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  mesh.name = 'shop-signs';
  gfx.scene.add(mesh);
  streetEnvironment.shopSigns = signs.length;
}
