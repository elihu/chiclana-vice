# Anexo: kit de fachadas, expresiones, compositor y correcciones

Parte de [PLAN-MODULAR.md](../PLAN-MODULAR.md), decisiones D8 y D9 y fase 2. El formato
se ha probado en el scratchpad el 6/10/2026: un intérprete equivalente al descrito aquí,
con la receta de [facade-designs.example.json](facade-designs.example.json), sustituyó al
bucle del Mercado y la huella de escena salió idéntica a la de `main`.

## K1. Conceptos

- **Kit**: funciones de JavaScript que crean piezas en el sistema local de un muro (`x`
  a lo largo del muro desde `a`, `y` hacia arriba, `z` hacia fuera). Son las funciones
  actuales de `buildDetailedFacades`, movidas sin cambios a `world/facade-kit.js`
  (paso 2.2). El kit crea mallas de preparación; los lotes por material y celda siguen
  en `world/facades.js`.
- **Receta**: lista ordenada de nodos que llaman al kit. El orden de los nodos es el orden
  de creación de piezas y, por tanto, el orden de los vértices en los lotes.
- **Edificio**: un ID, el hito OSM que lo identifica, el tipo de detalle y sus frentes;
  cada frente une un **anclaje** (dónde está el muro) con una receta y parámetros.
- **Expresión**: cadena con aritmética de JavaScript restringida, evaluada sin `eval`.

Vocabulario tomado de CGA (reglas que dividen y repiten fachadas) y de CityJSON
(plantillas reutilizables instanciadas con una transformación; LoD como «X.Y»). El campo
`lod` de cada edificio es solo documental: `"2.2"` para muros con huecos y relieve.

## K2. Expresiones (`web/js/engine/expr.js`)

### Gramática

```text
expr           := ternary
ternary        := or ( '?' expr ':' expr )?
or             := and ( '||' and )*
and            := equality ( '&&' equality )*
equality       := relational ( ( '==' | '!=' ) relational )*
relational     := additive ( ( '<' | '<=' | '>' | '>=' ) additive )*
additive       := multiplicative ( ( '+' | '-' ) multiplicative )*
multiplicative := unary ( ( '*' | '/' | '%' ) unary )*
unary          := ( '-' | '+' | '!' ) unary | postfix
postfix        := IDENT '(' ( expr ( ',' expr )* )? ')' | primary
primary        := NUMBER | IDENT | 'true' | 'false' | '(' expr ')'
NUMBER         := /\d+(\.\d+)?([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?/
IDENT          := /[A-Za-z_][A-Za-z0-9_]*/
```

### Semántica (idéntica a JavaScript para que la coma flotante coincida)

- Operadores binarios asociativos por la izquierda; la precedencia es la de JavaScript.
  `-step / 2` es `(-step) / 2`, como en JavaScript.
- `==` y `!=` se evalúan como `===` y `!==`.
- `&&`, `||` y `?:` cortocircuitan y devuelven el operando, como en JavaScript.
- `NUMBER` se convierte con `Number(texto)`, que da el mismo doble que el literal del
  código.
- Funciones permitidas: `min`, `max`, `round`, `floor`, `ceil`, `abs`, `sqrt`, `sin`,
  `cos`, `atan2`, `hypot` (las de `Math`). Constantes: `PI` (`Math.PI`) y `TAU`
  (`Math.PI * 2`, el mismo cálculo que `core/math.js`).
- Variables: se buscan en la cadena de ámbitos (`Object.create(padre)`); una variable
  inexistente lanza `Error('Variable desconocida: nombre')`.
- Se analiza una vez por cadena y se guarda el árbol en un `Map`.
- API: `export function compile(text)` → función `(scope) => valor`;
  `export function freeNames(text)` → nombres usados (para el validador);
  `export function evaluate(text, scope)`.

### Corpus mínimo de `tests/verify-design.mjs`

Cada expresión se evalúa con `expr.js` y con `new Function('s', 'with (s) return (' + e + ')')`
(sustituyendo `==`/`!=` por `===`/`!==`) sobre los mismos ámbitos, y se exige igualdad con
`Object.is`:

