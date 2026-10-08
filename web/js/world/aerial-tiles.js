import * as THREE from '../../vendor/three.module.min.js';
import { asset } from '../core/assets.js';
import { gfx, player, world } from '../core/state.js';

const materials = new Map(),
  loaded = new Map(),
  pending = new Map();
let desired = new Map(),
  failed = new Set(),
  level = null,
  selectionX = Infinity,
  selectionZ = Infinity,
  selectionQuality = null,
  selectionCoarse = null,
  selections = 0;
export const aerialLevel = () => (gfx.quality === 'low' || gfx.coarse ? 'lo' : 'hi');
export const tileKey = (i, j) => `${i}_${j}`;

export function aerialMaterial(i, j, options = {}, plainColor = '#9a9b86') {
  const key = tileKey(i, j);
  if (!materials.has(key)) materials.set(key, new Set());
  const m = new THREE.MeshStandardMaterial({
    map: loaded.get(key)?.texture ?? world.groundTexture,
    ...options,
  });
  m.userData.plainColor = plainColor;
  m.color.set(m.map ? '#ffffff' : plainColor);
  materials.get(key).add(m);
  return m;
}

function assign(key, texture) {
  for (const material of materials.get(key) ?? []) {
    material.map = texture ?? world.groundTexture;
    material.color.set(material.map ? '#ffffff' : material.userData.plainColor);
    material.needsUpdate = true;
  }
  gfx.needsRender = true;
}

export function desiredAerialTiles(x, z, vx = 0, vz = 0) {
  const index = world.aerialIndex;
  if (!index) return [];
  const mobile = aerialLevel() === 'lo',
    radius = mobile ? 220 : 300;
  x += vx * 2;
  z += vz * 2;
  return index.tiles
    .map(([i, j]) => ({
      i,
      j,
      key: tileKey(i, j),
      distance: Math.hypot(
        Math.max(i * index.tile - x, 0, x - (i + 1) * index.tile),
        Math.max(j * index.tile - z, 0, z - (j + 1) * index.tile),
      ),
    }))
    .filter((t) => t.distance < radius)
    .sort((a, b) => a.distance - b.distance || a.i - b.i || a.j - b.j)
    .slice(0, mobile ? 9 : 12);
}

function pump() {
  for (const [key, tile] of desired) {
    if (pending.size >= 2) break;
    if (loaded.has(key) || pending.has(key) || failed.has(key)) continue;
    const requestLevel = level;
    const request = new gfx.platform.TextureLoader()
      .loadAsync(asset(`aerial/${requestLevel}/${key}.jpg`))
      .then((texture) => {
        if (!desired.has(key) || level !== requestLevel) {
          texture.dispose();
          return;
        }
        const { tile: size, margin } = world.aerialIndex;
        const [x0, x1, z0, z1] = world.aerialBox;
        const extent = size + 2 * margin;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.repeat.set((x1 - x0) / extent, (z1 - z0) / extent);
        texture.offset.set(
          (x0 - tile.i * size + margin) / extent,
          ((tile.j + 1) * size + margin - z1) / extent,
        );
        loaded.set(key, { texture, level: requestLevel });
        assign(key, texture);
      })
      .catch(() => {
        if (level === requestLevel && desired.has(key)) failed.add(key);
      })
      .finally(() => {
        pending.delete(key);
        pump();
      });
    pending.set(key, request);
  }
}

export function updateAerialTiles(x, z, vx = 0, vz = 0) {
  if (!world.aerialIndex) return;
  const nextLevel = aerialLevel(),
    aheadX = x + vx * 2,
    aheadZ = z + vz * 2;
  if (
    gfx.quality === selectionQuality &&
    gfx.coarse === selectionCoarse &&
    Math.hypot(aheadX - selectionX, aheadZ - selectionZ) <= 5
  )
    return;
  selectionX = aheadX;
  selectionZ = aheadZ;
  selectionQuality = gfx.quality;
  selectionCoarse = gfx.coarse;
  selections++;
  const tiles = desiredAerialTiles(aheadX, aheadZ);
  if (nextLevel !== level) failed = new Set();
  level = nextLevel;
  desired = new Map(tiles.map((t) => [t.key, t]));
  for (const [key, entry] of loaded)
    if (!desired.has(key) || entry.level !== level) {
      assign(key, null);
      entry.texture.dispose();
      loaded.delete(key);
    }
  for (const key of failed) if (!desired.has(key)) failed.delete(key);
  pump();
}

export async function reloadAerialTiles() {
  updateAerialTiles(
    player.x,
    player.z,
    Math.sin(player.a) * player.speed,
    Math.cos(player.a) * player.speed,
  );
  while (pending.size) await Promise.all([...pending.values()]);
}

export function aerialTileStatus() {
  return {
    selections,
    level,
    desired: [...desired.keys()],
    loaded: [...loaded.keys()],
    pending: [...pending.keys()],
    failed: [...failed],
  };
}
