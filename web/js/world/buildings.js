import { aerialMaterial, aerialTint, tileKey } from './aerial-tiles.js';
import * as THREE from '../../vendor/three.webgpu.min.js';
import { chunks, gfx, world } from '../core/state.js';
import { facadeTexture } from '../engine/textures.js';
import { wallMaterial } from '../engine/wall-ao.js';
import { loadProgress } from '../ui/feedback.js';
import { sleepFrame } from '../core/dom.js';
import { groundHeightAt } from '../engine/terrain-sampling.js';
import { terrainEdge } from '../engine/terrain-drape.js';
import { edgeKey, sharedWallSpans } from './party-walls.js';

export async function buildBuildings() {
  // UV de tejados en el recuadro de la ortofoto.
  const [ax0, ax1, az0, az1] = world.aerialBox,
    aw = ax1 - ax0,
    ah = az1 - az0;
  const roofMaterials = new Map(),
    overflow = { r: [], ru: [], parts: 0 };
  const { tile: tileSize, margin } = world.aerialIndex ?? { tile: 255, margin: 20.5 };
  let groups = new Map(),
    facade = facadeTexture(),
    wallMat = wallMaterial({
      map: facade,
      vertexColors: true,
      roughness: 0.94,
      side: THREE.DoubleSide,
    }),
    roofMat = new THREE.MeshStandardMaterial({
      ...(world.groundTexture
        ? { map: world.groundTexture, color: aerialTint() }
        : { color: '#b4a58f' }),
      roughness: 0.98,
      side: THREE.DoubleSide,
    }),
    plainWallMat = wallMaterial({
      vertexColors: true,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
  // Paleta, colores por tipo, alturas mínimas y escala UV en web/city-design.json (`buildings`).
  const rules = world.cityDesign.buildings,
    palette = rules.palette;
  function bucket(b) {
    let cx = (b.minX + b.maxX) / 2,
      cz = (b.minZ + b.maxZ) / 2,
      k = Math.floor(cx / 85) + ',' + Math.floor(cz / 85);
    if (!groups.has(k))
      groups.set(k, {
        w: [],
        wu: [],
        wc: [],
        wh: [],
        dw: [],
        dwu: [],
        dwc: [],
        dwh: [],
        r: [],
        ru: [],
        i: Math.floor(Math.floor(cx / 85) / 3),
        j: Math.floor(Math.floor(cz / 85) / 3),
      });
    return groups.get(k);
  }
  const floorHeight = world.facadeProfiles.heightPolicy.floorHeight,
    wallBase = world.terrain.kind === 'flat' ? 0.02 : -0.08;
  // Muro con ventanas entre los puntos a y q de una arista; u0 es la coordenada U de a.
  function windowWall(g, b, col, h, a0, q0, u0, uScale) {
    const edge = terrainEdge(a0, q0),
      out = b.detailType ? [g.dw, g.dwu, g.dwc, g.dwh] : [g.w, g.wu, g.wc, g.wh];
    let u = u0;
    for (let k = 1; k < edge.length; k++) {
      const a = edge[k - 1],
        q = edge[k],
        len = Math.hypot(q[0] - a[0], q[1] - a[1]),
        u1 = u + len * uScale;
      if (len >= 0.1) {
        const ground0 = groundHeightAt(...a),
          ground1 = groundHeightAt(...q),
          vertices = [
            [a[0], ground0 + wallBase, a[1]],
            [q[0], ground1 + wallBase, q[1]],
            [q[0], b.baseY + h, q[1]],
            [a[0], b.baseY + h, a[1]],
          ],
          uvs = b.detailType
            ? [
                [0, 0],
                [len / rules.wallUvWidth, 0],
                [len / rules.wallUvWidth, h / floorHeight],
                [0, h / floorHeight],
              ]
            : vertices.map((vertex, j) => [
                j === 0 || j === 3 ? u : u1,
                (vertex[1] - b.baseY) / floorHeight,
              ]);
        for (const j of [0, 1, 2, 0, 2, 3]) {
          out[0].push(...vertices[j]);
          out[1].push(...uvs[j]);
          out[2].push(col.r, col.g, col.b);
          // Altura sobre el suelo del vértice (para la oclusión ambiental de la base).
          out[3].push(vertices[j][1] - (j === 0 || j === 3 ? ground0 : ground1));
        }
      }
      u = u1;
    }
  }
  // Medianera: un cuadrilátero liso desde el tejado vecino (5 cm por debajo, sin rendija)
  // hasta el propio. Va en la misma malla que su muro para no añadir llamadas de dibujo: en
  // los muros con ventanas toma un texel fijo del enlucido de la textura (UV constante, sin
  // derivadas: siempre el nivel 0, sin mezclar ventanas a distancia).
  const PLASTER_UV = [0.06, 0.94];
  function partyWall(g, b, color, a, q, bottom, top) {
    const vertices = [
        [a[0], bottom - 0.05, a[1]],
        [q[0], bottom - 0.05, q[1]],
        [q[0], top, q[1]],
        [a[0], top, a[1]],
      ],
      out = b.detailType ? [g.dw, g.dwu, g.dwc, g.dwh] : [g.w, g.wu, g.wc, g.wh];
    for (const j of [0, 1, 2, 0, 2, 3]) {
      out[0].push(...vertices[j]);
      out[1].push(...PLASTER_UV);
      out[2].push(color.r, color.g, color.b);
      out[3].push(vertices[j][1] - groundHeightAt(vertices[j][0], vertices[j][2]));
    }
  }

  // Altura de render de todos los edificios antes de los muros: un muro compartido necesita
  // la cota del tejado vecino.
  for (const b of world.city.buildings) {
    let h = b.visualH ?? b.h,
      cx = (b.minX + b.maxX) / 2,
      cz = (b.minZ + b.maxZ) / 2;
    for (const m of rules.minimumHeights)
      if (
        m.center
          ? Math.hypot(cx - m.center[0], cz - m.center[1]) < m.radius
          : b.detailType === m.detailType && b.floors >= m.minimumFloors
      )
        h = Math.max(h, m.height);
    b.renderH = h;
  }
  // Muro compartido con un vecino: oculto hasta su tejado, medianera ciega por encima.
  const shared = sharedWallSpans(
      world.city.buildings,
      world.city.buildings.map((b) => b.baseY + b.renderH),
    ),
    partyTint = new THREE.Color(rules.partyWall.color),
    stats = { hiddenArea: 0, partyArea: 0 };
  world.wallStats = stats;

  let count = 0;
  for (const [index, b] of world.city.buildings.entries()) {
    let g = bucket(b),
      h = b.renderH,
      top = b.baseY + h;
    if (!Number.isInteger(b.paletteIndex) || b.paletteIndex < 0 || b.paletteIndex >= palette.length)
      throw Error('Índice de paleta de edificio incompatible; regenera buildings.json');
    let col = new THREE.Color(
        b.detailType ? rules.detailColors[b.detailType] : palette[b.paletteIndex],
      ),
      partyCol = col.clone().lerp(partyTint, rules.partyWall.blend);
    [b.p, ...b.holes].forEach((ring, ringIndex) => {
      for (let i = 0; i < ring.length; i++) {
        const start = ring[i],
          end = ring[(i + 1) % ring.length],
          length = Math.hypot(end[0] - start[0], end[1] - start[1]),
          bays = Math.max(1, Math.round(length / rules.wallUvWidth)),
          uScale = length > 0 ? bays / length : 0,
          spans = shared.get(edgeKey(index, ringIndex, i));
        if (!spans) {
          windowWall(g, b, col, h, start, end, 0, uScale);
          continue;
        }
        const at = (t) => [
          start[0] + ((end[0] - start[0]) * t) / length,
          start[1] + ((end[1] - start[1]) * t) / length,
        ];
        for (const { t0, t1, cover } of spans) {
          const a = at(t0),
            q = at(t1),
            ground = Math.min(groundHeightAt(...a), groundHeightAt(...q));
          if (cover >= top - 0.01) stats.hiddenArea += (t1 - t0) * (top - ground);
          else if (cover > ground + 0.3) {
            stats.hiddenArea += (t1 - t0) * (cover - ground);
            stats.partyArea += (t1 - t0) * (top - cover);
            partyWall(g, b, partyCol, a, q, cover, top);
          } else windowWall(g, b, col, h, a, q, t0 * uScale, uScale);
        }
      }
    });
    let outer = b.p.map((p) => new THREE.Vector2(...p)),
      holes = b.holes.map((r) => r.map((p) => new THREE.Vector2(...p))),
      all = [...outer, ...holes.flat()],
      tris = THREE.ShapeUtils.triangulateShape(outer, holes);
    const fits =
      b.minX >= g.i * tileSize - margin &&
      b.maxX <= (g.i + 1) * tileSize + margin &&
      b.minZ >= g.j * tileSize - margin &&
      b.maxZ <= (g.j + 1) * tileSize + margin;
    const roofs = fits ? g : overflow;
    if (!fits) overflow.parts++;
    for (const tr of tris)
      for (const i of tr) {
        let p = all[i];
        roofs.r.push(p.x, b.baseY + h + 0.02, p.y);
        roofs.ru.push((p.x - ax0) / aw, 1 - (p.y - az0) / ah);
      }
    if (++count % 900 === 0) {
      loadProgress(
        'Reconstruyendo las manzanas y los patios…',
        30 + (count / world.city.buildings.length) * 25,
      );
      await sleepFrame();
    }
  }
  for (const g of [...groups.values(), overflow]) {
    const key = tileKey(g.i, g.j);
    if (g !== overflow && !roofMaterials.has(key))
      roofMaterials.set(
        key,
        aerialMaterial(g.i, g.j, { roughness: 0.98, side: THREE.DoubleSide }, '#b4a58f'),
      );
    let group = new THREE.Group();
    for (const [name, pos, uv, colors, material, hag] of [
      ['building-walls', g.w, g.wu, g.wc, wallMat, g.wh],
      ['building-plain-walls', g.dw, g.dwu, g.dwc, plainWallMat, g.dwh],
      ['building-roofs', g.r, g.ru, null, g === overflow ? roofMat : roofMaterials.get(key)],
    ]) {
      if (!pos?.length) continue;
      let geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      if (hag) geo.setAttribute('hag', new THREE.Float32BufferAttribute(hag, 1));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      let mesh = new THREE.Mesh(geo, material);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (g === overflow) {
      group.name = 'aerial-roofs-general';
      group.userData.parts = overflow.parts;
    }
    gfx.scene.add(group);
    chunks.push(group);
  }
}
