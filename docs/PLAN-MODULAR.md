# Plan de implementación: motor modular y ciudad desde datos

Fecha: 6/10/2026. Rama `docs/plan-modular`, creada desde `main` (5666928). Este documento
es un plan: no cambia el juego. Lo ejecuta un agente sin posibilidad de preguntar, así que
cada paso dice qué tocar, cómo comprobarlo y qué hacer si falla. Las decisiones ya están
tomadas; si algo no encaja con lo que encuentres, **para y deja una nota** en el informe
final en lugar de improvisar un diseño distinto.

Anexos en [`docs/plan-modular/`](plan-modular/):

| Anexo                                                                     | Contenido                                                                   |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [MAPA-FUNCIONES.md](plan-modular/MAPA-FUNCIONES.md)                       | Cada función o bloque de `game3d.js` y su módulo destino                    |
| [ESTADO-COMPARTIDO.md](plan-modular/ESTADO-COMPARTIDO.md)                 | Contenido exacto de `state.js` y tabla de renombrado de variables           |
| [HERRAMIENTAS.md](plan-modular/HERRAMIENTAS.md)                           | Código de la huella de escena, del humo en Chrome, del arnés y de los tests |
| [INVENTARIO-DATOS.md](plan-modular/INVENTARIO-DATOS.md)                   | Qué está ya en datos y qué sigue en el código, con valores                  |
| [KIT-FACHADAS.md](plan-modular/KIT-FACHADAS.md)                           | Formato del kit, lenguaje de expresiones y compositor                       |
| [facade-designs.schema.json](plan-modular/facade-designs.schema.json)     | Esquema JSON de las composiciones de fachada                                |
| [facade-designs.example.json](plan-modular/facade-designs.example.json)   | Ejemplo completo: el Mercado, equivalente al código actual                  |
| [city-design.example.json](plan-modular/city-design.example.json)         | Ejemplo de reglas de calle, zonas y mobiliario                              |
| [map-corrections.schema.json](plan-modular/map-corrections.schema.json)   | Esquema de la capa de correcciones manuales                                 |
| [map-corrections.example.json](plan-modular/map-corrections.example.json) | Ejemplo de correcciones                                                     |
| [TERRENO.md](plan-modular/TERRENO.md)                                     | Dónde asume el código suelo plano y dónde entrará el terreno                |

## 0. Resumen

- **Fase 0** (2 pasos): herramientas de comprobación. Una huella de la escena y del
  comportamiento en CPU (`tools/scene-fingerprint.mjs`) y un humo en Chrome real sin
  interfaz (`tools/browser-smoke.mjs`). Se toma la huella de referencia antes de tocar el
  juego.
- **Fase 1** (19 pasos): `web/game3d.js` pasa a ser una entrada de pocas líneas y el código
  se reparte en unos 35 módulos ES nativos bajo `web/js/`, sin cambio de escena, rutas ni
  comportamiento. Primero se crea la costura de pruebas (API explícita, sin parcheo de
  texto), luego se quitan los efectos de nivel superior, luego se centraliza el estado y,
  por último, se mueven las funciones por capas, de las hojas hacia arriba.
- **Fase 2** (12 pasos): el diseño de la ciudad pasa a archivos. Un kit de piezas
  paramétricas de fachada y un JSON de composición por edificio; piloto con el Mercado y
  geometría idéntica comprobada; después el resto de recetas, las reglas de calle, una
  capa de correcciones manuales separada y un modo `?debug` para editar.
- **Fase 3** (2 pasos): solo preparación del terreno: interfaz `heightAt` sin cablear y el
  inventario de supuestos `y = 0`.

Criterio de éxito de las fases 1 y 3 y de cada migración de la fase 2: **la huella es
idéntica** a la de referencia (escena, materiales, texturas, triángulos, geometría por
bytes, rutas, recursos pedidos y 600 pasos de simulación), `npm run check` pasa y el humo
en Chrome arranca sin errores. Se ha comprobado en el scratchpad que la huella es
determinista (dos ejecuciones iguales), que detecta un cambio de un solo color y que un
intérprete de recetas JSON reproduce el Mercado con huella idéntica.

## 1. Decisiones de arquitectura

### D1. Módulos ES nativos bajo `web/js/`, sin bundler ni compilación

`web/game3d.js` se conserva como **entrada** (así no cambian la URL de `index.html`, la
documentación ni las referencias externas) y el código pasa a `web/js/` en cuatro capas:
`core/` (estado y utilidades), `engine/` (render, materiales, cámara, audio), `world/`
(datos y constructores de la ciudad), `game/` (jugabilidad) y `ui/` (DOM, diálogos,
mapa, controles). `game-data.js`, `progress.js` y `measure.js` se quedan donde están
porque los tests y la consola los importan por esa ruta.

- Justificación: el equipo de V8 considera adecuado servir módulos sin empaquetar en
  producción para aplicaciones de menos de 100 módulos con un árbol poco profundo, y
  recomienda `modulepreload` y HTTP/2 (fuente 2). Aquí habrá unos 35 módulos propios de
  profundidad 4 como máximo y GitHub Pages sirve HTTP/2 con gzip (comprobado con `curl` el
  6/10/2026). El peso dominante es Three (687 KB sin comprimir), que no cambia.
- Descartado: bundler o minificador (prohibido por `AGENTS.md`); _tree-shaking_ de Three
  (exige compilación y Three ya se sirve minificado); un único archivo con regiones (no
  resuelve el acoplamiento ni el parcheo de tests).

### D2. Versionado: importmap con claves relativas, `modulepreload` y versión explícita

Hoy todos los recursos llevan el mismo `?v=` y Pages sirve con `Cache-Control:
max-age=600` (medido el 6/10/2026). Si los módulos se pidieran sin versión, durante diez
minutos tras publicar un navegador podría combinar `app.js` nuevo con `state.js` viejo de
su caché, y el `import` de una exportación inexistente es un `SyntaxError` que impide
arrancar. Solución elegida:

1. Los módulos se importan entre sí con **especificadores relativos sin consulta**:
   `import { gfx } from '../core/state.js'`. Así funcionan igual en Node (tests) y en el
   navegador, y no hay especificadores «desnudos» (`'three'`).
2. `index.html` declara un **importmap cuyas claves son esas URL relativas** y cuyos
   valores son la misma URL con `?v=VERSION`, una entrada por módulo (también
   `./vendor/three.module.min.js`, `./game-data.js` y `./progress.js`). El navegador
   resuelve primero el especificador relativo y después aplica el mapa sobre la URL
   resultante; las claves relativas se resuelven contra la URL del documento, así que
   funciona también bajo `/chiclana-vice/` (fuente 1; comprobado en Chrome sin interfaz el
   6/10/2026 con una página de prueba servida bajo `/chiclana-vice/`: los módulos se
   pidieron con `?v=` y el precargado se reutilizó, una sola instancia).
3. Un `<link rel="modulepreload" href="js/…?v=VERSION">` por módulo, con la misma lista,
   para que el navegador los pida en paralelo en lugar de descubrirlos nivel a nivel.
4. La entrada calcula la versión desde su propio `import.meta.url` (como ahora) y se la
   **pasa explícitamente** a `startGame({ version })`; `core/assets.js` la usa para los
   `fetch` de datos y la ortofoto. En Node, el arnés pasa la versión leída de
   `index.html`.
5. Un navegador sin importmap (anterior a marzo de 2023) carga los mismos módulos sin
   `?v=`: el juego funciona, solo pierde la invalidación de caché. Por eso no se usan
   especificadores desnudos.
6. `tests/verify-modules.mjs` comprueba que cada `.js` de `web/js/` tiene entrada en el
   importmap y en `modulepreload`, que todas las versiones coinciden con la de
   `game3d.js?v=` y `style.css?v=`, y que ningún módulo escribe `?v=` a mano.

Cambiar la versión al publicar: sustituir todas las apariciones en `index.html` a la vez,
por ejemplo `sed -i 's/?v=[^"]*"/?v=NUEVA"/g' web/index.html`; el test detecta cualquier
olvido.

Descartado:

- `?v=` literal en cada `import` de cada módulo: decenas de cadenas que actualizar a mano
  y fáciles de olvidar; además los tests en Node recibirían URL con consulta.
- `import()` dinámico con `asset()` en todos los módulos: obliga a `await` de nivel
  superior en cadena, retrasa la evaluación del grafo completo y pierde el análisis
  estático (ESLint, errores de enlace tempranos).
- Carpeta versionada (`js/v2026-10-06/…`): exige copiar archivos en cada publicación, un
  paso de compilación encubierto.
- Especificadores desnudos (`'chiclana/state'`) con importmap: Node no los resuelve sin un
  _loader_ propio, y sin importmap el navegador falla.
- _Service worker_: complejidad y riesgo de servir versiones viejas; no aporta nada aquí.

### D3. Estado compartido: un módulo hoja `core/state.js` con objetos mutables

Todo lo que hoy es una variable de nivel superior usada por más de una función que irá a
módulos distintos pasa a `web/js/core/state.js`, que no importa nada propio salvo Three y
`game-data.js`. Dos reglas:

- **Contenedores** que nunca se reasignan (arrays, `Map`, objetos como `state`, `player`,
  `input`, `graph`, `segments`, `streetEnvironment`, `facadeWork`…): se exportan como
  `export const` **con el mismo nombre**. El código que los usa no cambia, solo añade el
  `import`.
- **Escalares reasignables** (`scene`, `renderer`, `city`, `paused`, `quality`, `mode`,
  `orbit`…): pasan a ser propiedades de seis objetos exportados, agrupados por dominio y
  **con el mismo nombre de propiedad que la variable antigua**: `world`, `gfx`,
  `session`, `view`, `pointer`, `actors` y `audio`. La regla de renombrado es mecánica:
  `paused` → `session.paused`, `worldW` → `world.worldW`. Tabla completa en
  [ESTADO-COMPARTIDO.md](plan-modular/ESTADO-COMPARTIDO.md).

Justificación frente a las alternativas:

- `export let scene` + `setScene()`: los _live bindings_ hacen que leer funcione sin
  cambios, pero un módulo que no es dueño no puede asignar (`scene = x` lanza `TypeError`)
  y harían falta unos 40 _setters_. Además mezcla dos mecanismos. Se descarta.
