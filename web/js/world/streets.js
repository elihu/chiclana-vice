import * as THREE from '../../vendor/three.module.min.js';
import { flatGeometry, mat, mergeParts, modelMaterial } from '../engine/materials.js';
import { gfx, segments, streetEnvironment, waterAreas, world } from '../core/state.js';
import { nearestRoad } from './spatial.js';
import { surfaceTexture } from '../engine/textures.js';
import { drapeTriangles } from '../engine/terrain-drape.js';
import { groundHeightAt } from '../engine/terrain-sampling.js';

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
    water.push({ geometry: flatGeometry(a.p), matrix: at(0, y + heights.water, 0) });
  }
  for (const r of world.city.roads) {
    if (!r.bridge) continue;
    for (let i = 1; i < r.p.length; i++) {
      let a = r.p[i - 1],
        b = r.p[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]),
        angle = Math.atan2(b[0] - a[0], b[1] - a[1]),
        profile = r.bridgeProfile[i - 1],
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
    [water, modelMaterial('#658b80', { metalness: 0.2, roughness: 0.45 }), false],
    [decks, modelMaterial('#b9b5a5'), true],
    [rails, modelMaterial('#b7b9af'), true],
  ]) {
    if (!parts.length) continue;
    let mesh = new THREE.Mesh(mergeParts(parts), material);
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
  let asphalt = surfaceTexture('asphalt'),
    stone = surfaceTexture('stone'),
    slabs = surfaceTexture('slabs');
  let groups = {
    asphalt: { p: [], uv: [], tex: asphalt },
    stone: { p: [], uv: [], tex: stone },
    slabs: { p: [], uv: [], tex: slabs, roughness: 0.98 },
  };
  function tri(g, pts, uv) {
    for (let i of [0, 1, 2, 0, 2, 3]) {
      g.p.push(...pts[i]);
      g.uv.push(...uv[i]);
    }
  }
  for (const road of world.city.roads) {
    if (road.bridge) continue;
    let pedestrian = paved.pedestrianTypes.includes(road.type),
      local = road.p.some(
        (p) => p[0] > roadMinX && p[0] < roadMaxX && p[1] > roadMinZ && p[1] < roadMaxZ,
      );
    if (!local) continue;
    let g = groups[pedestrian ? 'stone' : 'asphalt'],
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
      let p = [
        [a[0] + nx * half, y, a[1] + nz * half],
        [a[0] - nx * half, y, a[1] - nz * half],
        [b[0] - nx * half, y, b[1] - nz * half],
        [b[0] + nx * half, y, b[1] + nz * half],
      ];
      tri(g, p, [
        [0, along / 4],
        [half / 2, along / 4],
        [half / 2, (along + len) / 4],
        [0, (along + len) / 4],
      ]);
      along += len;
      streetEnvironment.surfaces++;
    }
  }
  // Mapped pedestrian squares retain their real polygon outlines.
  for (const a of world.city.areas) {
    if (
      a.kind !== 'square' ||
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
  for (const g of Object.values(groups)) {
    if (!g.p.length) continue;
    let geo = new THREE.BufferGeometry();
    const draped = drapeTriangles(g.p, g.uv);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(draped.position, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(draped.uv, 2));
    geo.computeVertexNormals();
    let mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: g.tex,
        roughness: g.roughness ?? 0.96,
        side: THREE.DoubleSide,
      }),
    );
    mesh.receiveShadow = true;
    gfx.scene.add(mesh);
  }
  // Crossing locations are taken from mapped OSM crossing nodes, not invented intersections.
  const mark = [],
    cross = design.crossings;
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
      for (let i of [0, 1, 2, 0, 2, 3]) mark.push(...pts[i]);
    }
    streetEnvironment.crossings++;
  }
  let mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(drapeTriangles(mark).position, 3));
  mg.computeVertexNormals();
  gfx.scene.add(new THREE.Mesh(mg, mat('#eeeade', { side: THREE.DoubleSide, roughness: 1 })));
}
