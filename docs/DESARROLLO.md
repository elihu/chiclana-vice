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

Para reproducir las rutas de GitHub Pages, servir una carpeta que contenga `web/` con el
nombre `chiclana-vice/` y abrir http://localhost:8080/chiclana-vice/.

## Comprobar

```fish
npm ci --ignore-scripts
npm run check
```

| Script                 | Qué hace                                                          |
| ---------------------- | ----------------------------------------------------------------- |
| `npm run lint`         | ESLint sobre JavaScript propio (no Python ni CSS)                 |
| `npm run format:check` | Prettier sobre JS, HTML, CSS, Markdown, YAML y configuración      |
| `npm run format`       | Aplica el formato                                                 |
| `npm test`             | `verify-world.mjs` (datos), `verify-modules.mjs` y `verify3d.mjs` |
| `npm run check`        | Los tres anteriores; es lo que ejecuta la CI                      |

Los verificadores usan DOM y WebGL simulados: comprueban datos, misiones, colisiones,
controles táctiles simulados y cámaras, pero no el render en GPU, el rendimiento ni un
móvil físico. Si un cambio afecta a interfaz, cámara, render o controles, probarlo en un
navegador real y anotar qué no se ha verificado. El arnés común `tests/runtime-harness.mjs`, compartido por el verificador y el exportador
de frentes, crea los globales simulados e importa el juego con `import()`; no modifica su
texto. El juego expone su API de pruebas a través de `startGame()`.

Para refactorizaciones sin cambios visibles hay dos herramientas aparte, que no forman parte
de `npm test`. `node tools/scene-fingerprint.mjs --out base.json` guarda una huella de la
escena (objetos, materiales, geometría por bytes, rutas, recursos pedidos y 600 pasos de
simulación en CPU) y `--compare base.json` la contrasta con la del árbol actual.
`node tools/browser-smoke.mjs URL` abre el juego en Chrome sin interfaz (SwiftShader), recoge
errores y cuenta mallas y triángulos. Se comparan en la misma máquina y con la misma versión
de Node, y no acreditan GPU, rendimiento ni móvil.

Prettier no formatea los datos (`web/*.json`, `source-data/`), las licencias ni
`web/vendor/`. Las versiones de las herramientas están fijadas en `package-lock.json`, que
se versiona. El juego no necesita `node_modules`.

## Estructura

| Ruta             | Contenido                                                          |
| ---------------- | ------------------------------------------------------------------ |
| `web/`           | Juego, capas de datos y recursos publicados en Pages               |
| `web/game3d.js`  | Entrada del juego: lee `?v=` y llama a `startGame()`               |
| `web/js/`        | Módulos ES del juego, por capas (ver «Módulos del juego»)          |
| `web/arcade/`    | Versión arcade anterior, independiente                             |
| `web/vendor/`    | Three.js r169 y su licencia; no se reformatea                      |
| `web/licenses/`  | Textos completos de licencias de datos                             |
| `web/measure.js` | Medición opcional en el navegador; el juego no la importa          |
| `tools/`         | Conversores y generadores de datos (ver `tools/AGENTS.md`)         |
| `tests/`         | Verificadores en Node                                              |
| `source-data/`   | Catálogo de frentes y auditoría IGN que usan los conversores       |
| `docs/`          | Guías                                                              |
| `.github/`       | CI, despliegue en Pages y Dependabot                               |
| `.agents/`       | Habilidades compartidas por agentes (`.claude/skills/` las enlaza) |

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

Dependencias en un solo sentido: `core` ← `engine` ← `world` ← `game` ← `ui` ← `app`. Dos
excepciones: `ui/feedback.js` (avisos y barra de carga), que solo depende de `core` y
puede importarse desde cualquier capa, y `ui/hud.js` (`updateHUD`, `updateHudReadouts`),
que importan `game/missions`, `player`, `police` y `update` para refrescar el marcador. `tests/verify-modules.mjs` falla si aparece un
ciclo.

