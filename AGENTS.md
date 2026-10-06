# Chiclana Vice — instrucciones para agentes

Juego web 3D estático sobre coordenadas reales del centro de Chiclana. JavaScript de
navegador sin frameworks ni compilación; Three.js r169 local en `web/vendor/`. GitHub
Pages publica `web/` tal cual. La documentación y los commits se escriben en español.

Antes de cambiar el juego, lee `docs/DESARROLLO.md` y `docs/ESTADO.md`. Si tocas datos o
fuentes, lee también `docs/MAP_SOURCES.md` y `docs/DATOS_PUBLICOS.md`. Antes de editar
algo en `tools/`, lee `tools/AGENTS.md`.

## Comandos

- Instalar herramientas: `npm ci --ignore-scripts`. En worktrees, `node_modules` puede ser
  un enlace simbólico a otra copia: no ejecutes `npm install`.
- Comprobar todo (lint, formato y verificadores): `npm run check`. Debe pasar antes del
  commit que cierra el trabajo y antes de integrar.
- Aplicar formato, incluido Markdown: `npm run format`.
- Servir el juego: `uv run --no-project python -m http.server 8080 --bind 127.0.0.1 --directory web`
- Python siempre con `uv run --no-project python`; dependencias con `--with paquete`.

## Límites

Siempre:

- Conserva coordenadas, contornos, patios, plantas, calles, capacidades del juego,
  controles táctiles y modo ligero.
- Agrupa geometría y materiales repetidos; piensa en móviles modestos.
- Los JSON de `web/` se generan con `tools/`; no los edites a mano (ver `tools/AGENTS.md`).
- Edita `LICENSE` y `THIRD_PARTY_NOTICES.md` en la raíz; las copias de `web/` se
  regeneran con `node tools/export-provenance.mjs`.
- Documenta fuentes y aproximaciones en `docs/MAP_SOURCES.md`. Las licencias y
  atribuciones solo se describen en `THIRD_PARTY_NOTICES.md`.
- Di qué has verificado y cómo. `tests/verify3d.mjs` usa DOM y WebGL simulados: no prueba
  GPU, rendimiento ni móvil.

Pregunta antes de:

- `git push`, publicar, crear etiquetas o releases, reescribir historial o forzar un push.
- Cambiar `.github/workflows/`, añadir dependencias o cambiar la versión de Three.js.
- Cambiar licencias o atribuciones, o borrar datos publicados.

Nunca:

- Introducir frameworks, bundlers ni un paso de compilación para el juego.
- Reformatear o editar `web/vendor/` y `web/licenses/`.
- Añadir originales de Catastro (ZIP/GML), rásteres LiDAR, fotografías de referencia,
  credenciales o tokens.
- Afirmar precisión fotogramétrica, validez catastral o verificación en móvil o GPU que
  no se haya hecho.
- Añadir trailers `Co-Authored-By` o líneas de atribución (tampoco de agentes de IA) en
  commits, mensajes de merge o pull requests.

## Estructura

- `web/`: sitio publicado y fuente editable (`game3d.js`, `style.css`, `index.html`, capas
  JSON, `arcade/`, `vendor/`, `licenses/`).
- `tools/`: conversores y generadores de datos (Node `.mjs`, Python `.py`).
- `tests/`: verificadores en Node de datos y flujos del juego.
- `source-data/`: catálogo y auditoría que usan los conversores; no se publica.
- `docs/`: guías; índice en `docs/README.md`.

## Git

- Una rama corta y un worktree por agente: `feat/…`, `fix/…`, `perf/…`, `docs/…`,
  `chore/…`, `ci/…`, `test/…`. Trabaja solo en tu worktree.
- Conventional Commits en español: `tipo(ámbito opcional): descripción en minúscula`.
- No hagas merge, rebase ni push salvo que te lo pidan. El flujo completo y la integración
  están en `docs/GIT_WORKFLOW.md`.
- No edites `docs/ESTADO.md` desde una rama salvo que tu tarea cierre o añada un
  pendiente; quien integra en `main` lo actualiza.
