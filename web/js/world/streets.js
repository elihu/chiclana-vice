import * as THREE from '../../vendor/three.webgpu.min.js';
import { flatGeometry, mat, mergeParts, modelMaterial } from '../engine/materials.js';
import { shoreGeometry, waterMaterial } from '../engine/water.js';
import { gfx, segments, streetEnvironment, waterAreas, world } from '../core/state.js';
import { nearestRoad } from './spatial.js';
import { buildSidewalks } from './sidewalks.js';
import { createRoadSpace, carvePavement, roundaboutIslands, hatchPavement } from './road-space.js';
import { applyGroundDetail, surfaceTexture } from '../engine/textures.js';
import { drapeTriangles } from '../engine/terrain-drape.js';
import { groundHeightAt, surfaceHeightAt } from '../engine/terrain-sampling.js';
import { pInside, boundaryDistance } from '../core/math.js';

// `heightAt(x, z)`: cota absoluta de la cara superior en cada vértice (plano inclinado en las
// plataformas de perfil lineal). La cara inferior y los laterales bajan `thickness`.
function platformGeometry(polygon, thickness, heightAt) {
  const top = flatGeometry(polygon),
    flat = top.toNonIndexed(),
    a = flat.getAttribute('position').array,
    positions = [];
  for (let i = 0; i < a.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const x = a[i + k * 3],
        z = a[i + k * 3 + 2];
      positions.push(x, heightAt(x, z), z);
    }
    for (const k of [2, 1, 0]) {
      const x = a[i + k * 3],
        z = a[i + k * 3 + 2];
      positions.push(x, heightAt(x, z) - thickness, z);
    }
  }
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i],
      q = polygon[(i + 1) % polygon.length],
      v = [
        [p[0], heightAt(...p), p[1]],
        [q[0], heightAt(...q), q[1]],
        [q[0], heightAt(...q) - thickness, q[1]],
        [p[0], heightAt(...p) - thickness, p[1]],
      ];
    for (const k of [0, 1, 2, 0, 2, 3]) positions.push(...v[k]);
  }
  top.dispose();
  flat.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

