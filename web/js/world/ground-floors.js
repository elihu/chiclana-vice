// Clase del bajo de un frente (F2c). Combina los indicios del Catastro y de OSM por edificio
// (web/ground-floors.json) con el tipo de la calle, según las reglas de city-design.json →
// groundFloors. Los datos del Catastro describen el edificio entero y sobreestiman bloques y
// locales; el tipo de calle decide cuando el indicio no basta. Sin acceso al estado del juego.

// Orden de comprobación de las reglas (el primer acierto gana):
//   1. comercio de OSM delante del frente           → shop
//   2. uso comercial u oficinas                     → shop
//   3. bloque (viviendas y plantas suficientes)     → block (portal; locales si la calle es principal)
//   4. inmuebles de más: calle principal → shop; calle menor → garage
//   5. resto: calle principal → shop; calle menor → house
export const GROUND_KINDS = ['shop', 'block', 'house', 'garage'];

// Número del atributo por vértice de los muros genéricos (0 = sin clase: cornisa y medianera).
// Los bloques en calle principal llevan locales junto al portal.
export const GROUND_CODES = { shop: 1, blockShops: 2, blockHomes: 3, house: 4, garage: 5 };

// El tipo de local (C2 de PLAN-COMERCIOS) va en el mismo atributo: código + FAMILY_STRIDE × tipo,
// donde el tipo es la posición en groundFloors.families más uno (0 = genérico).
export const FAMILY_STRIDE = 16;

// Tipo de local de un comercio de OSM (`shop:bakery`…): el primero de `families` que lo incluye,
// literalmente o con un comodín `clave:*`. Devuelve su posición más uno, o 0 si ninguno.
export function shopFamily(families, type) {
  if (!type) return 0;
  const key = type.slice(0, type.indexOf(':') + 1) + '*';
  const index = families.findIndex((f) => f.types.includes(type) || f.types.includes(key));
  return index + 1;
}

// `shopNear` es el comercio de OSM delante del frente (`[x, z, tipo…]`) o null; el tipo de local
// solo cuenta cuando ese comercio es el que hace del bajo un local.
export function classifyGroundFloor(rules, { part, uses, floors, roadType, shopNear }) {
  const main = rules.mainRoadTypes.includes(roadType),
    use = part ? (uses[part[0]] ?? '') : '',
    units = part ? part[1] : 0,
    dwellings = part ? part[2] : 0;
  let kind;
  if (shopNear) return { kind: 'shop', main, family: shopFamily(rules.families, shopNear[2]) };
  if (rules.commercialUses.includes(use)) kind = 'shop';
  else if (dwellings >= rules.blockMinimumDwellings && floors >= rules.blockMinimumFloors)
    kind = 'block';
  else if (units - dwellings >= rules.extraUnits) kind = main ? 'shop' : 'garage';
  else kind = main ? 'shop' : 'house';
  return { kind, main, family: 0 };
}

// Clase del edificio entero (C1 de PLAN-COMERCIOS): nave industrial o gran superficie, con hasta
// `maximumFloors` plantas y una planta de al menos el área mínima. Industrial: uso del Catastro o
// indicio de zona industrial de OSM (salvo los usos excluidos, como las viviendas de un polígono).
// Gran superficie: uso comercial o indicio de zona comercial. `null` para el resto. Dentro de la
// zona `cellarZone` (el casco histórico) lo industrial son bodegas y almacenes encalados: `cellar`.
export const BUILDING_KINDS = ['industrial', 'bigRetail', 'cellar'];

// Valores del atributo `bajo` para todo el muro de esas clases (los de los bajos van de 1 a 5).
export const BUILDING_CODES = {
  industrial: 6,
  industrialStreet: 7,
  bigRetail: 8,
  bigRetailEntrance: 9,
  cellar: 10,
  cellarStreet: 11,
};

export function classifyBuilding(rules, { part, uses, zone, zoneKinds, floors, area }) {
  if (!part || floors > rules.maximumFloors) return null;
  const use = uses[part[0]] ?? '',
    zoneKind = zone > 0 ? zoneKinds[zone - 1] : null;
  if (
    area >= rules.industrialMinimumArea &&
    (rules.industrialUses.includes(use) ||
      (zoneKind === 'industrial' && !rules.zoneExcludedUses.includes(use)))
  )
    return 'industrial';
  if (
    area >= rules.bigRetailMinimumArea &&
    (rules.bigRetailUses.includes(use) ||
      (zoneKind === 'retail' && !rules.zoneExcludedUses.includes(use)))
  )
    return 'bigRetail';
  return null;
}

// Área de planta de una parte de buildings.json (contorno menos patios), en m².
export function partArea(b) {
  const ring = (points) =>
    Math.abs(
      points.reduce((sum, [x0, z0], i) => {
        const [x1, z1] = points[(i + 1) % points.length];
        return sum + x0 * z1 - x1 * z0;
      }, 0),
    ) / 2;
  return ring(b.p) - (b.holes ?? []).reduce((sum, hole) => sum + ring(hole), 0);
}