```text
len / 2 · len + 0.5 · max(3, round(len / 5.15)) · len / bays · (j + 0.5) * step
min(2.8, step * 0.65) · x - ww * 0.25 · -step / 2 + 0.35 · q < step / 2 - 0.25
x - step * 0.3 + k * step * 0.3 · len > 60 && j % 5 != 2 · (round(y / 0.46) % 2) * 0.57
1 - 2 - 3 · 8 / 4 / 2 · 7 % 4 % 3 · -2 * -3 · !0 · 0.1 + 0.2 · round(-2.5)
a ? b : c ? d : e · 2 * PI · TAU / 12 · hypot(3, 4) · .5e1 + 1e-3
```

Ámbitos de prueba: `len` ∈ {17.3, 59.99, 60, 107.25}, `j` y `k` ∈ 0..6, `y` ∈ {0.45,
0.91, 2.75}, `bays` y `step` derivados, `a..e` ∈ {0, 1, 2}. Errores esperados: `foo(1)`
(función no permitida), `zz + 1` (variable desconocida), `1 +` y `(1` (sintaxis), `a = 1`
(asignación no soportada), `x.y` (acceso a propiedades no soportado).

## K3. Formato de `web/facade-designs.json`

Esquema completo: [facade-designs.schema.json](facade-designs.schema.json). Ejemplo
completo: [facade-designs.example.json](facade-designs.example.json).

```text
{
  "version": 1, "kit": 1, "description", "license", "attribution",
  "recipes": { nombre: { "params": { nombre: valor }, "body": [nodo…] } },
  "buildings": [ {
    "id", "name", "landmark", "detailType", "lod", "status", "references": [texto],
    "fronts": [ { "anchor": anclaje, "recipe": nombre, "with": { param: valor }, "scaleY": valor } ],
    "roof": { "y": valor, "color": color }   // opcional, una por edificio (landmarkRing)
  } ]
}
```

### Valores

| Forma                               | Significado                                         |
| ----------------------------------- | --------------------------------------------------- |
| número o booleano                   | Literal                                             |
| `"#rrggbb"`                         | Color literal                                       |
| `"$nombre"`                         | Color de `facade-profiles.json` → `palette.nombre`  |
| `{"text": "…"}`                     | Texto literal (rótulos)                             |
| `{"pick": [valor…], "index": expr}` | Elemento `index` de la lista (variantes por `seed`) |
| cualquier otra cadena               | Expresión (K2)                                      |

### Nodos (cada nodo tiene exactamente una clave de tipo)

| Nodo                                                                           | Equivale a                                                             |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `{"let": {"a": v, "b": v}}`                                                    | `let a = v; let b = v;` en orden, en el ámbito actual                  |
| `{"box": [x, y, z, w, h, d], "color": c, "rotation": [rx, ry, rz]}`            | `const m = cube(g, x, y, z, w, h, d, c); m.rotation.set(rx, ry, rz)`   |
| `{"piece": "pane", "args": [v…], "rotation": [rx, ry, rz]}`                    | `kit.pane(g, …args)`; rotación opcional sobre la malla devuelta        |
| `{"geo": ["TorusGeometry", p…], "at": [x, y, z], "color": c, "rotation": […]}` | `geo(g, new THREE.TorusGeometry(…p), x, y, z, c)`                      |
| `{"group": {"at": [x, y, z], "rotation": [rx, ry, rz]}, "body": [nodo…]}`      | `const sub = new THREE.Group(); …; g.add(sub)`; el cuerpo usa `sub`    |
| `{"for": "v", "from": v, "while": expr, "step": v, "body": [nodo…]}`           | `for (let v = from; while; v += step) { … }`; `step` se evalúa una vez |
| `{"for": "v", "in": [v…], "body": [nodo…]}`                                    | `for (const v of [ … ]) { … }`; la lista se evalúa antes del bucle     |
| `{"if": expr, "then": [nodo…], "else": [nodo…]}`                               | `if (expr) { … } else { … }`                                           |
| `{"use": "receta", "with": {"p": v}}`                                          | Ejecuta otra receta sobre el mismo `g` en un ámbito hijo               |

