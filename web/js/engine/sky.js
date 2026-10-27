import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';

const {
  uniform,
  vec3,
  float,
  mix,
  smoothstep,
  saturate,
  pow,
  max,
  dot,
  normalize,
  length,
  positionLocal,
  positionWorld,
  cameraPosition,
  pmremTexture,
  fog,
  rangeFogFactor,
} = THREE.TSL;

// Valores ajustables del cielo, la luz de entorno y la niebla (colores en sRGB). Los uniformes se
// pueden cambiar en vivo desde la consola con `setSky({ zenith: '#5588bb' })`.
export const SKY = {
  // Degradado: el horizonte coincide con el color de la niebla de G2; el cenit es más azul.
  horizon: '#d6d9d2',
  zenith: '#2a68c0',
  // Suelo lejano neutro y algo cálido, por debajo del horizonte; también es el rebote del entorno.
  ground: '#a89a7c',
  // Exponente del degradado: menor sube antes al cenit.
  gradientPower: 0.5,
  // Halo del sol: ancho (resplandor del horizonte) y estrecho (corona), color y fuerza.
  haloColor: '#ffd9a0',
  haloWide: 0.45,
  haloTight: 1.6,
  haloStrength: 1.6,
  // Fuerza del halo dentro del entorno horneado (la luz directa ya la pone el sol).
  envHalo: 0.5,
  // Luz ambiente del cielo horneado y de la hemisférica de apoyo.
  envIntensity: 0.95,
  hemiIntensity: 0.4,
  // Niebla: altura mínima del rayo sobre el horizonte al muestrear el entorno, desenfoque
  // (0 nítido, 1 muy difuso) y cuánto aclara con la altura de la cámara entre 20 y 400 m.
  fogHorizonY: 0.02,
  fogBlur: 0.3,
  fogBrighten: 0.25,
};

export const skyUniforms = {
  horizon: uniform(new THREE.Color(SKY.horizon)),
  zenith: uniform(new THREE.Color(SKY.zenith)),
  ground: uniform(new THREE.Color(SKY.ground)),
  power: uniform(SKY.gradientPower),
  haloColor: uniform(new THREE.Color(SKY.haloColor)),
  haloWide: uniform(SKY.haloWide),
  haloTight: uniform(SKY.haloTight),
  halo: uniform(SKY.haloStrength),
  fogNear: uniform(175),
  fogFar: uniform(620),
  fogBrighten: uniform(SKY.fogBrighten),
};

const colorKeys = ['horizon', 'zenith', 'ground', 'haloColor'],
  numberKeys = {
    gradientPower: 'power',
    haloWide: 'haloWide',
    haloTight: 'haloTight',
    haloStrength: 'halo',
    fogBrighten: 'fogBrighten',
  };

// Cambia valores de SKY en vivo (colores, halo, niebla). La luz ambiente (envIntensity,
// hemiIntensity) se aplica con `applySkyLight()`; para rehornear el entorno, `bakeSkyEnvironment()`.
export function setSky(patch = {}) {
  Object.assign(SKY, patch);
  for (const key of colorKeys) skyUniforms[key].value.set(SKY[key]);
  for (const [key, name] of Object.entries(numberKeys)) skyUniforms[name].value = SKY[key];
  applySkyLight();
  gfx.needsRender = true;
}

function skyColorAt(dir, sunDir) {
  const u = skyUniforms,
    up = pow(saturate(dir.y), u.power),
    below = smoothstep(-0.25, 0, dir.y).oneMinus(),
    cosSun = saturate(dot(dir, sunDir)),
    halo = pow(cosSun, 6).mul(u.haloWide).add(pow(cosSun, 80).mul(u.haloTight)).mul(u.halo);
  return mix(mix(u.horizon, u.zenith, up), u.ground, below).add(u.haloColor.mul(halo));
}

let sky = null,
  hemiLight = null;

// Cúpula unida a la cámara. Sin profundidad ni niebla: se dibuja primero y lo demás la tapa.
export function createSky(sunDirection, hemi) {
  hemiLight = hemi;
  const sunDir = vec3(...sunDirection.clone().normalize().toArray()),
    material = new THREE.MeshBasicNodeMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
  material.colorNode = skyColorAt(normalize(positionLocal), sunDir);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
  dome.name = 'sky-dome';
  dome.scale.setScalar(1000);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  gfx.scene.add(dome);
  sky = { dome, material };
  return sky;
}

export function updateSky(camera) {
  if (sky) sky.dome.position.copy(camera.position);
}

let pmrem = null,
  envTarget = null;

// Hornea el cielo una sola vez (cubo PMREM). Devuelve los milisegundos que ha costado.
export async function bakeSkyEnvironment() {
  const t0 = performance.now(),
    envScene = new THREE.Scene(),
    dome = new THREE.Mesh(sky.dome.geometry, sky.material);
  dome.scale.setScalar(50);
  envScene.add(dome);
  pmrem ??= new THREE.PMREMGenerator(gfx.renderer);
  const base = skyUniforms.halo.value;
  skyUniforms.halo.value = base * SKY.envHalo;
  try {
    envTarget = await pmrem.fromSceneAsync(envScene, 0, 0.1, 100, { renderTarget: envTarget });
  } finally {
    skyUniforms.halo.value = base;
  }
  gfx.scene.environment = envTarget.texture;
  applySkyLight();
  gfx.scene.fogNode = createSkyFogNode(envTarget.texture);
  return performance.now() - t0;
}

// Reparto de la luz ambiente entre el entorno horneado y la hemisférica. Son uniformes.
export function applySkyLight() {
  if (gfx.scene) gfx.scene.environmentIntensity = SKY.envIntensity;
  if (hemiLight) hemiLight.intensity = SKY.hemiIntensity;
}

// Niebla del color del cielo. Mismas distancias que la `Fog` lineal de la escena (que sigue ahí
// para la cámara y el descarte); el color sale del entorno horneado, hacia el horizonte en la
// dirección de la vista, y aclara con la altura de la cámara.
function createSkyFogNode(envTexture) {
  const toFrag = positionWorld.sub(cameraPosition),
    dir = toFrag.div(max(length(toFrag), 0.001)),
    lift = smoothstep(20, 400, cameraPosition.y),
    horizonDir = normalize(vec3(dir.x, max(dir.y, SKY.fogHorizonY), dir.z)),
    haze = pmremTexture(envTexture, horizonDir, float(SKY.fogBlur)).rgb,
    color = mix(haze, vec3(1), lift.mul(skyUniforms.fogBrighten));
  return fog(color, rangeFogFactor(skyUniforms.fogNear, skyUniforms.fogFar));
}

// Mantiene los uniformes de la niebla del cielo iguales a los de `scene.fog`.
export function syncSkyFog() {
  const f = gfx.scene?.fog;
  if (!f) return;
  skyUniforms.fogNear.value = f.near;
  skyUniforms.fogFar.value = f.far;
}
