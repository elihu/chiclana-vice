// Utilidad opcional: no se importa desde el juego.
// Consola del navegador: (await import('./measure.js')).measure({ label: 'normal' })
export async function measure({ label = 'sin-etiqueta', seconds = 10, download = true } = {}) {
  const game = window.__cityGame;
  if (!game) throw Error('Espera a que cargue el juego.');
  if (!Number.isFinite(seconds) || seconds < 3 || seconds > 60)
    throw Error('Usa entre 3 y 60 segundos.');
  const active = () =>
    !document.hidden &&
    ['welcome', 'modal', 'mapOverlay'].every((id) =>
      document.getElementById(id).classList.contains('hidden'),
    );
  if (!active()) throw Error('Entra al juego y cierra pausa/mapa antes de medir.');
  const canvas = document.getElementById('world');
  const gl = canvas.getContext('webgl2');
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  const viewport = {
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
    drawingBufferWidth: canvas.width,
    drawingBufferHeight: canvas.height,
  };
  const origin = { x: game.player.x, z: game.player.z };
  const intervals = [],
    calls = [],
    triangles = [];
  let last;
  const warmupEnd = performance.now() + 2000;
  const end = warmupEnd + seconds * 1000;
  await new Promise((resolve, reject) => {
    function sample(now) {
      if (!active()) return reject(Error('Medición interrumpida: pestaña oculta, pausa o mapa.'));
      if (
        innerWidth !== viewport.width ||
        innerHeight !== viewport.height ||
        canvas.width !== viewport.drawingBufferWidth ||
        canvas.height !== viewport.drawingBufferHeight
      ) {
        return reject(Error('Medición interrumpida: cambió la resolución.'));
      }
      if (now >= warmupEnd && last !== undefined) {
        intervals.push(now - last);
        calls.push(game.stats.calls);
        triangles.push(game.stats.triangles);
      }
      last = now >= warmupEnd ? now : undefined;
      if (now >= end) return resolve();
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  if (intervals.length < 30) throw Error('Muestra insuficiente; repite con la pestaña visible.');
  const p = (values, q) =>
    [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))];
  const round = (n) => Math.round(n * 100) / 100;
  const result = {
    timestamp: new Date().toISOString(),
    label,
    userAgent: navigator.userAgent,
    viewport,
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'no disponible',
    hardwareConcurrency: navigator.hardwareConcurrency,
    startPosition: origin,
    endPosition: { x: game.player.x, z: game.player.z },
    samples: intervals.length,
    meanFps: round((1000 * intervals.length) / intervals.reduce((n, v) => n + v, 0)),
    frameIntervalMedianMs: round(p(intervals, 0.5)),
    frameIntervalP95Ms: round(p(intervals, 0.95)),
    framesOver33msPercent: round(
      (100 * intervals.filter((v) => v > 33.34).length) / intervals.length,
    ),
    drawCallsMedian: p(calls, 0.5),
    renderedTrianglesMedian: p(triangles, 0.5),
    note: 'Intervalos RAF del navegador; incluyen sincronización/planificación, no son tiempos GPU. Las estadísticas de Three.js pueden incluir pasadas de sombra.',
  };
  console.table(result);
  if (download) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `chiclana-${label.replace(/[^a-z0-9_-]/gi, '-')}-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return result;
}
