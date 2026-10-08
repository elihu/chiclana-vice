import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.min.js';
import { gfx, world } from '../web/js/core/state.js';
import {
  aerialMaterial,
  aerialTileStatus,
  desiredAerialTiles,
  reloadAerialTiles,
  updateAerialTiles,
} from '../web/js/world/aerial-tiles.js';
import { terrainGeometry, terrainTiles } from '../web/js/world/terrain-mesh.js';

export async function verifyAerialTiles({
  g,
  requested,
  initialAerialRequests,
  initialDesiredTiles,
  assetVersion,
}) {
  const initial = initialAerialRequests.filter((u) => /aerial\/(hi|lo)\//.test(u));
  assert(initial.length <= 9, 'solo las teselas del radio al arrancar');
  assert(
    initial.every((u) => initialDesiredTiles.includes(u.split('/').at(-1).split('.jpg')[0])),
    'cada petición inicial pertenece al radio',
  );
  assert(!requested.some((u) => /^aerial(?:-2048)?\.jpg/.test(u)), 'sin ortofoto única');
  const saved = {
    x: g.player.x,
    z: g.player.z,
    a: g.player.a,
    speed: g.player.speed,
    quality: gfx.quality,
    coarse: gfx.coarse,
    loader: gfx.platform.TextureLoader,
  };
  const general = world.groundTexture;
  let generalDisposed = false;
  general.addEventListener('dispose', () => {
    generalDisposed = true;
  });
  const discarded = [],
    requests = [],
    queue = [];
  let maximum = 0;
  class Loader {
    loadAsync(url) {
      requests.push(url);
      return new Promise((resolve, reject) => {
        queue.push({ url, resolve, reject });
        maximum = Math.max(maximum, queue.length);
      });
    }
  }
  const tick = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  const finish = async (fail = null) => {
    while (queue.length) {
      const task = queue.shift();
      if (task.url === fail) task.reject(Error('fallo de tesela simulado'));
      else {
        const texture = new THREE.Texture();
        texture.addEventListener('dispose', () => discarded.push(texture));
        task.resolve(texture);
      }
      await tick();
      assert(aerialTileStatus().loaded.length <= (gfx.quality === 'low' || gfx.coarse ? 9 : 12));
    }
  };
  await reloadAerialTiles();
  gfx.platform.TextureLoader = Loader;
  gfx.coarse = false;
  gfx.quality = 'auto';
  Object.assign(g.player, { x: -640, z: 470, speed: 0 });
  updateAerialTiles(g.player.x, g.player.z);
  assert.equal(queue.length, 2, 'dos descargas como máximo');
  const stale = queue.map((q) => q.url);
  Object.assign(g.player, { x: 640, z: -470 });
  updateAerialTiles(g.player.x, g.player.z);
  const desired = desiredAerialTiles(g.player.x, g.player.z).map((t) => t.key);
  assert.equal(desired.length, new Set(desired).size);
  assert(desired.length <= 12);
  assert(
    aerialTileStatus().loaded.every((key) => desired.includes(key)),
    'lejanas liberadas',
  );
  const failedKey = desired[0],
    failedUrl = `aerial/hi/${failedKey}.jpg?v=${assetVersion}`;
  const fallback = aerialMaterial(...failedKey.split('_').map(Number), { roughness: 1 });
  await finish(failedUrl);
  assert.equal(maximum, 2);
  assert.equal(discarded.length, stale.length, 'cargas obsoletas liberadas al llegar');
  assert.deepEqual(aerialTileStatus().failed, [failedKey]);
  assert.equal(fallback.map, general, 'fallo conserva la vista general');
  assert.deepEqual(aerialTileStatus().loaded.sort(), desired.filter((k) => k !== failedKey).sort());
  for (const key of aerialTileStatus().loaded) {
    const [i, j] = key.split('_').map(Number),
      material = aerialMaterial(i, j);
    const texture = material.map,
      [x0, x1, z0, z1] = world.aerialBox;
    const { tile, margin } = world.aerialIndex;
    const center = new THREE.Vector2(
      ((i + 0.5) * tile - x0) / (x1 - x0),
      1 - ((j + 0.5) * tile - z0) / (z1 - z0),
    );
    texture.updateMatrix();
    texture.transformUv(center);
    assert(
      Math.abs(center.x - 0.5) < 1e-12 && Math.abs(center.y - 0.5) < 1e-12,
      'centro local coincide con el centro de la imagen',
    );
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
    assert.equal(texture.anisotropy, 4);
    assert(Math.abs((texture.repeat.x * tile) / (x1 - x0) - tile / (tile + 2 * margin)) < 1e-12);
    material.dispose();
  }
  const before = requests.length;
  const calculations = aerialTileStatus().selections;
  updateAerialTiles(g.player.x, g.player.z);
  updateAerialTiles(g.player.x + 3, g.player.z + 4);
  assert.equal(aerialTileStatus().selections, calculations, 'hasta 5 m no recalcula');
  updateAerialTiles(g.player.x + 5.01, g.player.z);
  assert.equal(aerialTileStatus().selections, calculations + 1, 'más de 5 m recalcula');
  updateAerialTiles(g.player.x + 5.01, g.player.z, 3, 0);
  assert.equal(aerialTileStatus().selections, calculations + 2, 'cuenta el punto adelantado');
  await tick();
  assert.equal(requests.length, before, 'no repite la selección ni el fallo cada frame');
  const loaded = [];
  g.scene.traverse((o) => {
    if (o.material?.map && o.material.map !== general && o.material.map.repeat.x !== 1)
      loaded.push(o.material.map);
  });
  for (const texture of new Set(loaded))
    texture.addEventListener('dispose', () => {
      texture.userData.freed = true;
    });
  gfx.quality = 'low';
  const first = reloadAerialTiles(),
    second = reloadAerialTiles();
  await finish();
  await Promise.all([first, second]);
  assert.equal(aerialTileStatus().level, 'lo');
  assert(aerialTileStatus().loaded.length <= 9);
  assert(
    loaded.every((texture) => texture.userData.freed),
    'texturas hi liberadas',
  );
  const lowRequests = requests.slice(before);
  assert(lowRequests.every((u) => u.includes('/lo/') && u.endsWith('?v=' + assetVersion)));
  assert.equal(lowRequests.length, new Set(lowRequests).size, 'calidad sin peticiones duplicadas');
  const noChange = requests.length;
  const previousSelection = aerialTileStatus().selections;
  gfx.coarse = true;
  gfx.quality = 'auto';
  await reloadAerialTiles();
  assert.equal(
    aerialTileStatus().selections,
    previousSelection + 1,
    'recalcula al cambiar calidad aunque mantenga lo',
  );
  assert.equal(requests.length, noChange, 'normal táctil mantiene lo');
  assert.equal(world.groundTexture, general);
  assert(!generalDisposed, 'la vista general sigue cargada');
  fallback.dispose();
  Object.assign(g.player, { x: saved.x, z: saved.z, a: saved.a, speed: saved.speed });
  gfx.platform.TextureLoader = saved.loader;
  gfx.coarse = saved.coarse;
  gfx.quality = saved.quality;
  await reloadAerialTiles();
  const ahead = desiredAerialTiles(0, 0, 200, 0).map((t) => t.key);
  assert(
    ahead.some((k) => k.startsWith('2_')),
    'anticipa velocidad por dos segundos',
  );
  assert(!ahead.some((k) => k.startsWith('-3_')));
  console.log(
    'Carga de teselas: radio, teletransporte, presupuesto 12/9, dos descargas, fallo y calidad sin duplicados OK',
  );

  const full = terrainGeometry(world.terrain),
    tiles = terrainTiles(world.terrain);
  const positions = new Map(),
    seen = new Map(),
    triangles = [];
  const p = full.getAttribute('position'),
    n = full.getAttribute('normal');
  for (let k = 0; k < p.count; k++)
    positions.set([p.getX(k), p.getY(k), p.getZ(k)].join(','), [n.getX(k), n.getY(k), n.getZ(k)]);
  const canonical = (geometry) => {
    const pos = geometry.getAttribute('position'),
      result = [];
    for (let k = 0; k < geometry.index.count; k += 3)
      result.push(
        [0, 1, 2]
          .map((offset) => {
            const v = geometry.index.getX(k + offset);
            return [pos.getX(v), pos.getY(v), pos.getZ(v)].join(',');
          })
          .join(';'),
      );
    return result;
  };
  let shared = 0;
  for (const { geometry } of tiles) {
    const pos = geometry.getAttribute('position'),
      normal = geometry.getAttribute('normal');
    assert(geometry.boundingSphere);
    for (let k = 0; k < pos.count; k++) {
      const key = [pos.getX(k), pos.getY(k), pos.getZ(k)].join(',');
      assert(positions.has(key), 'vértice exacto de la malla completa');
      assert.deepEqual([normal.getX(k), normal.getY(k), normal.getZ(k)], positions.get(key));
      if (seen.has(key)) shared++;
      seen.set(key, true);
    }
    triangles.push(...canonical(geometry));
    geometry.dispose();
  }
  assert(shared > 0, 'bordes compartidos comprobados');
  assert.deepEqual(
    triangles.sort(),
    canonical(full).sort(),
    'mismos triángulos, sin huecos ni duplicados',
  );
  full.dispose();
  assert.equal(g.scene.getObjectByName('aerial-roofs-general').userData.parts, 6);
  console.log(
    `Costuras: ${tiles.length} trozos, ${shared} vértices compartidos exactos en posición y normal; ${triangles.length} triángulos conservados; 6 tejados con vista general`,
  );
  const flatTiles = terrainTiles({ kind: 'flat' });
  assert.equal(flatTiles.length, 24, 'plano recortado por teselas');
  for (const { geometry } of flatTiles) {
    assert.equal(geometry.index.count, 6);
    assert(geometry.boundingSphere);
    geometry.dispose();
  }
}
