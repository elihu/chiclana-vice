// Modo `?debug`: un toque corto sobre el lienzo muestra coordenadas locales e identificadores
// (edificio, frente, vía OSM, objeto de calle, monumento) y copia fragmentos JSON listos para
// facade-designs.json o map-corrections.json. Solo lo carga app.js con `?debug`; no cambia nada
// del juego ni del arrastre de cámara (oyentes con addEventListener).
import * as THREE from '../../vendor/three.webgpu.min.js';
import { buildingGrid, chunks, facadeWork, gfx, player, world } from '../core/state.js';
import { pInside, pointSeg } from '../core/math.js';
import { sha256Hex } from '../world/corrections.js';
import { groundHeightAt, surfaceHeightAt } from '../engine/terrain-sampling.js';
import { setAerialTint } from '../world/aerial-tiles.js';
import { setGroundDetail } from '../engine/textures.js';

export function adjustLight({ exposure, hemi, sun, aerial, detail } = {}) {
  for (const [name, value] of Object.entries({ exposure, hemi, sun, aerial }))
    if (
      value !== undefined &&
      (!Number.isFinite(value) || value < 0 || (name === 'aerial' && value > 1))
    )
      throw Error(`Parámetro de luz inválido: ${name}`);
  if (detail !== undefined) setGroundDetail(detail);
  if (exposure !== undefined) gfx.renderer.toneMappingExposure = exposure;
  if (hemi !== undefined)
    gfx.scene.traverse((object) => {
      if (object.isHemisphereLight) object.intensity = hemi;
    });
  if (sun !== undefined) gfx.sun.intensity = sun;
  if (aerial !== undefined)
    setAerialTint(new THREE.Color().setRGB(aerial, aerial, aerial, THREE.SRGBColorSpace));
  gfx.needsRender = true;
}

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
    raw: world.surfaces ? round2(world.surfaces.rawHeightAt(x, z)) : null,
    platforms:
      world.surfaces?.platforms
        .filter((p) => pInside(x, z, p.polygon))
        .map((p) => ({
          id: p.id,
          height: round2(p.heightAt(x, z)),
          clearance: p.clearance,
          lowerRoads: p.lowerRoads,
          evidence: p.evidence,
        })) ?? [],
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
  window.__luz = adjustLight;
  const params = new URLSearchParams(globalThis.location?.search ?? ''),
    light = {};
  for (const name of ['exposure', 'hemi', 'sun', 'aerial', 'detail'])
    if (params.has(name))
      light[name] =
        name === 'detail' ? { strength: Number(params.get(name)) } : Number(params.get(name));
  adjustLight(light);
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
  const selectTree = installTreeReview(root, api.scene);

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
    if (point) {
      if (!selectTree(point)) show(inspectPoint(point.x, point.z, point.y));
    }
  });
  canvas.addEventListener('pointercancel', () => {
    down = null;
  });
  return { panel, show };
}

// Archivos locales de revisión: no se solicitan desde web/ ni afectan al mundo jugable.
export function validateTreeReview(review, candidates, fingerprint) {
  if (review?.version !== 1 || review.candidatesSha256 !== fingerprint)
    throw Error('La revisión corresponde a otra instantánea de candidatos.');
  if (!Array.isArray(review.acceptedZones) || !Array.isArray(review.excludedCandidates))
    throw Error('Zonas y exclusiones deben ser listas.');
  const ids = new Set(candidates.map((c) => c.id)),
    zoneIds = new Set();
  for (const zone of review.acceptedZones) {
    const r = zone.rect;
    if (
      typeof zone.id !== 'string' ||
      !zone.id.trim() ||
      zoneIds.has(zone.id) ||
      !Array.isArray(r) ||
      r.length !== 4 ||
      !r.every(Number.isFinite) ||
      r[0] >= r[1] ||
      r[2] >= r[3]
    )
      throw Error('Zona aceptada inválida o repetida.');
    zoneIds.add(zone.id);
  }
  if (
    review.excludedCandidates.some((id) => !ids.has(id)) ||
    new Set(review.excludedCandidates).size !== review.excludedCandidates.length
  )
    throw Error('Exclusión desconocida o repetida.');
  return review;
}

export function treeCandidateStatus(candidate, review) {
  if (review.excludedCandidates.includes(candidate.id)) return 'excluido';
  return review.acceptedZones.some(
    ({ rect: r }) =>
      candidate.x >= r[0] && candidate.x <= r[1] && candidate.z >= r[2] && candidate.z <= r[3],
  )
    ? 'aceptado'
    : 'pendiente';
}

