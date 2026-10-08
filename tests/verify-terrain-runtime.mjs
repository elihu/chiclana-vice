import { updateMarkers } from '../web/js/game/missions.js';
import { rescue } from '../web/js/game/player.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRuntime } from './runtime-harness.mjs';
import { world, actors, camTarget, session } from '../web/js/core/state.js';

const city = JSON.parse(fs.readFileSync('web/world.json', 'utf8'));
// Rampa sintética al paso del piloto: el presupuesto de malla depende del paso fuente.
const half = city.size.map((v) => Math.ceil(v / 2 / 10) * 10);
const columns = half[0] / 5 + 1,
  rows = half[1] / 5 + 1,
  buffer = new ArrayBuffer(columns * rows * 2),
  dv = new DataView(buffer);
for (let j = 0; j < rows; j++)
  for (let i = 0; i < columns; i++)
    dv.setInt16(
      (j * columns + i) * 2,
      Math.round(-200 + (200 * i) / (columns - 1) + (200 * j) / (rows - 1)),
      true,
    );
const manifest = {
  version: 1,
  bounds: [-half[0], half[0], -half[1], half[1]],
  origin: city.origin,
  size: city.size,
  columns,
  rows,
  step: [10, 10],
  encoding: 'int16-le',
  scale: 0.1,
  rowOrder: 'north-to-south',
  diagonal: 'nw-se',
  file: 'terrain.bin',
  sha256: createHash('sha256').update(new Uint8Array(buffer)).digest('hex'),
  referenceElevation: 5,
};
const { g } = await createRuntime({ terrain: { manifest, buffer } });
assert.equal(g.terrain.kind, 'grid');
for (const p of g.people)
  assert.equal(
    p.mesh.position.y,
    g.surfaceHeightAt(p.mesh.position.x, p.mesh.position.z, p.surfaceY, p.s.roadId),
    'peatón ya colocado antes de iniciar',
  );
for (const b of g.city.buildings) {
  assert(Number.isFinite(b.baseY));
  assert(b.baseY >= Math.max(...b.p.map((p) => g.groundHeightAt(...p))) - 1e-5);
  const policy = world.facadeProfiles.heightPolicy;
  assert(Math.abs(b.h - (b.floors * policy.floorHeight + policy.baseOffset)) < 1e-8);
}
for (const c of g.vehicles) {
  assert.equal(c.mesh.position.y, g.surfaceHeightAt(c.x, c.z, c.surfaceY, c.surfaceRoad ?? null));
  assert(Math.abs(c.mesh.rotation.x) <= Math.PI / 12);
}
// La intro consulta una vez y no recoloca vehículos parados.
const surfaceQuery = world.surfaces.surfaceHeightAt;
let queryCount = 0;
world.surfaces.surfaceHeightAt = (...args) => {
  queryCount++;
  return surfaceQuery(...args);
};
g.frame(performance.now());
assert.equal(queryCount, 1, 'una sola consulta de superficie en la intro');
// El anillo se sube solo al cambiar el objetivo; su escala sigue animándose.
const goal = { x: g.pois[0].x + 1, z: g.pois[0].z };
updateMarkers(goal);
const ringPositions = actors.ring.geometry.getAttribute('position'),
  version = ringPositions.version,
  firstQueries = queryCount;
session.t += 0.1;
updateMarkers({ ...goal });
assert.equal(ringPositions.version, version, 'sin subida de geometría por frame');
assert.equal(queryCount, firstQueries, 'sin consultas de marcador por frame');
updateMarkers({ ...goal, x: goal.x + 5 });
assert(ringPositions.version > version, 'objetivo nuevo reconstruye anillo');
world.surfaces.surfaceHeightAt = surfaceQuery;
g.start();
for (let i = 0; i < 120; i++) g.update(1 / 60);
assert(g.camPos.y > g.surfaceHeightAt(g.camPos.x, g.camPos.z));
assert(camTarget.y > g.surfaceHeightAt(g.player.x, g.player.z));
g.interact();
g.update(1 / 60);
assert.equal(actors.character.mesh.position.y, g.surfaceHeightAt(g.player.x, g.player.z));
for (let i = 0; i < 3; i++) {
  g.cycleCamera();
  g.update(1 / 60);
  assert(g.camPos.toArray().every(Number.isFinite));
}
g.player.car = null;
for (const poi of g.pois) {
  Object.assign(g.player, g.safePoint(poi.x, poi.z));
  g.update(1 / 60);
  assert.equal(
    actors.character.mesh.position.y,
    g.surfaceHeightAt(g.player.x, g.player.z, g.player.surfaceY),
  );
}
const positions = [];
g.scene.traverse((o) => {
  if (o.isMesh) positions.push(o.geometry.getAttribute('position').array);
});
for (const p of positions) assert(Array.from(p).every(Number.isFinite));
const t = world.terrain;
g.setCoarse(false);
await g.reloadGroundTexture();
assert.equal(world.terrain, t);
assert(!session.paused);
console.log(
  'Synthetic ramp: building bases, vehicle tilt, walking, cameras, POIs and quality passed',
);

assert.doesNotThrow(() => rescue(), 'rescate a pie sin acceder a un coche ausente');
assert.equal(g.player.car, null);
assert(Number.isFinite(g.player.surfaceY), 'rescate a pie vuelve a una superficie válida');