export function buildRoadDetails() {
  // Reglas y alturas de capa en web/city-design.json (secciones `centerLines` y `pavements`).
  const line = world.cityDesign.centerLines,
    heights = world.cityDesign.pavements.layerHeights,
    positions = [],
    colors = [];
  let c = new THREE.Color('#e8e0cb');
  for (const s of segments) {
    if (!s.drive || s.width < line.minimumWidth || s.length < line.minimumLength) continue;
    let dx = (s.b[0] - s.a[0]) / s.length,
      dz = (s.b[1] - s.a[1]) / s.length;
    for (let at = line.start; at < s.length - line.endMargin; at += line.spacing) {
      let x = s.a[0] + dx * at,
        z = s.a[1] + dz * at,
        e = Math.min(line.dash, s.length - at);
      let p = [
        [x - dz * line.halfWidth, heights.centerLine, z + dx * line.halfWidth],
        [x + dz * line.halfWidth, heights.centerLine, z - dx * line.halfWidth],
        [x + dx * e + dz * line.halfWidth, heights.centerLine, z + dz * e - dx * line.halfWidth],
        [x + dx * e - dz * line.halfWidth, heights.centerLine, z + dz * e + dx * line.halfWidth],
      ];
      for (let i of [0, 1, 2, 0, 2, 3]) {
        positions.push(...p[i]);
        colors.push(c.r, c.g, c.b);
      }
    }
  }
  let geom = new THREE.BufferGeometry();
  geom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(drapeTriangles(positions).position, 3),
  );
  geom.computeVertexNormals();
  gfx.scene.add(
    new THREE.Mesh(
      geom,
      mat(line.color, { side: THREE.DoubleSide, transparent: true, opacity: line.opacity }),
    ),
  );
  // Retain actual river outline and actual mapped bridges. Static pieces share one
  // cached material per colour and are merged into one mesh per material.
  const water = [],
    decks = [],
    rails = [],
    at = (x, y, z, angle = 0) => new THREE.Matrix4().makeRotationY(angle).setPosition(x, y, z);
  for (const a of waterAreas) {
    // Aproximación visual por tramo: lámina horizontal en la cota mínima del borde.
    const y = world.terrain.kind === 'flat' ? 0 : Math.min(...a.p.map((p) => groundHeightAt(...p)));
    let geometry = flatGeometry(a.p);
    const basin = world.surfaces?.basins.find((b) => b.area === a);
    if (world.surfaces && !basin) {
      const positions = geometry.toNonIndexed().getAttribute('position').array;
      geometry.dispose();
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          drapeTriangles(positions, null, (x, z) => world.surfaces.waterHeightAt(x, z, a)).position,
          3,
        ),
      );
      geometry.computeVertexNormals();
    }
    water.push({
      geometry: shoreGeometry(geometry, a.p),
      matrix: at(
        0,
        basin ? basin.y + heights.water : world.surfaces ? heights.water : y + heights.water,
        0,
      ),
    });
  }
  for (const p of world.surfaces?.platforms || []) {
    decks.push({
      geometry: platformGeometry(p.polygon, p.thickness, p.heightAt),
      matrix: at(0, heights.deck, 0),
    });
  }
  for (const r of world.city.roads) {
    if (!r.bridge) continue;
    const pieces =
      world.surfaces?.profiles.get(r.id) ??
      r.p.slice(1).map((b, i) => ({ a: r.p[i], b, y0: 0, y1: 0 }));
    for (const piece of pieces) {
      const middle = [(piece.a[0] + piece.b[0]) / 2, (piece.a[1] + piece.b[1]) / 2];
      if (
        world.surfaces?.platforms.some(
          (p) =>
            p.deckRoads.includes(r.id) &&
            (pInside(...middle, p.polygon) || boundaryDistance(...middle, p.polygon) < 0.05),
        )
      )
        continue;
      let a = piece.a,
        b = piece.b,
        length = Math.hypot(b[0] - a[0], b[1] - a[1]),
        angle = Math.atan2(b[0] - a[0], b[1] - a[1]),
        profile = piece,
        y = profile ? (profile.y0 + profile.y1) / 2 : 0,
        slope = profile ? -Math.atan2(profile.y1 - profile.y0, length) : 0,
        matrix = (x, yy, z) =>
          new THREE.Matrix4()
            .makeRotationFromEuler(new THREE.Euler(slope, angle, 0, 'YXZ'))
            .setPosition(x, yy, z);
      decks.push({
        geometry: new THREE.BoxGeometry(
          r.w,
          0.12,
          Math.hypot(length, profile ? profile.y1 - profile.y0 : 0),
        ),
        matrix: matrix((a[0] + b[0]) / 2, y + heights.deck, (a[1] + b[1]) / 2),
      });
      for (let side of [-1, 1])
        rails.push({
          geometry: new THREE.BoxGeometry(
            0.12,
            0.12,
            Math.hypot(length, profile ? profile.y1 - profile.y0 : 0),
          ),
          matrix: matrix(
            (a[0] + b[0]) / 2 + ((Math.cos(angle) * r.w) / 2) * side,
            y + heights.railing,
            (a[1] + b[1]) / 2 - ((Math.sin(angle) * r.w) / 2) * side,
          ),
        });
    }
  }
  for (const [parts, material, cast] of [
    [water, waterMaterial(), false],
    [decks, modelMaterial('#b9b5a5'), true],
    [rails, modelMaterial('#b7b9af'), false],
  ]) {
    if (!parts.length) continue;
    let mesh = new THREE.Mesh(mergeParts(parts, parts === water ? ['shore'] : []), material);
    mesh.name = parts === decks ? 'bridge-decks' : parts === water ? 'river-water' : 'bridge-rails';
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    gfx.scene.add(mesh);
    for (const p of parts) p.geometry.dispose();
  }
}