- Contexto pasado explícitamente a cada función (`build(ctx)`): el más testeable, pero
  cambia la firma de casi todas las funciones; con 4.000 líneas el riesgo de alterar el
  comportamiento en un refactor sin cambios es alto. Se descarta para la fase 1; los
  módulos nuevos de la fase 2 (compositor, kit, correcciones) sí reciben sus dependencias
  por parámetro.
- Clases (`Game`, `World`) con `this`: reescritura completa y errores de `this` en
  manejadores de eventos. Se descarta.
- Objeto único `S` con todo: más simple, pero pierde la agrupación por dominio que guía a
  quien lee. Los seis objetos cuestan lo mismo.

Rendimiento: acceder a `session.t` en lugar de a una variable de módulo es una carga de
propiedad monomórfica; V8 la optimiza igual. Los objetos se crean con todas sus
propiedades desde el principio (forma estable). No se crean objetos nuevos por frame.

### D4. Ningún efecto de nivel superior; un único arranque `startGame()`

Ningún módulo de `web/js/` puede tocar `document`, `window`, `localStorage`, `matchMedia`,
`innerWidth` ni registrar oyentes al evaluarse. Todo eso ocurre dentro de funciones que
llama `startGame(options)` en `js/app.js`, en el mismo orden que hoy tiene el archivo.
Consecuencias: los tests importan los módulos con `import` normal, Node puede evaluar
cualquier módulo sin DOM (lo comprueba `verify-modules.mjs`) y los ciclos de importación
no pueden fallar por orden de evaluación. Tampoco hay `await` de nivel superior.

`startGame({ version, platform })` acepta `platform = { WebGLRenderer, TextureLoader }`
(por defecto los de Three). El arnés pasa sus clases simuladas: es exactamente lo que hoy
hace sustituyendo `globalThis.__THREE`.

### D5. API de pruebas explícita, sin parcheo de texto

`startGame()` devuelve el objeto de pruebas que hoy fabrica el arnés con expresiones
regulares (unión de las claves de `window.__cityGame` y de las que inyecta
`tests/runtime-harness.mjs`), construido en `js/test-api.js` con _getters_ para los
valores reasignables. `window.__cityGame` sigue teniendo **exactamente las mismas claves
públicas que hoy** (las usa `measure.js`); la API completa no se cuelga de `window`. El
arnés deja de escribir un módulo temporal y de aplicar sustituciones: importa
`web/js/app.js` y llama a `startGame()`. `tools/export-facades.mjs` no cambia porque solo
usa `createRuntime()`.

Nota: el encargo menciona `tests/qa3d-runtime.mjs`; en `main` el arnés ya genera el
módulo temporal en `/tmp` y lo borra. Ese mecanismo es el que desaparece.

### D6. Capas y dependencias sin ciclos

```text
core  ←  engine  ←  world  ←  game  ←  ui  ←  app / test-api / entrada
```

Un módulo solo importa de su capa o de capas a su izquierda, con una excepción
deliberada: `ui/feedback.js` (`toast` y `loadProgress`) solo depende de `core/` y lo
puede importar cualquier capa (la cámara, el audio y los constructores lo usan). Segunda
excepción, comprobada al ejecutar la fase 1: `ui/hud.js` lo importan `game/missions`,
`player`, `police` y `update` para refrescar el marcador; no crea ciclos. Nota de ejecución:
`platform` pasó a `gfx.platform` en 1.12 (lo necesita `loadLayers`), no en 1.13. El
reparto de
[MAPA-FUNCIONES.md](plan-modular/MAPA-FUNCIONES.md) está calculado para que el grafo sea
acíclico; `verify-modules.mjs` lo comprueba y falla con la lista del ciclo. Si un paso
creara un ciclo, la solución está escrita en el propio mapa (por ejemplo `target()` vive
en `game/jobs.js` y no en `game/missions.js` para que `ui/hud.js` no dependa de misiones).

### D7. Huella de escena como criterio de igualdad

`tools/scene-fingerprint.mjs` arranca el juego en el arnés de CPU y produce un JSON con:
recuentos (objetos, mallas, mallas instanciadas, instancias, materiales, texturas,
geometrías, triángulos con y sin instancias), un hash estricto de la escena en orden de
recorrido (tipo, nombre, visibilidad, sombras, matriz de mundo, bytes de cada atributo e
índice, firma del material y matrices y colores de instancia), un hash sin orden, los
ajustes de render (relación de píxel, sombras, tono, niebla, fondo), un hash de las rutas
entre todos los lugares a pie y en coche, la lista de recursos de datos pedidos y un
hash de 600 pasos de simulación con entrada fija, más el DOM resultante.

- Se compara siempre en la misma máquina y la misma versión de Node, contra una
  referencia tomada del commit base. No entra en `npm test`: los resultados en coma
  flotante de `Math.sin` y similares pueden variar entre versiones de V8 y la CI prueba
  dos versiones de Node.
- `tools/browser-smoke.mjs` abre el juego en Chrome sin interfaz (SwiftShader) mediante
  el protocolo DevTools, sin dependencias: espera a la pantalla de bienvenida, recoge
  excepciones y errores de consola, comprueba que todas las peticiones locales llevan
  `?v=` y cuenta mallas y triángulos en el navegador real. Medido en `main`: listo en
  unos 3 s, 12 peticiones, 1.421 mallas y 917.276 triángulos, igual que en Node. No
  acredita rendimiento en GPU ni móvil.

### D8. Diseño desde datos: kit de piezas, recetas JSON y expresiones

Las recetas de fachada pasan a `web/facade-designs.json`: **recetas** con nombre (listas
de nodos: `let`, `box`, `piece`, `geo`, `group`, `for`, `if`) y **edificios** que aplican
recetas a frentes anclados. Las piezas (`pane`, `balcony`, `arch`, `pediment`, `column`,
`door`, `belfry`, `cross`, `sign`, `statue`…) son las funciones actuales, movidas sin
cambios a `world/facade-kit.js`. Los valores numéricos admiten expresiones
(`"max(3, round(len / 5.15))"`) evaluadas por un intérprete pequeño y seguro
(`engine/expr.js`, sin `eval`), con la misma precedencia y asociatividad que JavaScript,
de modo que la aritmética de coma flotante es idéntica a la del código actual.

- Inspiración: las gramáticas de forma CGA (reglas, división y repetición de fachadas,
  inserción de piezas; fuentes 6 y 7) y las plantillas de geometría de CityJSON
  (geometría reutilizable instanciada con una transformación; fuente 5). No se adopta
  CityJSON como formato: describe superficies ya construidas, no reglas, y no aporta
  nada a un motor que genera primitivas; sí se toma su vocabulario de LoD para
  documentar el nivel de cada fachada (`"lod": "2.2"` orientativo, no normativo).
- Anclaje: `{"front": "building-2615-edge-12"}` (ID del catálogo `frontages.json`, que el
  juego resuelve contra `buildings.json`), `{"a": …, "b": …, "outward" | "outwardFrom": …}`
  (segmento explícito) o `{"ring": […], "center": […]}` (todas las aristas de un anillo).
  El piloto del Mercado usa `ring` con los cuatro puntos actuales de
  `facade-profiles.json` porque su contorno no coincide arista a arista con el catastral
  (tres de sus vértices son del edificio 2615 y el cuarto no) y el sentido de la arista
  catastral es el contrario, lo que reflejaría el patrón de ladrillo.
- Reglas de calle, zonas, mobiliario, pavimentos, vegetación y alturas especiales pasan a
  `web/city-design.json`.
- Validación compartida: un único validador en `web/js/world/design-validate.js` lo usan
  el juego (error claro al cargar) y `tests/verify-world.mjs` (comprobaciones estrictas y
  cruzadas con `buildings.json` y `frontages.json`). Sin dependencias nuevas: los
  esquemas JSON de los anexos son documentación y sirven al editor mediante `$schema`.

### D9. Correcciones manuales como capa aparte aplicada al cargar

`web/map-corrections.json` contiene operaciones sobre la base (`road.set`,
`road.movePoint`, `road.add`, `road.remove`, `area.movePoint`, `building.hide`), cada una
con guarda (`expect`: el valor actual que debe encontrar), motivo, evidencia y fecha.
`world/corrections.js` las aplica en memoria tras validar las capas y antes de construir
el grafo. `buildings.json` y `osm-world.json` no se tocan, la huella geográfica fija sigue
valiendo y una corrección cuya guarda deja de coincidir (porque se regeneró OSM) falla en
`verify-world` en lugar de aplicarse a ciegas.

ODbL: corregir datos de OSM produce una base de datos derivada; si se publica, debe
ofrecerse bajo ODbL (fuente 4). El archivo se declara `ODbL-1.0` con la atribución de OSM
y se registra en `data-sources.json`. Los errores reales de OSM se corrigen mejor en el
propio OpenStreetMap; esta capa es para ajustes de juego o mientras llega la edición.

### D10. Modo `?debug` opcional

Con `?debug` en la URL, `app.js` importa dinámicamente `js/debug/inspector.js` (sin coste
en el modo normal). Un toque corto sobre el lienzo (sin arrastre) calcula el punto
(rayo contra las mallas de edificios y fachadas y, si no hay, contra el plano `y = 0`) y
muestra en un panel: `x`, `y`, `z` con dos decimales, índice de edificio, ID de frente
más cercano, vía OSM más cercana (`id`, ocurrencia, nombre, punto más cercano), objeto de
calle y monumento que lo contiene, con un botón «Copiar» que pone en el portapapeles el
fragmento JSON listo para `facade-designs.json` o `map-corrections.json`. Lleva además la
posición y el rumbo del jugador. No altera el arrastre de cámara (oyentes adicionales con
`addEventListener`, no `on…`), no se activa solo y no cambia nada sin `?debug`.

### D11. Terreno: solo la interfaz

Se crea `world/terrain.js` con un terreno plano (`heightAt() → 0`) asignado en
`world.terrain`, sin llamarlo desde ningún constructor. El inventario de supuestos de
suelo plano y los puntos de inserción están en [TERRENO.md](plan-modular/TERRENO.md); el
diseño del modelo de alturas lo decide el trabajo de cuestas en curso.

## 2. Estructura final de archivos

