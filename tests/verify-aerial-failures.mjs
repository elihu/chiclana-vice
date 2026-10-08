import assert from 'node:assert/strict';
import { createRuntime } from './runtime-harness.mjs';
import { world } from '../web/js/core/state.js';
import { boundsBox } from '../web/js/world/bounds.js';
import {
  aerialMaterial,
  aerialTileStatus,
  reloadAerialTiles,
} from '../web/js/world/aerial-tiles.js';

const file = process.argv[2];
assert(['aerial/index.json', 'aerial/general.jpg'].includes(file));
const { g, els, requested } = await createRuntime({ failedAssets: [file] });
assert(g && world.terrain.kind === 'grid', 'arranca con relieve pese al fallo');
assert.equal(world.groundTexture, null);
assert.equal(els.toast.textContent, 'Ortofoto no disponible: suelo y tejados en color liso');
assert.deepEqual(world.aerialBox, boundsBox());
const ground = g.scene.getObjectByName('terrain-ground');
assert(ground.isGroup && ground.children.length === 24);
let plain = 0;
for (const mesh of ground.children) {
  if (!mesh.material.map) {
    assert.equal(mesh.material.color.getHexString(), '9a9b86');
    plain++;
  } else assert.equal(mesh.material.color.getHexString(), 'ffffff');
}
assert(plain > 0, 'teselas sin textura conservan el color del suelo');
let plainRoofs = 0;
g.scene.traverse((o) => {
  if (o.material?.userData.plainColor === '#b4a58f' && !o.material.map) {
    assert.equal(o.material.color.getHexString(), 'b4a58f');
    plainRoofs++;
  }
});
assert(plainRoofs > 0, 'tejados sin textura conservan su color');
assert.equal(
  g.scene.getObjectByName('aerial-roofs-general').children[0].material.color.getHexString(),
  'b4a58f',
);
for (const [options, color] of [
  [{}, '#9a9b86'],
  [{ roughness: 0.98 }, '#b4a58f'],
]) {
  const material = aerialMaterial(100, 100, options, color);
  assert.equal(material.map, null);
  assert.equal(material.color.getHexString(), color.slice(1));
  material.dispose();
}
if (file === 'aerial/index.json') {
  assert.equal(world.aerialIndex, null);
  await reloadAerialTiles();
  assert.equal(aerialTileStatus().loaded.length, 0);
  assert(!requested.some((u) => /aerial\/(hi|lo)\//.test(u)), 'sin índice no pide teselas');
  assert(!requested.some((u) => u.startsWith('aerial/general.jpg')));
} else {
  assert(world.aerialIndex);
  assert(
    requested.findIndex((u) => u.startsWith('height-samples.json')) <
      requested.findIndex((u) => u.startsWith('aerial/general.jpg')),
    'otras capas arrancan antes de resolver el índice',
  );
  await reloadAerialTiles();
  assert(aerialTileStatus().loaded.length > 0, 'las teselas funcionan sin vista general');
}
console.log(`Fallo ${file}: arranque, aviso, recuadro y colores lisos OK`);