export function buildStreetSurfaces() {
  const design = world.cityDesign,
    paved = design.pavements,
    heights = paved.layerHeights,
    [roadMinX, roadMaxX, roadMinZ, roadMaxZ] = design.zones.pavedRoads,
    [squareMinX, squareMaxX, squareMinZ, squareMaxZ] = design.zones.pavedSquares;
  const space = createRoadSpace(
    world.city.roads,
    paved.nonDrivableTypes,
    (x, z, id) => surfaceHeightAt(x, z, null, id),
    true,
  );
  let asphalt = surfaceTexture('asphalt'),
    stone = surfaceTexture('stone'),
    slabs = surfaceTexture('slabs');
  let groups = {
    asphalt: { p: [], uv: [], tex: asphalt },
    stone: { p: [], uv: [], tex: stone },
    slabs: { p: [], uv: [], tex: slabs, roughness: 0.98 },
  };
  const bands = Object.fromEntries(
    Object.entries(groups).map(([k, g]) => [k, { ...g, p: [], uv: [] }]),
  );
  // Completar separadores como calzada con pintura, sin una caja elevada ni baldosa.
  const dividerPositions = [],
    dividerUV = [],
    dividerSpace = createRoadSpace(world.city.roads, paved.nonDrivableTypes, null, true);
  let paintedDividers = 0;
  for (const face of world.surfaces?.dividers ?? []) {
    const indexed = flatGeometry(face.polygon),
      flat = indexed.toNonIndexed(),
      position = [...flat.getAttribute('position').array],
      uv = position.flatMap((_, i) => (i % 3 ? [] : [position[i] / 4, -position[i + 2] / 4]));
    indexed.dispose();
    flat.dispose();
    const cut = carvePavement(position, uv, dividerSpace, (x, z) => surfaceHeightAt(x, z)),
      draped = drapeTriangles(cut.position, cut.uv, (x, z) =>
        Math.max(surfaceHeightAt(x, z), groundHeightAt(x, z)),
      );
    const before = dividerPositions.length;
    for (let i = 0; i < draped.position.length; i += 9) {
      const x = (draped.position[i] + draped.position[i + 3] + draped.position[i + 6]) / 3,
        z = (draped.position[i + 2] + draped.position[i + 5] + draped.position[i + 8]) / 3;
      if (world.surfaces.dividerHeightAt(x, z) === null) continue;
      for (let k = 0; k < 9; k++)
        dividerPositions.push(draped.position[i + k] + (k % 3 === 1 ? heights.asphalt : 0));
      dividerUV.push(...draped.uv.slice((i / 3) * 2, (i / 3) * 2 + 6));
    }
    if (dividerPositions.length > before) paintedDividers++;
  }
  if (dividerPositions.length) {
    groups.asphalt.p = groups.asphalt.p.concat(dividerPositions);
    groups.asphalt.uv = groups.asphalt.uv.concat(dividerUV);
    const paint = hatchPavement(dividerPositions).map((v, i) => v + (i % 3 === 1 ? 0.006 : 0)),
      marks = new THREE.BufferGeometry();
    marks.setAttribute('position', new THREE.Float32BufferAttribute(paint, 3));
    marks.computeVertexNormals();
    const stripes = new THREE.Mesh(
      marks,
      mat('#eee9dc', { roughness: 0.95, side: THREE.DoubleSide }),
    );
    stripes.name = 'road-divider-hatching';
    stripes.receiveShadow = true;
    gfx.scene.add(stripes);
  }
  streetEnvironment.paintedDividers = paintedDividers;
  for (const platform of world.surfaces?.platforms || [])
    for (const band of platform.bands) {
      const original = flatGeometry(band.polygon),
        geo = original.toNonIndexed(),
        output = bands[band.material];
      original.dispose();
      const a = geo.getAttribute('position');
      for (let i = 0; i < a.count; i++) {
        output.p.push(
          a.getX(i),
          platform.heightAt(a.getX(i), a.getZ(i)) + heights.slabs,
          a.getZ(i),
        );
        output.uv.push(a.getX(i) / 4, -a.getZ(i) / 4);
      }
      geo.dispose();
    }
  const localRoad = (road) =>
    road.p.some((p) => p[0] > roadMinX && p[0] < roadMaxX && p[1] > roadMinZ && p[1] < roadMaxZ);
  function tri(g, pts, uv) {
    for (let i of [0, 1, 2, 0, 2, 3]) {
      g.p.push(...pts[i]);
      g.uv.push(...uv[i]);
    }
  }
  for (const road of world.city.roads) {
    if (road.bridge && !world.surfaces) continue;
    let pedestrian = paved.pedestrianTypes.includes(road.type);
    if (!world.surfaces && !localRoad(road)) continue;
    let output = groups[pedestrian ? 'stone' : 'asphalt'],
      g = world.surfaces ? { p: [], uv: [] } : output,
      along = 0;
    for (let i = 1; i < road.p.length; i++) {
      let a = road.p[i - 1],
        b = road.p[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      let nx = -dz / len,
        nz = dx / len,
        half = Math.max(paved.minimumHalfWidth, road.w / 2),
        y = pedestrian ? heights.stone : heights.asphalt;
      const count = world.surfaces
        ? Math.max(1, Math.ceil(len / world.cityDesign.terrainSurfaces.roads.pavementStep))
        : 1;
      for (let k = 0; k < count; k++) {
        const aa = [a[0] + (dx * k) / count, a[1] + (dz * k) / count],
          bb = [a[0] + (dx * (k + 1)) / count, a[1] + (dz * (k + 1)) / count];
        let p = [
          [aa[0] + nx * half, y, aa[1] + nz * half],
          [aa[0] - nx * half, y, aa[1] - nz * half],
          [bb[0] - nx * half, y, bb[1] - nz * half],
          [bb[0] + nx * half, y, bb[1] + nz * half],
        ];
        tri(g, p, [
          [0, (along + (len * k) / count) / 4],
          [half / 2, (along + (len * k) / count) / 4],
          [half / 2, (along + (len * (k + 1)) / count) / 4],
          [0, (along + (len * (k + 1)) / count) / 4],
        ]);
      }
      // Cuña exterior en cada quiebro de la polilínea: sin ella, cada tramo termina en un corte
      // recto y queda un triángulo sin asfalto (se ve la ortofoto) en el lado de fuera.
      if (i > 1) {
        const px = a[0] - road.p[i - 2][0],
          pz = a[1] - road.p[i - 2][1],
          plen = Math.hypot(px, pz);
        if (plen >= 0.1) {
          const pnx = -pz / plen,
            pnz = px / plen;
          for (const side of [1, -1]) {
            const c1 = [a[0] + pnx * half * side, a[1] + pnz * half * side],
              c2 = [a[0] + nx * half * side, a[1] + nz * half * side];
            // Hueco solo si la esquina del tramo nuevo queda por delante del corte del anterior.
            if (((c2[0] - c1[0]) * px + (c2[1] - c1[1]) * pz) / plen < 0.01) continue;
            const corners = [
              [a, half / 4],
              [c1, side > 0 ? 0 : half / 2],
              [c2, side > 0 ? 0 : half / 2],
            ];
            // Mismo sentido de giro que los rectángulos (normal hacia abajo, como ellos).
            if ((c1[1] - a[1]) * (c2[0] - a[0]) - (c1[0] - a[0]) * (c2[1] - a[1]) > 0)
              corners.push(corners.splice(1, 1)[0]);
            for (const [point, u] of corners) {
              g.p.push(point[0], y, point[1]);
              g.uv.push(u, along / 4);
            }
          }
        }
      }
      along += len;
      streetEnvironment.surfaces++;
    }
    if (pedestrian) {
      const cut = carvePavement(g.p, g.uv, space, (x, z) => surfaceHeightAt(x, z, null, road.id));
      g.p = cut.position;
      g.uv = cut.uv;
    }
    if (world.surfaces) {
      const mesh = drapeTriangles(g.p, g.uv, (x, z) => surfaceHeightAt(x, z, null, road.id));
      for (let i = 0; i < mesh.position.length; i += 9) {
        const x = (mesh.position[i] + mesh.position[i + 3] + mesh.position[i + 6]) / 3,
          z = (mesh.position[i + 2] + mesh.position[i + 5] + mesh.position[i + 8]) / 3;
        if (pedestrian && world.surfaces.dividerHeightAt(x, z) !== null) continue;
        output.p.push(...mesh.position.slice(i, i + 9));
        output.uv.push(...mesh.uv.slice((i / 3) * 2, (i / 3) * 2 + 6));
      }
    }
  }
  // Aceras con bordillo (visual; ver sidewalks.js). Con terreno de rejilla sin modelo de
  // superficies no hay cota de calzada que seguir, y no se dibujan.
  if (world.surfaces || world.terrain?.kind !== 'grid') {
    const sidewalk = { p: [], uv: [] };
    buildSidewalks(sidewalk, paved, (road) => world.surfaces || localRoad(road));
    const cut = carvePavement(sidewalk.p, sidewalk.uv, space, (x, z) => surfaceHeightAt(x, z));
    bands.slabs.p = bands.slabs.p.concat(cut.position);
    bands.slabs.uv = bands.slabs.uv.concat(cut.uv);
  }
  const islands = roundaboutIslands(world.city.roads),
    islandParts = [];
  for (const island of islands) {
    islandParts.push({
      geometry: platformGeometry(island.polygon, 0.12, (x, z) => surfaceHeightAt(x, z) + 0.12),
      matrix: new THREE.Matrix4(),
    });
  }
  if (islandParts.length) {
    const mesh = new THREE.Mesh(mergeParts(islandParts), mat('#b7b2a0', { roughness: 0.95 }));
    mesh.name = 'roundabout-islands';
    mesh.receiveShadow = true;
    gfx.scene.add(mesh);
  }
  streetEnvironment.roundabouts = islands.length;
  // Mapped pedestrian squares retain their real polygon outlines.
  // Evita pavimento duplicado cuando >80% del contorno coincide con un tablero;
  // 3 m tolera el margen de acera entre dos huellas de una misma plaza. Son criterios
  // de deduplicación visual, no un cambio de cotas, contornos ni transitabilidad.
  for (const a of world.city.areas) {
    if (
      world.surfaces?.platforms.some(
        (p) =>
          p.area === a ||
          (a.kind === 'square' &&
            a.p.filter((q) => pInside(...q, p.polygon) || boundaryDistance(...q, p.polygon) < 3)
              .length /
              a.p.length >
              0.8),
      )
    )
      continue;
    // Con relieve se pavimentan todas las plazas; `zones.pavedSquares` solo limita el modo
    // sin modelo de superficies (escena anterior).
    if (a.kind !== 'square') continue;
    if (
      !world.surfaces &&
      !a.p.some(
        (p) => p[0] > squareMinX && p[0] < squareMaxX && p[1] > squareMinZ && p[1] < squareMaxZ,
      )
    )
      continue;
    // All squares share the slab material and one merged mesh.
    let geo = flatGeometry(a.p),
      p = geo.getAttribute('position'),
      index = geo.index;
    for (let i = 0; i < index.count; i++) {
      let k = index.getX(i),
        x = p.getX(k),
        z = p.getZ(k);
      groups.slabs.p.push(x, heights.slabs + p.getY(k), z);
      groups.slabs.uv.push(x / 4, -z / 4);
    }
    geo.dispose();
    streetEnvironment.surfaces++;
  }
  const squares = carvePavement(groups.slabs.p, groups.slabs.uv, space, (x, z) =>
    surfaceHeightAt(x, z),
  );
  groups.slabs.p = squares.position;
  groups.slabs.uv = squares.uv;
  for (const g of [...Object.values(groups), ...Object.values(bands)]) {
    if (!g.p.length) continue;
    let geo = new THREE.BufferGeometry();
    const draped =
      (world.surfaces && g !== groups.slabs) || Object.values(bands).includes(g)
        ? { position: g.p, uv: g.uv }
        : drapeTriangles(g.p, g.uv);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(draped.position, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(draped.uv, 2));
    geo.computeVertexNormals();
    let mesh = new THREE.Mesh(
      geo,
      applyGroundDetail(
        new THREE.MeshStandardNodeMaterial({
          map: g.tex,
          roughness: g.roughness ?? 0.96,
          side: THREE.DoubleSide,
        }),
      ),
    );
    if (g === groups.asphalt) mesh.name = 'street-asphalt';
    mesh.receiveShadow = true;
    gfx.scene.add(mesh);
  }
  // Crossing locations are taken from mapped OSM crossing nodes, not invented intersections.
  const mark = [],
    cross = design.crossings;
  // Cada paso se asienta con la cota de su calzada (no la del MDT), como el resto de capas.
  for (const p of world.mappedStreetObjects) {
    if (p.tags.highway !== 'crossing') continue;
    let near = nearestRoad(p.x, p.z, true);
    if (
      !near ||
      near.d > cross.maximumDistance ||
      near.s.bridge ||
      near.s.width < cross.minimumRoadWidth
    )
      continue;
    const stripes = [];
    let s = near.s,
      dx = (s.b[0] - s.a[0]) / s.length,
      dz = (s.b[1] - s.a[1]) / s.length,
      half = s.width * cross.halfWidthFactor;
    for (
      let across = -half + cross.edgeStart;
      across < half - cross.edgeEnd;
      across += cross.stripeSpacing
    ) {
      let x = p.x - dz * across,
        z = p.z + dx * across,
        ww = cross.stripeWidth,
        ll = cross.stripeHalfLength;
      let pts = [
        [x - (dz * ww) / 2 - dx * ll, heights.crossing, z + (dx * ww) / 2 - dz * ll],
        [x + (dz * ww) / 2 - dx * ll, heights.crossing, z - (dx * ww) / 2 - dz * ll],
        [x + (dz * ww) / 2 + dx * ll, heights.crossing, z - (dx * ww) / 2 + dz * ll],
        [x - (dz * ww) / 2 + dx * ll, heights.crossing, z + (dx * ww) / 2 + dz * ll],
      ];
      for (let i of [0, 1, 2, 0, 2, 3]) stripes.push(...pts[i]);
    }
    mark.push(
      ...drapeTriangles(stripes, null, (x, z) => surfaceHeightAt(x, z, null, s.roadId)).position,
    );
    streetEnvironment.crossings++;
  }
  let mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(mark, 3));
  mg.computeVertexNormals();
  gfx.scene.add(new THREE.Mesh(mg, mat('#eeeade', { side: THREE.DoubleSide, roughness: 1 })));
}
