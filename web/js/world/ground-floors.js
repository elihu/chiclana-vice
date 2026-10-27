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

export function classifyGroundFloor(rules, { part, uses, floors, roadType, shopNear }) {
  const main = rules.mainRoadTypes.includes(roadType),
    use = part ? (uses[part[0]] ?? '') : '',
    units = part ? part[1] : 0,
    dwellings = part ? part[2] : 0;
  let kind;
  if (shopNear) kind = 'shop';
  else if (rules.commercialUses.includes(use)) kind = 'shop';
  else if (dwellings >= rules.blockMinimumDwellings && floors >= rules.blockMinimumFloors)
    kind = 'block';
  else if (units - dwellings >= rules.extraUnits) kind = main ? 'shop' : 'garage';
  else kind = main ? 'shop' : 'house';
  return { kind, main };
}

export function groundCode({ kind, main }) {
  if (kind === 'block') return main ? GROUND_CODES.blockShops : GROUND_CODES.blockHomes;
  return GROUND_CODES[kind];
}

// Prepara la capa (opcional) y devuelve las consultas. Sin capa, todos los bajos salen sin indicio.
export function createGroundFloors(layer, rules) {
  const CELL = 25,
    grid = new Map();
  for (const shop of layer?.shops ?? []) {
    const key = Math.floor(shop[0] / CELL) + ',' + Math.floor(shop[1] / CELL);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(shop);
  }
  // ¿Hay un comercio de OSM delante del frente (a→q, normal n)? Se mide en el sistema del frente:
  // t a lo largo (con `shopMargin` de holgura) y s hacia fuera (hasta `shopDistance`; hasta
  // `shopBehind` hacia dentro, por los comercios que OSM marca sobre el propio edificio).
  function shopNear(a, q, nx, nz) {
    const len = Math.hypot(q[0] - a[0], q[1] - a[1]);
    if (len === 0 || grid.size === 0) return false;
    const reach = rules.shopDistance + len + rules.shopMargin,
      cx = (a[0] + q[0]) / 2,
      cz = (a[1] + q[1]) / 2;
    for (let gx = Math.floor((cx - reach) / CELL); gx <= Math.floor((cx + reach) / CELL); gx++)
      for (let gz = Math.floor((cz - reach) / CELL); gz <= Math.floor((cz + reach) / CELL); gz++)
        for (const [x, z] of grid.get(gx + ',' + gz) ?? []) {
          const s = (x - cx) * nx + (z - cz) * nz,
            t = ((x - a[0]) * (q[0] - a[0]) + (z - a[1]) * (q[1] - a[1])) / len;
          if (
            s <= rules.shopDistance &&
            s >= -rules.shopBehind &&
            t >= -rules.shopMargin &&
            t <= len + rules.shopMargin
          )
            return true;
        }
    return false;
  }
  return {
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
