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

## Modo ligero

Se activa desde Pausa → «MODO MÓVIL LIGERO». Hoy hace lo siguiente:

- Fija la resolución de render a 1 píxel por píxel CSS (sin escalar por la densidad de
  pantalla).
- Acerca el final de la niebla para dibujar menos a lo lejos.
- Desactiva las sombras (mapa de sombras y proyección del sol, con recompilación).
- Oculta las celdas más allá del final de la niebla.
- Al arrancar en ligero o en un dispositivo táctil, carga la ortofoto reducida
  `aerial-2048.jpg`; cambiar la calidad durante la partida no la recarga.

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
