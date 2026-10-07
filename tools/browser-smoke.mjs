// Prototipo: humo en Chrome real sin interfaz (SwiftShader), sin dependencias.
// node browser-smoke.mjs URL [chrome]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
const local = requests.filter(
  (u) => u.startsWith(new URL(url).origin) && !u.endsWith('/') && !u.includes('favicon'),
);
console.log(
  JSON.stringify(
    {
      ms: Date.now() - t0,
      state,
      scene,
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
