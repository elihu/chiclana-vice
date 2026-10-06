import * as THREE from '../../vendor/three.module.min.js';
import { $ } from '../core/dom.js';
import { PLACES, JOBS as jobs } from '../../game-data.js';
import { actors, gfx, pois, state } from '../core/state.js';
import { safePoint } from '../world/spatial.js';

export function setupPOIs() {
  for (const [name, x, z] of PLACES) {
    let safe = safePoint(x, z);
    let el = document.createElement('span');
    el.className = 'poi';
    el.textContent = name;
    $('poiLabels').appendChild(el);
    pois.push({ name, x: safe.x, z: safe.z, labelX: x, labelZ: z, el });
  }
}

export function target() {
  let j = jobs[state.job];
  if (!j) return null;
  let s = j.stages[state.stage];
  return { ...pois[s.poi], ...s };
}

export function createMissionMarkers() {
  actors.ring = new THREE.Mesh(
    new THREE.RingGeometry(5.5, 6.2, 48),
    new THREE.MeshBasicMaterial({
      color: '#ffd285',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  actors.ring.rotation.x = -Math.PI / 2;
  actors.ring.position.y = 0.15;
  gfx.scene.add(actors.ring);
  actors.beam = new THREE.Mesh(
    new THREE.CylinderGeometry(5.6, 5.6, 4, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#ffc177',
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  gfx.scene.add(actors.beam);
  let arrowGeo = new THREE.ConeGeometry(0.55, 1.5, 4);
  actors.arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#edfa88' }));
  gfx.scene.add(actors.arrow);
}
