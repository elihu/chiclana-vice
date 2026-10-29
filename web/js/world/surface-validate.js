import { createValidationKit } from './validate-kit.js';

// Anclaje de área: el ID de OSM la identifica (si se declara) y la forma comprueba que
// la geometría no ha cambiado desde que se escribió el diseño.
export const anchoredArea = (anchor) => (a) =>
  (anchor.areaId === undefined || a.id === anchor.areaId) &&
  a.kind === anchor.kind &&
  a.p.length === anchor.vertexCount &&
  a.p.some((v) => v[0] === anchor.vertex[0] && v[1] === anchor.vertex[1]);

// Prolongación de un extremo del tablero: un número no negativo o un par [inicio, fin].
const extensionValid = (v) => {
  const valid = (e) => Number.isFinite(e) && e >= 0;
  return Array.isArray(v) ? v.length === 2 && v.every(valid) : valid(v);
};

export function validateSurfaceDesign(design, city = null) {
  if (design === undefined) return [];
  const errors = [],
    fail = (p, text) => errors.push(`terrainSurfaces.${p}: ${text}`),
    positive = (v) => Number.isFinite(v) && v > 0,
    roads = city ? new Map(city.roads.map((r) => [r.id, r])) : null;
  const kit = createValidationKit(errors, { prefix: 'terrainSurfaces.' });
  if (!kit.oneOf('version', design?.version, [1], 'se esperaba 1')) return errors;
  const keys = (object, allowed, path) => kit.object(path, object, { keys: allowed });
  keys(design, ['version', 'roads', 'water', 'platforms'], '$');
  keys(
    design.roads,
    [
      'sampleStep',
      'pavementStep',
      'meshSubdivisions',
      'smoothingRadius',
      'shoulder',
      'bridgeAnchorRadius',
      'accessRadius',
      'maximumAccessStep',
      'coverageGap',
      'groundMargin',
    ],
    'roads',
  );
  keys(
    design.water,
    ['percentile', 'bedDepth', 'shoreWidth', 'axis', 'sliceLength', 'maximumSlope', 'features'],
    'water',
  );
  for (const p of [
    'sampleStep',
    'pavementStep',
    'smoothingRadius',
    'shoulder',
    'bridgeAnchorRadius',
  ])
    kit.number(`roads.${p}`, design.roads?.[p], {
      min: 0,
      exclusiveMin: true,
      message: 'se esperaba un número positivo',
    });
  kit.oneOf(
    'roads.meshSubdivisions',
    design.roads?.meshSubdivisions,
    [1, 2, 4],
    'se esperaba 1, 2 o 4',
  );
  for (const k of ['accessRadius', 'maximumAccessStep', 'coverageGap', 'groundMargin'])
    if (design.roads?.[k] !== undefined)
      kit.number('roads.' + k, design.roads[k], {
        min: 0,
        exclusiveMin: true,
        max: 20,
        message: 'se esperaba un número positivo hasta 20',
      });
  if (
    design.roads?.sampleStep < 0.5 ||
    design.roads?.smoothingRadius > 100 ||
    design.roads?.pavementStep < 1 ||
    design.roads?.shoulder > 10
  )
    fail('roads', 'resolución o radio fuera del presupuesto permitido');
  for (const p of ['bedDepth', 'shoreWidth'])
    kit.number(`water.${p}`, design.water?.[p], {
      min: 0,
      exclusiveMin: true,
      message: 'se esperaba un número positivo',
    });
  if (!(design.water?.percentile >= 0 && design.water.percentile <= 1))
    fail('water.percentile', 'se esperaba un percentil entre 0 y 1');
  if (
    !positive(design.water?.sliceLength) ||
    !positive(design.water?.maximumSlope) ||
    !['x', 'z'].includes(design.water?.axis)
  )
    fail('water', 'eje, longitud de tramo y pendiente positiva obligatorios');
  kit.array('platforms', design.platforms);
  const ids = new Set();
  for (const [i, p] of (Array.isArray(design.platforms) ? design.platforms : []).entries()) {
    if (!kit.object(`platforms.${i}`, p)) {
      continue;
    }
    keys(
      p,
      [
        'id',
        'areaAnchor',
        'roadAnchor',
        'heightAnchors',
        'deckRoads',
        'lowerRoads',
        'clearance',
        'evidence',
        'thickness',
        'bands',
        'profile',
      ],
      `platforms.${i}`,
    );
    const references = [
      p.roadAnchor?.roadId,
      ...(Array.isArray(p.heightAnchors) ? p.heightAnchors.map((a) => a?.roadId) : []),
      ...(Array.isArray(p.deckRoads) ? p.deckRoads : []),
      ...(Array.isArray(p.lowerRoads) ? p.lowerRoads : []),
    ].filter(Boolean);
    if (city && references.some((id) => city.roads.filter((r) => r.id === id).length !== 1))
      fail(`platforms.${i}`, 'anclaje de vía inexistente o ambiguo');
    if (typeof p.id !== 'string' || !p.id || ids.has(p.id))
      fail(`platforms.${i}.id`, 'identificador único obligatorio');
    ids.add(p.id);
    kit.number(`platforms.${i}.clearance`, p.clearance, {
      min: 0,
      exclusiveMin: true,
      message: 'se esperaba altura libre positiva',
    });
    if (p.thickness !== undefined)
      kit.number(`platforms.${i}.thickness`, p.thickness, {
        min: 0,
        exclusiveMin: true,
        max: 3,
        message: 'grosor positivo hasta 3 m',
      });
    if (p.roadAnchor?.endExtension !== undefined && !extensionValid(p.roadAnchor.endExtension))
      fail(
        'platforms.' + i + '.roadAnchor.endExtension',
        'se esperaba una prolongación no negativa o un par [inicio, fin]',
      );
    if (p.roadAnchor?.lateralOffset !== undefined)
      kit.number(`platforms.${i}.roadAnchor.lateralOffset`, p.roadAnchor.lateralOffset);
    if (p.profile !== undefined)
      kit.oneOf(
        `platforms.${i}.profile`,
        p.profile,
        ['flat', 'linear'],
        'se esperaba "flat" o "linear"',
      );
    if (p.profile === 'linear' && !p.roadAnchor)
      fail(`platforms.${i}.profile`, 'el perfil lineal requiere roadAnchor');
    if (p.bands !== undefined) kit.array(`platforms.${i}.bands`, p.bands);
    for (const band of Array.isArray(p.bands) ? p.bands : []) {
      if (
        !band ||
        typeof band.id !== 'string' ||
        !['asphalt', 'stone', 'slabs'].includes(band.material) ||
        !positive(band.roadAnchor?.width) ||
        (band.roadAnchor?.endExtension !== undefined &&
          !extensionValid(band.roadAnchor.endExtension)) ||
        !Number.isFinite(band.roadAnchor?.lateralOffset) ||
        typeof band.roadAnchor?.roadId !== 'string' ||
        (city && city.roads.filter((r) => r.id === band.roadAnchor.roadId).length !== 1)
      )
        fail(
          `platforms.${i}.bands`,
          'banda anclada a vía existente con material y anchura obligatorios',
        );
    }
    if (
      !Array.isArray(p.evidence) ||
      !p.evidence.every((s) => typeof s === 'string' && s.length > 8) ||
      !p.evidence.length
    )
      fail(`platforms.${i}.evidence`, 'fuentes o justificación obligatorias');
    if (p.roadAnchor) {
      if (
        typeof p.roadAnchor.roadId !== 'string' ||
        !positive(p.roadAnchor.width) ||
        (roads && !roads.has(p.roadAnchor.roadId))
      )
        fail(`platforms.${i}.roadAnchor`, 'vía existente y anchura positiva obligatorias');
      if (p.areaAnchor) fail(`platforms.${i}`, 'solo un tipo de anclaje');
    } else if (
      !Array.isArray(p.areaAnchor?.vertex) ||
      p.areaAnchor.vertex.length !== 2 ||
      !p.areaAnchor.vertex.every(Number.isFinite) ||
      (p.areaAnchor.areaId !== undefined && typeof p.areaAnchor.areaId !== 'string')
    )
      fail(`platforms.${i}.areaAnchor`, 'se esperaba vértice de área existente');
    else if (city && city.areas.filter(anchoredArea(p.areaAnchor)).length !== 1)
      fail(`platforms.${i}.areaAnchor`, 'anclaje ambiguo o área modificada');
    kit.array(`platforms.${i}.heightAnchors`, p.heightAnchors, {
      min: 2,
      message: 'mínimo dos accesos',
    });
    for (const a of Array.isArray(p.heightAnchors) ? p.heightAnchors : []) {
      if (!a || typeof a !== 'object') {
        fail(`platforms.${i}.heightAnchors`, 'se esperaba un objeto');
        continue;
      }
      keys(a, ['roadId', 'vertex', 'offset'], `platforms.${i}.heightAnchors`);
      if (
        typeof a.roadId !== 'string' ||
        !Number.isInteger(a.vertex) ||
        a.vertex < 0 ||
        !Number.isFinite(a.offset)
      )
        fail(`platforms.${i}.heightAnchors`, 'anclaje de vía inválido');
      else if (roads && !roads.get(a.roadId)?.p[a.vertex])
        fail(`platforms.${i}.heightAnchors`, 'vía o vértice inexistente');
    }
    for (const field of ['deckRoads', 'lowerRoads']) {
      if (
        !Array.isArray(p[field]) ||
        p[field].some((s) => typeof s !== 'string') ||
        new Set(p[field]).size !== p[field]?.length
      )
        fail(`platforms.${i}.${field}`, 'lista de vías únicas obligatoria');
      else if (roads && p[field].some((id) => !roads.has(id)))
        fail(`platforms.${i}.${field}`, 'vía inexistente');
    }
    if (
      Array.isArray(p.deckRoads) &&
      Array.isArray(p.lowerRoads) &&
      p.deckRoads.some((id) => p.lowerRoads.includes(id))
    )
      fail(`platforms.${i}`, 'una vía no puede ocupar ambos niveles');
  }
  if (design.water?.features !== undefined) kit.array('water.features', design.water.features);
  for (const f of Array.isArray(design.water?.features) ? design.water.features : []) {
    if (
      !f ||
      f.kind !== 'basin' ||
      typeof f.id !== 'string' ||
      !Array.isArray(f.areaAnchor?.vertex) ||
      (f.areaAnchor.areaId !== undefined && typeof f.areaAnchor.areaId !== 'string') ||
      !Array.isArray(f.evidence) ||
      !f.evidence.length
    ) {
      fail('water.features', 'cubeta con anclaje y evidencia obligatorios');
      continue;
    }
    if (city && city.areas.filter(anchoredArea(f.areaAnchor)).length !== 1)
      fail('water.features', 'área inexistente o ambigua');
  }
  // Corredores de polilínea con juntas en inglete. Rechaza giros de retorno
  // cuya junta quedaría indefinida o fuera de cuatro semianchuras.
  if (roads)
    for (const p of Array.isArray(design.platforms) ? design.platforms : []) {
      for (const anchor of [
        p?.roadAnchor,
        ...(Array.isArray(p?.bands) ? p.bands : []).map((b) => b?.roadAnchor),
      ].filter(Boolean)) {
        const road = roads.get(anchor.roadId);
        if (!road) continue;
        let previous = null;
        for (let i = 1; i < road.p.length; i++) {
          const dx = road.p[i][0] - road.p[i - 1][0],
            dz = road.p[i][1] - road.p[i - 1][1],
            length = Math.hypot(dx, dz);
          if (!length) {
            fail('platforms.roadAnchor', 'polilínea con segmento nulo');
            continue;
          }
          const direction = [dx / length, dz / length];
          if (previous && previous[0] * direction[0] + previous[1] * direction[1] < -0.875)
            fail('platforms.roadAnchor', 'giro de retorno incompatible con el corredor en inglete');
          previous = direction;
        }
      }
    }
  return errors;
}
