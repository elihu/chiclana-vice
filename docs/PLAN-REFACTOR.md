# Plan de rendimiento, simplificación y mantenimiento

Fecha: 29/10/2026. Base: `main` en `8c156e0`, tras integrar `fix/mundo-transitabilidad` (referencias de
línea tomadas en `b44fcc5`). Este documento es un plan: no cambia el juego. Lo ejecuta un
agente sin posibilidad de preguntar; si algo no encaja, **para y explícalo** en lugar de
improvisar otro diseño.

## Objetivo

Arrancar antes, gastar menos CPU por fotograma y dejar el código más fácil de cambiar,
**sin cambios visibles**: misma escena, mismas rutas, misma simulación. Nada de esto toca
datos, fachadas, cotas, transitabilidad, controles ni modo ligero.

## Punto de partida (medido el 29/10/2026, Node 26, CPU, DOM y WebGL simulados)

- Arranque completo en el arnés: **10,5 s**. Por constructor (tiempo inclusivo del perfil):
  aceras `buildSidewalks` 3,3 s, resto de `buildStreetSurfaces` 2,4 s, `init` propio
  (mayormente `safePoint`/`blocked` en línea) 2,8 s, `buildDetailedFacades` 1,4 s,
  `buildRoadDetails` 1,0 s, `buildBuildings` 0,6 s.
- `update(1/60)`: **0,55 ms por fotograma**; `updatePlayer` es el mayor (≈30 %).
- Funciones propias más caras por tiempo propio: la flecha de `blocked`
  (`world/spatial.js:95`, recorre **todos** los obstáculos de calle en cada consulta)
  2,2 s; `pInside` 1,1 s; `roadAt` 1,0 s; `dividerHeightAt` 0,6 s; `boundaryDistance`
  0,6 s; `nearOther`/`close`/`free` de `sidewalks.js` 0,7 s.
- Rejillas espaciales hechas a mano, cada una con su celda y claves de texto
  (`gx + ',' + gz`, 27 apariciones): `buildingGrid`, `road-space.js`, `surface-model.js`
  (`indexBounds`, cuatro rejillas), `ground-floors.js`, `tram.js`, `shadow-proxies.js`.
  `nearestRoad` y `waterAreas.some(...)` son búsquedas lineales.
- Funciones gigantes (ESLint `complexity` > 25 o más de 120 líneas):
  `createSurfaceModel` 813 líneas y complejidad 96; `validateSurfaceDesign` complejidad
  154; `validateCityDesign` 371 líneas; `validateFacadeDesigns` 333; `buildStreetSurfaces`
  300 y complejidad 67; `buildBuildings` 290; `buildStops` 243; `installTreeReview` 239;
  `installControls` 224; `buildSidewalks` 206; `buildTrees` 200; `updatePlayer`
  complejidad 52; `composeBuilding` 43.

Estas cifras no acreditan GPU, memoria real, fluidez ni móvil.

Versiones el 29/10/2026: Three.js 0.186.1 es la última publicada y no se cambia. eslint
10.13.0, prettier 3.9.10 y `actions/setup-node` v7.1.0 se suben aparte en
`chore/versiones`; si esa rama ya está en `main`, la referencia se toma con ellas.

## Cómo ejecutar este plan

- **Una fase = una rama** desde `main` limpio (`refactor/…` o `perf/…`, nombre en cada
  fase). Un commit por paso, Conventional Commits en español. Sin push, merge ni rebase.
- **Referencias antes de tocar nada** (en el scratchpad, no en el repositorio):
  - `node tools/scene-fingerprint.mjs --out <scratch>/huella-base.json` en el árbol.
  - La misma huella **sin relieve**: `git archive main | tar -x -C <scratch>/plano`, borrar
    `web/terrain.json` y `web/terrain.bin`, enlazar `node_modules` y ejecutar la huella
    desde esa copia. Repetir con la rama al final de la fase.
  - `node tools/bench-startup.mjs --out <scratch>/arranque-base.json` (desde R0).
- **Verificación al final de la fase**, no en cada paso: `npm run check` y las dos huellas
  con `--compare`, que deben ser **idénticas**. Durante los pasos basta `npm run lint` y el
  verificador que toque lo cambiado. Si una huella cambia, busca el paso culpable con
  `git bisect` (un commit por paso), deshazlo y entrega el diagnóstico (qué clave cambia y
  por qué); que «se vea igual» no basta.
- **Sin capturas, scene-budget ni Chrome**: el revisor hace el humo en navegador.
- Medidas de tiempo: tres ejecuciones de `bench-startup` y se informa la mediana, en la
  misma máquina y versión de Node que la referencia. No afirmes FPS ni rendimiento de GPU
  o móvil.