```text
web/
  index.html            importmap + modulepreload + entrada (sin otros cambios)
  game3d.js             entrada: lee ?v=, llama a startGame() (unas 10 líneas)
  game-data.js          sin cambios (lugares, miradores, encargos, población)
  progress.js           sin cambios
  measure.js            sin cambios
  facade-profiles.json  paleta, celda de lotes y política de alturas (reducido en fase 2)
  facade-designs.json   NUEVO (fase 2): recetas y composiciones de fachada
  city-design.json      NUEVO (fase 2): zonas, reglas de calle, mobiliario, vegetación
  map-corrections.json  NUEVO (fase 2): correcciones manuales sobre OSM y Catastro
  js/
    app.js              startGame, init, frame, showStartupError
    test-api.js         createTestApi, createPublicApi
    core/
      state.js          estado compartido (D3)
      math.js           clamp, lerp, TAU, d, pInside, pointSeg, fold
      random.js         rnd (semilla 7631)
      dom.js            $, ui, setText, setStyle, sleepFrame
      assets.js         setAssetVersion, asset
    engine/
      materials.js      mat, caché de modelos, mergeParts, modelParts, flatGeometry…
      textures.js       facadeTexture, surfaceTexture
      renderer.js       setupRenderer, setupScene, applyQuality, resize
      camera.js         updateCamera, cameraSweep, snapCamera, cycleCamera…
      audio.js          toggleAudio, mute, updateEngineSound
      expr.js           NUEVO (fase 2): intérprete de expresiones
    world/
      loader.js         loadWorld, loadLayers, applyHeightSamples
      spatial.js        indexBuildings, inBuilding, nearestRoad, blocked, safePoint
      buildings.js      buildBuildings
      facades.js        prepareFacades, buildDetailedFacades, lotes
      facade-kit.js     NUEVO (fase 2): piezas paramétricas
      facade-composer.js NUEVO (fase 2): aplica recetas JSON con el kit
      design-validate.js NUEVO (fase 2): validador compartido con los tests
      corrections.js    NUEVO (fase 2): capa de correcciones
      streets.js        buildStreetSurfaces, buildRoadDetails
      furniture.js      buildUrbanFurniture
      vegetation.js     addVegetationCells, buildTrees
      signs.js          addSigns
      terrain.js        NUEVO (fase 3): terreno plano, interfaz heightAt
    game/
      graph.js          buildRoadGraph, connectOpenSpaces, orientDriveGraph, findRoute…
      vehicles.js       carCabin, createCar, carCollision, nearestCar
      people.js         createPerson
      traffic.js        spawnTraffic, stepAgent, updatePedestrians
      police.js         setHeat, dropPolice, updatePolice
      jobs.js           setupPOIs, target, createMissionMarkers
      missions.js       advanceStage, updateMissions, updateMarkers
      player.js         updatePlayer, interact, rescue
      save.js           save, loadSavedProgress
      flow.js           start
      update.js         update
    ui/
      feedback.js       toast, loadProgress
      hud.js            updateHUD, updateHudReadouts, drawLabels
      input.js          clearInput
      map.js            prepareMap, drawMap, listStreets, openMap, closeMap
      dialogs.js        modal, closeModal, help, pauseMenu, foco
      controls.js       installTouchDetection, installControls
    debug/
      inspector.js      NUEVO (fase 2): modo ?debug
tests/
  runtime-harness.mjs   sin parcheo de texto; importa web/js/app.js
  verify3d.mjs          mismas comprobaciones de flujo
  verify-modules.mjs    NUEVO: importmap, versión, evaluación sin DOM, ciclos
  verify-design.mjs     NUEVO (fase 2): expresiones, kit y compositor
  verify-world.mjs      + validación de diseños y correcciones
tools/
  scene-fingerprint.mjs NUEVO: huella de escena y comportamiento
  browser-smoke.mjs     NUEVO: humo en Chrome sin interfaz
```

## 3. Reglas comunes a todos los pasos

### 3.1 Antes de empezar una fase

```fish
cd /home/elihu/GIT/chiclana-vice-public
git switch main
git worktree add ../chiclana-vice-wt/refactor-modulos -b refactor/modulos main
ln -s /home/elihu/GIT/chiclana-vice-public/node_modules ../chiclana-vice-wt/refactor-modulos/node_modules
cd ../chiclana-vice-wt/refactor-modulos
npm run check
```

Una rama por fase: `refactor/modulos` (fases 0 y 1), `feat/diseno-datos` (fase 2),
`refactor/terreno-interfaz` (fase 3). Cada fase parte de `main` con la anterior ya
integrada por el usuario. Lee antes `AGENTS.md`, `docs/DESARROLLO.md`, `docs/ESTADO.md`,
`tests/AGENTS.md` y, en la fase 2, `docs/MAP_SOURCES.md`, `docs/DATOS.md` y
`tools/AGENTS.md`.

### 3.2 Verificación estándar (V) de cada paso

```fish
npm run check
node tools/scene-fingerprint.mjs --compare /tmp/chiclana-fp/base.json > /dev/null
```

La segunda orden imprime `Huella idéntica a …` y termina con 0, o lista las diferencias y
termina con 1. Si `/tmp/chiclana-fp/base.json` no existe (reinicio), regenerarlo así, con
`BASE` = `092318d` (commit del paso 0.1 en `refactor/modulos`: primer commit que incluye
`tools/scene-fingerprint.mjs`; su escena es idéntica a la de `main`):

```fish
rm -rf /tmp/chiclana-fp-base; mkdir -p /tmp/chiclana-fp-base
git archive BASE web tests tools source-data | tar -x -C /tmp/chiclana-fp-base
set repo (pwd)
cd /tmp/chiclana-fp-base; and node $repo/tools/scene-fingerprint.mjs --out /tmp/chiclana-fp/base.json > /dev/null; cd $repo
```

### 3.3 Verificación en navegador (VB), cuando el paso lo pida

```fish
uv run --no-project python -m http.server 8091 --bind 127.0.0.1 --directory web &
set srv1 $last_pid
node tools/browser-smoke.mjs http://127.0.0.1:8091/
mkdir -p /tmp/chiclana-pages; ln -sfn (pwd)/web /tmp/chiclana-pages/chiclana-vice
uv run --no-project python -m http.server 8092 --bind 127.0.0.1 --directory /tmp/chiclana-pages &
set srv2 $last_pid
node tools/browser-smoke.mjs http://127.0.0.1:8092/chiclana-vice/
kill $srv1 $srv2
```

Usa SOLO los puertos 8091 y 8092 y cierra los servidores por su PID, en una orden
separada. NUNCA uses `pkill` ni mates otros `http.server`: el usuario tiene los suyos en
8080 y 8081.

Resultado esperado: `"ready": true`, `"errors": []`, `"unversioned": []`, `meshes` 1421 y
`triangles` 917276 en ambas URL (valores de `main` 5666928; si la referencia del paso 0.2
da otros, usa esos). VB usa SwiftShader en CPU: no acredita GPU, FPS ni móvil.

### 3.4 Si falla

1. No hagas commit. Lee el mensaje: `npm run lint` (`no-undef` suele ser una variable que
   falta importar o renombrar), el test concreto, o la lista de diferencias de la huella.
2. Huella distinta: genera volcados por objeto y compáralos (`$repo` como en 3.2):

   ```fish
   node tools/scene-fingerprint.mjs --dump /tmp/chiclana-fp/ahora.txt > /dev/null
   cd /tmp/chiclana-fp-base; and node $repo/tools/scene-fingerprint.mjs --dump /tmp/chiclana-fp/base.txt > /dev/null; cd $repo
   diff /tmp/chiclana-fp/base.txt /tmp/chiclana-fp/ahora.txt | head
   ```

   La primera línea distinta indica el objeto (su `name` y su tipo). Diferencias típicas:
   orden de `scene.add` alterado, llamadas a `rnd()` reordenadas, un `let` capturado antes
   de inicializarse o un valor por defecto cambiado.

3. Si `behaviour.trace` difiere y la escena no: se ha alterado el orden de una llamada a
   `rnd()` en la simulación, un reloj (`session.t`, `collisionClock`) o una condición.
4. Si en dos intentos no lo resuelves, `git restore --staged --worktree .` para volver al
   último commit bueno, divide el paso en dos más pequeños y anótalo en el informe.

### 3.5 Reglas de código para los movimientos

- **Mover, no reescribir**: corta y pega el cuerpo de la función tal cual. Solo cambian
  los `import`/`export`, los nombres de estado según la tabla y lo que el paso diga
  expresamente.
- Mantén el **orden de las llamadas** en `init()` y en `update()`; el orden de `scene.add`
  y de `rnd()` forma parte de la huella.
- Rutas de importación relativas con extensión `.js`. Three siempre como
  `import * as THREE from '../../vendor/three.module.min.js'` (o `'../vendor/…'` desde
  `js/app.js` y `js/test-api.js`). Nada de `import 'three'`.
- Cada módulo nuevo se añade en el mismo commit al importmap y a los `modulepreload` de
  `index.html` con la versión vigente (ver HERRAMIENTAS.md, «Plantilla de index.html»).
- Comentarios en inglés si se mueven tal cual; los nuevos, en español, breves.
- Commits: Conventional Commits en español, sin `Co-Authored-By` ni atribuciones. Añade
  rutas concretas (`git add web/js/core/math.js web/js/app.js web/index.html`), revisa
  `git diff --cached` y `git diff --check`.

## 4. Fase 0: herramientas de comprobación

### Paso 0.1: huella de escena y humo en Chrome

- **Objetivo**: poder demostrar «misma escena y mismo comportamiento».
- **Archivos**: `tools/scene-fingerprint.mjs`, `tools/browser-smoke.mjs` (nuevos),
  `docs/DESARROLLO.md` (sección «Comprobar»).
- **Instrucciones**:
  1. Copia literalmente los dos scripts de [HERRAMIENTAS.md](plan-modular/HERRAMIENTAS.md)
     (secciones H1 y H2).
  2. En `docs/DESARROLLO.md`, al final de «Comprobar», añade un párrafo: qué hace cada
     herramienta, que se comparan en la misma máquina y versión de Node, y que no
     acreditan GPU ni móvil.
  3. `npm run format`.
- **Verificación**:

  ```fish
  npm run check
  node tools/scene-fingerprint.mjs --out /tmp/chiclana-fp/a.json > /dev/null
  node tools/scene-fingerprint.mjs --compare /tmp/chiclana-fp/a.json > /dev/null
  ```

  y VB (sección 3.3).

