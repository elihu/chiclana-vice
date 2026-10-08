import { validBounds, worldBounds } from './bounds.js';
import { asset } from '../core/assets.js';
import { applyCorrections, sha256Hex } from './corrections.js';
import { reloadAerialTiles } from './aerial-tiles.js';
import { gfx, world } from '../core/state.js';
import { validateCorrections } from './design-validate.js';
import { loadTerrain } from './terrain.js';

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
  const bounds = worldBounds(manifest);
  if (
    !pair(manifest.origin) ||
    !validBounds(bounds) ||
    typeof manifest.files?.buildings !== 'string' ||
    typeof manifest.files?.osm !== 'string'
  )
    throw incompatible();
  const [buildings, osm, corrections] = await Promise.all([
    read(manifest.files.buildings),
    read(manifest.files.osm),
    read('map-corrections.json').catch(() => {
      throw Error('No se han podido cargar las correcciones del mapa');
    }),
  ]);
  for (const layer of [buildings, osm])
    if (
      layer?.version !== 1 ||
      !pair(layer.origin) ||
      layer.origin.some((v, i) => v !== manifest.origin[i])
    )
      throw incompatible();
  if (![buildings.buildings, osm.roads, osm.areas].every(Array.isArray)) throw incompatible();
  // Correcciones manuales sobre la base, solo en memoria; una guarda que falla lanza un error.
  const correctionErrors = validateCorrections(corrections);
  if (correctionErrors.length)
    throw Error('Correcciones del mapa incompatibles: ' + correctionErrors.join('; '));
  applyCorrections(
    { roads: osm.roads, areas: osm.areas, buildings: buildings.buildings },
    corrections,
  );
  return {
    origin: manifest.origin,
    bounds,
    buildings: buildings.buildings,
    roads: osm.roads,
    areas: osm.areas,
    landmarks: Array.isArray(osm.landmarks) ? osm.landmarks : [],
    trees: Array.isArray(osm.trees) ? osm.trees : [],
  };
}

// Compatibilidad con los controles y el API de pruebas: ahora recarga solo teselas.
export const reloadGroundTexture = reloadAerialTiles;

export async function loadLayers() {
  const response = await fetch(asset('aerial/index.json'));
  if (!response.ok) throw Error('No se ha podido cargar el índice de ortofoto');
  const aerialIndex = await response.json();
  if (aerialIndex.version !== 1) throw Error('Índice de ortofoto incompatible');
  const aerial = 'aerial/' + aerialIndex.general.file;
  const [res, tex, heightSamples, profiles, streetObjects, designs, cityDesign] = await Promise.all(
    [
      loadWorld(),
      // La vista general permanece cargada como respaldo y para el mapa.
      new gfx.platform.TextureLoader().loadAsync(asset(aerial)).catch(() => null),
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
      fetch(asset('city-design.json')).then((r) => {
        if (!r.ok) throw Error('No se ha podido cargar el diseño de la ciudad');
        return r.json();
      }),
    ],
  );
  const { terrain, warning } = await loadTerrain(
    (file) => fetch(asset(file)),
    res,
    async (bytes) =>
      globalThis.crypto?.subtle
        ? Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), (v) =>
            v.toString(16).padStart(2, '0'),
          ).join('')
        : sha256Hex(new Uint8Array(bytes)),
  );
  return {
    res,
    tex,
    aerial,
    aerialIndex,
    heightSamples,
    profiles,
    streetObjects,
    designs,
    cityDesign,
    terrain,
    warning: terrain.manifest?.preview
      ? 'Relieve provisional: superficies y accesos pendientes de revisión'
      : warning,
  };
}
