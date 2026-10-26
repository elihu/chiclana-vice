// Presupuesto de render en Chrome sin interfaz (SwiftShader), sin dependencias.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SAVE_KEY } from '../web/game-data.js';

const args = process.argv.slice(2),
  url = args.shift();
const options = {};
for (let n = 0; n < args.length; n++) {
  const key = args[n];
  if (key === '--low') options.low = true;
  else if (key === '--giro') options.giro = true;
  else if (['--out', '--compare', '--shots'].includes(key) && args[n + 1])
    options[key.slice(2)] = args[++n];
  else throw Error('Argumento no válido: ' + key);
}
if (!url || (!options.out && !options.compare))
  throw Error(
    'Uso: node tools/scene-budget.mjs URL --out JSON|--compare JSON [--low] [--giro] [--shots DIR]',
  );
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chiclana-budget-'));
let proc, ws;
try {
  proc = spawn(
    'google-chrome-stable',
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
    const timer = setTimeout(() => reject(Error('Chrome no arranca')), 15000);
    proc.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.stderr.on('data', (data) => {
      buf += data;
      const match = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const port = new URL(wsUrl).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map(),
    errors = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === 'Runtime.exceptionThrown')
      errors.push(
        message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text,
      );
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
      errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    if (message.method === 'Network.loadingFailed') errors.push(message.params.errorText);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(Error('Tiempo agotado: ' + method));
      }, 90000);
      pending.set(requestId, (message) => {
        clearTimeout(timer);
        if (message.error) reject(Error(JSON.stringify(message.error)));
        else resolve(message.result);
      });
      ws.send(JSON.stringify({ id: requestId, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (options.low)
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem(${JSON.stringify(SAVE_KEY)},JSON.stringify({cash:250,job:0,found:[],quality:'low'}))`,
    });
  const loadStart = Date.now();
  await send('Page.navigate', { url });
  const deadline = Date.now() + 90000;
  let ready = false,
    readinessError;
  while (!ready) {
    try {
      ready = await evaluate(
        "!!window.__cityGame && !document.getElementById('welcome').classList.contains('hidden')",
      );
    } catch (error) {
      // La navegación puede destruir el contexto entre dos consultas de CDP.
      readinessError = error;
    }
    if (errors.length || Date.now() > deadline)
      throw Error(
        'Juego no listo: ' + (errors.join('\n') || readinessError?.message || 'plazo agotado'),
      );
    if (!ready) await sleep(100);
  }
  const loadMs = Date.now() - loadStart;
  await evaluate(`(async()=>{
    const {session}=await import('./js/core/state.js');
    const {start}=await import('./js/game/flow.js');
    const {target}=await import('./js/game/jobs.js');
    const {updateMarkers}=await import('./js/game/missions.js');
    // Importar antes de start evita que un frame avance la partida antes de pausarla.
    start();session.paused=true;session.t=0;updateMarkers(target());
    const style=document.createElement('style');
    style.textContent='body > :not(#world) { visibility: hidden !important; }';
    document.head.appendChild(style);
  })()`);
  const points = await evaluate(`(()=>{
    const g=window.__cityGame;
    return [{name:'Alameda',x:g.player.x,z:g.player.z},...['Mercado de Abastos','Plaza Mayor','Ermita de Santa Ana','San Telmo'].map(name=>{
      const p=g.pois.find(p=>p.name===name);if(!p)throw Error('Lugar ausente: '+name);
      return {name,x:p.x,z:p.z};
    })].map(p=>({...p,a:g.player.a}));
  })()`);
  if (options.giro) {
    // Dos giros de 360° seguidos en primera persona, sin avanzar la partida. Cada frame se
    // dibuja a mano; se anota su duración (con `finish` si el motor es WebGL) y los
    // pipelines y programas que se crearon en él.
    const turns = [],
      counts = `(async()=>{const {gfx}=await import('./js/core/state.js'),r=gfx.renderer;
        return {pipelines:r._pipelines.caches.size,programs:r.info.memory.programs}})()`,
      afterLoad = await evaluate(counts);
    for (const point of points.filter((p) =>
      ['Alameda', 'Plaza Mayor', 'San Telmo'].includes(p.name),
    ))
      for (const turn of [1, 2]) {
        const frames = await evaluate(`(async()=>{
          const {player,view,gfx}=await import('./js/core/state.js');
          const {cycleCamera,snapCamera,updateCamera}=await import('./js/engine/camera.js');
          const {x,z,a}=${JSON.stringify(point)};
          const first=${turn === 1};
          if(first){
            Object.assign(player,{x,z,a,speed:0});if(player.car)Object.assign(player.car,{x,z,a,speed:0});
            while(view.mode!==1)cycleCamera();
          }
          const r=gfx.renderer,out=[],gl=r.backend?.gl,steps=36;
          r.info.autoReset=false;
          const nextFrame=()=>new Promise(res=>requestAnimationFrame(()=>res()));
          for(let k=0;k<steps;k++){
            player.a=a+k*Math.PI*2/steps;if(player.car)player.car.a=player.a;
            snapCamera(k===0&&first);updateCamera(100);
            await nextFrame();
            const p0=r._pipelines.caches.size,g0=r.info.memory.programs,t0=performance.now();
            r.info.reset();r.render(gfx.scene,gfx.camera);gl?.finish();
            out.push({ms:+(performance.now()-t0).toFixed(1),pipelines:r._pipelines.caches.size-p0,programs:r.info.memory.programs-g0});
          }
          r.info.autoReset=true;
          return out;
        })()`);
        const ms = frames.map((f) => f.ms).sort((p, q) => p - q);
        const summary = {
          point: point.name,
          turn,
          frames,
          maxMs: ms.at(-1),
          p95Ms: ms[Math.floor(ms.length * 0.95)],
          medianMs: ms[ms.length >> 1],
          totalMs: +ms.reduce((q, w) => q + w, 0).toFixed(1),
          over100: ms.filter((q) => q > 100).length,
          pipelines: frames.reduce((q, f) => q + f.pipelines, 0),
          programs: frames.reduce((q, f) => q + f.programs, 0),
        };
        turns.push(summary);
        console.log(
          `${point.name} giro ${turn}: máx ${summary.maxMs} ms, p95 ${summary.p95Ms}, mediana ${summary.medianMs}, >100 ms: ${summary.over100}, pipelines nuevos ${summary.pipelines}, programas nuevos ${summary.programs}`,
        );
      }
    // Cambio de calidad en marcha: ningún pipeline nuevo si el calentamiento cubrió los dos modos.
    const switched = await evaluate(`(async()=>{
      const {gfx}=await import('./js/core/state.js'),{applyQuality}=await import('./js/engine/renderer.js'),r=gfx.renderer,
        nextFrame=()=>new Promise(res=>requestAnimationFrame(()=>res())),out=[];
      for(const quality of ['low','auto']){
        const p0=r._pipelines.caches.size,g0=r.info.memory.programs;
        gfx.quality=quality;applyQuality();await nextFrame();
        const t0=performance.now();r.render(gfx.scene,gfx.camera);r.backend?.gl?.finish();
        out.push({quality,ms:+(performance.now()-t0).toFixed(1),pipelines:r._pipelines.caches.size-p0,programs:r.info.memory.programs-g0});
      }
      return out;
    })()`);
    console.log('cambio de calidad', JSON.stringify(switched));
    const totals = await evaluate(`(async()=>{
      const {gfx}=await import('./js/core/state.js'),r=gfx.renderer;
      return {pipelines:r._pipelines.caches.size,programs:r.info.memory.programs,programsSize:r.info.memory.programsSize,
        geometries:r.info.memory.geometries,backend:gfx.backend,quality:gfx.quality};
    })()`);
    if (errors.length) throw Error('Errores de página:\n' + errors.join('\n'));
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(
      options.out,
      JSON.stringify({ url, loadMs, afterLoad, totals, switched, turns }, null, 2) + '\n',
    );
    console.log(
      'carga',
      loadMs,
      'ms; tras la carga',
      JSON.stringify(afterLoad),
      '; totales',
      JSON.stringify(totals),
    );
  } else {
    const cameras = ['sigue', 'primera-persona', 'aerea'],
      views = [];
    if (options.shots) fs.mkdirSync(options.shots, { recursive: true });
    for (const point of points)
      for (let mode = 0; mode < 3; mode++) {
        await evaluate(`(async()=>{
      const {player,view}=await import('./js/core/state.js');
      const {cycleCamera,snapCamera,updateCamera}=await import('./js/engine/camera.js');
      const {x,z,a}=${JSON.stringify(point)};
      Object.assign(player,{x,z,a,speed:0});if(player.car)Object.assign(player.car,{x,z,a,speed:0});
      while(view.mode!==${mode})cycleCamera();snapCamera(true);updateCamera(100);
    })()`);
        await sleep(2500);
        await evaluate(
          "(async()=>{await (await import('./js/world/aerial-tiles.js')).reloadAerialTiles()})()",
        );
        await sleep(1000);
        const measured = await evaluate(`(async()=>{
      const {gfx}=await import('./js/core/state.js'),{setSunShadows,renderFrame}=await import('./js/engine/renderer.js'),r=gfx.renderer,i=r.info.render;
      // La gradación (RenderPipeline) solo vuelve a dibujar la escena una vez por tick del renderizador:
      // hay que esperar entre una medida y la siguiente.
      const tick=()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
      const cast=gfx.sun.castShadow,frames=r._nodes.nodeFrame;
      try {
        // El pase de sombras se omite si ya se actualizó en este mismo frame de nodos (el bucle
        // del juego pudo renderizar en el último rAF): se avanza el contador para forzarlo.
        await tick();r.info.autoReset=false;frames.frameId++;gfx.sun.shadow.needsUpdate=true;
        r.info.reset();renderFrame();
        const total={calls:i.drawCalls??i.calls,triangles:i.triangles};
        setSunShadows(false);await tick();r.info.reset();renderFrame();
        return {total,main:{calls:i.drawCalls??i.calls,triangles:i.triangles},backend:gfx.backend};
      } finally {setSunShadows(cast);r.info.autoReset=true;await tick();renderFrame();}
    })()`);
        const vegetation = await evaluate(`(async()=>{
        const {gfx}=await import('./js/core/state.js');
        const THREE=await import('./vendor/three.webgpu.min.js');
        const frustum=new THREE.Frustum().setFromProjectionMatrix(
          new THREE.Matrix4().multiplyMatrices(gfx.camera.projectionMatrix,gfx.camera.matrixWorldInverse));
        let instances=0,triangles=0,batches=0;
        gfx.scene.traverse(o=>{
          if(!o.isInstancedMesh || !o.name.startsWith('vegetation-') || !o.visible || !frustum.intersectsObject(o))return;
          instances+=o.count;batches++;
          triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3*o.count;
        });
        return {instances,triangles,batches};
      })()`);
        views.push({ point: point.name, camera: cameras[mode], ...measured, vegetation });
        console.log(point.name, cameras[mode], JSON.stringify(measured));
        if (options.shots) {
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          const slug = point.name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replaceAll(' ', '-');
          fs.writeFileSync(
            path.join(options.shots, `${slug}-${cameras[mode]}${options.low ? '-low' : ''}.png`),
            Buffer.from(shot.data, 'base64'),
          );
        }
      }
    const inventory = await evaluate(`(async()=>{
    const {gfx,facadeWork,chunks,streetEnvironment}=await import('./js/core/state.js');
    let meshes=0,triangles=0,shadowTriangles=0;
    // Categoría por nombre de la malla o de un ancestro; lo no reconocido va a «otros».
    const categories=[['arboles',/^vegetation-/],['fachadas',/^facade-cell-|^reference-led-facades$/],
      ['muros',/^building-(plain-)?walls$/],['tejados',/^building-roofs$/],
      ['mobiliario',/^urban-furniture$|^street-sign/],['puentes',/^bridge-/],
      ['terreno',/^terrain-ground$|^river-water$/],['actores',/^vehicle$/]];
    const shadowByCategory={};
    gfx.scene.traverse(o=>{if(!o.isMesh)return;meshes++;
      const t=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3*(o.isInstancedMesh?o.count:1);
      triangles+=t;
      if(!o.castShadow)return;
      shadowTriangles+=t;
      let category=o.isSkinnedMesh?'actores':null;
      for(let p=o;p&&!category;p=p.parent)category=categories.find(([,re])=>re.test(p.name))?.[0]??null;
      const row=shadowByCategory[category??'otros']??={meshes:0,triangles:0};
      row.meshes++;row.triangles+=t;
    });
    return {meshes,triangles,shadowTriangles,shadowByCategory,memory:{...gfx.renderer.info.memory},programs:gfx.renderer.info.memory.programs,backend:gfx.backend,
      facadeMeshes:facadeWork.meshes,chunks:chunks.length,trees:streetEnvironment.trees,
      treeSources:streetEnvironment.treeSources,treeBuildMs:streetEnvironment.treeBuildMs,quality:gfx.quality};
  })()`);
    if (options.low && inventory.quality !== 'low') throw Error('Calidad ligera no aplicada');
    if (errors.length) throw Error('Errores de página:\n' + errors.join('\n'));
    const report = {
      url,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      quality: inventory.quality,
      points,
      inventory,
      views,
    };
    if (options.out) {
      fs.mkdirSync(path.dirname(options.out), { recursive: true });
      fs.writeFileSync(options.out, JSON.stringify(report, null, 2) + '\n');
    }
    if (options.compare) {
      const before = JSON.parse(fs.readFileSync(options.compare, 'utf8'));
      if (before.quality !== report.quality) throw Error('Calidades incompatibles');
      for (const row of views) {
        const old = before.views.find((v) => v.point === row.point && v.camera === row.camera);
        if (!old) throw Error('Vista ausente en referencia: ' + row.point + ' ' + row.camera);
        for (const pass of ['total', 'main'])
          for (const metric of ['calls', 'triangles']) {
            const a = old[pass][metric],
              b = row[pass][metric];
            console.log(
              `${row.point} ${row.camera} ${pass}.${metric}: ${a} → ${b} (${a ? (((b - a) / a) * 100).toFixed(2) + '%' : b === 0 ? '0%' : 'sin base'})`,
            );
          }
      }
    }
  }
} finally {
  ws?.close();
  if (proc && proc.exitCode === null && proc.pid) {
    const stopped = once(proc, 'exit');
    proc.kill();
    await stopped;
  }
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
