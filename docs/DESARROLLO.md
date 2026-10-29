# Desarrollo, estructura y convenciones

Juego web estático 3D sobre coordenadas reales del centro de Chiclana. `web/` es a la vez
la fuente editable y lo que se publica: no hay compilación ni directorio `dist/`.

## Ejecutar

```fish
uv run --no-project python -m http.server 8080 --bind 127.0.0.1 --directory web
```

Abrir http://localhost:8080; Ctrl+C detiene el servidor. Para probar desde otro equipo de
una red de confianza, usar `--bind 0.0.0.0` y la IP local. El progreso se guarda en el
navegador (`localStorage`), por origen.

El motor usa WebGPU solo en un contexto seguro (HTTPS o `localhost`); desde la IP local
cae a WebGL 2. Para probar WebGPU en un Android por USB, `adb reverse tcp:8080 tcp:8080` y
abrir http://localhost:8080 en el móvil. `#fps` muestra el motor en uso y los FPS, y
`#motor=webgl` fuerza WebGL 2.

Para reproducir las rutas de GitHub Pages, servir una carpeta que contenga `web/` con el
nombre `chiclana-vice/` y abrir http://localhost:8080/chiclana-vice/.

## Comprobar

```fish
npm ci --ignore-scripts
npm run check
```

| Script                 | Qué hace                                                     |
| ---------------------- | ------------------------------------------------------------ |
| `npm run lint`         | ESLint sobre JavaScript propio (no Python ni CSS)            |
| `npm run format:check` | Prettier sobre JS, HTML, CSS, Markdown, YAML y configuración |
| `npm run format`       | Aplica el formato                                            |
| `npm test`             | Verificadores por archivo descritos debajo                   |
| `npm run check`        | Los tres anteriores; es lo que ejecuta la CI                 |

`npm test` ejecuta, en este orden, los siguientes archivos de `tests/`:

| Archivo                        | Qué comprueba                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `verify-world.mjs`             | Capas, procedencia, checksums y coherencia de los datos publicados.                               |
| `verify-modules.mjs`           | Capas de módulos, importmap, precargas e importación sin DOM.                                     |
| `verify-design.mjs`            | Diseños de autor y contratos de los validadores.                                                  |
| `verify-party-walls.mjs`       | Medianeras y muros compartidos.                                                                   |
| `verify-terrain.mjs`           | Contrato, muestreo y malla del terreno.                                                           |
| `verify-surfaces.mjs`          | Modelo de superficies y perfiles.                                                                 |
| `verify-surface-junctions.mjs` | Continuidad de las uniones entre vías.                                                            |
| `verify-bridges.mjs`           | Uniones, escalones, altura libre y acuerdo entre calzada y tablero; informa también de `endDrop`. |
| `verify-terrain-runtime.mjs`   | Integración del relieve con el juego en el arnés.                                                 |
| `verify3d.mjs`                 | Flujos del juego, colisiones, cámaras y controles simulados.                                      |

Los verificadores usan DOM y WebGL simulados: comprueban datos, misiones, colisiones,
controles táctiles simulados y cámaras, pero no el render en GPU, el rendimiento ni un
móvil físico. Si un cambio afecta a interfaz, cámara, render o controles, probarlo en un
navegador real y anotar qué no se ha verificado. El arnés común `tests/runtime-harness.mjs`, compartido por el verificador y el exportador
de frentes, crea los globales simulados e importa el juego con `import()`; no modifica su
texto. El juego expone su API de pruebas a través de `startGame()`.

Para refactorizaciones sin cambios visibles hay herramientas aparte, que no forman parte
de `npm test`. `node tools/scene-fingerprint.mjs --out base.json` guarda una huella de la
escena (objetos, materiales, geometría por bytes, rutas, recursos pedidos y 600 pasos de
simulación en CPU) y `--compare base.json` la contrasta con la del árbol actual.
`node tools/bench-startup.mjs --out arranque-base.json` mide el arranque del arnés,
sus etapas y el coste medio de `update(1/60)` en 1.200 pasos tras 60 de calentamiento.
`--compare arranque-base.json` imprime diferencias por etapa en ms y porcentaje; se
informa la mediana de tres ejecuciones en procesos separados, en la misma máquina y
versión de Node. El JSON contiene `{ node, bootMs, stages, updateMsPerFrame }`:
`bootMs` incluye la creación del arnés y la importación del juego; las etapas cubren
`init`, incluidas sus esperas. La API de pruebas expone una copia mediante
`startupTimings()` (`[{ name, ms }]`), y con `#fps` o `?debug` el juego muestra las
etapas en la consola con `console.table`. Son tiempos de CPU con DOM y WebGL simulados.
`node tools/browser-smoke.mjs URL` abre el juego en Chrome sin interfaz (SwiftShader), recoge
errores y cuenta mallas y triángulos. Se comparan en la misma máquina y con la misma versión
de Node, y no acreditan GPU, rendimiento ni móvil.

Prettier no formatea los datos (`web/*.json`, `source-data/`), las licencias ni
`web/vendor/`. Las versiones de las herramientas están fijadas en `package-lock.json`, que
se versiona. El juego no necesita `node_modules`.

## Estructura

| Ruta             | Contenido                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `web/`           | Juego, capas de datos y recursos publicados en Pages                                       |
| `web/game3d.js`  | Entrada del juego: lee `?v=` y llama a `startGame()`                                       |
| `web/js/`        | Módulos ES del juego, por capas (ver «Módulos del juego»)                                  |
| `web/vendor/`    | Three.js 0.186.1 (WebGPURenderer, con WebGL 2 de respaldo) y su licencia; no se reformatea |
| `web/licenses/`  | Textos completos de licencias de datos                                                     |
| `web/measure.js` | Medición opcional en el navegador; el juego no la importa                                  |
| `tools/`         | Conversores y generadores de datos (ver `tools/AGENTS.md`)                                 |
| `tests/`         | Verificadores en Node                                                                      |
| `source-data/`   | Catálogo de frentes y auditoría IGN que usan los conversores                               |
| `docs/`          | Guías                                                                                      |
| `.github/`       | CI, despliegue en Pages y Dependabot                                                       |
| `.agents/`       | Habilidades compartidas por agentes (`.claude/skills/` las enlaza)                         |

Copias intencionadas, que no se editan a mano: `web/LICENSE` y `web/THIRD_PARTY_NOTICES.md`
(copias de la raíz). Se regeneran con `node tools/export-provenance.mjs` y
`tests/verify-world.mjs` comprueba que coinciden. El catálogo de frentes tiene una sola
copia, `web/frontages.json`, generada con `node tools/export-facades.mjs`.

