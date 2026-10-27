import { gfx } from '../core/state.js';
import { renderFrame } from './renderer.js';

// WebGPURenderer crea cada pipeline la primera vez que se dibuja un objeto: al girar entran
// objetos nuevos y el frame espera a que se compilen (tirones de más de 1 s en un móvil).
// Esto lo adelanta a la pantalla de carga: con todo visible y sin descarte por campo de
// visión, compila los pipelines del pase principal con `compileAsync` y dibuja un frame de
// calentamiento, que crea también los de la pasada de sombras (`compileAsync` no los toca).
// La pasada de sombras se fuerza aunque el modo ligero la tenga apagada, de modo que cambiar
// entre normal y ligero en marcha no compila nada (solo cambian uniformes; ver `applyQuality`).
export async function precompileShaders(onProgress) {
  const { renderer, scene, camera } = gfx,
    shadow = gfx.sun.shadow,
    saved = [];
  scene.traverse((object) => {
    saved.push([object, object.visible, object.frustumCulled]);
    object.visible = true;
    object.frustumCulled = false;
  });
  const shadowState = [shadow.autoUpdate, shadow.needsUpdate, shadow.intensity];
  try {
    await renderer.compileAsync(scene, camera, null, onProgress);
    shadow.autoUpdate = true;
    shadow.needsUpdate = true;
    renderer.render(scene, camera);
    // Pipelines de la cúpula del cielo (ya en la escena) y de la gradación (RenderPipeline), que
    // el modo ligero no usa pero puede activarse al cambiar de calidad.
    renderFrame(true);
  } finally {
    for (const [object, visible, culled] of saved) {
      object.visible = visible;
      object.frustumCulled = culled;
    }
    [shadow.autoUpdate, shadow.needsUpdate, shadow.intensity] = shadowState;
    gfx.needsRender = true;
  }
}