- **Resultado esperado**: la segunda ejecución da `Huella idéntica`; VB con `ready: true`.
- **Commit**: `test(tools): añadir huella de escena y humo en chrome sin interfaz`
- **Si falla**: si ESLint protesta por `WebSocket` o `fetch` en `tools/`, añade
  `/* global WebSocket */` al principio de `browser-smoke.mjs` (Node 22 los trae
  globales). Si Chrome no está en `google-chrome-stable`, pásale la ruta como segundo
  argumento. Si la huella no es determinista entre dos ejecuciones, para: es un hallazgo
  que hay que reportar (algo usa `Math.random` o la hora).

### Paso 0.2: referencia

- **Objetivo**: fijar la huella del commit base.
- **Archivos**: ninguno del repositorio.
- **Instrucciones**: anota `git rev-parse HEAD` (será `BASE` en todo el plan) y ejecuta
  `node tools/scene-fingerprint.mjs --out /tmp/chiclana-fp/base.json`. Copia en el
  informe los recuentos de `scene`.
- **Verificación**: `node tools/scene-fingerprint.mjs --compare /tmp/chiclana-fp/base.json`.
- **Resultado esperado**: `Huella idéntica`. Con `main` 5666928 los recuentos medidos
  fueron: 1.787 objetos, 1.421 mallas, 76 instanciadas, 2.963 instancias, 137 materiales,
  9 texturas, 731 geometrías, 917.276 triángulos (761.408 sin contar instancias).
- **Commit**: ninguno.

## 5. Fase 1: modularización sin cambios visibles

Todos los pasos usan V; los marcados con VB, también la verificación en navegador.

### Paso 1.1: entrada separada, importmap, versión explícita y API de pruebas

- **Objetivo**: que el juego sea importable sin parchear su texto y que la carga de
  módulos tenga ya su versionado definitivo. El código sigue en un único archivo.
- **Archivos**: `web/game3d.js` → `web/js/app.js` (`git mv`), `web/game3d.js` (nuevo),
  `web/index.html`, `tests/runtime-harness.mjs`,
  `tests/verify3d.mjs`, `tests/verify-modules.mjs` (nuevo), `package.json`.
- **Instrucciones**:
  1. `git mv web/game3d.js web/js/app.js`.
  2. En `web/js/app.js`, sustituye las líneas 1–16 actuales (cálculo de
     `ASSET_VERSION`, `await import` de Three, `game-data.js` y `progress.js`) por:

     ```js
     import * as THREE from '../vendor/three.module.min.js';
     import {
       SAVE_KEY,
       INITIAL_POSITION,
       SPAWN_POSITION,
       POPULATION,
       PLACES,
       VIEWPOINTS,
       PROGRESS_LIMITS,
       JOBS as jobs,
     } from '../game-data.js';
     import { readProgress } from '../progress.js';

     // Cache-busting suffix shared by every runtime resource, passed by the entry module.
     let ASSET_VERSION = null;
     const asset = (path) =>
       ASSET_VERSION ? path + '?v=' + encodeURIComponent(ASSET_VERSION) : path;
     let platform = null;
     ```

  3. En `init()`: `new THREE.WebGLRenderer({` → `new platform.WebGLRenderer({` y
     `new THREE.TextureLoader()` → `new platform.TextureLoader()`.
  4. En `init()`, sustituye todo el bloque `window.__cityGame = { … };` por
     `window.__cityGame = createPublicApi();`.
  5. Sustituye el bloque final `init().catch((err) => { … });` por la función
     `showStartupError(err)` con el mismo cuerpo, y añade al final del archivo:

     ```js
     export async function startGame({ version = null, platform: injected = {} } = {}) {
       ASSET_VERSION = version;
       platform = {
         WebGLRenderer: THREE.WebGLRenderer,
         TextureLoader: THREE.TextureLoader,
         ...injected,
       };
       try {
         await init();
       } catch (err) {
         showStartupError(err);
         return null;
       }
       return createTestApi();
     }
     ```

  6. Mientras todo siga en un archivo, las dos API viven dentro de `app.js` (no se
     exportan): añade `function createPublicApi()` y `function createTestApi()` tal como
     las da HERRAMIENTAS.md, sección H4, en su variante «paso 1.1» (mismas claves, los
     valores reasignables como _getters_). En el paso 1.18 pasan a `js/test-api.js`.
  7. Crea `web/game3d.js` con el contenido de H5.
  8. En `web/index.html`, inserta antes de `<link rel="stylesheet" …>` el importmap y los
     `modulepreload` de H6 con las entradas `./js/app.js`,
     `./vendor/three.module.min.js`, `./game-data.js` y `./progress.js`, y actualiza el
     comentario de versión común.
  9. Sustituye `tests/runtime-harness.mjs` por la versión de H3 (sin `patch`, sin
     `__THREE`, sin módulo temporal, con guarda de una sola ejecución por proceso).
  10. En `tests/verify3d.mjs`, en la lista de recursos versionados, quita
      `'./vendor/three.module.min.js'`, `'./game-data.js'` y `'./progress.js'` (ahora los
      comprueba `verify-modules.mjs`).
  11. Crea `tests/verify-modules.mjs` con H7 y añádelo a `npm test` en `package.json`:
      `"test": "node tests/verify-world.mjs && node tests/verify-modules.mjs && node tests/verify3d.mjs"`.
      En este paso, la comprobación «sin efectos de nivel superior» de H7 se deja
      desactivada con la constante `STRICT_TOP_LEVEL = false`; se activa en 1.2.
  12. `npm run format`.
- **Verificación**: V y VB.
- **Resultado esperado**: huella idéntica (la sección `resources` no incluye `.js`, así
  que no cambia); VB sin errores, con una petición más (`js/app.js`) y todas con `?v=`.
- **Commit**: `refactor(juego): separar la entrada y exponer una api de pruebas sin parcheo`
- **Si falla**:
  - `SyntaxError: The requested module … does not provide an export named`: falta un
    `export` o el nombre está mal escrito.
  - El arnés se queda colgado: `frame` debe seguir siendo una `function frame(now)` con
    ese nombre; el `requestAnimationFrame` simulado ignora las funciones llamadas
    `frame`.
  - `unversioned` en VB no vacío: falta esa URL en el importmap.
  - `TypeError: platform.WebGLRenderer is not a constructor`: `startGame` no se llamó
    antes de `init` o el arnés no pasa `platform`.

### Paso 1.2: sin efectos de nivel superior

- **Objetivo**: importar `app.js` no toca el DOM ni registra oyentes (D4).
- **Archivos**: `web/js/app.js`, `tests/verify-modules.mjs`.
- **Instrucciones**: dentro de `app.js`, convierte cada sentencia de nivel superior con
  efectos en código dentro de funciones, sin cambiar su orden relativo:
  1. `let W = innerWidth, H = innerHeight, coarse = matchMedia(…)` → declara `let W = 0,
H = 0, coarse = false;` y crea `function installTouchDetection()` que asigna
     `W = innerWidth; H = innerHeight; coarse = matchMedia('(any-pointer: coarse)').matches;`
     y contiene, en el mismo orden, el bloque de `coarseQuery` y el oyente `pointerdown`
     de captura. `coarseQuery` pasa a ser una `const` local de la función.
  2. `const stored = readProgress(…); if (stored.quality === 'low') quality = 'low';` y
     la creación de `state`: declara `const state = { cash: 0, job: 0, stage: 0, timer: 0,
wanted: 0, heat: 0, arrest: 0, found: new Set(), health: 100 };` (mismo orden de
     claves) y crea `function loadSavedProgress()` con
     `const stored = readProgress(() => localStorage, PROGRESS_LIMITS);`, la línea de
     `quality` y `state.cash = stored.cash; state.job = stored.job; state.found = new
Set(stored.found);`.
  3. `const chart = document.createElement('canvas'); …; const chartCtx = …` → `let
chart, chartCtx;` y mueve las cuatro líneas de creación al principio de
     `prepareMap()` (`chart = …; chart.width = 1344; chart.height = 1002; chartCtx = …`).
     `prepareMap()` se llama una sola vez.
  4. Todo el bloque de enlaces desde `$('start').onclick = start;` hasta el oyente
     `webglcontextlost` incluido (asignaciones `onclick`, `bindHold`, joystick, arrastre,
     teclado, `blur`, `visibilitychange`, `pagehide`, `resize`, menú contextual) pasa a
     `function installControls()`, en el mismo orden. `const holdPointers = new Map()`
     se queda fuera (es un contenedor) y `let joy = $('joy')` pasa a ser `const joy`
     dentro de `installControls`; `joyMove` se define dentro también.
  5. En `startGame`, antes del `try`: `installTouchDetection(); loadSavedProgress();
installControls();`, en ese orden (el mismo que tenían en el archivo).
  6. En `tests/verify-modules.mjs`, pon `STRICT_TOP_LEVEL = true`.
- **Verificación**: V.
- **Resultado esperado**: huella idéntica; `verify-modules` importa `app.js` en un proceso
  sin DOM sin errores.
- **Commit**: `refactor(juego): mover los efectos de nivel superior a startGame`
- **Si falla**: `ReferenceError: document is not defined` en `verify-modules` indica la
  sentencia que queda fuera de una función. Si `verify3d` falla en «touch devices load the
  reduced orthophoto», `coarse` se asigna después de `init`: revisa el orden del paso 5.

### Paso 1.3: `core/state.js` con los contenedores

- **Objetivo**: crear el módulo de estado y mover los contenedores, sin renombrar nada.
- **Archivos**: `web/js/core/state.js` (nuevo), `web/js/app.js`, `web/index.html`.
- **Instrucciones**: crea `state.js` con la parte «Contenedores» de
  [ESTADO-COMPARTIDO.md](plan-modular/ESTADO-COMPARTIDO.md). Borra esas declaraciones de
  `app.js` (incluidos `facadeWork`, `streetEnvironment`, `driveNetwork`, `holdPointers`,
  `camPos`… que pasan de `let` a `export const` cuando nunca se reasignan) e impórtalas.
  Añade el módulo al importmap y a `modulepreload`.
- **Verificación**: V.
- **Resultado esperado**: huella idéntica.
- **Commit**: `refactor(juego): centralizar los contenedores de estado compartido`
- **Si falla**: `Assignment to constant variable` o el error `no-import-assign` de ESLint
  indican que algo reasigna un contenedor; búscalo y conviértelo en mutación
  (`array.length = 0; array.push(…)`) solo si la tabla lo indica; si no, déjalo en `app.js`
  y anótalo.