`web/game-data.js` centraliza lugares, miradores, encargos y constantes compartidas por
el juego y los tests. `web/progress.js` valida las partidas guardadas antes de usarlas.

Los objetos de calle se cargan de `web/street-objects.json` (capa opcional) y
`web/osm-world.json` es la única copia de las vías.

## Módulos del juego

`web/game3d.js` es solo la entrada; el código está en módulos ES nativos bajo `web/js/`,
sin bundler ni compilación:

| Carpeta          | Contenido                                                                      |
| ---------------- | ------------------------------------------------------------------------------ |
| `js/core/`       | Estado compartido (`state.js`), matemáticas, azar con semilla, DOM y `asset()` |
| `js/engine/`     | Materiales y cachés de geometría, texturas, renderizador, cámara y audio       |
| `js/world/`      | Carga de capas, índice espacial y constructores (edificios, fachadas, calles…) |
| `js/game/`       | Grafo y rutas, vehículos, personas, tráfico, policía, misiones, jugador, bucle |
| `js/ui/`         | Avisos, HUD, mapa, diálogos, entrada y controles                               |
| `js/debug/`      | Inspector del modo `?debug`; se carga solo con `?debug`                        |
| `js/app.js`      | `startGame`, `init`, `frame` y `showStartupError`                              |
| `js/test-api.js` | API de pruebas (`createPublicApi`, `createTestApi`)                            |

| Archivo bajo `web/js/`          | Responsabilidad                                                        |
| ------------------------------- | ---------------------------------------------------------------------- |
| `app.js`                        | Arranque por etapas, bucle de dibujo y errores de inicio.              |
| `core/assets.js`                | Versión y rutas de recursos.                                           |
| `core/dom.js`                   | Acceso al DOM, opciones de URL y espera de un fotograma.               |
| `core/grid.js`                  | Rejilla espacial común con claves numéricas.                           |
| `core/math.js`                  | Geometría y matemáticas compartidas.                                   |
| `core/random.js`                | Azar con semilla.                                                      |
| `core/state.js`                 | Contenedores y estado compartido.                                      |
| `debug/inspector.js`            | Inspector de mapa y revisión de copas con `?debug`.                    |
| `engine/audio.js`               | Audio del juego.                                                       |
| `engine/camera.js`              | Posición y actualización de cámaras.                                   |
| `engine/contact-shadows.js`     | Sombras de contacto de los actores.                                    |
| `engine/expr.js`                | Evaluación de expresiones de las recetas.                              |
| `engine/foliage.js`             | Material de vegetación animada.                                        |
| `engine/ground-near.js`         | Detalle cercano del suelo y sus materiales.                            |
| `engine/materials.js`           | Materiales, geometrías y agrupación de piezas.                         |
| `engine/night-glow.js`          | Brillos nocturnos de farolas y vehículos.                              |
| `engine/post.js`                | Gradación de color y viñeta.                                           |
| `engine/precompile.js`          | Compilación anticipada de shaders.                                     |
| `engine/renderer.js`            | Renderizador, suelo, sol y dibujo de la escena.                        |
| `engine/sky.js`                 | Cielo y entorno iluminado.                                             |
| `engine/terrain-drape.js`       | Recorte y proyección de geometría sobre el terreno.                    |
| `engine/terrain-sampling.js`    | Muestreo de superficies y colocación de vehículos.                     |
| `engine/textures.js`            | Texturas procedurales.                                                 |
| `engine/time-of-day.js`         | Horas del día y transición de iluminación.                             |
| `engine/wall-ao.js`             | Oscurecimiento ambiental al pie de los muros.                          |
| `engine/water.js`               | Material del agua del río.                                             |
| `engine/windows.js`             | Materiales y aspecto de las ventanas.                                  |
| `game/car-batch.js`             | Instancias de coches agrupadas por material.                           |
| `game/car-model.js`             | Geometría del modelo de coche.                                         |
| `game/flow.js`                  | Inicio de la partida.                                                  |
| `game/graph.js`                 | Grafos, conexiones y rutas.                                            |
| `game/jobs.js`                  | Lugares, objetivos y creación de marcadores.                           |
| `game/missions.js`              | Avance de encargos y actualización de marcadores.                      |
| `game/people.js`                | Modelo de personas.                                                    |
| `game/player.js`                | Actualización del jugador a pie y conduciendo.                         |
| `game/police.js`                | Comportamiento policial.                                               |
| `game/save.js`                  | Carga y guardado del progreso del juego.                               |
| `game/traffic.js`               | Tráfico, avance de agentes y peatones.                                 |
| `game/update.js`                | Secuencia de actualización de la simulación.                           |
| `game/vehicles.js`              | Creación, selección y colisiones de vehículos.                         |
| `test-api.js`                   | API pública y API del arnés de pruebas.                                |
| `ui/controls.js`                | Instalación de teclado, joystick, botones, menú y controles de cámara. |
| `ui/dialogs.js`                 | Diálogos y paneles de ayuda.                                           |
| `ui/feedback.js`                | Avisos y progreso de carga.                                            |
| `ui/hud.js`                     | Marcador, lecturas y etiquetas.                                        |
| `ui/input.js`                   | Limpieza del estado de entrada.                                        |
| `ui/map.js`                     | Mapa y minimapa.                                                       |
| `ui/perf.js`                    | Panel de medición de fotogramas.                                       |
| `world/aerial-tiles.js`         | Carga y sustitución de teselas de ortofoto.                            |
| `world/bounds.js`               | Consultas de la unión de límites del mundo.                            |
| `world/buildings.js`            | Construcción de edificios genéricos.                                   |
| `world/corrections.js`          | Aplicación de correcciones del mapa y sus guardas.                     |
| `world/design-validate.js`      | Fachada pública de los validadores de fachadas, ciudad y correcciones. |
| `world/facade-composer.js`      | Ejecución de composiciones de fachada.                                 |
| `world/facade-kit.js`           | Piezas geométricas del kit de fachadas.                                |
| `world/facades.js`              | Preparación y construcción de fachadas detalladas.                     |
| `world/furniture.js`            | Mobiliario urbano y obstáculos de calle.                               |
| `world/ground-clean.js`         | Máscaras y entorno limpio bajo las copas de la ortofoto.               |
| `world/ground-floors.js`        | Bajos de edificios según su uso.                                       |
| `world/loader.js`               | Carga y validación de capas y aplicación de alturas.                   |
| `world/party-walls.js`          | Detección de muros compartidos.                                        |
| `world/road-space.js`           | Espacio ocupado por las calzadas y sus bordes.                         |
| `world/shadow-proxies.js`       | Geometrías estáticas sustitutas para el pase de sombras.               |
| `world/sidewalks.js`            | Aceras, bordillos y faldones.                                          |
| `world/signs.js`                | Señales y rótulos de calle.                                            |
| `world/spatial.js`              | Índices, proximidad a vías, agua, obstáculos y colisiones.             |
| `world/streets.js`              | Calzadas, juntas, marcas y detalles de calle.                          |
| `world/surface-model.js`        | Construcción y consultas de perfiles, plataformas, agua y terreno.     |
| `world/surface-validate.js`     | Validación de superficies y anclajes de área.                          |
| `world/terrain-mesh.js`         | Malla del terreno y transición exterior.                               |
| `world/terrain-placement.js`    | Bases y preparación de superficies para la escena.                     |
| `world/terrain.js`              | Contrato y muestreo puro de la rejilla del terreno.                    |
| `world/tram.js`                 | Vías, paradas y modelo del tranvía.                                    |
| `world/validate-city.js`        | Validación de `city-design.json`.                                      |
| `world/validate-corrections.js` | Validación estructural de `map-corrections.json`.                      |
| `world/validate-facades.js`     | Validación de `facade-designs.json` y contratos de las piezas.         |
| `world/validate-kit.js`         | Comprobaciones elementales y acumulación ordenada de errores.          |
| `world/vegetation.js`           | Construcción de árboles y arbustos.                                    |