- **Reglas de código**: las de `docs/DESARROLLO.md` (capas, estado compartido, sin
  efectos de nivel superior, importmap y `modulepreload` para cada módulo nuevo). Sin
  dependencias nuevas. Mismo estilo que el código alrededor. Un módulo nuevo va en la
  capa más baja que le baste.
- Si algo se atasca más de 15 minutos, para y explica.
- Ninguna fase espera revisión visual del usuario: todas deben dejar la huella idéntica.
  El revisor sirve la rama si el humo da algo raro.

## Decisiones

- **D1. Una rejilla espacial común.** `core/grid.js` exporta `createGrid(cell)` con
  `insert(item, minX, maxX, minZ, maxZ)`, `queryPoint(x, z)` y
  `queryBox(minX, maxX, minZ, maxZ, visit)`. Claves numéricas (por ejemplo
  `(gx + 32768) * 65536 + (gz + 32768)`), sin cadenas. La consulta por caja no repite un
  elemento: marca con un contador de consulta (`item` en un `Map` interno de
  sello → último sello), sin crear un `Set` por llamada. **El orden de visita es el de
  inserción**, para que «el primero que cumple» y los empates den lo mismo que hoy.
  **Las rejillas que indexan una lista de `core/state.js`** (obstáculos, agua, tramos) se
  sincronizan al consultarse con `syncedGrid` de `world/spatial.js`: indexan lo añadido al
  final y se rehacen si la lista mengua o cambia su primer elemento, porque esas listas se
  mutan directamente (`push`, `length = 0`), también en los tests. No se añaden funciones
  `add…` obligatorias. Una rejilla de datos que no cambian tras construirse (superficies,
  aceras) puede crearse una vez en su constructor.
- **D2. Mismo resultado, no «casi».** Cada sustitución de una búsqueda lineal debe dar
  el mismo elemento, también en empates: entre candidatos a igual distancia gana el de
  menor índice original, como en el recorrido lineal. `nearestRoad` busca por anillos de
  celdas hasta que la distancia del anillo supere la mejor hallada; si no hay candidatos,
  recurre al recorrido lineal.
- **D3. Partir sin cambiar el orden de cálculo.** Al extraer funciones de los
  constructores grandes, el orden de las llamadas a `rand()` y de inserción en escena,
  mallas agrupadas y listas se conserva exactamente; la huella lo comprueba.
- **D4. Etapas de arranque declaradas.** `init` ejecuta una lista de etapas
  `{ name, progress?, run }` (`app/stages.js` o dentro de `app.js`), cada una con su
  tiempo en `performance.now()`. Con `#fps` o `?debug` los tiempos van a la consola
  (`console.table`); `bench-startup` los lee de la API de pruebas. Sin cambiar el orden
  ni los mensajes de la barra de carga.
- **D5. Validación declarativa.** Los validadores de `design-validate.js` y
  `validateSurfaceDesign` comparten un pequeño ayudante (`world/validate-kit.js`:
  `number(path, v, {min, max, integer})`, `oneOf`, `array`, `object` con claves
  permitidas) que acumula mensajes. **Los mensajes de error no cambian** (los tests los
  comparan); si uno no se puede reproducir con el ayudante, se deja a mano.
- **D6. Objetos de opciones solo donde ya duele.** Las funciones con 8 o 9 argumentos
  posicionales (`sculptedBox`, `box`/`add` de `materials.js`, `cube`/`pane`/`sign` del
  kit, `windowWall`, `cube`/`cyl` de `furniture.js`, `lamp`/`sidePatch` de
  `car-model.js`) **no** se cambian en esta pasada: son muchas llamadas y el beneficio es
  bajo. Queda anotado como pendiente.
- **D7. Fuera de alcance:** cambiar llamadas de dibujo, triángulos, shaders, materiales,
  texturas, datos de `web/*.json`, `tools/` (salvo la herramienta nueva de R0) y Three.js.

## Fase R0. Medir el arranque (`perf/medir-arranque`)

1. **Etapas de arranque (D4).** Convertir la secuencia de `init` (`web/js/app.js:55`) en
   etapas con nombre y tiempo. La API de pruebas expone `startupTimings()` con
   `[{ name, ms }]`. Comprobar: huellas idénticas.
2. **`tools/bench-startup.mjs`.** Crea el arnés, arranca, lee `startupTimings()`, mide
   `update(1/60)` en 1.200 pasos tras 60 de calentamiento y escribe
   `{ node, bootMs, stages, updateMsPerFrame }`. `--compare ref.json` imprime diferencias
   por etapa en ms y %. Uso en la cabecera, como `scene-fingerprint.mjs`. Documentarlo en
   `DESARROLLO.md` junto a las otras herramientas de refactorización.

Entrega: tabla de etapas de la referencia (mediana de tres).