Cubierta: no es un nodo de receta sino la clave `roof: {"y": v, "color": c}` del edificio
(sección 11.1 del plan): una sola por edificio, compuesta tras todos sus muros con
`staging.add(flatPolygon(anillo, y, material(c)))`. Exige exactamente un frente con
anclaje `landmarkRing`; `y` y `color` se evalúan con los parámetros de su receta y su `with`.

Colores (`color` de `box`, `geo` y `roof`): `#rrggbb`, `$paleta`, un `pick`, el nombre de un
parámetro o variable cuyo valor sea un color, o `=expresión` (por ejemplo
`=len > 5 ? claro : oscuro`). El resultado debe ser `#rrggbb` o `$paleta`; si no, el
compositor falla con un error claro.

Ámbitos: cada iteración de `for` y cada rama de `if` se ejecutan en un ámbito hijo; `let`
escribe en el ámbito actual (como el bloque de JavaScript). La variable de un `for` no se
puede reasignar con `let` dentro del cuerpo.

### Piezas del kit (versión 1)

| Pieza          | Argumentos tras `g` (los opcionales, con su valor por defecto)                   | Paso |
| -------------- | -------------------------------------------------------------------------------- | ---- |
| `pane`         | `x, y, w, h, z = 0.12, shutters = false, frameColor = $wood`                     | 2.2  |
| `balcony`      | `x, y, w, color = $iron, depth = 0.55`                                           | 2.2  |
| `arch`         | `x, y, w, h`                                                                     | 2.2  |
| `pediment`     | `x, y, w`                                                                        | 2.2  |
| `sign`         | `text, x, y, w, h, color = '#e5e0ce', bg = '#514d43'`                            | 2.2  |
| `civicPane`    | `x, y, w, h, z`                                                                  | 2.2  |
| `cross`        | `x, y, z = 0.2`                                                                  | 2.2  |
| `column`       | `x, y, h, r, color`                                                              | 2.2  |
| `door`         | `x, y, w, h`                                                                     | 2.2  |
| `belfry`       | `x, y, w, h`                                                                     | 2.2  |
| `statue`       | `x, y, scale = 1` (hoy local de Jesús Nazareno)                                  | 2.7  |
| `spiralColumn` | `x` (tubo helicoidal de la portada de Jesús Nazareno, mismos 52 tramos y radios) | 2.7  |

Geometrías permitidas en `geo`: `CircleGeometry`, `TorusGeometry`, `CylinderGeometry`,
`SphereGeometry`, `ConeGeometry`, más dos formas propias: `["ArchShape", w, h, curveSegments]`
(`ShapeGeometry(archShape(w, h), curveSegments)`) y
`["TriangleExtrude", x1, y1, x2, y2, x3, y3, depth]` (el frontón de San Telmo). Cada vez
que una receta necesite algo nuevo, se añade al kit **en un commit de refactor previo** y
se sube `kit` solo si cambia la firma de una pieza existente.

### Anclajes