Dependencias en un solo sentido: `core` ← `engine` ← `world` ← `game` ← `ui` ← `app`. Dos
excepciones: `ui/feedback.js` (avisos y barra de carga), que solo depende de `core` y
puede importarse desde cualquier capa, y las funciones de actualización de
`ui/hud.js` (`updateHUD`, `updateHudReadouts`), que pueden importarse desde `game`
para refrescar el marcador. `tests/verify-modules.mjs` falla si aparece un
ciclo o una dependencia en dirección contraria a las capas, salvo las dos excepciones
explícitas de interfaz.

- **Fachadas desde datos**: las fachadas detalladas (Ayuntamiento, Mercado, naves y
  portadas de iglesia, frentes genéricos de calle) son recetas de `web/facade-designs.json`
  que ejecuta `world/facade-composer.js` con las piezas de `world/facade-kit.js`
  (`engine/expr.js` evalúa las expresiones). `web/city-design.json` fija qué calles y zonas
  reciben frentes y con qué receta. `world/design-validate.js` valida ambos al cargar y en
  `tests/verify-world.mjs`; el formato está en `docs/KIT-FACHADAS.md`.
- **Variación de edificios**: `tools/building-variation.mjs` resuelve los colores al
  generar `buildings.json` y guarda un `paletteIndex` por parte. El navegador lee el
  índice, sin calcular hashes ni consumir azar. La identidad del generador normaliza
  contorno y patios, sin depender del orden de las partes, plantas ni clasificación de
  fachada. El catálogo de compatibilidad está en `source-data/building-variation.json`,
  fuera de la web; `city-design.json.buildings.variation.seed` gobierna las partes sin
  asignación. Cambiar el contorno cambia su identidad; no es un ID catastral persistente.
  La secuencia del entorno arranca con `city-design.json.randomSeed`: vegetación y
  actores aún la comparten.
- **Correcciones del mapa**: `world/corrections.js` aplica `web/map-corrections.json` a las
  vías, áreas y contornos en `loadWorld`, tras validar las capas y antes de construir el
  grafo. Es una función pura de datos (sin DOM ni Three).
- **Sin efectos de nivel superior**: ningún módulo toca `document`, `window`,
  `localStorage` ni registra oyentes al evaluarse; todo ocurre dentro de funciones que
  llama `startGame()`. Así Node puede importar cualquier módulo sin DOM.
- **Estado compartido**: los contenedores (arrays, `Map`, objetos) se exportan de
  `core/state.js` con su nombre y se mutan, nunca se reasignan; los escalares
  reasignables son propiedades de `world`, `gfx`, `session`, `view`, `pointer`, `actors`
  y `audio`. No se desestructuran fuera de una función.
- **Importmap y versión**: los módulos se importan con rutas relativas sin `?v=`.
  `index.html` declara un importmap cuyas claves son esas rutas y cuyos valores llevan
  `?v=VERSION`, más un `modulepreload` por módulo. `game3d.js` pasa su propio `?v=` a
  `startGame({ version })`, que lo usa para los JSON y la ortofoto. Al añadir un módulo,
  inclúyelo en el importmap y en los `modulepreload`.
- **Cambiar la versión**: sustituir todas las apariciones a la vez, por ejemplo
  `sed -i 's/?v=[^"]*"/?v=NUEVA"/g' web/index.html`; `verify-modules.mjs` detecta
  cualquier olvido.

### Índices, arranque y validadores

`core/grid.js` exporta `createGrid(cell)`: `insert(item, minX, maxX, minZ, maxZ)`
indexa una caja; `queryPoint(x, z)` devuelve los candidatos de su celda;
`queryBox(minX, maxX, minZ, maxZ, visit)` visita sin duplicados y en orden de inserción.
Un visitante que devuelve `true` termina la consulta. Son candidatos: el consumidor
comprueba la geometría exacta.

El ayudante privado `syncedGrid` de `world/spatial.js` sincroniza al consultar los índices
de obstáculos, agua y tramos con sus listas mutables de `core/state.js`. Indexa las
adiciones al final y reconstruye si la lista mengua o cambia su primer elemento; no
detecta cambios en mitad de la lista. `nearestRoad` busca por anillos y resuelve empates
por índice original. Edificios, superficies, espacio de calzada, aceras, bajos, tranvía y
sustitutos de sombra conservan sus implementaciones específicas; no todos usan la rejilla común.