## Fase R1. Índices espaciales (`perf/indices-espaciales`)

1. **`core/grid.js` (D1)** con pruebas en un verificador nuevo o en
   `verify-modules.mjs`: inserción por caja, consulta por punto y por caja, sin
   duplicados y en orden de inserción.
2. **Obstáculos de calle.** `streetEnvironment.colliders` pasa a tener una rejilla
   (radio máximo conocido; consultar la caja `x ± (r + rMax)`). Sustituir los tres
   `colliders.some(...)` de `spatial.js`, `vegetation.js` y `furniture.js` y mantener la
   rejilla al hacer `push` (un único `addCollider` en `world/spatial.js`).
3. **Edificios.** `buildingGrid` con `core/grid.js`; `inBuilding` y `crossesWall` sin
   `Set` por llamada.
4. **Agua y vías.** Rejilla de `waterAreas` por caja; `nearestRoad` por anillos (D2).
5. **Superficies.** `surface-model.js` (`indexBounds`, `key`) y `road-space.js` usan
   `core/grid.js`. Calcular cada caja de polígono una vez (`polygonBounds` en
   `core/math.js`, en lugar de `Math.min(...xs)` repetido).
6. **Aceras.** `nearOther`, `close` y `free` de `sidewalks.js` (`:41–:71`) consultan
   rejillas en lugar de recorrer listas.
7. **Resto de rejillas** (`ground-floors.js`, `tram.js`, `shadow-proxies.js`) solo si la
   sustitución es directa; si no, anotarlo.

Objetivo orientativo: arranque al menos un 30 % menor en `bench-startup`. Un paso se
revierte solo si el arranque total empeora más del 3 % (el ruido entre ejecuciones ronda
ese valor), no por una etapa suelta; se anota. Entrega: tabla antes/después por
etapa.

### Continuación de R1 (29/10/2026)

Ejecución de los pasos 5–7 sobre `perf/indices-espaciales`, sin repetir el paso 3.
Medianas de tres procesos separados, Node v26.8.2 en la misma máquina, con DOM y WebGL
simulados. Las referencias y los JSON se guardan fuera del repositorio en
`/tmp/chiclana-r1-cont/`.

- **Paso 5 revertido.** La rejilla común y las cajas de polígonos conservaban la huella
  con relieve. Frente al punto de partida de esta continuación, `prepareTerrainPlacement`
  pasó de 372,34 a 383,10 ms y `buildRoadDetails` de 744,88 a 785,59 ms; la bajada de
  `buildStreetSurfaces` de 4.171,81 a 4.116,63 ms no compensa el criterio del plan de
  revertir pasos que empeoran sus etapas. Se conserva la implementación anterior de
  `surface-model.js` y `road-space.js`.
- **Paso 6 revertido por huella distinta.** `git bisect` en una copia temporal aisló
  `0067233`. Cambiaban `scene.triangles` (−1.477 con relieve, −115 sin relieve),
  `scene.trianglesWithoutInstancing`, `scene.strict` y `scene.unordered`. El conjunto
  mutable de vecinos continuos se actualizaba por tramo, pero los `fallback` de aceras
  cortas se ejecutan al terminar la calle: consultaban los vecinos del último tramo,
  en lugar de los de su tramo original. Se revierte el paso completo sin rehacerlo.
- **Paso 7 revertido tras medirlo aislado.** Se probaron las sustituciones directas en
  bajos y tranvía. La mejora observada junto al paso 6 descartado no se confirmó al medir
  el paso 7 solo: frente al inicio de esta continuación, `buildBuildings` pasó de
  552,91 a 561,60 ms, `buildDetailedFacades` de 1.159,20 a 1.218,48 ms y `buildTram`
  de 8,11 a 8,13 ms. Sus dos huellas sí eran idénticas a `main`; se revierte por tiempos.
  `shadow-proxies.js` no se sustituyó: agrupa buffers por material y celda y luego los
  itera; `createGrid` no ofrece esa operación y el reemplazo no es directo.

Los pasos 5–7 no dejan cambios en el código del juego. Se conservan los pasos 1, 2 y 4
anteriores y la sincronización de `ff2b1be`.
El paso 3 sigue descartado por no mejorar, según la ejecución anterior. No se modifica
`docs/ESTADO.md`; no se ejecutan Chrome, capturas, push ni merge. Estas medidas no
acreditan GPU, FPS ni móvil.

## Fase R2. Partir los módulos grandes (`refactor/modulos-grandes`)

Movimientos de código con huella idéntica (D3). Un commit por módulo.

1. **`world/surface-model.js` (1.098 líneas).** Validación a `world/surface-validate.js`;
   perfiles de calzada y tableros, divisorias y consultas (`roadAt`, `dividerHeightAt`,
   `drySurfaceAt`…) en funciones de nivel de módulo o submódulos que reciben un contexto
   explícito en lugar de cierres dentro de `createSurfaceModel`. La API devuelta no cambia.
