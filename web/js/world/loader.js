import * as THREE from '../../vendor/three.module.min.js';
import { asset } from '../core/assets.js';
import { applyCorrections } from './corrections.js';
import { gfx, world } from '../core/state.js';
import { validateCorrections } from './design-validate.js';

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
    size: manifest.size,
    buildings: buildings.buildings,
    roads: osm.roads,
    areas: osm.areas,
    landmarks: Array.isArray(osm.landmarks) ? osm.landmarks : [],
    trees: Array.isArray(osm.trees) ? osm.trees : [],
  };
}

// Light mode and touch devices use the 2048×1536 derivative (same extent).
export const aerialFile = () =>
  gfx.quality === 'low' || gfx.coarse ? 'aerial-2048.jpg' : 'aerial.jpg';

let aerialPending = null; // { file, promise }: carga en curso, para no pedirla dos veces

// Al cambiar de calidad en caliente: carga la ortofoto que toca, la pone en los materiales
// que usaban la anterior (suelo y cubiertas) y libera esta. Sin ortofoto inicial no hace nada.
export function reloadGroundTexture() {
  const file = aerialFile();
  if (aerialPending?.file === file) return aerialPending.promise;
  if (!world.groundTexture || world.groundTextureFile === file) return Promise.resolve(false);
  const pending = { file },
    done = (tex) => {
      if (aerialPending === pending) aerialPending = null;
      if (!tex) return false;
      // La calidad ha vuelto a cambiar mientras cargaba: se descarta.
      if (aerialFile() !== file || !world.groundTexture) {
        tex.dispose();
        return false;
      }
      const old = world.groundTexture;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      gfx.scene.traverse((o) => {
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          if (m?.map === old) m.map = tex;
      });
      world.groundTexture = tex;
      world.groundTextureFile = file;
      old.dispose();
      gfx.needsRender = true;
      return true;
    };
  pending.promise = new gfx.platform.TextureLoader()
    .loadAsync(asset(file))
    .catch(() => null)
    .then(done);
  aerialPending = pending;
  return pending.promise;
}

export async function loadLayers() {
  const aerial = aerialFile();
  const [res, tex, heightSamples, profiles, streetObjects, designs, cityDesign] = await Promise.all(
    [
      loadWorld(),
      // Without the orthophoto, plain colours (reloadGroundTexture then does nothing).
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
  return { res, tex, aerial, heightSamples, profiles, streetObjects, designs, cityDesign };
}
