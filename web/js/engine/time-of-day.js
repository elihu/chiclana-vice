import { urlOptions } from '../core/dom.js';
import { gfx } from '../core/state.js';
import { PROGRESS_LIMITS } from '../../game-data.js';
import { readProgress, TIME_IDS } from '../../progress.js';
import { GRADE, setGrade } from './post.js';
import { SUN, setSun } from './renderer.js';
import { bakeSkyEnvironment, SKY, setNight, setSky } from './sky.js';

// Horas del día. Cada una es un conjunto de valores (sol, cielo, niebla, gradación y noche) que se
// aplican sobre los mismos uniformes: no se crea ningún material ni shader, así que cambiar de hora
// no recompila nada. Solo se rehornea el entorno (PMREM) una vez. La tarde es la de siempre: se
// toma de los valores iniciales de `SUN`, `SKY` y `GRADE`, así que no puede desviarse de ellos.
// `night` (0 a 1) enciende ventanas, escaparates, faros y pilotos.
const OVERRIDES = {
  manana: {
    name: 'Mañana',
    sun: { direction: [120, 52, 40], color: '#ffe3bd', intensity: 3.0 },
    sky: {
      horizon: '#e3dccb',
      zenith: '#3b7bc6',
      ground: '#a39b82',
      haloColor: '#ffe2b4',
      haloStrength: 1.3,
    },
    fog: '#c7cfcf',
    grade: { exposure: 1.02, saturation: 1.22 },
  },
  mediodia: {
    name: 'Mediodía',
    sun: { direction: [-25, 150, 25], color: '#fff3e0', intensity: 3.9 },
    sky: {
      horizon: '#cbdde2',
      zenith: '#1e62c6',
      ground: '#aaa088',
      haloColor: '#fff0cc',
      haloStrength: 0.9,
      envIntensity: 1.0,
    },
    fog: '#b6cad5',
    grade: { exposure: 0.98, contrast: 1.2, highlightTint: [1.03, 1.0, 0.96] },
  },
  tarde: { name: 'Tarde' },
  anochecer: {
    name: 'Anochecer',
    sun: { direction: [-150, 20, 55], color: '#ff9a5c', intensity: 1.5 },
    sky: {
      horizon: '#dc8a62',
      zenith: '#1a2a58',
      ground: '#4b4048',
      haloColor: '#ff8a50',
      haloStrength: 2.1,
      fogBrighten: 0.08,
      envIntensity: 0.55,
      hemiIntensity: 0.24,
    },
    fog: '#7d6670',
    grade: {
      exposure: 1.25,
      contrast: 1.18,
      saturation: 1.2,
      shadowTint: [0.9, 0.95, 1.14],
      highlightTint: [1.1, 0.98, 0.84],
      vignette: 0.42,
    },
    night: 1,
  },
};

// Valores completos de cada hora (la tarde, los iniciales; las demás los modifican). Se calcula al
// primer uso, antes de que nada cambie `SUN`, `SKY` ni `GRADE`.
export const TIMES = {};

let ready = false,
  current = 'tarde',
  bakeChain = Promise.resolve();

function buildTimes() {
  if (ready) return;
  ready = true;
  const base = {
    sun: { ...SUN, direction: [...SUN.direction] },
    sky: { ...SKY },
    fog: '#a5bbc8', // el color de `scene.fog` que crea renderer.js
    grade: { ...GRADE, shadowTint: [...GRADE.shadowTint], highlightTint: [...GRADE.highlightTint] },
    night: 0,
  };
  for (const id of TIME_IDS) {
    const o = OVERRIDES[id];
    TIMES[id] = {
      name: o.name,
      sun: { ...base.sun, ...o.sun },
      sky: { ...base.sky, ...o.sky },
      fog: o.fog ?? base.fog,
      grade: { ...base.grade, ...o.grade },
      night: o.night ?? base.night,
    };
  }
}

export const currentTime = () => current;
export const timeName = (id = current) => OVERRIDES[id]?.name ?? '';
export const nextTime = () => TIME_IDS[(TIME_IDS.indexOf(current) + 1) % TIME_IDS.length];

// Hora de inicio: `#hora=` en la URL (para pruebas) o la guardada con la partida; si no, la tarde.
export function initialTime() {
  const forced = urlOptions().get('hora');
  if (TIME_IDS.includes(forced)) return forced;
  return readProgress(() => localStorage, PROGRESS_LIMITS).time;
}

// Aplica una hora: sol, cielo, niebla, gradación y noche. Con `bake` (por defecto) y el entorno ya
// horneado, lo rehornea una sola vez y devuelve los milisegundos (también en `gfx.timeBakeMs`). Al
// arrancar, el renderizador hornea después, así que se llama con `bake: false`.
export async function setTimeOfDay(id, { bake = true } = {}) {
  buildTimes();
  const time = TIMES[id] ?? TIMES.tarde;
  current = TIMES[id] ? id : 'tarde';
  setSun(time.sun);
  setSky(time.sky);
  gfx.scene?.fog?.color.set(time.fog);
  setGrade(time.grade);
  setNight(time.night);
  if (!bake || gfx.skyBakeMs == null) return 0;
  // Los rehorneados van en cola: si se cambia de hora rápido, el último manda.
  bakeChain = bakeChain.then(async () => {
    gfx.timeBakeMs = await bakeSkyEnvironment();
    gfx.needsRender = true;
  });
  await bakeChain;
  return gfx.timeBakeMs;
}