2. **`world/streets.js`.** `buildStreetSurfaces` en etapas con nombre (calzadas, juntas,
   marcas, pasos de cebra…) dentro del mismo módulo o en `world/street-*.js`.
3. **`world/sidewalks.js`, `world/buildings.js`, `world/vegetation.js`, `world/tram.js`.**
   Extraer los bloques internos de `buildSidewalks`, `buildBuildings`, `buildTrees`,
   `buildStops` y `buildTram` a funciones con nombre.
4. **`game/player.js`.** `updatePlayer` (complejidad 52) en `updateOnFoot`, `updateDriving`
   y las partes comunes; sin cambiar el orden de las operaciones ni los números.
5. **`ui/controls.js`.** `installControls` por grupo de controles (teclado, joystick,
   botones, menú).
6. **`debug/inspector.js`.** `installTreeReview` en funciones con nombre.

Criterio: ninguna función de estos módulos por encima de 150 líneas ni de complejidad 40,
salvo justificación escrita en el informe. No se añade la regla a la configuración de
ESLint en esta fase.

## Fase R3. Validadores declarativos (`refactor/validadores`)

1. `world/validate-kit.js` (D5) con sus pruebas.
2. `validateSurfaceDesign`, `validateCityDesign`, `validateFacadeDesigns` y
   `validateCorrections` usan el ayudante, cada uno en su módulo
   (`world/validate-*.js`); `design-validate.js` queda como fachada que reexporta.
   `tests/verify-design.mjs` y `tests/verify-world.mjs` deben pasar sin cambiar los
   mensajes esperados.

## Fase R4. Coste por fotograma (`perf/fotograma`)

1. Perfil de `update` con `node --cpu-prof` sobre `bench-startup` y anotar las cinco
   funciones propias más caras.
2. Reducir trabajo repetido en `updatePlayer`, `placeVehicleIfChanged`, `updateCamera` y
   `updateHudReadouts` (cálculos por fotograma que no cambian, objetos creados por
   llamada), con la simulación de 600 pasos de la huella idéntica.
3. Activar en ESLint `complexity` (40) y `max-lines-per-function` (150) como aviso solo
   para `web/js/`, si R2 los dejó en verde.

Entrega: ms por fotograma antes/después (mediana de tres). No afirmar FPS.

## Fase R5. Documentación al día (`docs/al-dia`)

1. **`docs/DESARROLLO.md`**: tabla de módulos por archivo (una línea por módulo, hoy
   faltan unos 30, entre ellos `road-space.js`, `spatial.js`, `water.js`, `traffic.js`),
   `core/grid.js`, etapas de arranque y `bench-startup`.
2. **Planes ejecutados a `docs/historico/`**: `PLAN-MODULAR.md` (y `plan-modular/`, salvo
   `KIT-FACHADAS.md` y los esquemas, que siguen siendo referencia vigente y pasan a
   `docs/`), `PLAN-AMPLIACION.md`, `ESTUDIO-AMPLIACION.md`, `PLAN-MEJORA-GRAFICA.md`,
   `PLAN-MOTOR-GRAFICOS.md`, `PLAN-TERRENO.md`, `PROPUESTA-CONVENCIONES.md` y este plan al
   cerrarse. Actualizar todos los enlaces (`grep -rn` en `docs/`, `AGENTS.md`,
   `tools/AGENTS.md`, `README.md` y comentarios de código) y que `npm run check` pase.
3. **`docs/README.md`**: índice en tres bloques (trabajar, referencia, estado) y un
   apartado «Histórico» con una línea por plan.
4. **`docs/ESTADO.md`**: no se toca en la rama (lo actualiza quien integra), salvo cerrar
   los pendientes que este plan resuelva.

## Lo que este plan no acredita

GPU, memoria real, fluidez, FPS ni móvil. La mejora de arranque se mide en Node con DOM y
WebGL simulados; en el navegador el tiempo real incluye descarga, compilación de shaders
y GPU.

### Cierre de R1 (29/10/2026)

Tanda del revisor sobre la misma rama: `free()` de `sidewalks.js` consulta el agua con la
rejilla sincronizada (`inWater`) y memoriza por tramo sus puntos, que comparten las piezas
vecinas y el faldón (`free()` no tiene efectos). Huellas idénticas con y sin relieve.
Mediana de tres, `main` frente a la rama: `buildStreetSurfaces` 4.262 → 3.250 ms,
`spawnActors` 2.250 → 214 ms, arranque 10.267 → 7.173 ms (−30 %) y `update` 0,58 →
0,27 ms por paso. El índice de extremos del paso 6 sigue descartado.
