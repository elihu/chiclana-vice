import * as THREE from '../../vendor/three.webgpu.min.js';
import { $, urlOptions } from '../core/dom.js';
import { gfx } from '../core/state.js';
import { mat } from './materials.js';
import { createPost } from './post.js';
import { applySkyLight, bakeSkyEnvironment, createSky, SKY, syncSkyFog, updateSky } from './sky.js';
import { applyGroundDetailQuality } from './textures.js';

// Equilibrio de luz elegido en G2.2 (combinación B).
// La hemisférica de apoyo y la luz del cielo horneado se reparten en `SKY` (sky.js).
const EXPOSURE = 1.05,
  SUN_INTENSITY = 3.2;

const SUN_OFFSET = new THREE.Vector3(-85, 125, 60),
  sunBasis = new THREE.Matrix4().lookAt(
    SUN_OFFSET,
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
  ),
  sunBasisInverse = sunBasis.clone().invert(),
  snapped = new THREE.Vector3();

export function placeSun(x, y, z) {
  const cam = gfx.sun.shadow.camera,
    texel = (cam.right - cam.left) / gfx.sun.shadow.mapSize.x;
  snapped.set(x, y, z).applyMatrix4(sunBasisInverse);
  snapped.x = Math.round(snapped.x / texel) * texel;
  snapped.y = Math.round(snapped.y / texel) * texel;
  snapped.applyMatrix4(sunBasis);
  gfx.sun.target.position.copy(snapped);
  gfx.sun.position.copy(snapped).add(SUN_OFFSET);
  gfx.sun.target.updateMatrixWorld();
}

// WebGPURenderer usa WebGPU cuando el navegador lo ofrece y si no WebGL 2; `?motor=webgl`
// fuerza WebGL 2 para comparar los dos motores en el mismo equipo.
export async function setupRenderer() {
  const forceWebGL = urlOptions().get('motor') === 'webgl';
  gfx.renderer = new gfx.platform.Renderer({
    canvas: $('world'),
    antialias: true,
    powerPreference: 'high-performance',
    forceWebGL,
  });
  await gfx.renderer.init();
  gfx.backend = gfx.renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  // La pérdida del dispositivo WebGPU usa el mismo aviso que la del contexto WebGL.
  gfx.renderer.onDeviceLost = () => $('world').dispatchEvent(new Event('webglcontextlost'));
  gfx.renderer.setSize(gfx.W, gfx.H);
  gfx.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  gfx.renderer.outputColorSpace = THREE.SRGBColorSpace;
  gfx.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  gfx.renderer.toneMappingExposure = EXPOSURE;
  gfx.scene = new THREE.Scene();
  gfx.scene.fog = new THREE.Fog('#a5bbc8', 175, 620);
  gfx.camera = new THREE.PerspectiveCamera(62, gfx.W / gfx.H, 0.15, 1800);
  const hemi = new THREE.HemisphereLight('#d9eaf4', '#9a8868', SKY.hemiIntensity);
  gfx.scene.add(hemi);
  createSky(SUN_OFFSET, hemi);
  gfx.sun = new THREE.DirectionalLight('#fff0d6', SUN_INTENSITY);
  gfx.sun.position.set(-100, 150, 60);
  gfx.sun.shadow.mapSize.set(1024, 1024);
  Object.assign(gfx.sun.shadow.camera, {
    left: -75,
    right: 75,
    top: 75,
    bottom: -75,
    near: 1,
    far: 350,
  });
  gfx.sun.shadow.camera.updateProjectionMatrix();
  gfx.sun.shadow.bias = -0.0002;
  gfx.sun.shadow.normalBias = 0.09;
  gfx.scene.add(gfx.sun, gfx.sun.target);
  // Con el renderizador simulado de las pruebas no hay entorno horneado ni gradación.
  if (gfx.renderer instanceof THREE.Renderer) {
    gfx.skyBakeMs = await bakeSkyEnvironment();
    post = createPost();
  } else applySkyLight();
  applyQuality();
}

// Dibuja un fotograma: con gradación (RenderPipeline) o directo en el modo ligero.
let post = null,
  postOn = false;

// `force` usa la gradación aunque el modo ligero la tenga apagada (la precompilación de los shaders).
export function renderFrame(force = false) {
  updateSky(gfx.camera);
  if (post && (postOn || force)) post.render();
  else gfx.renderer.render(gfx.scene, gfx.camera);
}

export function addGroundPlanes(tiles, exterior) {
  const ground = new THREE.Group();
  ground.name = 'terrain-ground';
  for (const { geometry, material, i, j } of tiles) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.aerialTile = [i, j];
    mesh.receiveShadow = true;
    ground.add(mesh);
  }
  gfx.scene.add(ground);
  let outer = new THREE.Mesh(
    exterior || new THREE.PlaneGeometry(8000, 8000),
    mat('#9a9b86', exterior ? { side: THREE.DoubleSide } : {}),
  );
  if (!exterior) {
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.1;
  }
  gfx.scene.add(outer);
}

export function resizeRenderer() {
  gfx.W = innerWidth;
  gfx.H = innerHeight;
  if (!gfx.renderer) return;
  gfx.renderer.setSize(gfx.W, gfx.H);
  gfx.camera.aspect = gfx.W / gfx.H;
  gfx.camera.updateProjectionMatrix();
  gfx.needsRender = true;
}

// Sombras del sol. Con WebGPURenderer (r186), cambiar en marcha `shadowMap.enabled` o
// `castShadow` deja nodos de sombra destruidos en pipelines de la caché y el render lanza una
// excepción que detiene el bucle. El sol proyecta siempre; sin sombras, el mapa deja de
// actualizarse (no hay pasada de sombras, que es lo caro) y su intensidad es 0. Los dos son
// uniformes: no se recompila nada.
export function setSunShadows(on) {
  const shadow = gfx.sun.shadow;
  gfx.renderer.shadowMap.enabled = true;
  gfx.sun.castShadow = true;
  if (gfx.sunShadows === on) return;
  gfx.sunShadows = on;
  shadow.autoUpdate = on;
  shadow.needsUpdate = on;
  shadow.intensity = on ? 1 : 0;
  gfx.needsRender = true;
}

// Light mode: DPR 1, no shadows, shorter fog and no colour grading (it adds a full-screen pass).
export function applyQuality() {
  const low = gfx.quality === 'low';
  applyGroundDetailQuality();
  gfx.renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio || 1, gfx.coarse ? 1.35 : 1.75));
  setSunShadows(!low);
  gfx.scene.fog.far = low ? 380 : 620;
  syncSkyFog();
  postOn = !low && post !== null;
  gfx.needsRender = true;
}
