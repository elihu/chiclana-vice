import { boundsBox } from '../world/bounds.js';
import { $ } from '../core/dom.js';
import { TAU, fold } from '../core/math.js';
import { VIEWPOINTS } from '../../game-data.js';
import { clearInput } from './input.js';
import { closeDialog, openDialog } from './dialogs.js';
import { gfx, graph, player, pois, police, session, world } from '../core/state.js';
import { mute } from '../engine/audio.js';
import { safePoint } from '../world/spatial.js';
import { snapCamera } from '../engine/camera.js';
import { target } from '../game/jobs.js';
import { toast } from './feedback.js';

let chart, chartCtx;
// Canvas no hereda colores CSS: resolver la paleta una vez, al preparar el mapa.
const mapColors = {
  ground: '#233a40',
  water: '#2f5f6b',
  park: '#36534b',
  building: '#8a9691',
  street: '#f5f2e8',
  poi: '#58a6b5',
  police: '#ef6f5e',
  albero: '#f0c24b',
  cal: '#f5f2e8',
  noche: '#12232b',
};

function trace(c, poly) {
  const [x0, , z0] = boundsBox();
  c.beginPath();
  poly.forEach((p, i) => (i ? c.lineTo(p[0] - x0, p[1] - z0) : c.moveTo(p[0] - x0, p[1] - z0)));
}