`init` en `app.js` declara etapas `{ name, run }` y las ejecuta en orden con `await`,
registrando cada duración con `performance.now()`. Abarcan carga y preparación del
mundo, renderizador, grafos e índices, terreno y constructores, actores y cámara,
compilación de shaders y final de carga. Los mensajes y las esperas de la barra de carga
viven dentro de esas etapas. `startupTimings()`, la consola y `bench-startup` se describen
en [Comprobar](#comprobar).

Los validadores están separados por archivo: `validate-city.js`, `validate-facades.js`
y `validate-corrections.js`, reexportados por `design-validate.js`;
`surface-validate.js` exporta `validateSurfaceDesign`, que también reexporta
`surface-model.js`. Comparten `createValidationKit` de `validate-kit.js` para números,
opciones, arrays y objetos, y conservan comprobaciones específicas y mensajes propios.

## Modo de depuración (`?debug`)

Con `?debug` en la URL (también en la web publicada) `startGame` importa
`js/debug/inspector.js`; sin él, el módulo ni se pide y el juego no cambia. Un toque corto
sobre el lienzo (menos de 6 px y 350 ms, así que el arrastre de cámara no lo activa) abre un
panel con las coordenadas locales del punto (rayo contra edificios y fachadas, o el suelo real (plano si no hay capa)), el edificio, el frente `building-<i>-edge-<e>` (con indicación de si está en
`frontages.json`), la vía OSM más cercana (`id`, aparición, nombre y vértice), el objeto de
calle a menos de 3 m, el monumento que lo contiene y la posición y el rumbo del jugador.
«Copiar anclaje» y «Copiar corrección» ponen el fragmento JSON en el portapapeles
(también queda en un cuadro de texto, porque el portapapeles exige un contexto seguro: HTTPS
o `localhost`). El procedimiento de edición está en [DATOS.md](DATOS.md#diseños-y-correcciones-a-mano).
Probado a mano en un móvil Android; no en iOS.

Para revisar el grano cercano del suelo, abre `?debug` y ajusta en la consola:

```js
__luz({ detail: { scale: 8, near: 8, far: 60, strength: 1 } });
```

`scale` es el tamaño de repetición en metros; `near` y `far` son las distancias
desde la cámara entre las que se desvanece el grano, también en metros. `strength`
va de 0 a 1. Se admiten cambios parciales; en ligero la intensidad efectiva siempre
es cero y al volver a normal se recupera la elegida. Los valores de referencia
dejan la vista aérea fuera del alcance del detalle. El ajuste no recompila el shader
y solo afecta al suelo, sin modificar las cubiertas. `__luz` también admite `exposure`,
`hemi`, `sun` y `aerial` para pruebas rápidas; los valores de referencia del cielo, el sol
y el color viven en `SKY`, `SUN` y `GRADE` ([Cielo, entorno y color](#cielo-entorno-y-color)).

## Mundo y límites

`world.json.bounds` declara una lista de rectángulos `[x0, x1, z0, z1]` en
coordenadas locales: x hacia el este y z hacia el sur. Hoy son tres: el centro
`[-671.835, 671.835, -500.94, 500.94]`, Santa Ana `[-420, -60, 500.94, 650]` y el norte
`[-820, -380, -1120, -500.94]`, contiguos al centro.
El cargador convierte también el antiguo `size` de copias locales a un rectángulo.

`world/bounds.js` centraliza pertenencia, margen interior, proximidad al borde y caja
envolvente. Los márgenes se miden hasta el borde de la unión: la costura entre rectángulos
contiguos o solapados no bloquea ni avisa. Colisiones, aviso de salida, mobiliario y
vegetación consultan los límites;
el mapa, minimapa y suelo plano usan su caja envolvente. El recuadro de la ortofoto
(`world.aerialBox`) es independiente, aunque hoy coincide con esa caja: fija las UV de
suelo y tejados y la posición de la imagen en el mapa. El faldón del relieve sigue
el borde de la rejilla del terreno.

## Terreno

El relieve real está activo con `web/terrain.json` y `web/terrain.bin`, validados para el
juego el 8/10/2026. Sin esos archivos se usa el modo plano, que conserva la escena anterior.
La carga opcional de `terrain.json` y `terrain.bin` se resuelve antes de construir la
escena. Una capa presente pero incompatible detiene el arranque; un 404 usa terreno
plano y un fallo de red añade un aviso. La referencia vertical se suma por separado a
las alturas relativas de edificios; la física y las rutas siguen en planta.

| Módulo                       | Responsabilidad                                                                |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `world/terrain.js`           | Contrato, rejilla y muestreo triangular puro, sin DOM ni Three.                |
| `world/terrain-mesh.js`      | Malla indexada, normales, UV y transición exterior.                            |
| `world/terrain-placement.js` | Bases de edificios y monumentos y preparación del modelo de superficies.       |
| `engine/terrain-sampling.js` | Terreno, superficie transitable y colocación/inclinación de vehículos.         |
| `engine/terrain-drape.js`    | Cortes de aristas y pavimentos contra celdas y diagonales.                     |
| `world/surface-model.js`     | Diseño validado de perfiles, agua, plataformas y continuidad entre niveles.    |
| Constructores y juego        | Bases, objetos, cámaras, actores y marcadores relativos a la misma superficie. |

`app` pasa la geometría del suelo al renderizador; `engine` no importa constructores
`world`. `reloadGroundTexture` actualiza los materiales sin mover la geometría.
`cameraSweep` conserva los márgenes de patios y compara con `baseY + renderH`, además
de comprobar terreno/tableros. El inspector selecciona el suelo real e informa de cotas
relativas, referencia y datos de la plataforma seleccionada. El contrato editable
está en [SUPERFICIES_TERRENO.md](SUPERFICIES_TERRENO.md).

La implementación, la validación y los límites del recorte están en
[TERRENO_PILOTO.md](TERRENO_PILOTO.md). Los perfiles de pasarelas, accesos y agua son
aproximaciones de autor revisadas visualmente, no mediciones. El inventario anterior se conserva como historia en
[TERRENO.md](historico/plan-modular/TERRENO.md).

En los corredores de plataforma, `roadAnchor.endExtension` admite un número no negativo
(prolonga ambos extremos por igual) o un par `[inicio, fin]` en metros, según el orden de
los vértices de la vía anclada. Si se omite, vale cero. `surface-validate.js` valida ambas
formas y `surface-model.js` las aplica al construir el polígono del tablero.

`tests/verify-bridges.mjs` informa de `endDrop`: la mayor caída positiva desde el borde
de los extremos cortos del tablero hasta la superficie medio metro hacia fuera, con
muestras cada 25 cm y excluyendo puntos dentro del tablero o del agua. Es informativo,
sin aserción: junto a bocas de pasos inferiores puede haber caídas reales. Los límites y
pendientes conocidos siguen en [ESTADO.md](ESTADO.md#pendientes).

## Suelo cercano

`engine/ground-near.js` y `world/ground-clean.js` mejoran la ortofoto de cerca sin tocar las
teselas publicadas. Todo va en TSL dentro del color de las teselas de suelo
(`applyGroundDetail(material, { ortho: true })`) y se apaga con el mismo alcance que el grano
cercano: `fade` = 1 a menos de `near` m de la cámara y 0 a más de `far` (`setGroundDetail`).
Desde lejos y en vista aérea la ortofoto queda como estaba.

- **Copas**: al cargar (`prepareGroundClean`, tras `buildTrees`) se dibuja una máscara con los
  círculos de `vegetation.json` (árboles y arbustos, borde suave) y un «entorno limpio»: la
  vista general sin esas copas, rellenada con el promedio ponderado de los píxeles vecinos
  (desenfoque por cajas normalizado, 3 m/píxel). Bajo cada copa el color pasa de la foto a ese
  entorno. En la ortofoto el oscuro de cada árbol (copa y sombra) llega a unas dos veces el
  radio detectado y se alarga hacia el norte y el noroeste, así que la máscara lleva un segundo
  canal con una zona más amplia y desplazada hacia la sombra (`zoneGrow`, `zoneMargin`,
  `zoneShift`); dentro de ella solo se sustituye lo que en la tesela fina sea más oscuro que el
  entorno limpio (`crownDark`), de modo que el césped claro alrededor se conserva. Cuesta unos
  70 ms al arrancar y unos 6 MB de texturas; no se construye en ligero.
- **Sombras horneadas**: los oscuros de la ortofoto suben hacia una luminancia mínima
  (`shadowFloor`) con transición suave; el asfalto y otros oscuros normales quedan por encima.
- **Materiales propios**: la clase del suelo se deduce del color de la foto (sin tinte): verde
  predominante = césped, saturado ocre o marrón = tierra, gris claro poco saturado = pavimento;
  el asfalto y las sombras oscuras no encajan y quedan como están. Cada clase multiplica la foto
  por una textura procedural de media 1 (la baldosa, además, con un toque cálido: `pavementWarm`) (`groundMaterialTexture`: un RGBA de datos de 256 px, sin
  imágenes: césped, tierra y baldosas con juntas), muestreada dos veces en coordenadas de mundo
  (cada 3 m y cada 1,1 m) para romper la repetición. Así se conserva el color medio de la foto.
  Coste: 2 lecturas de textura y unas decenas de operaciones por fragmento de suelo a menos de
  `far` m; a más, ninguno efectivo (el factor es 0). Se apaga con un uniforme en ligero.
- Ajuste en vivo: `setGroundNear({ crownClean, crownDark, shadowStrength, shadowFloor,
shadowSoftness, materialStrength, materialScale, green, earth, pavement, minLight,
pavementWarm })` y `GROUND_CLEAN`
  (resolución y radios de la máscara, solo al construir).

## Aceras

`world/sidewalks.js` (llamado desde `buildStreetSurfaces`) añade, solo como geometría visual,
una acera con bordillo a cada lado de las vías cuyo tipo está en
`pavements.sidewalks.roadTypes` (`city-design.json`; esquema en `schemas/` y validación en
`design-validate.js`). No cambia las cotas de `surfaceHeightAt` ni la transitabilidad: el
jugador pisa la cota de la calzada, así que sus pies quedan `curbHeight` (10 cm) por debajo de
la baldosa.

- Cada pieza (`step`, 3 m) toma la cota de la calzada (`surfaceHeightAt(x, z, null, road.id)`),
  no la del MDT, y sigue la cuesta. La baldosa va en la malla `slabs` de las bandas
  (preajustada, sin proyectar al terreno); el bordillo (cara vertical hacia la calzada y tapa
  de `curbWidth`) va en una malla nueva, `street-curbs`, con un material propio.
- Sin acera en vías de menos de `minimumRoadLength` (enlaces, ramales) ni por el lado donde
  otra calzada (incluida la propia vía en tramos paralelos, glorietas y dobles calzadas) queda
  a menos de medio ancho + ancho de acera del eje en la mitad o más del tramo. Cada pieza se
  descarta si una esquina, un borde o su centro cae a menos de medio ancho + margen del eje de
  cualquier otro tramo dibujado (puentes, peatonales y servicio incluidos); solo se ignoran
  los tramos vecinos casi colineales que continúan la misma calle.
- Recorte por pieza: se prueban el borde interior y el exterior (extremos y centro) contra
  edificios (`inBuilding`, `buildingMargin`), agua, tableros de plataforma y otras calzadas
  (medio ancho de la que cruza más `junctionMargin`; las vías del mismo nombre casi
  paralelas, que son una calle partida, no cuentan). Si el ancho completo no cabe se prueba
  con 66 % y 33 %; por debajo de `minimumWidth` no hay acera. En los cruces las aceras se
  cortan antes de la calzada que cruza, sin solapes; las esquinas quedan abiertas.
- Tranvía: cada pieza se descarta también si cae sobre la franja del tranvía (más
  `junctionMargin`) o en un cruce a nivel (`tram.crossingClearance`); los tramos de la vía
  empotrados en una calzada no la recortan (ver «Tranvía»).
- Tramos sueltos: una sucesión continua de piezas por un mismo lado de una vía más corta que
  `minimumRun` (10 m) no se dibuja (queda el faldón de la calzada). Evita franjas aisladas
  entre recortes junto a cruces anchos, peatonales y plazas.
- Faldones: en el borde exterior de cada acera (o de la calzada si no tiene acera, incluidas las
  vías peatonales) se baja una cara vertical del color del bordillo hasta
  `skirtTerrainMargin` por debajo del terreno muestreado (`groundHeightAt`), con un máximo de
  `skirtMaxDepth`, y solo donde el borde queda más de `skirtMinGap` por encima del terreno.
  Así tapan huecos y piezas flotantes en terraplenes y accesos de puentes, sin geometría
  donde el terreno ya llega al borde. Los puentes no llevan faldón propio: su tablero ya
  tiene canto (`platformGeometry`) y barandillas; sí lo llevan las vías de acceso, cuyo
  perfil sube hacia el tablero (Puente VII Centenario, OSM 142805148, y Puente Nuestra
  Señora de los Remedios, OSM 50664224).
- Las vías peatonales y los puentes no reciben acera (los tableros ya tienen la suya en
  `platforms[].bands`). El ancho de acera debe caber en `terrainSurfaces.roads.shoulder` para
  que la cota de la calzada siga siendo la del modelo.
- Plazas: con relieve (`world.surfaces`), `buildStreetSurfaces` pavimenta todas las áreas
  `square` del mapa, no solo las de `zones.pavedSquares` (que queda para el modo sin modelo
  de superficies). Sigue sin pavimentar la plaza que ya es un tablero (`platforms[].area`) o
  que coincide con él en más del 80 % de su contorno (a menos de 3 m), para no duplicar.
  Las baldosas de las plazas se proyectan al terreno con el muestreo general.
- Con terreno de rejilla sin modelo de superficies no se dibujan; el modo ligero es igual que el
  normal (geometría estática y barata).

## Tranvía

`world/tram.js` (`buildTram`, tras `buildRoadDetails`) dibuja, solo como geometría visual, las
vías de `web/tram.json` (capa OSM, ver `docs/DATOS.md`): no cambia cotas, colisiones ni
transitabilidad. Parámetros de autor en `city-design.json` (sección `tram`; esquema en
`schemas/` y validación en `design-validate.js`).

- Cada muestra (cada `sampleStep`) tiene uno de tres tipos, a `bedHeight` sobre la cota de
  `surfaceHeightAt` (calzada, tablero o terreno):
  - `lane`: el eje queda dentro de una calzada (Calle Mendizábal, Virgen del Carmen, San
    Antonio, Alameda Solano: calles hoy de sentido único con el otro carril reservado al
    tranvía). Carril exclusivo de `stripWidth` con superficie `laneColor` (hormigón claro,
    distinta del asfalto) y una línea blanca continua en cada borde; los raíles van empotrados.
    El carril se desplaza hacia el eje de la calle lo justo (suavizado) para caber en la
    calzada con `laneMargin`, de modo que no pisa la acera, que se mantiene.
  - `paved`: puentes, cruces a nivel y medianas pegadas a las calzadas; franja `pavedColor`.
  - `grass`: franja de césped separada de la calzada (Avenida de los Reyes Católicos). Los
    tramos de césped de menos de `minimumGrassRun` entre tramos empotrados se pavimentan.
    Las empotradas toman la cota del eje en ambos lados; la de césped, la de cada esquina.
- Dos raíles separados el ancho de vía de OSM (1,668 m) y, cada `poleSpacing` (28 m), un poste
  con brazo, por el lado con más espacio libre y fuera de edificios; el hilo de contacto se
  dibuja a `wireHeight` en tramos rectos de `wireStep`.
- Mallas agrupadas por material: `tram-bed-paved`, `tram-bed-grass`, `tram-lane` (color por
  vértice: hormigón y líneas), `tram-rails`, `tram-catenary` y, para las paradas, `tram-stops`
  (color por vértice), `tram-stop-glass` y `tram-stop-signs`: ocho llamadas en total.
- Paradas: andén (contorno de OSM) elevado `platformHeight` con canto y banda táctil en el
  borde que da a la vía, marquesina (tejado, postes y cristal) junto al borde exterior y poste
  con el nombre de la parada (`stop` en `city-design.json`).
- `tramBlocks(x, z, margin)` (usado por `sidewalks.js`) indica si un punto cae sobre la franja
  (salvo en tramos `lane`) o a menos de `crossingClearance` de un cruce a nivel o paso peatonal:
  ahí no hay acera, bordillo ni faldón.

## Cielo, entorno y color

- `js/engine/sky.js`: cúpula con degradado y halo del sol (se dibuja primero, sin
  profundidad ni niebla), entorno horneado una sola vez con `PMREMGenerator` al arrancar
  (`gfx.skyBakeMs` guarda lo que tarda) y `scene.fogNode` con el color del entorno hacia el
  horizonte. `scene.fog` sigue en la escena porque la cámara y el descarte del modo ligero
  leen `scene.fog.far`; el nodo usa sus mismas distancias (`syncSkyFog()`).
- `js/engine/post.js`: gradación (exposición, contraste, saturación, sombras frías, luces
  cálidas) y viñeta, aplicadas en lineal antes del mapeo de tonos.
- Los valores están en `SKY` y `GRADE` y se cambian en vivo desde la consola con
  `(await import('./js/engine/sky.js')).setSky({ zenith: '#5588bb' })` y
  `(await import('./js/engine/post.js')).setGrade({ contrast: 1.2 })`. Para rehornear el
  entorno tras cambiar colores, `await bakeSkyEnvironment()`.
- Luz directa: `SUN` en `js/engine/renderer.js` (dirección hacia el sol, color e
  intensidad: sol de tarde, bajo y cálido); se cambia en vivo con `setSun({ intensity: 3 })`.
- `SKY.envZenithBlend` (`sky.js`) acerca el cenit al horizonte solo dentro del entorno
  horneado, para que las caras en sombra queden neutras y no azules sin cambiar la cúpula.
- `js/engine/time-of-day.js`: horas del día. `TIMES` (`manana`, `mediodia`, `tarde`,
  `anochecer`) fija `SUN`, `SKY`, el color de `scene.fog`, `GRADE` y el uniforme `night`
  (0 a 1); la tarde se toma de los valores iniciales de esos objetos, así que es la de
  siempre. `setTimeOfDay(id)` solo cambia uniformes y valores (ni materiales ni shaders
  nuevos) y rehornea el entorno una vez; el tiempo queda en `gfx.timeBakeMs`. Al arrancar
  se aplica antes del horneado inicial. Botón **Hora** (`#timeBtn`, junto a Cámara, Mapa y
  Pausa) que rota entre las horas y la guarda con la partida (`time` en `progress.js`);
  `#hora=manana|mediodia|tarde|anochecer` en la URL la fuerza para pruebas. En modo ligero
  funcionan igual (son valores, no pases).
- Noche: `skyUniforms.night` enciende la emisión de las ventanas (`WINDOWS.lit*` en
  `windows.js`: una fracción al azar con `windowHash`, las de persiana bajada no, y
  escaparates algo iluminados) y sube el emisivo de faros y pilotos de los coches
  (`registerNightLamp` en `sky.js`). No hay luces dinámicas nuevas.
- `js/engine/night-glow.js`: luz falsa de noche con tres `InstancedMesh` aditivas (opacidad =
  `night`, ocultas de día): mancha bajo cada farola, haz de faros delante de cada coche y
  brillo rojo tras los pilotos (`NIGHT_GLOW`, en vivo con `setNightGlow`). Los cristales de las
  farolas usan un material emisivo compartido registrado con `registerNightLamp`.
- `js/engine/wall-ao.js`: oclusión falsa de la luz ambiente en la base de muros y fachadas
  (`WALL_AO`: luz que queda al pie, altura a la que se recupera y diferencia entre plantas
  bajas y altas), con el atributo `hag` (altura sobre la base) de la geometría; en vivo con
  `setWallAO`. No afecta a la luz directa.
- `js/engine/contact-shadows.js`: sombras de contacto difuminadas bajo coches y personas, un
  material e instancias compartidos (`CONTACT_SHADOW`: opacidad, suavidad y tamaños); en vivo
  con `setContactShadows`. Se mantienen en modo ligero, que no tiene sombras del sol.
- Los shaders se compilan en la pantalla de carga (`js/engine/precompile.js`, «Compilando los
  shaders…»); las mallas instanciadas comparten shader con `shareInstanceShader`
  (`materials.js`). Una malla o material nuevo visible desde el inicio queda cubierto solo
  con estar en la escena antes de esa fase.
- Se dibuja siempre con `renderFrame()` (`renderer.js`), no con `renderer.render`.
- Con el renderizador simulado de las pruebas no hay entorno horneado ni gradación.

## Modo ligero

Se activa desde Pausa → «MODO MÓVIL LIGERO». Hoy hace lo siguiente:

- Fija la resolución de render a 1 píxel por píxel CSS (sin escalar por la densidad de
  pantalla).
- Acerca el final de la niebla para dibujar menos a lo lejos.
- Apaga la gradación de color y la viñeta (`RenderPipeline`), porque añaden un pase a
  pantalla completa; el cielo, el entorno horneado y la niebla del cielo se mantienen.
- Desactiva las sombras (mapa de sombras y proyección del sol, con recompilación).
- Anula el grano cercano del suelo mediante un uniforme, sin recompilar por este ajuste, y con
  él el suelo cercano de la ortofoto (copas limpias, sombras suavizadas y materiales propios; ver «Suelo cercano»).
  Si se arranca en ligero no se construyen sus texturas hasta pasar a normal.
- Oculta las celdas más allá del final de la niebla.
- Descarta el detalle de fachadas a 200 m y la vegetación a 300 m de la cámara;
  en vista aérea, el alcance es 380 m para ambos. Se suma el radio de la esfera
  envolvente de cada celda. Hay 10 m de histéresis: una celda visible se oculta al
  alcanzar `alcance + radio + 10`, y una oculta reaparece al bajar de
  `alcance + radio`. Al volver a calidad normal, todo este detalle vuelve a ser
  visible, sin descarte por distancia.
- En ligero o en un dispositivo táctil, carga las teselas de ortofoto `lo` (0,5 m/píxel),
  como mucho 9 en un radio de 220 m; en calidad normal sin pantalla táctil, las `hi`
  (0,25 m/píxel), hasta 12 en 300 m. Al cambiar la calidad durante la partida se
  sustituyen las teselas activas en el suelo y las cubiertas y se liberan las
  anteriores; la vista general sigue cargada.

La elección se guarda en el navegador (`chiclana-real-v2`) y nunca se activa sola.

Funciona en un móvil Android (comprobado a mano); su efecto en el rendimiento no se ha
medido en un móvil físico.

## Sustitutos de sombra

`web/js/world/shadow-proxies.js` (`buildShadowProxies`, tras `addSigns`) copia los proyectores
estáticos grandes (muros, tejados, fachadas, mobiliario, puentes) a geometría solo de
posición, un material por cara (`side`) y una malla por celda de 160 m, y sustituye las copas
de los árboles por un icosaedro de 20 triángulos que comparte las matrices de instancia. Los
sustitutos viven en la capa 1, que solo ve la cámara de sombra (`sun.shadow.camera.layers`);
las originales pasan a `castShadow = false`. Las facetas de fachada de menos de 0,02 m² (por
debajo del texel del mapa) no se copian. Quien añada un proyector estático nuevo debe incluir
su nombre en `STATIC` de ese módulo; si no, sigue proyectando él mismo.

## Medir en el navegador

Para medir el presupuesto de render, sirve `web/` y ejecuta:

```sh
node tools/scene-budget.mjs http://127.0.0.1:8080/ --out /tmp/chiclana-budget/base.json --shots /tmp/chiclana-budget/normal-a
node tools/scene-budget.mjs http://127.0.0.1:8080/ --out /tmp/chiclana-budget/base-low.json --low --shots /tmp/chiclana-budget/low-a
node tools/scene-budget.mjs http://127.0.0.1:8080/ --compare /tmp/chiclana-budget/base.json --shots /tmp/chiclana-budget/normal-b
uv run --no-project --with pillow --with numpy python tools/compare-shots.py /tmp/chiclana-budget/normal-a /tmp/chiclana-budget/normal-b
```

`scene-budget.mjs` requiere Node con WebSocket global y `google-chrome-stable`.
Abre Chrome sin interfaz con SwiftShader a 1280 × 720 y escala 1, inicia la partida y
mide Alameda (inicio), Mercado de Abastos, Plaza Mayor, Santa Ana y San Telmo en
seguimiento, primera persona y aérea, con el rumbo inicial. Inicia y pausa la sesión
en la misma tarea, antes de que avance la simulación; fija el tiempo de animación a
cero y coloca los marcadores del encargo inicial sin descubrir lugares ni entregar
encargos. Tráfico y peatones conservan su posición inicial. Ajusta la superficie del
jugador y coloca la cámara sin interpolación residual. Oculta la interfaz (HUD,
avisos y etiquetas) y renderiza a mano para medir y capturar. Espera 2,5 segundos,
recarga las teselas de ortofoto y espera otro segundo en cada vista. `--low` guarda
la calidad ligera antes de cargar y comprueba que se haya aplicado.

El JSON incluye llamadas de dibujo y triángulos por vista: `total` suma el pase
principal y el de sombras; `main` excluye sombras (`setSunShadows(false)`: sin pasada
de sombras). Con WebGPURenderer las llamadas salen de `info.render.drawCalls`; la
herramienta usa `info.autoReset = false` y `info.reset()` antes de cada medida, y
restaura las sombras y el reinicio automático al terminar. Espera dos fotogramas antes
de cada medida: la gradación solo vuelve a dibujar la escena una vez por tick del
renderizador, y dos dibujos seguidos medirían solo la pasada de salida. El JSON anota el motor
(`backend`: WebGPU o WebGL 2); comparar solo medidas del mismo motor. También registra una vez el inventario de
mallas, triángulos (multiplicados por las instancias), triángulos que proyectan
sombras (con el desglose por categoría en `shadowByCategory`: árboles, fachadas, muros,
tejados, mobiliario, puentes, actores), memoria del renderizador, programas, mallas de fachada, celdas y árboles.
`--compare` muestra las cifras anteriores y actuales y su diferencia porcentual;
no impone un umbral de presupuesto. Los errores de página hacen fallar la ejecución.
La espera de arranque tolera fallos de `Runtime.evaluate` durante la navegación
hasta el plazo de 90 segundos. Chrome y su perfil temporal se cierran y eliminan al
terminar, también ante errores.
El servidor se cierra por separado.

`compare-shots.py` compara los PNG con el mismo nombre, contando los píxeles cuya
diferencia máxima entre canales RGBA es mayor que 8 (escala 0–255), e imprime esa
proporción y la diferencia máxima. Sale con código 1 si alguna captura supera
`--limit` (por defecto 0,5 %); dimensiones distintas también fallan. Avisa de PNG
sin pareja y falla si no hay ninguno comparable. Repite las capturas sobre el mismo
árbol antes de un cambio para conocer el ruido y fijar el límite de comparación.

En G0 se recomienda el límite predeterminado de 0,5 % (o uno menor), sin ampliar
la tolerancia para cubrir una simulación en marcha. La revisión del 9/10/2026
dio **0 % de ruido y diferencia máxima de canal 0 en las 15 vistas de cada modo**
entre dos ejecuciones consecutivas por calidad; los informes JSON completos también
fueron idénticos entre repeticiones. La sesión congelada sustituye las referencias
anteriores, cuyo ruido cercano
al 1 % procedía de avisos, descubrimientos, entregas, marcadores animados y actores
en movimiento. Las nuevas capturas y cifras se guardan en
`/tmp/chiclana-budget-fixed/`; son artefactos temporales.

El cálculo de los pases no cambia, pero las referencias se miden ahora con los
actores en su posición inicial y el objetivo del primer encargo fijo en el Mercado
(en vez de avanzar a otro encargo). Esto cambia qué objetos entran en el frustum
principal y el de sombras. Al teletransportar se reinicia la referencia de superficie
y se elimina la interpolación residual de cámara; en Santa Ana también cambia el
encuadre. No se elimina geometría para reducir los recuentos: el inventario conserva
1618 mallas, 1686067 triángulos y 1216705 triángulos que proyectan sombras en ambos
modos. En ligero, las geometrías subidas al renderizador bajan de 675 a 667, pues los
actores quietos no llegan a hacer visibles las mismas geometrías durante el recorrido.

Frente a `base.json` y `base-low.json` anteriores, Alameda y Mercado en seguimiento
y primera persona conservan llamadas y triángulos. Ejemplos de cambios justificados
(llamadas total/principal; triángulos total/principal):

| Vista                    | Normal anterior → congelado                          | Ligero anterior → congelado                          |
| ------------------------ | ---------------------------------------------------- | ---------------------------------------------------- |
| Mercado, aérea           | 305/140 → 310/145; 859819/500143 → 860147/500471     | 140/140 → 145/145; 500143/500143 → 500471/500471     |
| Plaza Mayor, seguimiento | 756/656 → 741/665; 1275139/1196683 → 1270629/1197933 | 610/610 → 619/619; 1160458/1160458 → 1161708/1161708 |
| Santa Ana, seguimiento   | 509/423 → 511/433; 806162/721577 → 822336/738991     | 401/401 → 411/411; 700790/700790 → 718204/718204     |
| San Telmo, aérea         | 382/194 → 358/182; 1078294/677244 → 1072534/674364   | 194/194 → 182/182; 677244/677244 → 674364/674364     |

Estos recuentos y las capturas en SwiftShader no acreditan rendimiento de GPU,
FPS ni comportamiento en móvil físico. Para medir intervalos entre frames en el
dispositivo real, usa la herramienta siguiente.

`web/measure.js` se publica pero no se carga con el juego. Con el juego en marcha y sin
menús abiertos, en la consola:

```js
(await import('./measure.js')).measure({ label: 'normal' });
```

Registra durante unos segundos los intervalos entre frames (mediana, percentil 95) y el
identificador de la GPU que expone el navegador, y descarga un JSON. Sirve para comparar antes y después en el mismo navegador y equipo; no
sustituye a una prueba en móvil físico.

## Convenciones de código

- JavaScript de navegador `.js`; herramientas Node `.mjs`; Python `.py`. Archivos nuevos
  en kebab-case.
- camelCase para variables y funciones; PascalCase para clases.
- Prettier: dos espacios, comillas simples, punto y coma, 100 columnas. EditorConfig: UTF-8
  y LF; Python con cuatro espacios.
- Código nuevo en el módulo de su capa (ver «Módulos del juego»); un módulo nuevo solo si
  la responsabilidad no encaja en uno existente.
- Guías en `docs/` con nombres descriptivos en mayúsculas.

### Revisión de copas en `?debug`

«Revisar copas» abre la superposición local de candidatos PNOA. Carga los archivos
`source-data/tree-candidates.json` y `source-data/tree-review.json` con sus selectores:
no se publican ni se descargan como recursos del juego. Amarillo indica pendiente,
verde aceptado por rectángulo y rojo excluido por candidato. El botón del piloto
rellena su rectángulo para revisarlo; no acepta nada automáticamente. Las decisiones
se descargan y se copian al archivo de autor; procedimiento y validación en
[DATOS.md](DATOS.md#8-revisión-de-copas-g52-archivo-de-autor). La vegetación del juego
sigue igual hasta G5.3.

La capa opcional `vegetation.json` coloca las copas aceptadas de ortofoto; sin ella
se conserva el entorno anterior. `streetEnvironment.treeSources` cuenta por separado
capa, OSM, plaza y relleno de parques (cero con la capa); `treeBuildMs` mide la construcción completa de
árboles y arbustos con `performance.now()`. El presupuesto por vista incluye también
instancias, triángulos y lotes de vegetación visibles en el frustum principal.
Son medidas de CPU y recuentos, no FPS ni tiempo de GPU.

`scene-budget` imprime también, por vista, el desglose del pase principal por categoría y
por material (`breakdown` en el JSON: llamadas, triángulos y materiales por categoría, y los
25 materiales con más llamadas). Los coches se dibujan como instancias por ranura de material
(`js/game/car-batch.js`): cada coche conserva su `mesh` como ancla y `syncCarBatches` copia su
matriz a las instancias de los coches a la vista justo antes de dibujar.
