# tools/ — conversores y generadores de datos

Complementa el `AGENTS.md` de la raíz. Procedimiento detallado y comandos con argumentos
en `docs/DATOS_PUBLICOS.md`.

- Los scripts escriben en `web/` y `source-data/`. Revisa `git diff --stat` después de
  ejecutarlos y no confirmes cambios de datos que la tarea no pida.
- Orden obligatorio tras cambiar datos: generador (`rebuild-map.py`, `prepare-world.mjs`,
  `audit-ign-heights.py` o `export-facades.mjs`), después `node tools/export-provenance.mjs`
  y al final `npm test`. Sin `export-provenance`, los checksums y las copias de `web/`
  quedan desfasados y `tests/verify-world.mjs` falla.
- Las descargas originales (Catastro, OSM, recortes IGN) van a una caché fuera del
  repositorio, por ejemplo `/tmp/chiclana-ign`. Nunca a Git.
- Python: `uv run --no-project --with pyproj --with shapely python tools/…`; cuatro
  espacios en código nuevo. No reformatees en bloque los scripts existentes.
- Node: módulos ES `.mjs`, sin dependencias de ejecución nuevas.
- Conserva en las salidas los campos de atribución y licencia (`attribution`, `license`,
  `sourceUrls`). TODO(integración): `audit-ign-heights.py` aún no genera `attribution`
  (auditoría N1); si lo ejecutas antes de que se corrija, restaura el campo y avisa.