export function prepareMap() {
  if (typeof getComputedStyle === 'function') {
    const theme = getComputedStyle(document.documentElement);
    for (const name of Object.keys(mapColors)) {
      const token = ['albero', 'cal', 'noche'].includes(name) ? '--' + name : '--map-' + name;
      mapColors[name] = theme.getPropertyValue(token).trim() || mapColors[name];
    }
  }
  const [x0, x1, z0, z1] = boundsBox();
  chart = document.createElement('canvas');
  chart.width = Math.ceil(x1 - x0);
  chart.height = Math.ceil(z1 - z0);
  chartCtx = chart.getContext('2d');
  chartCtx.fillStyle = mapColors.ground;
  chartCtx.fillRect(0, 0, chart.width, chart.height);
  for (let a of world.city.areas) {
    trace(chartCtx, a.p);
    chartCtx.fillStyle =
      a.kind === 'water' ? mapColors.water : a.kind === 'park' ? mapColors.park : mapColors.ground;
    chartCtx.fill();
  }
  for (let b of world.city.buildings) {
    trace(chartCtx, b.p);
    chartCtx.fillStyle = mapColors.building;
    chartCtx.fill();
    for (let h of b.holes) {
      trace(chartCtx, h);
      chartCtx.fillStyle = mapColors.ground;
      chartCtx.fill();
    }
  }
  chartCtx.lineJoin = chartCtx.lineCap = 'round';
  for (let r of world.city.roads) {
    trace(chartCtx, r.p);
    chartCtx.strokeStyle = mapColors.street;
    chartCtx.lineWidth = r.w;
    chartCtx.stroke();
  }
  world.streetNames = [...new Set(world.city.roads.map((r) => r.name).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  );
  listStreets();
}

export function drawMap(canvas, mini = false) {
  const [x0, x1, z0, z1] = boundsBox(),
    width = x1 - x0,
    height = z1 - z0;
  let cw = canvas.width,
    ch = canvas.height,
    c = canvas.getContext('2d'),
    scale = mini ? 1.1 : Math.min(cw / width, ch / height) * 0.92;
  let ox = mini ? cw / 2 - player.x * scale : (cw - width * scale) / 2 - x0 * scale,
    oy = mini ? ch / 2 - player.z * scale : (ch - height * scale) / 2 - z0 * scale;
  c.fillStyle = mapColors.noche;
  c.fillRect(0, 0, cw, ch);
  c.save();
  c.translate(ox + x0 * scale, oy + z0 * scale);
  c.scale(scale, scale);
  // La vista general permanece cargada aunque se liberen las teselas del suelo.
  if (session.mapAerial && !mini && world.groundTexture?.image) {
    const [ax0, ax1, az0, az1] = world.aerialBox;
    c.drawImage(world.groundTexture.image, ax0 - x0, az0 - z0, ax1 - ax0, az1 - az0);
  } else c.drawImage(chart, 0, 0, width, height);
  c.translate(-x0, -z0);
  if (session.route.length) {
    c.strokeStyle = mapColors.albero;
    c.lineWidth = mini ? 4 : 5 / scale;
    c.lineJoin = 'round';
    c.beginPath();
    session.route.forEach((id, i) => {
      let n = graph[id];
      i ? c.lineTo(n.x, n.z) : c.moveTo(n.x, n.z);
    });
    c.stroke();
  }
  for (let p of pois) {
    c.fillStyle = mapColors.poi;
    c.beginPath();
    c.arc(p.x, p.z, mini ? 3.5 : 4 / scale, 0, TAU);
    c.fill();
  }
  let goal = target();
  if (goal) {
    c.strokeStyle = mapColors.albero;
    c.lineWidth = 2 / scale;
    c.beginPath();
    c.arc(goal.x, goal.z, 8 / scale, 0, TAU);
    c.stroke();
  }
  for (let p of police) {
    c.fillStyle = mapColors.police;
    c.beginPath();
    c.arc(p.x, p.z, 4 / scale, 0, TAU);
    c.fill();
  }
  c.translate(player.x, player.z);
  c.rotate(-player.a);
  c.fillStyle = mapColors.cal;
  c.strokeStyle = mapColors.noche;
  c.lineWidth = 2 / scale;
  c.beginPath();
  c.moveTo(0, 8 / scale);
  c.lineTo(-5 / scale, -5 / scale);
  c.lineTo(0, -2 / scale);
  c.lineTo(5 / scale, -5 / scale);
  c.closePath();
  c.stroke();
  c.fill();
  c.restore();
  if (!mini) {
    c.font = 'bold ' + Math.max(12, cw / 55) + 'px Arial';
    c.textAlign = 'center';
    for (let p of pois) {
      let x = ox + p.x * scale,
        y = oy + p.z * scale,
        w = c.measureText(p.name).width;
      c.fillStyle = mapColors.noche;
      c.fillRect(x - w / 2 - 5, y + 8, w + 10, 20);
      c.fillStyle = mapColors.cal;
      c.fillText(p.name, x, y + 23);
    }
    c.fillStyle = mapColors.cal;
    c.textAlign = 'right';
    c.fillText('N ↑', cw - 14, 25);
  }
}

export function listStreets() {
  let q = fold($('streetSearch').value),
    names = world.streetNames.filter((n) => fold(n).includes(q));
  let list = $('streetList');
  list.replaceChildren();
  for (const view of VIEWPOINTS) {
    if (q && !fold(view.name).includes(q)) continue;
    let b = document.createElement('button');
    b.textContent = view.name;
    b.classList.add('mapViewpoint');
    b.onclick = () => {
      let position = { x: view.x, z: view.z, a: Math.atan2(view.tx - view.x, view.tz - view.z) };
      if (player.car) {
        Object.assign(player.car, position);
        player.car.speed = 0;
      }
      Object.assign(player, position);
      player.speed = 0;
      view.mode = 0;
      session.routeClock = 0;
      closeMap();
      snapCamera(true);
      toast(view.name, 3);
    };
    list.appendChild(b);
  }
  for (let n of names) {
    let b = document.createElement('button');
    b.textContent = n;
    b.onclick = () => {
      let rs = world.city.roads.filter((r) => r.name === n),
        r = rs.reduce((a, b) => (a.p.length > b.p.length ? a : b)),
        pt = r.p[Math.floor(r.p.length / 2)],
        safe = safePoint(pt[0], pt[1], !!player.car);
      if (player.car) {
        Object.assign(player.car, safe);
        player.car.speed = 0;
      }
      Object.assign(player, safe);
      player.speed = 0;
      session.routeClock = 0;
      closeMap();
      snapCamera(true);
      toast(n, 3);
    };
    list.appendChild(b);
  }
  const count = list.children.length;
  $('streetResults').textContent = count + (count === 1 ? ' destino' : ' destinos');
  if (!count) {
    let p = document.createElement('p');
    p.textContent = 'No hay coincidencias. Prueba otro nombre o parte de la calle.';
    p.style.fontSize = '13px';
    list.appendChild(p);
  }
}

export function openMap() {
  if (!session.started || gfx.contextLost) return;
  session.paused = true;
  clearInput();
  mute();
  $('mapOverlay').classList.remove('hidden');
  openDialog($('closeMap')); // not the search field: no on-screen keyboard
  let c = $('map'),
    r = c.getBoundingClientRect();
  c.width = Math.round(r.width * 1.5);
  c.height = Math.round(r.height * 1.5);
  drawMap(c);
}

export function closeMap() {
  if (gfx.contextLost) return; // only reloading can bring the image back
  $('mapOverlay').classList.add('hidden');
  closeDialog();
  session.paused = false;
  gfx.needsRender = true;
  session.last = performance.now();
}
