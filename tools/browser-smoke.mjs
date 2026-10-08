// Prototipo: humo en Chrome real sin interfaz (SwiftShader), sin dependencias.
// node browser-smoke.mjs URL [chrome]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SAVE_KEY } from '../web/game-data.js';

const url = process.argv[2] || 'http://127.0.0.1:8080/';
const chrome = process.argv[3] || 'google-chrome-stable';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chiclana-smoke-'));
const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-first-run',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  proc.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
  setTimeout(() => reject(Error('chrome no arranca')), 15000);
});
const port = new URL(wsUrl).port;
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map(),
  errors = [],
  requests = [];
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) (pending.get(msg.id)(msg), pending.delete(msg.id));
  if (msg.method === 'Runtime.exceptionThrown')
    errors.push(
      msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text,
    );
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
    errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url);
  if (msg.method === 'Network.loadingFailed') errors.push('network ' + msg.params.errorText);
});
const send = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
await send('Runtime.enable');
await send('Network.enable');
await send('Page.enable');
if (process.argv.includes('--low'))
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem(${JSON.stringify(SAVE_KEY)},JSON.stringify({cash:250,job:0,found:[],quality:'low'}))`,
  });
const t0 = Date.now();
await send('Page.navigate', { url });
let state;
for (;;) {
  await new Promise((r) => setTimeout(r, 500));
  const res = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
    ready: !document.getElementById('welcome').classList.contains('hidden'),
    status: document.getElementById('loadStatus').textContent,
    streets: document.getElementById('streetCount').textContent,
    game: !!window.__cityGame,
  })`,
  });
  state = res.result.result.value;
  if (state.ready || errors.length || Date.now() - t0 > 90000) break;
}
const scene = (
  await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
  const g = window.__cityGame; if (!g) return null; let meshes = 0, triangles = 0;
  g.scene.traverse((o) => { if (!o.isMesh) return; meshes++; const p = o.geometry.getAttribute('position');
    triangles += ((o.geometry.index ? o.geometry.index.count : p.count) / 3) * (o.isInstancedMesh ? o.count : 1); });
  return { meshes, triangles, drawCalls: g.stats.calls };
})()`,
  })
).result.result.value;
const quality = (
  await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: "import('./js/core/state.js').then(m=>m.gfx.quality)",
  })
).result.result.value;
if (process.argv.includes('--low') && quality !== 'low') errors.push('Calidad ligera no aplicada');
const aerialChecks = (
  await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `Promise.all([import('./js/world/aerial-tiles.js'),import('./js/core/state.js')]).then(async ([m,s])=>{
      await m.reloadAerialTiles();
      return {...m.aerialTileStatus(), general:s.world.groundTextureFile,
        generalIdentity:s.world.groundTexture?.repeat.toArray().join(',')==='1,1' &&
          s.world.groundTexture?.offset.toArray().join(',')==='0,0'};
    })`,
  })
).result.result.value;
if (
  !aerialChecks ||
  aerialChecks.pending.length ||
  aerialChecks.failed.length ||
  aerialChecks.loaded.length !== aerialChecks.desired.length ||
  aerialChecks.loaded.length > (aerialChecks.level === 'lo' ? 9 : 12) ||
  aerialChecks.general !== 'aerial/general.jpg' ||
  !aerialChecks.generalIdentity
)
  errors.push('Carga de teselas incompatible');
const local = requests.filter(
  (u) => u.startsWith(new URL(url).origin) && !u.endsWith('/') && !u.includes('favicon'),
);
const aerialRequests = local.filter((u) => /\/aerial\//.test(u));
if (aerialRequests.some((u) => !/[?&]v=/.test(u))) errors.push('Ortofoto sin versión de recurso');
if (process.argv.includes('--low') && aerialRequests.some((u) => /\/hi\//.test(u)))
  errors.push('Modo ligero pide teselas hi');
const surfaceChecks = [];
if (process.argv.includes('--surfaces') && state.game) {
  const walking = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(()=>{
    const g=window.__cityGame,m=g.surfaceModel;if(!m)return [];
    return g.city.roads.filter(r=>r.bridge&&['pedestrian','footway','path'].includes(r.type)).map(r=>{
      // La colisión usa los límites jugables, no el margen de la rejilla MDT.
      const list=m.profiles.get(r.id),actor={surfaceY:list[0].y0};let wrong=0,blocked=0,count=0,outside=0;
      for(const s of list)for(const t of [0,.25,.5,.75,1]){
        const x=s.a[0]+s.dx*t,z=s.a[1]+s.dz*t,y=m.actorHeightAt(actor,x,z);
        if(!g.city.bounds.some(([x0,x1,z0,z1])=>x>=x0+5&&x<=x1-5&&z>=z0+5&&z<=z1-5)){outside++;continue;}
        if(Math.abs(y-(s.y0+(s.y1-s.y0)*t))>.1)wrong++;
        if(g.blocked(x,z,.28,y))blocked++;actor.surfaceY=y;count++;
      }return {road:r.id,count,wrong,blocked,outside};
    });
  })()`,
  });
  const rows = walking.result.result.value;
  surfaceChecks.push(...rows.map((r) => ({ id: 'walking-' + r.road, walking: r })));
  if (rows.some((r) => r.wrong || r.blocked))
    errors.push('Acceso peatonal al tablero incompatible');
  await send('Runtime.evaluate', { expression: "document.getElementById('start').click()" });
  const cases = (
    await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{
    const g=window.__cityGame,m=g.surfaceModel;if(!m)return [];
    const cases=[];
    for(const p of m.platforms) {
      const x=p.polygon.reduce((s,q)=>s+q[0],0)/p.polygon.length,z=p.polygon.reduce((s,q)=>s+q[1],0)/p.polygon.length;
      cases.push({id:p.id+'-upper',x,z,y:p.y,upper:true,road:null,a:0});
      for(const road of p.lowerRoads) {
        const s=m.profiles.get(road).find(s=>{const x=(s.a[0]+s.b[0])/2,z=(s.a[1]+s.b[1])/2;return m.surfaceHeightAt(x,z)-m.surfaceHeightAt(x,z,null,road)>2.5;});
        if(s)cases.push({id:p.id+'-lower',x:(s.a[0]+s.b[0])/2,z:(s.a[1]+s.b[1])/2,y:(s.y0+s.y1)/2,upper:false,road,a:Math.atan2(s.dx,s.dz)});
      }
    }return cases;
  })()`,
    })
  ).result.result.value;
  for (const test of cases || []) {
    const checked = await send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
      const g=window.__cityGame,test=${JSON.stringify(test)},c=g.player.car;
      Object.assign(c,{x:test.x,z:test.z,a:test.a,speed:0,surfaceY:test.y,surfaceRoad:test.road});
      Object.assign(g.player,{x:test.x,z:test.z,a:test.a,surfaceY:test.y});
      const camera=await import('./js/engine/camera.js');
      while(g.view.mode!==1)camera.cycleCamera();camera.snapCamera();
      return {id:test.id,expected:test.y,actual:c.mesh.position.y,camera:g.view.position,ceiling:g.surfaceModel.ceilingAt(test.x,test.z,test.y),blocked:g.blocked(test.x,test.z,.3,test.y)};
    })()`,
    });
    surfaceChecks.push(checked.result.result.value);
    await new Promise((resolve) => setTimeout(resolve, 350));
    const screen = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(
      path.join(os.tmpdir(), 'chiclana-surface-' + test.id + '.png'),
      Buffer.from(screen.result.data, 'base64'),
    );
  }
  if (
    surfaceChecks.some(
      (s) =>
        !s.walking &&
        (!s ||
          Math.abs(s.actual - s.expected) > 0.01 ||
          !s.camera.every(Number.isFinite) ||
          s.blocked),
    )
  )
    errors.push('Continuidad de superficies incompatible');
}
console.log(
  JSON.stringify(
    {
      ms: Date.now() - t0,
      state,
      scene,
      quality,
      aerialChecks,
      surfaceChecks,
      errors,
      requests: local.length,
      unversioned: local.filter((u) => !/[?&]v=/.test(u)),
    },
    null,
    1,
  ),
);
ws.close();
if (proc.exitCode === null) {
  const stopped = new Promise((resolve) => proc.once('exit', resolve));
  proc.kill();
  await stopped;
}
fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
process.exit(state.ready && !errors.length ? 0 : 1);