function installTreeReview(root, scene) {
  const {
    make,
    toggle,
    panel,
    status,
    candidatesInput,
    reviewInput,
    rect,
    zoneId,
    zones,
    selected,
    exclude,
    save,
    accept,
    pilot,
    remove,
    overlay,
  } = createTreeReviewPanel(root, scene);
  const reviewState = { candidates: [], review: null, fingerprint: '', current: null };
  const { redraw } = createTreeReviewRedraw({
    make,
    status,
    zones,
    selected,
    overlay,
    reviewState,
  });
  installTreeReviewActions({
    make,
    toggle,
    panel,
    status,
    candidatesInput,
    reviewInput,
    rect,
    zoneId,
    zones,
    exclude,
    save,
    accept,
    pilot,
    remove,
    overlay,
    reviewState,
    redraw,
  });
  return (point) => {
    if (panel.hidden || !reviewState.review) return;
    reviewState.current =
      reviewState.candidates
        .filter((c) => Math.hypot(c.x - point.x, c.z - point.z) <= Math.min(10, c.r + 2))
        .sort(
          (a, b) =>
            Math.hypot(a.x - point.x, a.z - point.z) - Math.hypot(b.x - point.x, b.z - point.z),
        )[0] ?? null;
    redraw();
    return true;
  };
}

function createTreeReviewPanel(root, scene) {
  const make = (tag, text) => {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    return e;
  };
  const toggle = make('button', 'Revisar copas'),
    panel = make('aside'),
    status = make('p', 'Carga tree-candidates.json. Cambios en memoria: descarga antes de cerrar.'),
    candidatesInput = make('input'),
    reviewInput = make('input'),
    rect = make('input'),
    zoneId = make('input'),
    zones = make('select'),
    selected = make('p', 'Toca cerca del centro de un anillo para seleccionarlo.'),
    exclude = make('button', 'Excluir / restaurar candidato'),
    save = make('button', 'Descargar tree-review.json'),
    accept = make('button', 'Aceptar rectángulo'),
    pilot = make('button', 'Rellenar rectángulo del piloto'),
    remove = make('button', 'Quitar zona seleccionada');
  toggle.className = 'treeReviewToggle';
  panel.className = 'treeReviewPanel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Revisión de copas');
  const label = (text, input) => {
    const l = make('label', text);
    l.appendChild(input);
    panel.appendChild(l);
  };
  panel.appendChild(make('strong', 'Copas: amarillo pendiente · verde aceptado · rojo excluido'));
  panel.appendChild(status);
  for (const input of [candidatesInput, reviewInput]) {
    input.type = 'file';
    input.accept = '.json,application/json';
  }
  label('Candidatos locales', candidatesInput);
  label('Revisión existente (opcional)', reviewInput);
  zoneId.value = 'zona-1';
  label('Nombre único de zona', zoneId);
  rect.placeholder = 'x0, x1, z0, z1';
  label('Rectángulo en metros', rect);
  for (const e of [pilot, accept, zones, remove, selected, exclude, save]) panel.appendChild(e);
  root.appendChild(toggle);
  root.appendChild(panel);
  const overlay = new THREE.Group();
  overlay.name = 'debug-tree-candidates';
  overlay.visible = false;
  scene.add(overlay);
  return {
    make,
    toggle,
    panel,
    status,
    candidatesInput,
    reviewInput,
    rect,
    zoneId,
    zones,
    selected,
    exclude,
    save,
    accept,
    pilot,
    remove,
    overlay,
  };
}

function createTreeReviewRedraw({ make, status, zones, selected, overlay, reviewState }) {
  const redraw = () => {
    for (const child of [...overlay.children]) {
      child.geometry.dispose();
      child.material.dispose();
      overlay.remove(child);
    }
    if (!reviewState.review) return;
    const positions = [],
      colors = [],
      totals = { pendiente: 0, aceptado: 0, excluido: 0 },
      palette = { pendiente: 0xffcc00, aceptado: 0x22ee55, excluido: 0xff3344 };
    const segment = (x, z, nx, nz, color) => {
      for (const [px, pz] of [
        [x, z],
        [nx, nz],
      ]) {
        positions.push(px, groundHeightAt(px, pz) + 0.4, pz);
        colors.push(color.r, color.g, color.b);
      }
    };
    for (const c of reviewState.candidates) {
      const state = treeCandidateStatus(c, reviewState.review),
        color = new THREE.Color(palette[state]);
      totals[state]++;
      for (let k = 0; k < 24; k++) {
        const a = (k * Math.PI * 2) / 24,
          b = ((k + 1) * Math.PI * 2) / 24;
        segment(
          c.x + c.r * Math.cos(a),
          c.z + c.r * Math.sin(a),
          c.x + c.r * Math.cos(b),
          c.z + c.r * Math.sin(b),
          color,
        );
      }
    }
    for (const { rect: r } of reviewState.review.acceptedZones) {
      const corners = [
        [r[0], r[2]],
        [r[1], r[2]],
        [r[1], r[3]],
        [r[0], r[3]],
      ];
      for (let k = 0; k < 4; k++)
        segment(...corners[k], ...corners[(k + 1) % 4], new THREE.Color(0x22ddff));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false }),
    );
    lines.renderOrder = 999;
    overlay.add(lines);
    zones.replaceChildren();
    for (const zone of reviewState.review.acceptedZones) {
      const option = make('option', zone.id);
      option.value = zone.id;
      zones.appendChild(option);
    }
    status.textContent = `${reviewState.candidates.length} copas: ${totals.pendiente} pendientes, ${totals.aceptado} aceptadas, ${totals.excluido} excluidas. Cambios en memoria: descarga para guardar.`;
    selected.textContent = reviewState.current
      ? `${reviewState.current.id}: ${treeCandidateStatus(reviewState.current, reviewState.review)} · radio ${reviewState.current.r} m · ExG ${reviewState.current.score}`
      : 'Toca cerca del centro de un anillo.';
    gfx.needsRender = true;
  };
  return { redraw };
}

