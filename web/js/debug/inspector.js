// Modo `?debug`: un toque corto sobre el lienzo muestra coordenadas locales e identificadores
// (edificio, frente, vía OSM, objeto de calle, monumento) y copia fragmentos JSON listos para
// facade-designs.json o map-corrections.json. Solo lo carga app.js con `?debug`; no cambia nada
// del juego ni del arrastre de cámara (oyentes con addEventListener).
import * as THREE from '../../vendor/three.module.min.js';
import { buildingGrid, chunks, facadeWork, gfx, player, world } from '../core/state.js';
import { pInside, pointSeg } from '../core/math.js';
import { sha256Hex } from '../world/corrections.js';
import { groundHeightAt, surfaceHeightAt } from '../engine/terrain-sampling.js';

// Un toque: mismo puntero, menos de 6 px de desplazamiento y menos de 350 ms.
export const TAP_MAX_DISTANCE = 6;
export const TAP_MAX_TIME = 350;
export function isTap(down, up) {
  return (
    down.id === up.id &&
    Math.hypot(up.x - down.x, up.y - down.y) < TAP_MAX_DISTANCE &&
    up.t - down.t < TAP_MAX_TIME
  );
}

const round2 = (v) => Math.round(v * 100) / 100;
// Distancia máxima a la que un punto se asigna a un edificio, a un objeto o a un frente.
const BUILDING_REACH = 3,
  OBJECT_REACH = 3;

// Edificio más cercano al punto (distancia 0 si lo contiene) usando la rejilla espacial del juego.
function findBuilding(x, z) {
  let best = null;
  for (
    let gx = Math.floor((x - BUILDING_REACH) / 25);
    gx <= Math.floor((x + BUILDING_REACH) / 25);
    gx++
  )
    for (
      let gz = Math.floor((z - BUILDING_REACH) / 25);
      gz <= Math.floor((z + BUILDING_REACH) / 25);
      gz++
    )
      for (const b of buildingGrid.get(gx + ',' + gz) || []) {
        let edge = 0,
          edgeDistance = Infinity;
        for (let i = 0; i < b.p.length; i++) {
          const d = pointSeg(x, z, b.p[i], b.p[(i + 1) % b.p.length]).d;
          if (d < edgeDistance) {
            edgeDistance = d;
            edge = i;
          }
        }
        const inside = pInside(x, z, b.p) && !b.holes.some((h) => pInside(x, z, h)),
          distance = inside ? 0 : edgeDistance;
        if (distance <= BUILDING_REACH && (!best || distance < best.distance))
          best = { b, edge, distance };
      }
  return best;
}

function findRoad(x, z) {
  const seen = new Map();
  let best = null;
  for (const r of world.city.roads) {
    const occurrence = seen.get(r.id) ?? 0;
    seen.set(r.id, occurrence + 1);
    for (let i = 1; i < r.p.length; i++) {
      const p = pointSeg(x, z, r.p[i - 1], r.p[i]);
      if (!best || p.d < best.distance)
        best = { r, occurrence, point: p, segment: i - 1, distance: p.d };
    }
  }
  if (!best) return null;
  const { r, occurrence, point, segment } = best,
    vertex = point.u < 0.5 ? segment : segment + 1;
  return {
    id: r.id,
    occurrence,
    name: r.name || '',
    type: r.type,
    width: r.w,
    distance: round2(best.distance),
    nearest: [round2(point.x), round2(point.z)],
    vertex: { index: vertex, p: [...r.p[vertex]] },
  };
}

// Información del punto local (x, z), sin DOM: la usan el panel y los tests.
export function inspectPoint(x, z, y = 0) {
  const info = { point: { x: round2(x), y: round2(y), z: round2(z) } };
  info.terrain = {
    ground: round2(groundHeightAt(x, z)),
    surface: round2(surfaceHeightAt(x, z)),
    referenceElevation: world.terrain?.manifest?.referenceElevation ?? null,
    verticalReference: world.terrain?.manifest?.verticalReference ?? 'plano',
    units: 'y relativa a referencia; x,z locales en metros',
  };
  const hit = findBuilding(x, z);
  if (hit) {
    const index = world.city.buildings.indexOf(hit.b),
      id = `building-${index}-edge-${hit.edge}`;
    info.building = {
      index,
      distance: round2(hit.distance),
      footprintSha256: sha256Hex(JSON.stringify(hit.b.p)),
      detailType: hit.b.detailType || null,
    };
    // Arista más cercana de ese edificio; `catalogued` indica que está en frontages.json.
    info.front = { id, edge: hit.edge, catalogued: facadeWork.fronts.some((f) => f.id === id) };
  } else {
    info.building = null;
    info.front = null;
  }
  info.road = findRoad(x, z);
  let object = null;
  for (const o of world.mappedStreetObjects) {
    const d = Math.hypot(x - o.x, z - o.z);
    if (d <= OBJECT_REACH && (!object || d < object.distance))
      object = { distance: round2(d), x: o.x, z: o.z, tags: { ...o.tags } };
  }
  info.object = object;
  info.landmark =
    world.city.landmarks.find((l) => Array.isArray(l.outline) && pInside(x, z, l.outline))?.name ??
    null;
  return info;
}

