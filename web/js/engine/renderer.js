import * as THREE from '../../vendor/three.module.min.js';
import { $ } from '../core/dom.js';
import { gfx, world } from '../core/state.js';
import { mat } from './materials.js';

export function setupRenderer() {
  gfx.renderer = new gfx.platform.WebGLRenderer({
    canvas: $('world'),
    antialias: true,
    powerPreference: 'high-performance',
  });
  gfx.renderer.setSize(gfx.W, gfx.H);
  gfx.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  gfx.renderer.outputColorSpace = THREE.SRGBColorSpace;
  gfx.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  gfx.renderer.toneMappingExposure = 1.2;
  gfx.scene = new THREE.Scene();
  gfx.scene.background = new THREE.Color('#a5bbc8');
  gfx.scene.fog = new THREE.Fog('#a5bbc8', 175, 620);
  gfx.camera = new THREE.PerspectiveCamera(62, gfx.W / gfx.H, 0.15, 1800);
  const hemi = new THREE.HemisphereLight('#d9eaf4', '#9a8868', 2.2);
  gfx.scene.add(hemi);
  gfx.sun = new THREE.DirectionalLight('#fff0d6', 3.2);
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
  applyQuality();
}

export function addGroundPlanes(geometry, exterior) {
  let g = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial(
      world.groundTexture
        ? { map: world.groundTexture, roughness: 1 }
        : { color: '#9a9b86', roughness: 1 },
    ),
  );
  g.name = 'terrain-ground';
  g.receiveShadow = true;
  gfx.scene.add(g);
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

// Light mode: DPR 1, no shadow casting (forces shader recompilation) and shorter fog.
export function applyQuality() {
  const low = gfx.quality === 'low';
  gfx.renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio || 1, gfx.coarse ? 1.35 : 1.75));
  gfx.renderer.shadowMap.enabled = !low;
  gfx.sun.castShadow = !low;
  gfx.scene.fog.far = low ? 380 : 620;
  gfx.needsRender = true;
}