function installTreeReviewActions({
  make,
  toggle,
  panel,
  status,
  candidatesInput,
  reviewInput,
  rect,
  zoneId,
  zones,
  exclude,
  save,
  accept,
  pilot,
  remove,
  overlay,
  reviewState,
  redraw,
}) {
  const action = (fn) => async () => {
    try {
      await fn();
    } catch (error) {
      status.textContent = error.message;
    }
  };
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    overlay.visible = !panel.hidden;
    gfx.needsRender = true;
  });
  candidatesInput.addEventListener(
    'change',
    action(async () => {
      const file = candidatesInput.files[0];
      if (!file) return;
      const text = await file.text(),
        data = JSON.parse(text),
        ids = new Set();
      if (data.version !== 1 || !Array.isArray(data.candidates))
        throw Error('Candidatos inválidos.');
      for (const c of data.candidates) {
        if (
          typeof c.id !== 'string' ||
          ids.has(c.id) ||
          ![c.x, c.z, c.r, c.score].every(Number.isFinite) ||
          c.r <= 0
        )
          throw Error('Candidato inválido o repetido.');
        ids.add(c.id);
      }
      reviewState.fingerprint = sha256Hex(new TextEncoder().encode(text));
      reviewState.candidates = data.candidates;
      reviewState.review = {
        version: 1,
        candidatesSha256: reviewState.fingerprint,
        acceptedZones: [],
        excludedCandidates: [],
      };
      reviewState.current = null;
      redraw();
    }),
  );
  reviewInput.addEventListener(
    'change',
    action(async () => {
      if (!reviewState.review) throw Error('Carga los candidatos primero.');
      if (!reviewInput.files[0]) return;
      reviewState.review = validateTreeReview(
        JSON.parse(await reviewInput.files[0].text()),
        reviewState.candidates,
        reviewState.fingerprint,
      );
      redraw();
    }),
  );
  pilot.addEventListener('click', () => {
    zoneId.value = 'frontagePilot';
    rect.value = world.cityDesign.zones.frontagePilot.join(', ');
  });
  accept.addEventListener(
    'click',
    action(() => {
      if (!reviewState.review) throw Error('Carga los candidatos primero.');
      const next = {
        ...reviewState.review,
        acceptedZones: [
          ...reviewState.review.acceptedZones,
          {
            id: zoneId.value.trim(),
            rect: rect.value.split(',').map((v) => (v.trim() ? Number(v) : NaN)),
          },
        ],
      };
      reviewState.review = validateTreeReview(
        next,
        reviewState.candidates,
        reviewState.fingerprint,
      );
      redraw();
    }),
  );
  remove.addEventListener('click', () => {
    if (!reviewState.review) return;
    reviewState.review.acceptedZones = reviewState.review.acceptedZones.filter(
      (zone) => zone.id !== zones.value,
    );
    redraw();
  });
  exclude.addEventListener('click', () => {
    if (!reviewState.current || !reviewState.review) return;
    const ids = reviewState.review.excludedCandidates;
    reviewState.review.excludedCandidates = ids.includes(reviewState.current.id)
      ? ids.filter((id) => id !== reviewState.current.id)
      : [...ids, reviewState.current.id];
    redraw();
  });
  save.addEventListener(
    'click',
    action(() => {
      if (!reviewState.review) throw Error('Carga los candidatos primero.');
      validateTreeReview(reviewState.review, reviewState.candidates, reviewState.fingerprint);
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(reviewState.review, null, 2) + '\n'], {
            type: 'application/json',
          }),
        ),
        link = make('a');
      link.href = url;
      link.download = 'tree-review.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }),
  );
}
