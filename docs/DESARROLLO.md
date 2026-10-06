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

| Script                 | Qué hace                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| `npm run lint`         | ESLint sobre JavaScript propio (no Python ni CSS)                |
| `npm run format:check` | Prettier sobre JS, HTML, CSS, Markdown, YAML y configuración     |
| `npm run format`       | Aplica el formato                                                |
| `npm test`             | `tests/verify-world.mjs` (datos) y `tests/verify3d.mjs` (flujos) |
| `npm run check`        | Los tres anteriores; es lo que ejecuta la CI                     |

Los verificadores usan DOM y WebGL simulados: comprueban datos, misiones, colisiones,
controles táctiles simulados y cámaras, pero no el render en GPU, el rendimiento ni un
móvil físico. Si un cambio afecta a interfaz, cámara, render o controles, probarlo en un
navegador real y anotar qué no se ha verificado. El arnés común `tests/runtime-harness.mjs`, compartido por el verificador y el exportador
de frentes, crea y elimina su módulo temporal fuera del repositorio. Engancha el juego con
sustituciones de texto que fallan con un error claro si dejan de coincidir.

Prettier no formatea los datos (`web/*.json`, `source-data/`), las licencias ni
`web/vendor/`. Las versiones de las herramientas están fijadas en `package-lock.json`, que
se versiona. El juego no necesita `node_modules`.

## Estructura

| Ruta             | Contenido                                                          |
| ---------------- | ------------------------------------------------------------------ |
| `web/`           | Juego, capas de datos y recursos publicados en Pages               |
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
- Separar módulos ES nuevos por responsabilidad cuando el cambio lo requiera; no dividir
  el motor entero como parte de otra tarea.
- Guías en `docs/` con nombres descriptivos en mayúsculas.
