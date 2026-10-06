import { asset } from '../core/assets.js';
import { gfx, world } from '../core/state.js';

// Optional LiDAR pilot: preserve cadastral floor counts/heights and footprint data.
export function applyHeightSamples(samples) {
  if (
    samples?.version !== 1 ||
    samples.buildingCount !== world.city.buildings.length ||
    !Array.isArray(samples.origin) ||
    samples.origin.length !== 2 ||
    samples.origin.some((v, i) => v !== world.city.origin[i])
  )
    return;
  const policy = world.facadeProfiles.heightPolicy,
    acceptance = policy.acceptance;
  for (const s of samples.entries || []) {
    let b = world.city.buildings[s.index];
    if (
      !b ||
      b.floors !== s.floors ||
      b.h !== s.old ||
      b.p.length !== s.vertices ||
      b.p[0].some((v, i) => v !== s.p0?.[i]) ||
      !Number.isFinite(s.height) ||
      s.height < policy.minimumHeight ||
      Math.abs(s.height - b.h) > acceptance.absoluteCorrectionRange[1] ||
      !Number.isFinite(s.coverage) ||
      !Number.isFinite(s.spread) ||
      !Number.isFinite(s.samples) ||
      s.samples < acceptance.minimumSamples ||
      s.coverage < acceptance.minimumCoverage ||
      s.spread > acceptance.maximumP90P10Spread
    )
      continue;
    b.visualH = s.height;
    b.heightSource = samples.source;
  }
}

export async function loadWorld() {
  const read = async (file) => {
    const r = await fetch(asset(file));
    if (!r.ok) throw Error('No se ha podido cargar ' + file);
    return r.json();
  };
  const manifest = await read('world.json');
  if (manifest.version !== 1) throw Error('Versión de mapa incompatible');
  // Validate the layer structure up front: a clear message instead of a TypeError later.
  const incompatible = () => Error('Capas del mapa incompatibles'),
    pair = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
  if (
    !pair(manifest.origin) ||
    !pair(manifest.size) ||
    typeof manifest.files?.buildings !== 'string' ||
    typeof manifest.files?.osm !== 'string'
  )
    throw incompatible();
  const [buildings, osm] = await Promise.all([
    read(manifest.files.buildings),
    read(manifest.files.osm),
  ]);
  for (const layer of [buildings, osm])
    if (
      layer?.version !== 1 ||
      !pair(layer.origin) ||
      layer.origin.some((v, i) => v !== manifest.origin[i])
    )
      throw incompatible();
  if (![buildings.buildings, osm.roads, osm.areas].every(Array.isArray)) throw incompatible();
  return {
    origin: manifest.origin,
    size: manifest.size,
    buildings: buildings.buildings,
    roads: osm.roads,
    areas: osm.areas,
    landmarks: Array.isArray(osm.landmarks) ? osm.landmarks : [],
    trees: Array.isArray(osm.trees) ? osm.trees : [],
  };
}

export async function loadLayers() {
  const [res, tex, heightSamples, profiles, streetObjects, designs] = await Promise.all([
    loadWorld(),
    // Light mode and touch devices start with the 2048×1536 derivative (same extent).
    // Toggling quality later does not reload it. Without the orthophoto, plain colours.
    new gfx.platform.TextureLoader()
      .loadAsync(asset(gfx.quality === 'low' || gfx.coarse ? 'aerial-2048.jpg' : 'aerial.jpg'))
      .catch(() => null),
    fetch(asset('height-samples.json'))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch(asset('facade-profiles.json')).then((r) => {
      if (!r.ok) throw Error('No se han podido cargar los perfiles');
      return r.json();
    }),
    // Optional layer: without it there are no mapped crossings or street furniture.
    fetch(asset('street-objects.json'))
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
    fetch(asset('facade-designs.json')).then((r) => {
      if (!r.ok) throw Error('No se han podido cargar los diseños de fachada');
      return r.json();
    }),
  ]);
  return { res, tex, heightSamples, profiles, streetObjects, designs };
}