export function groundCode({ kind, main, family = 0 }) {
  if (kind === 'block') return main ? GROUND_CODES.blockShops : GROUND_CODES.blockHomes;
  return GROUND_CODES[kind] + (kind === 'shop' ? family * FAMILY_STRIDE : 0);
}

// Prepara la capa (opcional) y devuelve las consultas. Sin capa, todos los bajos salen sin indicio.
// `zones` son las de city-design.json, para la zona de bodegas.
export function createGroundFloors(layer, rules, zones = {}) {
  const CELL = 25,
    grid = new Map();
  for (const shop of layer?.shops ?? []) {
    const key = Math.floor(shop[0] / CELL) + ',' + Math.floor(shop[1] / CELL);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(shop);
  }
  // Comercio de OSM delante del frente (a→q, normal n), o null. Se mide en el sistema del frente:
  // t a lo largo (con `shopMargin` de holgura) y s hacia fuera (hasta `shopDistance`; hasta
  // `shopBehind` hacia dentro, por los comercios que OSM marca sobre el propio edificio). Si hay
  // varios, el más cercano al centro del frente.
  function shopNear(a, q, nx, nz) {
    const len = Math.hypot(q[0] - a[0], q[1] - a[1]);
    if (len === 0 || grid.size === 0) return null;
    let best = null,
      bestDistance = Infinity;
    const reach = rules.shopDistance + len + rules.shopMargin,
      cx = (a[0] + q[0]) / 2,
      cz = (a[1] + q[1]) / 2;
    for (let gx = Math.floor((cx - reach) / CELL); gx <= Math.floor((cx + reach) / CELL); gx++)
      for (let gz = Math.floor((cz - reach) / CELL); gz <= Math.floor((cz + reach) / CELL); gz++)
        for (const shop of grid.get(gx + ',' + gz) ?? []) {
          const [x, z] = shop,
            s = (x - cx) * nx + (z - cz) * nz,
            t = ((x - a[0]) * (q[0] - a[0]) + (z - a[1]) * (q[1] - a[1])) / len,
            distance = Math.hypot(x - cx, z - cz);
          if (
            s <= rules.shopDistance &&
            s >= -rules.shopBehind &&
            t >= -rules.shopMargin &&
            t <= len + rules.shopMargin &&
            distance < bestDistance
          ) {
            best = shop;
            bestDistance = distance;
          }
        }
    return best;
  }
  return {
    shopNear,
    // Clase del edificio entero de la parte `index` (ver classifyBuilding), con su área de planta y
    // un punto suyo (x, z) para la zona de bodegas.
    building(index, floors, area, x, z) {
      const kind = classifyBuilding(rules.buildingKinds, {
          part: layer?.parts[index] ?? null,
          uses: layer?.uses ?? [],
          zone: layer?.zones?.[index] ?? 0,
          zoneKinds: layer?.zoneKinds ?? [],
          floors,
          area,
        }),
        cellar = zones[rules.buildingKinds.cellarZone];
      return kind === 'industrial' &&
        cellar &&
        x >= cellar[0] &&
        x <= cellar[1] &&
        z >= cellar[2] &&
        z <= cellar[3]
        ? 'cellar'
        : kind;
    },
    // Clase del frente a→q (normal hacia fuera n) de la parte `index` de buildings.json.
    classify(index, floors, a, q, nx, nz, roadType) {
      return classifyGroundFloor(rules, {
        part: layer?.parts[index] ?? null,
        uses: layer?.uses ?? [],
        floors,
        roadType,
        shopNear: shopNear(a, q, nx, nz),
      });
    },
  };
}

// Tipo de la vía más cercana a un punto (hasta `reach` m), con una rejilla de segmentos: los muros
// genéricos de toda la ciudad lo consultan una vez por arista.
export function createRoadLookup(segments, reach) {
  const CELL = 40,
    grid = new Map();
  for (const s of segments) {
    const x0 = Math.min(s.a[0], s.b[0]) - reach,
      x1 = Math.max(s.a[0], s.b[0]) + reach,
      z0 = Math.min(s.a[1], s.b[1]) - reach,
      z1 = Math.max(s.a[1], s.b[1]) + reach;
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const key = gx + ',' + gz;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(s);
      }
  }
  return (x, z) => {
    let best = null,
      md = reach;
    for (const s of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) ?? []) {
      const dx = s.b[0] - s.a[0],
        dz = s.b[1] - s.a[1],
        u = Math.min(
          1,
          Math.max(0, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / (dx * dx + dz * dz || 1)),
        ),
        d = Math.hypot(x - s.a[0] - dx * u, z - s.a[1] - dz * u);
      if (d < md) {
        md = d;
        best = s;
      }
    }
    return best?.type ?? null;
  };
}
