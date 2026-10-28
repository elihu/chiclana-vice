// Regresión puntual de las juntas del tranvía: sin DOM, render ni simulación del juego.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { readWorld } from '../tools/world-files.mjs';
import { applyCorrections } from '../web/js/world/corrections.js';
import { createTerrain } from '../web/js/world/terrain.js';
import { createSurfaceModel } from '../web/js/world/surface-model.js';

const read = (p) => JSON.parse(fs.readFileSync(p)),
  city = readWorld();
applyCorrections(city, read('web/map-corrections.json'));
const data = fs.readFileSync('web/terrain.bin'),
  design = read('web/city-design.json'),
  terrain = createTerrain(
    read('web/terrain.json'),
    data.buffer.slice(data.byteOffset, data.byteOffset + data.length),
    city,
  ),
  tracks = read('web/tram.json').tracks,
  model = createSurfaceModel(city, terrain, design.terrainSurfaces, [], {
    tracks,
    width: design.tram.stripWidth,
  });
let joints = 0;
for (const track of tracks.filter((t) => t.bridge)) {
  const id = 'tram:' + track.id,
    platform = model.platforms.find((p) => p.deckRoads.includes(id));
  assert(platform, 'el puente del tranvía comparte un tablero');
  for (const point of [track.p[0], track.p.at(-1)]) {
    const y = model.surfaceHeightAt(...point, null, id);
    assert(Math.abs(y - platform.heightAt(...point)) < 0.01, 'la vía se apoya en el tablero');
    for (const neighbour of tracks.filter(
      (t) =>
        t !== track &&
        [t.p[0], t.p.at(-1)].some((q) => Math.hypot(q[0] - point[0], q[1] - point[1]) < 0.01),
    )) {
      assert(
        Math.abs(y - model.surfaceHeightAt(...point, null, 'tram:' + neighbour.id)) < 0.01,
        'la junta del acceso no cae hasta el terreno inferior',
      );
      joints++;
    }
  }
}
assert(joints >= 2, 'ambos accesos del puente quedan cubiertos');
console.log('Tranvía: tablero y dos accesos comparten rasante');