- **Fachadas desde datos**: las fachadas detalladas (Ayuntamiento, Mercado, naves y
  portadas de iglesia, frentes genéricos de calle) son recetas de `web/facade-designs.json`
  que ejecuta `world/facade-composer.js` con las piezas de `world/facade-kit.js`
  (`engine/expr.js` evalúa las expresiones). `web/city-design.json` fija qué calles y zonas
  reciben frentes y con qué receta. `world/design-validate.js` valida ambos al cargar y en
  `tests/verify-world.mjs`; el formato está en `docs/plan-modular/KIT-FACHADAS.md`.
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

## Modo de depuración (`?debug`)

Con `?debug` en la URL (también en la web publicada) `startGame` importa
`js/debug/inspector.js`; sin él, el módulo ni se pide y el juego no cambia. Un toque corto
sobre el lienzo (menos de 6 px y 350 ms, así que el arrastre de cámara no lo activa) abre un
panel con las coordenadas locales del punto (rayo contra edificios y fachadas, o el plano
`y = 0`), el edificio, el frente `building-<i>-edge-<e>` (con indicación de si está en
`frontages.json`), la vía OSM más cercana (`id`, aparición, nombre y vértice), el objeto de
calle a menos de 3 m, el monumento que lo contiene y la posición y el rumbo del jugador.
«Copiar anclaje» y «Copiar corrección» ponen el fragmento JSON en el portapapeles
(también queda en un cuadro de texto, porque el portapapeles exige un contexto seguro: HTTPS
o `localhost`). El procedimiento de edición está en [DATOS.md](DATOS.md#diseños-y-correcciones-a-mano).
No se ha probado en un móvil físico.

## Terreno

El suelo es plano. `web/js/world/terrain.js` define `flatTerrain` (`heightAt() → 0`) y
`heightAt(terrain, x, z)`; `init` lo asigna en `world.terrain`, pero ningún constructor lo
llama todavía. La capa de alturas real entrará como capa opcional con el mismo patrón que
`height-samples.json` (sin ella, terreno plano) y la física seguirá en planta; el diseño
está en [plan-modular/TERRENO.md](plan-modular/TERRENO.md). Supuestos de suelo plano en el
código:

| Módulo destino                                         | Función                                                                            | Supuesto actual                                                                                                                      | Con terreno                                                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `engine/renderer.js`                                   | `addGroundPlanes`                                                                  | Suelo: `PlaneGeometry` horizontal en `y = 0`; exterior en `y = -0,1`                                                                 | Malla de terreno con la ortofoto; el plano exterior, en la cota del borde                                                            |
| `world/buildings.js`                                   | `buildBuildings`                                                                   | Muros de `y = 0,02` a `h`; cubierta en `h + 0,02`, todo absoluto                                                                     | Cota base por parte (`b.baseY`, p. ej. mínimo del terreno en el contorno); muros de `baseY` a `baseY + h`                            |
| `world/facade-kit.js`, `world/facade-composer.js`      | `wall` (kit), recetas `nave` y `cupula-san-juan-bautista` de `facade-designs.json` | Grupo del muro en `y = 0`; cubierta de nave en `h`; la cúpula usa un anclaje `world` absoluto en `y = 14,3`                          | Grupo en la cota de `a` (o media del frente); cúpula relativa a la base                                                              |
| `world/streets.js`, `city-design.json`                 | `buildStreetSurfaces`, `buildRoadDetails` (alturas en `pavements.layerHeights`)    | Calzada 0,028, piedra 0,05, losas 0,036, línea 0,065, pasos 0,082, agua 0,025, puente 0,02 y barandilla 1                            | Desfase sobre el terreno en cada vértice; tiras de calzada subdivididas para seguir la pendiente                                     |
| `engine/materials.js`                                  | `flatGeometry`, `flatPolygon`                                                      | Polígonos horizontales                                                                                                               | Polígonos drapeados (triangulación con cota por vértice)                                                                             |
| `world/furniture.js`                                   | grupos de mobiliario                                                               | Grupo en `y = 0`                                                                                                                     | `heightAt(x, z)` en el punto de colocación                                                                                           |
| `world/vegetation.js`                                  | `buildTrees`                                                                       | Tronco en `h / 2`, copas en `h + …`, arbustos en 0,42                                                                                | Sumar `heightAt(x, z)` a cada instancia                                                                                              |
| `world/signs.js`                                       | `addSigns`                                                                         | Placas a 2,45 m, postes a 1,4 m                                                                                                      | Sumar la cota del poste                                                                                                              |
| `game/update.js`, `game/police.js`, `app.js` (`frame`) | posicionado de vehículos                                                           | `c.mesh.position.set(c.x, 0, c.z)`                                                                                                   | `heightAt(c.x, c.z)`; opcionalmente cabeceo por pendiente                                                                            |
| `game/player.js`                                       | `updatePlayer`                                                                     | Personaje en `y = 0`; física 2D (x, z)                                                                                               | La física sigue en 2D; la cota solo se aplica al dibujar                                                                             |
| `game/traffic.js`                                      | `updatePedestrians`                                                                | Peatones en `y = 0`                                                                                                                  | `heightAt`                                                                                                                           |
| `game/missions.js`                                     | `updateMarkers`                                                                    | Anillo 0,16, haz 2, flecha 6                                                                                                         | Relativos a `heightAt(goal)`                                                                                                         |
| `engine/camera.js`                                     | `updateCamera`                                                                     | Alturas de cámara absolutas (4,7, 3,2, 45), ojo 1,2 / 1,61, objetivo 1,1, vista aérea mirando a `y = 0`; sol con objetivo en `y = 0` | Relativas a la cota del jugador                                                                                                      |
| `engine/camera.js`                                     | `cameraSweep`                                                                      | Compara la altura del rayo con `renderH` (altura absoluta = sobre `y = 0`)                                                           | Comparar con `baseY + renderH`                                                                                                       |
| `app.js`                                               | `frame` (bienvenida)                                                               | Cámara de presentación a 22 m mirando a `y = 0`                                                                                      | Relativa a la cota del jugador                                                                                                       |
| `ui/hud.js`                                            | `drawLabels`                                                                       | Etiquetas a 14 m y marcador a 2 m                                                                                                    | Relativas a la cota del lugar                                                                                                        |
| `debug/inspector.js`                                   | `pickPoint` (`?debug`)                                                             | Si el rayo no toca edificios ni fachadas, corta el plano `y = 0`                                                                     | Cortar contra la malla de terreno o iterar con `heightAt`                                                                            |
| `world/spatial.js`                                     | `inBuilding`, `blocked`, `safePoint`                                               | 2D, sin cota                                                                                                                         | Sin cambios (la colisión sigue en planta)                                                                                            |
| `world/loader.js`                                      | `loadWorld`, `applyHeightSamples`                                                  | `world.json` declara «Terreno: plano»; alturas IGN normalizadas al terreno (MDSn)                                                    | Nueva capa opcional (p. ej. `terrain.json`) cargada como `height-samples.json`; las alturas de edificio siguen siendo sobre el suelo |
| `ui/map.js`                                            | mapa 2D                                                                            | Planta                                                                                                                               | Sin cambios                                                                                                                          |

## Modo ligero

Se activa desde Pausa → «MODO MÓVIL LIGERO». Hoy hace lo siguiente:

- Fija la resolución de render a 1 píxel por píxel CSS (sin escalar por la densidad de
  pantalla).
- Acerca el final de la niebla para dibujar menos a lo lejos.
- Desactiva las sombras (mapa de sombras y proyección del sol, con recompilación).
- Oculta las celdas más allá del final de la niebla.
- Al arrancar en ligero o en un dispositivo táctil, carga la ortofoto reducida
  `aerial-2048.jpg`. Al cambiar la calidad durante la partida se carga la que toca (la
  completa solo en calidad normal sin pantalla táctil), se sustituye en el suelo y las
  cubiertas y se libera la anterior.

La elección se guarda en el navegador (`chiclana-real-v2`) y nunca se activa sola.

No se ha medido todavía su efecto en un móvil físico.

## Medir en el navegador

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