// Fragmentos para pegar en los archivos de diseño; el usuario completa lo que falta.
export function fragments(info, today = new Date().toISOString().slice(0, 10)) {
  const anchor = info.building
    ? { front: info.front.id, footprintSha256: info.building.footprintSha256 }
    : null;
  const correction = info.road
    ? {
        id: 'fix-001',
        op: 'road.movePoint',
        road: { id: info.road.id, occurrence: info.road.occurrence },
        index: info.road.vertex.index,
        expect: info.road.vertex.p,
        to: [info.point.x, info.point.z],
        reason: 'COMPLETAR',
        evidence: 'modo ?debug, punto copiado',
        date: today,
      }
    : null;
  return { anchor, correction };
}

function pickPoint(event, scene) {
  const canvas = gfx.renderer.domElement ?? event.target,
    rect = canvas.getBoundingClientRect(),
    ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    ),
    ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, gfx.camera);
  const targets = [...chunks];
  const terrain = scene.getObjectByName('terrain-ground');
  if (terrain) targets.push(terrain);
  const decks = scene.getObjectByName('bridge-decks');
  if (decks) targets.push(decks);
  const facades = scene.getObjectByName('reference-led-facades');
  if (facades) targets.push(facades);
  const hit = ray.intersectObjects(targets, true)[0];
  if (hit) return hit.point;
  if (world.terrain?.kind === 'grid') return null;
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    point = ray.ray.intersectPlane(ground, new THREE.Vector3());
  return point;
}

export function formatInfo(info) {
  const rows = [['Punto', `x ${info.point.x}  y ${info.point.y}  z ${info.point.z}`]];
  if (info.terrain)
    rows.push([
      'Terreno / paso',
      `${info.terrain.ground} / ${info.terrain.surface} m relativos; referencia ${info.terrain.referenceElevation ?? 'plana'} (${info.terrain.verticalReference})`,
    ]);
  rows.push([
    'Edificio',
    info.building
      ? `#${info.building.index} (a ${info.building.distance} m)` +
        (info.building.detailType ? ` · ${info.building.detailType}` : '')
      : 'ninguno a menos de 3 m',
  ]);
  rows.push([
    'Frente',
    info.front ? info.front.id + (info.front.catalogued ? '' : ' (no catalogado)') : '-',
  ]);
  rows.push([
    'Vía OSM',
    info.road
      ? `${info.road.name || '(sin nombre)'} · id ${info.road.id} aparición ${info.road.occurrence}` +
        ` · a ${info.road.distance} m en [${info.road.nearest}]`
      : '-',
  ]);
  rows.push([
    'Objeto de calle',
    info.object ? `${JSON.stringify(info.object.tags)} a ${info.object.distance} m` : '-',
  ]);
  rows.push(['Monumento', info.landmark ?? '-']);
  rows.push([
    'Jugador',
    `x ${round2(player.x)}  z ${round2(player.z)}  rumbo ${round2(((player.a * 180) / Math.PI + 360) % 360)}°`,
  ]);
  return rows;
}

// Crea el panel y los oyentes. `api`: la API de pruebas del juego (createTestApi). `root`: donde
// se añade el panel (document.body por defecto).
export function installInspector(api, { root = document.body } = {}) {
  const make = (tag, className, text) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const panel = make('aside', 'debugPanel'),
    title = make('strong', '', 'Inspector (?debug)'),
    close = make('button', 'debugClose', 'Cerrar'),
    list = make('dl'),
    buttons = make('div', 'debugButtons'),
    copyAnchor = make('button', '', 'Copiar anclaje'),
    copyFix = make('button', '', 'Copiar corrección'),
    output = make('textarea', 'debugOutput');
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Inspector de depuración');
  output.setAttribute('readonly', '');
  output.setAttribute('rows', '5');
  output.setAttribute('aria-label', 'Fragmento JSON copiado');
  panel.hidden = true;
  for (const e of [title, close, list, buttons, output]) panel.appendChild(e);
  buttons.appendChild(copyAnchor);
  buttons.appendChild(copyFix);
  root.appendChild(panel);

  let current = null;
  const show = (info) => {
    current = info;
    list.replaceChildren?.();
    for (const [label, value] of formatInfo(info)) {
      list.appendChild(make('dt', '', label));
      list.appendChild(make('dd', '', value));
    }
    output.value = '';
    panel.hidden = false;
  };
  // Copia al portapapeles si el contexto lo permite; el texto queda además visible para copiarlo a mano.
  const copy = async (fragment) => {
    if (!fragment) return void (output.value = 'No hay datos suficientes en este punto.');
    const text = JSON.stringify(fragment, null, 2);
    output.value = text;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* sin permiso o contexto no seguro: queda el cuadro de texto */
    }
  };
  copyAnchor.addEventListener('click', () => current && copy(fragments(current).anchor));
  copyFix.addEventListener('click', () => current && copy(fragments(current).correction));
  close.addEventListener('click', () => {
    panel.hidden = true;
  });

  const canvas = gfx.renderer?.domElement ?? document.getElementById('world');
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointerup', (e) => {
    const start = down;
    down = null;
    if (
      !start ||
      !isTap(start, { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() })
    )
      return;
    const point = pickPoint(e, api.scene);
    if (point) show(inspectPoint(point.x, point.z, point.y));
  });
  canvas.addEventListener('pointercancel', () => {
    down = null;
  });
  return { panel, show };
}