| Anclaje                                                      | Muro(s) que crea                                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{"a": [x, z], "b": [x, z], "outward": [x, z]}`              | `wall(a, b, outward)`                                                                                                                                                    |
| `{"a": …, "b": …, "outwardFrom": [x, z]}`                    | `wall(a, b, [mx - cx, mz - cz])` con `m` el punto medio                                                                                                                  |
| `{"ring": [[x, z]…], "center": [x, z]}`                      | Para `i` de 0 a n−1: `a = ring[i]`, `b = ring[(i + 1) % n]`, `outwardFrom: center` (Mercado)                                                                             |
| `{"landmarkRing": "Jesús Nazareno"}`                         | Hito cuyo nombre contiene el texto; anillo `outline.slice(0, -1)`, centro `p` (como `nave()`)                                                                            |
| `{"front": "building-2615-edge-12", "footprintSha256": "…"}` | Arista catastral; normal de `facadeWork.fronts` o, si el frente no está seleccionado, la misma prueba de lado de `prepareFacades` extraída a `outwardOf(building, edge)` |
| `{"world": true}`                                            | Grupo en el origen, sin muro (cúpula de San Juan Bautista)                                                                                                               |

Variables predefinidas en cada frente: `len` (longitud del muro), `PI`, `TAU` y, con
anclaje `front`, `h` (altura visual del edificio), `floors`, `seed` (la misma fórmula de
`prepareFacades`) y `commercialStreet`. Las recetas pueden declarar `params` con valor por
defecto y el frente los sobrescribe con `with`.

## K4. Compositor (`web/js/world/facade-composer.js`)

Con el piloto de terreno, todos los grupos del conjunto suman la misma `baseY` del
monumento indicado en `building.landmark` o del edificio anclado. Un anclaje `world`
conserva x/z globales en planta; sus alturas son relativas a esa base, incluida la
cúpula. La base no se suma de nuevo a cada pieza y `h` sigue siendo altura relativa.

```js
export function composeBuilding(kit, designs, id, context) // context: { palette, landmarks, fronts, buildings, staging }
```

1. Busca el edificio por `id` (error claro si no existe).
2. Para cada frente, en orden, y para cada muro de su anclaje, en orden: crea el muro con
   `kit.wall` (o un grupo en el origen con `world`), aplica `scaleY` si existe
   (`g.scale.y = valor`, justo después de crear el muro, como hace hoy el Ayuntamiento) y
   ejecuta la receta.
3. Ámbito raíz: `Object.create(FUNCIONES)` con `len` y las variables predefinidas, después
   los `params` de la receta en orden y después `with`.
4. Ejecuta los nodos en orden con un intérprete recursivo; `for` con `while` es
   literalmente `for (scope[v] = from; cond(scope); scope[v] += step)`.
5. No crea materiales propios: usa `kit.material`, `kit.cube`, `kit.geo`.

## K5. Validación (`web/js/world/design-validate.js`)

`export function validateFacadeDesigns(json, { kitPieces })` devuelve una lista de
errores (cadenas con la ruta JSON, por ejemplo `recipes.mercado-fachada.body[5].for`).
`validateCityDesign` y `validateCorrections` siguen el mismo patrón.

Comprobaciones en el juego y en los tests:

- `version` 1 y `kit` 1; claves desconocidas rechazadas (salvo `$schema`).
- Cada nodo tiene una sola clave de tipo; `box` con 6 valores; `rotation` y `at` con 3;
  colores `#rrggbb` o `$nombre` existente en la paleta; piezas y geometrías permitidas con
  un número de argumentos dentro de su firma.
- Toda expresión compila y sus nombres libres están definidos en ese punto (predefinidas,
  `params`, `let` anteriores, variables de bucle de los ancestros).
- `use` apunta a recetas existentes y no hay recursión.
- IDs de edificio únicos; cada frente con una receta existente y un único tipo de anclaje;
  coordenadas finitas; anillos de al menos 3 puntos.

Solo en `tests/verify-world.mjs` (cruzadas):

- Cada anclaje `front` existe en `web/frontages.json` y su `footprintSha256` coincide.
- Cada `landmark` y `landmarkRing` existe en `osm-world.json`.
- Los puntos de los anclajes están dentro del tamaño del mundo.
- Ningún frente catastral está anclado por dos edificios.

## K6. Procedencia, licencia y esquemas

Registro propuesto para `tools/export-provenance.mjs` (licencia decidida en la sección 11 de
PLAN-MODULAR.md; texto en inglés como el resto de registros):

