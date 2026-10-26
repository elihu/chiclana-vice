import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';

const { uniform, vec3, mix, smoothstep, saturate, pow, dot, normalize, positionLocal } = THREE.TSL;

// Valores ajustables del cielo (colores en sRGB). Los uniformes se
// pueden cambiar en vivo desde la consola con `setSky({ zenith: '#5588bb' })`.
export const SKY = {
  // Degradado: el horizonte coincide con el color de la niebla de G2; el cenit es más azul.
  horizon: '#a5bbc8',
  zenith: '#7aa0c8',
  // Suelo lejano neutro y algo cálido, por debajo del horizonte; también es el rebote del entorno.
  ground: '#a89a7c',
  // Exponente del degradado: menor sube antes al cenit.
  gradientPower: 0.6,
  // Halo del sol: ancho (resplandor del horizonte) y estrecho (corona), color y fuerza.
  haloColor: '#ffe3b5',
  haloWide: 0.28,
  haloTight: 0.9,
  haloStrength: 1,
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
};

const colorKeys = ['horizon', 'zenith', 'ground', 'haloColor'],
  numberKeys = {
    gradientPower: 'power',
    haloWide: 'haloWide',
    haloTight: 'haloTight',
    haloStrength: 'halo',
  };

// Cambia valores de SKY en vivo (colores y halo).
export function setSky(patch = {}) {
  Object.assign(SKY, patch);
  for (const key of colorKeys) skyUniforms[key].value.set(SKY[key]);
  for (const [key, name] of Object.entries(numberKeys)) skyUniforms[name].value = SKY[key];
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

let sky = null;

// Cúpula unida a la cámara. Sin profundidad ni niebla: se dibuja primero y lo demás la tapa.
export function createSky(sunDirection) {
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