### Pasos 1.4 a 1.7: escalares a objetos de estado (un commit por grupo)

- **Objetivo**: convertir las variables reasignables en propiedades de los objetos de
  `state.js`, un grupo por paso: 1.4 `world`, 1.5 `gfx`, 1.6 `session` y `audio`, 1.7
  `view`, `pointer` y `actors`.
- **Archivos**: `web/js/core/state.js`, `web/js/app.js`.
- **Instrucciones**: para el grupo del paso, añade el objeto a `state.js` tal como
  aparece en ESTADO-COMPARTIDO.md, borra la declaración `let` en `app.js` y sustituye cada
  **referencia a la variable de nivel superior** por `grupo.nombre`. Atención a las
  variables locales con el mismo nombre que **no** se renombran (lista en
  ESTADO-COMPARTIDO.md, «Sombras»: `t` en el intercambio de vértices de los lotes de
  fachada, `ring` en `nave()`, `base` en `mergeParts`, `h` en el Ayuntamiento…).
  Actualiza los _getters_ de `createPublicApi`/`createTestApi` y las plantillas de
  `pauseMenu`/`help`.
- **Verificación**: V, y además la orden de búsqueda del grupo en ESTADO-COMPARTIDO.md
  (debe no imprimir nada).
- **Resultado esperado**: huella idéntica.
- **Commits**: `refactor(juego): agrupar el estado del mundo en state.js`, `… del render
…`, `… de la partida y el audio …`, `… de cámara, punteros y actores …`.
- **Si falla**: ESLint `no-undef` señala referencias olvidadas. Si la huella cambia y no
  hay errores, casi siempre se ha renombrado una variable local sombreada.

### Paso 1.8: utilidades `core/`

- **Objetivo**: extraer las hojas sin dependencias.
- **Archivos**: `web/js/core/math.js`, `random.js`, `dom.js`, `assets.js` (nuevos),
  `web/js/app.js`, `web/index.html`.
- **Instrucciones**: mueve según MAPA-FUNCIONES.md. `random.js` contiene `let randSeed =
7631` privado y `export const rnd`. `assets.js` contiene `ASSET_VERSION` privado,
  `export function setAssetVersion(v)` y `export const asset`; `startGame` llama a
  `setAssetVersion(version)`. `fold` va a `math.js`.
- **Verificación**: V.
- **Commit**: `refactor(juego): extraer utilidades de núcleo`

### Paso 1.9: materiales, geometría y texturas

- **Archivos**: `web/js/engine/materials.js`, `web/js/engine/textures.js` (nuevos).
- **Instrucciones**: mueve `mat`, `flatGeometry`, `flatPolygon`, la caché de modelos
  (`modelGeometryCache`, `modelMaterialCache` privadas), `modelGeometry`,
  `modelMaterial`, `modelCylinder`, `modelBox`, `bevelGeometry`, `sculptedBox`,
  `mergeParts` y `modelParts` a `materials.js`; `facadeTexture` y `surfaceTexture` a
  `textures.js`.
- **Verificación**: V.
- **Commit**: `refactor(juego): extraer materiales, cachés de geometría y texturas`
- **Si falla**: si `modelParts().box` falla con `this` indefinido, alguien ha
  desestructurado el objeto; usa siempre `parts.box(…)`.

### Paso 1.10: avisos, barra de carga y guardado

- **Archivos**: `web/js/ui/feedback.js`, `web/js/game/save.js` (nuevos).
- **Instrucciones**: `toast` y `loadProgress` a `feedback.js`; `save` y
  `loadSavedProgress` a `save.js`.
- **Verificación**: V. **Commit**: `refactor(juego): extraer avisos y guardado`

### Paso 1.11: índice espacial y grafo de calles

- **Archivos**: `web/js/world/spatial.js`, `web/js/game/graph.js` (nuevos).
- **Instrucciones**: divide `buildGraph()` en dos funciones con el mismo código en el
  mismo orden: `buildRoadGraph()` (bucle de `city.roads`) en `graph.js` e
  `indexBuildings()` (bucle de `city.buildings` y el `waterAreas.push`) en `spatial.js`.
  En `init`, la llamada `buildGraph()` pasa a ser `buildRoadGraph(); indexBuildings();`.
  Mueve `inBuilding`, `nearestRoad`, `blocked`, `safePoint` a `spatial.js` y
  `connectOpenSpaces`, `driveComponents`, `orientDriveGraph`, `nearestNode`,
  `findRoute` (con sus `let` de trabajo privados) a `graph.js`.
- **Verificación**: V (la sección `routes` de la huella cubre este paso).
- **Commit**: `refactor(juego): separar índice espacial y grafo de calles`

### Paso 1.12: carga de capas

- **Archivos**: `web/js/world/loader.js` (nuevo).
- **Instrucciones**: mueve `loadWorld` y `applyHeightSamples`. Extrae del principio de
  `init()` la llamada `Promise.all([...])` a `export async function loadLayers()` que
  devuelve `{ res, tex, heightSamples, profiles, streetObjects }` con las mismas cinco
  promesas en el mismo orden; `init` hace `const { res, tex, heightSamples, profiles,
streetObjects } = await loadLayers();`. El resto de `init` no cambia todavía.
- **Verificación**: V (la sección `resources` debe ser idéntica, también en orden).
- **Commit**: `refactor(juego): extraer la carga de capas`

### Paso 1.13: renderizador y escena

- **Archivos**: `web/js/engine/renderer.js` (nuevo).
- **Instrucciones**: extrae de `init()` el tramo desde `gfx.renderer = new
platform.WebGLRenderer(` hasta `scene.add(outer)` incluido a dos funciones en orden,
  `setupRenderer()` (renderer, escena, niebla, cámara, luces, `applyQuality()`) y
  `addGroundPlanes()` (suelo y plano exterior). Mueve `applyQuality` y crea
  `resizeRenderer()` con el cuerpo del oyente `resize` hasta `needsRender = true`; el
  oyente de `installControls` llama a `resizeRenderer()` y después, como antes, reabre el
  mapa si estaba abierto. `platform` pasa a `gfx.platform`.
- **Verificación**: V y VB. **Commit**: `refactor(juego): extraer renderizador y escena`

### Paso 1.14: constructores del mundo

- **Archivos**: `web/js/world/buildings.js`, `facades.js`, `streets.js`, `furniture.js`,
  `vegetation.js`, `signs.js` (nuevos).
- **Instrucciones**: mueve cada función según MAPA-FUNCIONES.md. `originalFacadeStreets`
  se exporta desde `facades.js` y la importa `furniture.js`. Dos commits:
  1. `buildings.js`, `facades.js`.
  2. `streets.js`, `furniture.js`, `vegetation.js`, `signs.js`.
- **Verificación**: V después de cada commit; tras el primero, además
  `node tools/export-facades.mjs /tmp/chiclana-fp/frontages.json && cmp web/frontages.json /tmp/chiclana-fp/frontages.json`.
- **Commits**: `refactor(juego): extraer edificios y fachadas`,
  `refactor(juego): extraer calles, mobiliario, vegetación y señales`

### Paso 1.15: modelos y agentes

- **Archivos**: `web/js/game/vehicles.js`, `people.js`, `traffic.js` (nuevos). La
  policía espera al paso 1.17 porque llama a `updateHUD`.
- **Instrucciones**: según el mapa. En `update()`, el bucle `for (const p of people) {…}`
  pasa sin cambios a `export function updatePedestrians(dt)` en `traffic.js`, llamada en
  el mismo sitio.
- **Verificación**: V (la traza de comportamiento cubre el paso).
- **Commit**: `refactor(juego): extraer vehículos, peatones y tráfico`

### Paso 1.16: cámara y audio

- **Archivos**: `web/js/engine/camera.js`, `web/js/engine/audio.js` (nuevos).
- **Instrucciones**: según el mapa. En `updatePlayer`, el bloque `if (audioCtx &&
engineGain) {…}` pasa sin cambios a `export function updateEngineSound()` en
  `audio.js`, llamada en el mismo sitio.
- **Verificación**: V. **Commit**: `refactor(juego): extraer cámara y audio`

### Paso 1.17: jugabilidad e interfaz

- **Archivos**: `game/jobs.js`, `police.js`, `missions.js`, `player.js`, `flow.js`,
  `update.js`, `ui/hud.js`, `input.js`, `map.js`, `dialogs.js`, `controls.js` (nuevos).
- **Instrucciones**: según el mapa, en tres commits y en este orden de módulos (cada uno
  solo depende de los anteriores): (1) `jobs`, `hud`, `police`, `missions`, `player`,
  `flow`; (2) `input`, `dialogs`, `map`, `controls`; (3) `update.js`. De
  `update()` se extraen sin cambios tres funciones llamadas en el mismo sitio:
  `updateMissions(dt)` (desde `let goal = target();` hasta el bucle de lugares
  descubiertos), `updateMarkers(goal)` (anillo, haz y flecha) y
  `updateHudReadouts(goal)` (desde `setText('speed', …)` hasta `setText('hint', hint)`).
  `updateMissions` devuelve `goal`. De `init()` se extrae `createMissionMarkers()` (anillo,
  haz y flecha) a `jobs.js`.
- **Verificación**: V después de cada commit; VB tras el último.
- **Commits**: `refactor(juego): extraer misiones, policía, jugador y hud`,
  `refactor(juego): extraer mapa, diálogos y controles`,
  `refactor(juego): extraer el bucle de actualización`

### Paso 1.18: `app.js` final y API de pruebas

- **Objetivo**: `app.js` solo contiene `startGame`, `init`, `frame` y
  `showStartupError`; las API pasan a su módulo.
- **Archivos**: `web/js/app.js`, `web/js/test-api.js` (nuevo), `web/index.html`.
- **Instrucciones**: mueve `createPublicApi` y `createTestApi` a `js/test-api.js` en su
  variante final de H4 (importan de cada módulo) y expórtalas; `app.js` las importa y
  llama a `createTestApi(frame)` (así `test-api.js` no importa `app.js`). Añade el módulo
  al importmap y a `modulepreload`.
- **Verificación**: V y VB.
- **Commit**: `refactor(juego): completar la api de pruebas por módulos`

### Paso 1.19: documentación y cierre de la fase