```js
{
  files: ['facade-designs.json', 'city-design.json'],
  source: 'Authored procedural facade compositions and street design rules',
  conditions:
    'ODbL-1.0 as a whole (street names and identifiers derived from OSM); also attribute Catastro (anchor vertices). Original parameters; external reference rights not granted.',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  transformation:
    'Building features interpreted as parametric primitives from references listed in THIRD_PARTY_NOTICES.md; anchors are cadastral vertices or frontage identifiers',
},
{
  files: ['map-corrections.json'],
  source: 'Manual corrections applied at load time over the OSM and Catastro layers',
  conditions: 'ODbL-1.0 (corrections to OpenStreetMap data form a derivative database)',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  transformation: 'Guarded edits of road attributes and vertices; base layers unchanged',
},
```

Esquemas: en el paso 2.3, los dos `*.schema.json` de este anexo se copian a `schemas/` en
la raíz (no se publica) y los archivos de `web/` llevan
`"$schema": "../schemas/facade-designs.schema.json"` para que el editor los valide. El
validador ignora `$schema`. Los esquemas no se usan en los tests (no hay dependencia de
validación JSON Schema en el proyecto); el validador propio es la referencia.

## K7. Correcciones (`web/js/world/corrections.js`)

Esquema: [map-corrections.schema.json](map-corrections.schema.json). Ejemplo:
[map-corrections.example.json](map-corrections.example.json).

`export function applyCorrections(world, file)` recibe el objeto de `loadWorld` (antes de
devolverlo) y el JSON; modifica `world.roads`, `world.areas` y `world.buildings` en
memoria y devuelve la lista de IDs aplicados. Es una función pura de datos: sin DOM ni
Three, importable desde Node.

| Operación             | Campos                                                                    | Efecto                                                                     |
| --------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `road.set`            | `road: {id, occurrence}`, `expect: {campo: valor}`, `set: {campo: valor}` | Cambia `name`, `type`, `w`, `oneway` o `bridge`                            |
| `road.movePoint`      | `road`, `index`, `expect: [x, z]`, `to: [x, z]`                           | Mueve un vértice                                                           |
| `road.insertPoint`    | `road`, `after`, `expectAfter: [x, z]`, `at: [x, z]`                      | Inserta un vértice tras `after`                                            |
| `road.add`            | `add: {id: "fix-…", name, type, w, oneway, bridge, p}`                    | Añade una vía al final de `roads`                                          |
| `road.remove`         | `road`, `expect: {name}`                                                  | Quita una vía (no cambia los índices de edificios)                         |
| `area.movePoint`      | `area: {index, expectFirst: [x, z]}`, `index`, `expect`, `to`             | Mueve un vértice de un área                                                |
| `building.moveVertex` | `building: {index, footprintSha256}`, `vertex`, `expect`, `to`            | Mueve un vértice de un contorno catastral (esquinas que cierran una calle) |

Reglas:

- Se aplican en el orden del archivo. Cada operación comprueba su guarda (`expect`,
  `expectFirst`, `footprintSha256`) sobre los datos **en ese momento**; si no coincide,
  `applyCorrections` lanza `Error('Corrección fix-007 no aplicable: …')`. Así, si se
  regenera OSM y la vía cambia, la corrección falla en `verify-world` y en el juego en
  lugar de aplicarse a ciegas.
- No hay operación para ocultar o borrar edificios: cambiaría los índices de los que
  dependen los IDs de frente y el piloto de alturas.
- `building.moveVertex` cambia el `footprintSha256` de esa parte: tras añadirla hay que
  regenerar `frontages.json` (`node tools/export-facades.mjs`) en el mismo commit, que
  tendrá el tipo `feat(datos)` o `fix(datos)`, nunca `refactor`.
- Campos obligatorios en cada corrección: `id` (`fix-NNN`, único), `op`, `reason`,
  `evidence` (por ejemplo «ortofoto PNOA 2022-07» o «visita 10/10/2026») y `date`.
- `source-data/geometry-baseline.json` se sigue calculando sobre las capas de base; las
  correcciones no lo cambian.
- ODbL: el archivo se publica con `license: "ODbL-1.0"` y la atribución de OSM; en la
  ayuda del juego se enlaza junto a `osm-world.json`. Si una corrección arregla un error
  real del mapa, conviene editar también OpenStreetMap y retirarla cuando llegue la
  siguiente extracción.
