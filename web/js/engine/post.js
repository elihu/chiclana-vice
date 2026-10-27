import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';

const {
  pass,
  uniform,
  vec2,
  vec3,
  vec4,
  float,
  mix,
  dot,
  max,
  pow,
  smoothstep,
  length,
  screenUV,
  screenSize,
} = THREE.TSL;

// Gradación de color y viñeta, aplicadas en lineal antes del mapeo de tonos. Cambia en vivo con
// `setGrade({ contrast: 1.2 })` desde la consola; con `1` / `0` donde corresponda no hacen nada.
export const GRADE = {
  exposure: 1, // multiplica la luz antes del mapeo de tonos
  contrast: 1.25, // pivota sobre gris medio (0,18); 1 = sin cambio
  saturation: 1.28, // 1 = sin cambio
  shadowTint: [0.97, 1.0, 1.04], // multiplica las sombras: algo frías
  highlightTint: [1.07, 1.0, 0.92], // multiplica las luces: algo cálidas
  vignette: 0.34, // oscurecimiento en las esquinas; 0 = sin viñeta
};

const u = {
  exposure: uniform(GRADE.exposure),
  contrast: uniform(GRADE.contrast),
  saturation: uniform(GRADE.saturation),
  shadowTint: uniform(new THREE.Vector3(...GRADE.shadowTint)),
  highlightTint: uniform(new THREE.Vector3(...GRADE.highlightTint)),
  vignette: uniform(GRADE.vignette),
};

export function setGrade(patch = {}) {
  Object.assign(GRADE, patch);
  u.exposure.value = GRADE.exposure;
  u.contrast.value = GRADE.contrast;
  u.saturation.value = GRADE.saturation;
  u.shadowTint.value.set(...GRADE.shadowTint);
  u.highlightTint.value.set(...GRADE.highlightTint);
  u.vignette.value = GRADE.vignette;
  gfx.needsRender = true;
}

const LUMA = vec3(0.2126, 0.7152, 0.0722);

function gradeNode(scene) {
  const color = max(scene.rgb, vec3(0)).mul(u.exposure),
    luma = max(dot(color, LUMA), 0.0001),
    tinted = color
      .mul(mix(u.shadowTint, vec3(1), smoothstep(0.02, 0.6, luma)))
      .mul(mix(vec3(1), u.highlightTint, smoothstep(0.6, 3, luma))),
    // Contraste sobre gris medio, escalando los tres canales a la vez.
    contrasted = tinted.mul(pow(luma.div(0.18), u.contrast.sub(1))),
    gray = dot(contrasted, LUMA),
    saturated = max(mix(vec3(gray), contrasted, u.saturation), vec3(0)),
    // Distancia al centro normalizada por la de la esquina: igual en horizontal y vertical.
    aspect = screenSize.x.div(screenSize.y),
    corner = length(vec2(aspect, 1).mul(0.5)),
    radius = length(screenUV.sub(0.5).mul(vec2(aspect, 1))).div(corner),
    vignette = float(1).sub(smoothstep(0.35, 1, radius).mul(u.vignette));
  return vec4(saturated.mul(vignette), 1);
}

// Cadena de render con gradación. Añade un pase (escena a textura y pantalla completa), por lo
// que el modo ligero la apaga. Devuelve `null` si el renderizador no es el real (pruebas).
export function createPost() {
  if (!(gfx.renderer instanceof THREE.Renderer)) return null;
  const scenePass = pass(gfx.scene, gfx.camera, { samples: 4 }),
    pipeline = new THREE.RenderPipeline(gfx.renderer, gradeNode(scenePass.getTextureNode()));
  return pipeline;
}