- **Archivos**: `docs/DESARROLLO.md` (estructura de `web/js/`, capas, regla de efectos
  de nivel superior, importmap y cómo cambiar la versión), `tests/AGENTS.md` (el arnés
  ya no parchea texto; una ejecución por proceso), `docs/MAP_SOURCES.md` («recetas de
  geometría en `web/js/world/facades.js`»), `docs/DATOS.md` (misma frase).
- **Verificación**: V, VB y `git grep -n 'game3d.js' -- docs tests tools AGENTS.md`
  (solo deben quedar menciones correctas a la entrada).
- **Commit**: `docs: describir la estructura modular del juego`
- **Punto de parada (usuario)**: probar en un navegador con GPU y, si puede, en un móvil;
  comparar `measure.js` antes y después en el mismo equipo (DESARROLLO.md, «Medir en el
  navegador»). Integrar y publicar solo con su visto bueno.

## 6. Fase 2: diseño de la ciudad desde datos

Inventario completo en [INVENTARIO-DATOS.md](plan-modular/INVENTARIO-DATOS.md). En
resumen, ya están en datos los contornos, plantas y alturas (`buildings.json`), vías,
áreas, hitos y árboles (`osm-world.json`), objetos de calle (`street-objects.json`),
alturas IGN (`height-samples.json`), el catálogo de frentes (`frontages.json`, que hoy es
**salida** del juego) y parámetros sueltos de fachadas (`facade-profiles.json`); lugares,
miradores y encargos están en `game-data.js`. Siguen en el código: las seis recetas
detalladas, la regla de frentes genéricos, las alturas especiales y la paleta de
edificios, los rectángulos de zona, el mobiliario fijo, los pavimentos, la plantación,
las señales y el ambiente de escena.

Archivos de diseño: se editan a mano en `web/` (como ya ocurre con
`facade-profiles.json`), los valida `tests/verify-world.mjs` y, tras editarlos, se ejecuta
`node tools/export-provenance.mjs`. Es una excepción a «los JSON de `web/` se generan con
`tools/`», aprobada por el usuario (sección 11, decisión 1).

En cada paso de migración, la huella debe ser idéntica salvo `resources` cuando el paso
añade un archivo nuevo a la carga; en ese caso se compara con `--ignore resources`, se
comprueba a mano que la única diferencia de `resources` es el archivo nuevo y, tras el
commit, se regenera la referencia con `--out /tmp/chiclana-fp/base.json`.

### Paso 2.1: intérprete de expresiones

- **Archivos**: `web/js/engine/expr.js`, `tests/verify-design.mjs` (nuevos),
  `package.json`, `web/index.html`.
- **Instrucciones**: implementa la especificación de KIT-FACHADAS.md, sección K2
  (tokenizador, analizador por precedencia, caché de AST, evaluación con ámbitos
  encadenados, funciones permitidas). Sin `eval` ni `Function`. En
  `tests/verify-design.mjs`, compara el resultado con el de JavaScript para el corpus de
  K2 (en el test sí se permite `new Function` como referencia) y comprueba los errores
  (variable desconocida, función no permitida, sintaxis). Añade el test a `npm test`.
- **Verificación**: V. **Commit**: `feat(juego): añadir un intérprete de expresiones para diseños`

### Paso 2.2: kit de piezas de fachada

- **Archivos**: `web/js/world/facade-kit.js` (nuevo), `web/js/world/facades.js`.
- **Instrucciones**: mueve de `buildDetailedFacades` a
  `export function createFacadeKit({ staging, palette })` las funciones internas
  `material`, `cube`, `geo`, `wall`, `pane`, `balcony`, `archShape`, `arch`, `pediment`,
  `sign`, `civicPane`, `cross`, `column`, `door` y `belfry` y el `unitBox`, sin cambiar
  sus cuerpos; devuelve un objeto con todas. `buildDetailedFacades` crea `staging`, llama
  a `createFacadeKit` y desestructura las funciones **una vez al principio** con los mismos
  nombres; el resto del cuerpo no cambia. `statue` y la espiral salomónica siguen locales
  en este paso.
- **Verificación**: V. **Commit**: `refactor(juego): extraer el kit de piezas de fachada`

### Paso 2.3: archivo de diseños, validador y compositor (sin uso)

- **Archivos**: `web/facade-designs.json`, `web/js/world/design-validate.js`,
  `web/js/world/facade-composer.js` (nuevos), `web/js/world/loader.js`,
  `tests/verify-world.mjs`, `tests/verify-design.mjs`, `tools/export-provenance.mjs`,
  `web/data-sources.json`, `web/index.html`, `THIRD_PARTY_NOTICES.md` (licencia ODbL según
  la sección 11, decisión 2).
- **Instrucciones**:
  1. Crea `web/facade-designs.json` copiando `facade-designs.example.json` (sin la clave
     `$schema` si el usuario no quiere esquemas en `web/`; ver K6).
  2. Implementa `design-validate.js` y `facade-composer.js` según K3–K5.
  3. `loadLayers()` añade una sexta promesa al final de la lista: `facade-designs.json`,
     obligatoria (mismo patrón que `facade-profiles.json`, mensaje «No se han podido
     cargar los diseños de fachada»); `init` guarda el resultado en
     `world.facadeDesigns` y lo valida con `validateFacadeDesigns` (lanza `Error('Diseños
de fachada incompatibles: …')`).
  4. Añade el registro de procedencia en `tools/export-provenance.mjs` (texto propuesto
     en K6) y ejecuta `node tools/export-provenance.mjs`.
  5. En `verify-world.mjs`, valida el archivo y comprueba los anclajes (K5).
  6. En `verify-design.mjs`, compón el Mercado en un `THREE.Group` de prueba con un kit
     real y comprueba número de mallas por color frente al código actual (H8).
- **Verificación**: V con `--ignore resources`; `resources` solo añade
  `facade-designs.json?v=…`. VB.
- **Commit**: `feat(datos): añadir diseños de fachada con validador y compositor`

### Paso 2.4: piloto, el Mercado desde datos

- **Archivos**: `web/js/world/facades.js`, `web/facade-profiles.json`,
  `tools/export-provenance.mjs` (si cambia el texto), `web/data-sources.json`.
- **Instrucciones**: sustituye en `buildDetailedFacades` el bloque del Mercado (desde
  `const mp = facadeProfiles.market.outline;` hasta el cierre de su bucle `for`) por
  `composeBuilding(kit, world.facadeDesigns, 'mercado')`, **en la misma posición** (después
  del Ayuntamiento y antes de `nave`). Borra la clave `market` de
  `web/facade-profiles.json` y ejecuta `node tools/export-provenance.mjs`. `prepareFacades`
  sigue detectando el Mercado por el nombre del hito, como hoy.
- **Verificación**: V **sin** `--ignore` contra la referencia regenerada en 2.3; VB.
  Prototipo comprobado en el scratchpad el 6/10/2026: la receta del anexo con un
  intérprete equivalente da huella idéntica.
- **Resultado esperado**: huella idéntica.
- **Commit**: `refactor(datos): construir la fachada del mercado desde diseños`
- **Si falla**: genera `--dump` y compara solo las líneas `facade-cell-…`. Las causas
  habituales son: orden de nodos distinto del orden de llamadas original, `step`
  acumulado de otra forma (`from + i * step` en lugar de `v += step`), un `!=` traducido
  a comparación débil, o una rotación aplicada antes de crear la pieza.
- **Punto de parada (usuario)**: revisar el formato del JSON antes de migrar el resto.

### Pasos 2.5 a 2.7: resto de recetas detalladas (un commit por edificio)

- 2.5 Ayuntamiento (`scaleY` del frente, `arch`, `civicPane`, `pediment`, toros, círculos,
  cilindros y esferas mediante `geo`, banderas con colores explícitos). Borra `townhall`
  de `facade-profiles.json`. Commit `refactor(datos): construir el ayuntamiento desde diseños`.
- 2.6 Naves de iglesia: receta `nave` con anclaje `{"landmarkRing": "Jesús Nazareno"}` y
  nodo `roof`; mueve `churches` de `facade-profiles.json`. Commit
  `refactor(datos): construir las naves de iglesia desde diseños`.
- 2.7 Portadas de Jesús Nazareno, San Telmo y San Juan Bautista (tres commits). Requiere
  añadir al kit `statue`, `spiralColumn` (el tubo helicoidal), nodo `group` (para el
  ala girada de San Telmo) y anclaje `{"world": true}` (cúpula de San Juan en
  coordenadas absolutas). Commits `refactor(datos): construir la portada de … desde
diseños`. Cierra el pendiente SP-5 de `docs/ESTADO.md` en el último.

Mismos verificación, resultado y pasos de fallo que 2.4.

### Paso 2.8: frentes genéricos de calle

- **Archivos**: `web/city-design.json` (nuevo, sección `frontages`),
  `web/facade-designs.json` (receta `street-generic`), `web/js/world/facades.js`.
- **Instrucciones**: los umbrales y listas de `prepareFacades` (rectángulo de la zona
  piloto, rectángulo «original», lista de calles, longitud mínima 3,3 m, distancia
  máxima 17 m, separación 1 m) pasan a `city-design.json` (valores en el ejemplo). El
  cuerpo del bucle de frentes de `buildDetailedFacades` pasa a la receta `street-generic`
  con las variables `seed`, `floors`, `storey`, `h`, `len` y `commercialStreet`
  (booleano: la calle del frente no está en `frontages.residentialStreets`), con
  `{"pick": […], "index": "seed % 3"}` para las variantes. Los IDs de frente no cambian.
- **Verificación**: V con `--ignore resources` (se añade `city-design.json`) y
  `cmp` de `export-facades` como en 1.14.
- **Commit**: `refactor(datos): describir los frentes genéricos en datos`

### Paso 2.9: reglas de calle, zonas y edificios (cuatro commits)

1. Zonas con nombre y mobiliario: `protectedPoints`, farolas por calle, farolas y bancos
   de la Plaza de las Bodegas, bancos fijos, calles con bolardos.
2. Pavimentos y pasos de peatones: zonas, tipos peatonales, alturas de capa, reglas de
   cruce.
3. Vegetación: densidad de parques, separación, árboles de la plaza del Mercado, arbustos.
4. Edificios: paleta genérica, colores por tipo, alturas mínimas especiales (Arquillo,
   Iglesia Mayor, Ayuntamiento) y escala UV.

Cada uno: valores de `city-design.example.json`, V idéntica, commit
`refactor(datos): describir … en city-design.json`. Los modelos de farola, banco,
papelera y bolardo siguen en código (son piezas del motor, como las del kit).

### Paso 2.10: capa de correcciones manuales

- **Archivos**: `web/map-corrections.json` (con `corrections: []`),
  `web/js/world/corrections.js`, `web/js/world/loader.js`, `tests/verify-world.mjs`,
  `tests/verify-design.mjs`, `tools/export-provenance.mjs`, `docs/MAP_SOURCES.md`.
- **Instrucciones**: implementa el esquema de `map-corrections.schema.json` y las
  operaciones de KIT-FACHADAS.md, sección K7. `loadWorld` aplica las correcciones
  después de validar las capas y antes de devolver la ciudad. En `verify-design.mjs`,
  prueba cada operación sobre un mundo sintético creado en el propio test (dos vías, una
  con ID repetido, un área y un edificio): aplicación correcta, guarda que falla,
  ocurrencias de IDs repetidos y que aplicar dos veces falla por guarda. Valida además el
  ejemplo del anexo con `validateCorrections` y comprueba que, sobre los datos reales,
  `fix-001` y `fix-003` se aplican y `fix-002` y `fix-004` fallan por guarda (sus valores
  son marcadores). El `footprintSha256` es el SHA-256 de `JSON.stringify(b.p)`, como en
  `tools/export-facades.mjs`. En `verify-world.mjs`, valida el
  archivo publicado y comprueba que aplicarlo produce vías válidas. La huella geográfica
  fija sigue calculándose sobre las capas de base.
- **Verificación**: V con `--ignore resources`.
- **Commit**: `feat(datos): añadir una capa de correcciones manuales sobre la base`

### Paso 2.11: modo `?debug`

- **Archivos**: `web/js/debug/inspector.js` (nuevo), `web/js/app.js`, `web/style.css`,
  `web/index.html` (importmap, sin `modulepreload`: solo se carga con `?debug`),
  `tests/verify3d.mjs`.
- **Instrucciones**: implementa D10. En `startGame`, tras `init`, si
  `new URLSearchParams(location.search).has('debug')`, `await import('./debug/inspector.js')`
  y `installInspector(createTestApi())`. Panel con `position: fixed`, por encima del HUD,
  cerrable, que respete `env(safe-area-inset-*)`. Toque = `pointerdown` y `pointerup` del
  mismo puntero con menos de 6 px de desplazamiento y menos de 350 ms. En
  `verify3d.mjs`, un caso nuevo arranca sin `?debug` (comprueba que el módulo no se pide)
  y otro llama a `inspectPoint(x, z)` del inspector importado directamente y comprueba
  edificio, frente y vía para un punto conocido de la calle Jesús Nazareno.
- **Verificación**: V (la huella no usa `?debug`); VB con `?debug` y sin él.
- **Commit**: `feat(juego): añadir un modo de depuración con coordenadas e ids`

### Paso 2.12: limpieza y documentación

- `facade-profiles.json` queda con `palette`, `streetShades`, `bayWidth`,
  `facadeCellSize` y `heightPolicy`. Actualiza `docs/MAP_SOURCES.md` (recetas en datos),
  `docs/DATOS.md` (cómo editar diseños y correcciones, orden: editar → `npm test` →
  `export-provenance` → `npm test`), `docs/DESARROLLO.md` (modo `?debug`), `AGENTS.md` y
  `tools/AGENTS.md` (excepción de archivos de diseño, si se aprueba).
- Commit `docs: documentar el diseño desde datos y el modo de depuración`.
- **Punto de parada (usuario)**.

## 7. Fase 3: preparar el terreno

### Paso 3.1: interfaz de terreno plano

- **Archivos**: `web/js/world/terrain.js` (nuevo), `web/js/core/state.js`,
  `web/js/world/loader.js`, `web/index.html`.
- **Instrucciones**: crea `terrain.js` con el contenido de TERRENO.md, sección T3
  (`flatTerrain` y `heightAt(terrain, x, z)`), añade `terrain: null` al final de
  `world` en `state.js` y asigna `world.terrain = flatTerrain` en `init` justo después de
  `world.city = res`. Ningún constructor lo usa todavía.
- **Verificación**: V. **Commit**: `refactor(juego): preparar la interfaz de terreno`

### Paso 3.2: documentar los puntos de inserción

- Copia la tabla T1 de TERRENO.md a una sección «Terreno» de `docs/DESARROLLO.md` y
  enlázala desde `docs/MAP_SOURCES.md` («Terreno plano»).
- Commit `docs: inventariar los supuestos de suelo plano`.

## 8. Riesgos y trampas concretas

| Riesgo                                   | Dónde aparece                                                                        | Cómo se evita                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencias circulares                  | `missions ↔ hud`, `dialogs ↔ controls`, `police → hud`                               | Reparto acíclico del mapa y extracción de las hojas hacia arriba (ningún módulo extraído importa `app.js`); `verify-modules` falla con el ciclo desde el paso 1.1      |
| Orden de inicialización                  | Efectos de nivel superior, `coarse` antes de `init`, oyentes antes que `init`        | Paso 1.2; `startGame` llama en el orden original; test de importación sin DOM                                                                                          |
| _Live bindings_ de `let` exportados      | Un módulo que asigna una importación (`scene = …`) lanza `TypeError`                 | No se exportan `let`; estado en objetos (D3); ESLint `no-import-assign` está activo en la configuración recomendada                                                    |
| Capturar estado al evaluar               | `const { scene } = gfx` en nivel superior guarda `null`                              | Leer siempre `gfx.scene` dentro de la función; prohibido desestructurar objetos de estado fuera de funciones                                                           |
| `this` perdido                           | `modelParts().box` usa `this.add`; `el()` del arnés usa `this.children`              | No desestructurar esos objetos; mover el código tal cual                                                                                                               |
| `await` de nivel superior                | Hoy la entrada espera a Three con `await import`                                     | Imports estáticos; cero `await` de nivel superior (lo comprueba `verify-modules`)                                                                                      |
| Nombre de `frame`                        | El `requestAnimationFrame` simulado no reprograma funciones llamadas `frame`         | Mantener `function frame(now)`; no envolverla en flechas                                                                                                               |
| Orden de `rnd()`                         | Paleta de edificios, plantación, tráfico, peatones, `stepAgent`                      | No reordenar llamadas; la huella lo detecta (`scene.strict` o `behaviour.trace`)                                                                                       |
| Orden de `scene.add`                     | `createCar`, `createPerson`, constructores                                           | Misma secuencia en `init`; `scene.unordered` ayuda a distinguir orden de contenido                                                                                     |
| Variables sombreadas al renombrar        | `t`, `ring`, `base`, `h` locales                                                     | Lista de sombras en ESTADO-COMPARTIDO.md y búsquedas por grupo                                                                                                         |
| Rendimiento por frame                    | Funciones extraídas de `update`                                                      | Sin objetos ni cierres nuevos por frame; las funciones extraídas reciben valores sueltos                                                                               |
| Carga en móvil                           | ~35 peticiones pequeñas en lugar de una                                              | `modulepreload` de todos los módulos, HTTP/2 y gzip de Pages; total de bytes casi igual; medir con la red limitada en DevTools antes y después (no sustituye un móvil) |
| Una sola ejecución del juego por proceso | Los módulos ES se evalúan una vez; antes cada `createRuntime` creaba un módulo nuevo | Guarda en `createRuntime`; si un test necesita dos arranques, que use un proceso hijo                                                                                  |
| Instancias duplicadas de Three           | Un módulo que importe Three con otra URL (`?v=` distinto o sin importmap)            | Una sola ruta relativa a `vendor/` en todos los módulos y una sola entrada en el importmap                                                                             |
| Caché de Pages (`max-age=600`)           | Versión nueva en `index.html` y módulos viejos                                       | Todo pasa por el importmap con la misma versión; cambiar la versión en cada publicación                                                                                |
| Coma flotante en recetas JSON            | Bucles con paso acumulado, orden de operaciones                                      | Semántica `v += step` y precedencia de JavaScript en `expr.js`; corpus de pruebas; huella idéntica en el piloto                                                        |
| IDs de frente frágiles                   | `building-<índice>-edge-<arista>` depende del orden de `buildings.json`              | Las composiciones guardan además el `footprintSha256` del catálogo y `verify-world` lo comprueba                                                                       |

## 9. Qué NO hacer

- No introducir frameworks, bundlers, minificadores, TypeScript ni un paso de compilación;
  no añadir dependencias npm (si algo parece necesitarlas, para y pregunta).
- No cambiar coordenadas, contornos, alturas, plantas, calles, capacidades, controles,
  modo ligero, textos, colores ni la apariencia en un paso de refactor.
- No mezclar refactor y cambios de comportamiento en el mismo commit. Si descubres un
  error durante el refactor, anótalo y corrígelo en un commit `fix:` aparte, después de la
  fase, con su propia verificación.
- No actualizar `/tmp/chiclana-fp/base.json` salvo en los pasos que lo indican; no
  actualizar `source-data/geometry-baseline.json`.
- No editar `web/vendor/`, `web/licenses/`, las capas de base (`buildings.json`,
  `osm-world.json`, `street-objects.json`, `height-samples.json`) ni las copias de
  licencias.
- No cambiar `.github/workflows/`, licencias ni atribuciones sin la respuesta del usuario.
- No hacer push, merge, rebase ni publicar.
- No afirmar verificación en GPU o móvil: VB usa SwiftShader en CPU.

## 10. Estimación y puntos de parada

| Fase | Pasos | Commits | Líneas movidas o nuevas (aprox.)                                        | Parada para revisar                                    |
| ---- | ----- | ------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| 0    | 2     | 1       | +350 (herramientas)                                                     | —                                                      |
| 1    | 19    | 22      | ~4.000 movidas, +600 nuevas (state, API, test)                          | Tras 1.2 (costura), tras 1.7 (estado), al final (1.19) |
| 2    | 12    | 17      | +1.500 (expr, compositor, validador, inspector), ~900 de recetas a JSON | Tras 2.4 (piloto), tras 2.8, al final (2.12)           |
| 3    | 2     | 2       | +60                                                                     | Al final                                               |

Cada paso de la fase 1 cabe en una sesión corta; los pasos 1.4–1.7 y 1.17 son los más
largos por el número de referencias. Las decisiones que necesita la fase 2
están en la sección 11.

## 11. Decisiones del usuario (6/10/2026)

Las cinco preguntas abiertas están resueltas; el plan se ejecuta con estas decisiones.

1. **Archivos de diseño en `web/`**: sí. `facade-designs.json`, `city-design.json` y
   `map-corrections.json` son ficheros de autor editables a mano en `web/`, validados en
   `verify-world`. Se aplica lo previsto en 2.12 para `AGENTS.md` y `tools/AGENTS.md`.
2. **Licencias**: `facade-designs.json`, `city-design.json` y `map-corrections.json` van
   bajo ODbL 1.0 en conjunto, como `frontages.json`, con atribución a Catastro (vértices de
   anclaje) y a OSM (identificadores y nombres). Es la propuesta K6: sus anclajes usan
   vértices catastrales e identificadores de OSM, y declararlos MIT obligaría a rediseñar
   los anclajes. El código del motor y del compositor sigue bajo MIT. Registrarlos en
   `export-provenance.mjs`, `data-sources.json` y `THIRD_PARTY_NOTICES.md` tal como indica
   K6.
3. **Correcciones y OSM**: no es obligatorio subirlas. La capa es para ajustes de juego;
   si se detecta un error real, el usuario puede corregirlo en OSM a mano.
4. **Modo `?debug`**: disponible también en la web publicada.
5. **Reanclar el Mercado**: sí, en un commit `feat` propio, separado del refactor, con
   huella nueva documentada y revisión visual del usuario antes de seguir.

### 11.1 Decisiones tras la parada de 2.4 (6/10/2026)

- **Criterio nuevo del usuario**: se aceptan decisiones que mejoren el diseño aunque la
  escena deje de ser idéntica a `main`. Condiciones: van en commits `feat` propios,
  separados de los commits de refactor (que siguen exigiendo huella idéntica); el mensaje
  y el informe explican el cambio; se regenera la referencia de huella después del commit
  (`/tmp/chiclana-fp/base.json`, guardando la anterior con otro nombre) y se adjuntan
  capturas antes y después en los puntos de VB. Nunca se cambian coordenadas reales,
  contornos ni calles.
- **`roof`**: una cubierta por edificio, compuesta tras todos sus muros (como `nave()`
  original), no una por frente. Un nodo `roof` en el nivel del edificio, no de la receta.
- **`commercialStreet`**: la regla pasa a datos. El contexto de expresión expone `hash`
  (el hash determinista por frente que ya usa el código) y `street`; la regla exacta
  actual (incluido `hash % 3`) se escribe como expresión en el diseño, de modo que el
  resultado no cambia. Si una regla más clara mejora el diseño, aplicarla después en un
  commit `feat` según el criterio anterior.
- **`outwardOf(building, edge)`**: se extrae al kit en 2.8, cuando lo necesiten los anclajes
  `front`.
- **Colores paramétricos**: el campo `color` acepta también una expresión (cadena que empieza
  por `=`) o un parámetro de receta cuyo valor sea `#hex` o `$paleta`; el compositor valida
  el resultado y falla con un error claro si no es un color.
- **Puntos dentro del mundo**: `|x| ≤ size[0]/2` y `|z| ≤ size[1]/2` (origen centrado).

### 11.2 Notas de ejecución de los pasos 2.5 a 2.8 (6/10/2026)

- `roof` pasa a ser la clave `roof: {y, color}` del edificio (no un nodo de receta); `y` y
  `color` se evalúan con los parámetros de la receta del único frente `landmarkRing`. El
  compositor admite colores `=expresión` y por nombre de parámetro o variable; el
  resultado debe ser `#rrggbb` o `$paleta`. Commit `feat` previo a 2.6, escena idéntica.
- Las expresiones no tienen cadenas, así que `street` (el nombre) se expone pero no se
  puede comparar en una expresión: `commercialStreet` lo calcula el juego a partir de
  `frontages.residentialStreets` y la receta escribe `commercialStreet && hash % 3 != 0`.
  `hash` y `seed` valen lo mismo.
- 2.8: `bayWidth` y `streetShades` salen de `facade-profiles.json` y viven en la receta
  `street-generic` (parámetro y `pick`); el juego aplica la receta con `composeFront`
  (no hay un edificio por frente). `validateFacadeDesigns` recibe `frontRecipes` para
  comprobar esa receta con las variables de frente. `outwardOf` está en el kit y la usan
  `prepareFacades` y el anclaje `front` de un frente no seleccionado (con `street` vacío).
- `facade-profiles.json` conserva `palette`, `facadeCellSize` y `heightPolicy`.

### 11.3 Decisiones tras la parada de 2.8 (6/10/2026)

- **Calles comerciales**: se mantiene la lista `frontages.residentialStreets` en
  `city-design.json` y el booleano `commercialStreet` calculado por el juego. No se añaden
  cadenas a `expr.js`: la lista en datos es más clara y suficiente.
- **`bayWidth` y `streetShades`** viven en la receta `street-generic`: cada receta es
  dueña de su aspecto. Aceptado.
- **`facade-profiles.json`** queda solo con paleta, `facadeCellSize` y política de alturas.
  En 2.9, mover a `city-design.json` las listas de INVENTARIO-DATOS.md (lugares, encargos,
  miradores, zonas, puntos protegidos) y dejar `facade-profiles.json` con eso únicamente.
- **Esquema de `city-design.json`**: crear `schemas/city-design.schema.json` en 2.9 y
  añadir el `$schema` al fichero.
- K3 y K4 se leen con las precisiones de 11.2 (`roof` por edificio, `composeFront` para
  frentes genéricos).

### 11.4 Notas de ejecución de los pasos 2.9 a 2.12 (6/10/2026)

- 2.9 se hizo en cinco commits `refactor`, todos con huella idéntica y sin cambiar la lista de
  recursos: el esquema y el `$schema` (`schemas/city-design.schema.json`), y después
  mobiliario, pavimentos y señales, vegetación y edificios genéricos. Cada commit amplía a la
  vez `city-design.json`, `validateCityDesign` (con una especificación por sección), su
  prueba negativa en `tests/verify-design.mjs` y las comprobaciones cruzadas de
  `tests/verify-world.mjs` (puntos dentro del mundo, calles y tipos de vía existentes en OSM).
- Al pasar los literales a datos se añadieron al ejemplo los números que seguían escondidos
  en el código, con el mismo valor: `plazaLamps.bench` y `plazaLamps.bin`,
  `bollards.endMargin`, `crossings.edgeStart` y `edgeEnd`, `centerLines.start`, `endMargin` y
  `halfWidth`, las alturas `water`, `deck` y `railing`, `vegetation.marketTrees.roadClearance`,
  `buildingClearance` y `colliderClearance` y `vegetation.shrubBuildingClearance`. Las
  farolas de calle usan `frontages.originalStreets`, como antes. Las operaciones de coma
  flotante conservan el orden original (por ejemplo `lerp(from, to, i / (count - 1)) + shift`).
- Lugares, miradores y encargos siguen en `web/game-data.js`. La lista de 11.3 los nombra,
  pero INVENTARIO-DATOS.md los declara ya en datos y mantiene el módulo (lo importan de forma
  síncrona el juego, la validación de partidas guardadas y los tests); moverlos a JSON
  obliga a cambiar la validación de `progress.js` y a cargarlos antes de importar esos
  módulos. Queda pendiente de que el usuario confirme si se quiere.
- 2.10: `map-corrections.json` es obligatorio (error claro si no carga), va vacío y sin
  `appliesTo` (los hashes de la base harían saltar `verify-world` en cada regeneración; las
  guardas de cada corrección ya protegen). Se implementan las operaciones de K7; `building.hide`
  de D9 no existe (K7 prevalece: ocultar edificios cambiaría los índices de frente). El SHA-256
  del contorno es una función propia síncrona porque `crypto.subtle` no existe en contextos
  no seguros (juego servido por HTTP en la red local). `verify-world` exige además que
  `frontages.json` coincida con los contornos ya corregidos.
- 2.11: el panel tiene dos botones, «Copiar anclaje» (`facade-designs.json`) y «Copiar
  corrección» (esqueleto `road.movePoint` de `map-corrections.json`), en vez de uno. El
  fragmento queda también en un cuadro de texto por si el portapapeles no está disponible.
- 2.12: el orden de edición documentado es editar, `node tests/verify-design.mjs`,
  `export-provenance`, `npm test`, porque `npm test` antes de `export-provenance` falla por el
  checksum desfasado.

## 12. Fuentes consultadas

Consultas del 6/10/2026 salvo que se indique.

1. MDN, `<script type="importmap">`: claves URL relativas, resolución contra la URL base
   del mapa, orden respecto a los módulos, varios mapas y compatibilidad (_Baseline_
   desde marzo de 2023).
   https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap
2. V8, «JavaScript modules»: módulos sin empaquetar en producción con menos de 100
   módulos y árbol poco profundo, `modulepreload`, HTTP/2, granularidad.
   https://v8.dev/features/modules
3. Comprobaciones propias: cabeceras de GitHub Pages (`curl -I`, `Cache-Control:
max-age=600`, HTTP/2, gzip) y Chrome 2026 sin interfaz con una página de prueba bajo
   `/chiclana-vice/` (importmap con claves relativas y `modulepreload`).
4. OSMF, «Licence and Legal FAQ»: corregir o mejorar datos de OSM crea una base de datos
   derivada que, si se distribuye, sigue bajo ODbL; distinción con obras producidas;
   preferencia por devolver los datos a OSM.
   https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ
5. CityJSON 2.0.1: LoD como cadena «X.Y», superficies semánticas, plantillas de
   geometría con transformación y extensiones. https://www.cityjson.org/specs/2.0.1/
6. Esri, CityEngine, tutoriales de gramática de forma CGA (división de fachadas,
   repetición, paso de índices): https://doc.arcgis.com/en/cityengine/2020.0/tutorials/tutorial-6-basic-shape-grammar.htm
   y https://desktop.arcgis.com/en/cityengine/2015/tutorials/tutorial-9-advanced-shape-grammar.htm
7. P. Müller, P. Wonka, S. Haegler, A. Ulmer y L. Van Gool, «Procedural Modeling of
   Buildings», ACM SIGGRAPH 2006, https://doi.org/10.1145/1141911.1141931 (referencia
   bibliográfica del origen de CGA; no consultada en línea).
8. ESLint, reglas recomendadas de `@eslint/js` 10.0.1 instalado en el repositorio
   (`no-import-assign`, `no-undef`), comprobado localmente.
