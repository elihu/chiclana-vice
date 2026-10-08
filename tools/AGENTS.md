# tools/ — conversores y generadores de datos

Complementa el `AGENTS.md` de la raíz. Procedimiento detallado y comandos con argumentos
en `docs/DATOS.md`.

- Excepción: `web/facade-designs.json`, `web/city-design.json` y `web/map-corrections.json`
  son archivos de diseño de autor que se editan a mano (sus esquemas, en `schemas/`, son
  documentación para el editor). Tras editarlos: `node tests/verify-design.mjs`,
  `node tools/export-provenance.mjs` y `npm test`. Si una corrección mueve un vértice de un
  edificio, regenera además `web/frontages.json` con `node tools/export-facades.mjs`.
- Los scripts escriben en `web/` y `source-data/`. Revisa `git diff --stat` después de
  ejecutarlos y no confirmes cambios de datos que la tarea no pida.
- Orden obligatorio tras cambiar datos: generador (`rebuild-map.py`, `prepare-world.mjs`,
  `audit-ign-heights.py` o `export-facades.mjs`), después `node tools/export-provenance.mjs`
  y al final `npm test`. Sin `export-provenance`, los checksums y las copias de `web/`
  quedan desfasados y `tests/verify-world.mjs` falla.
- Las descargas originales (Catastro, OSM, recortes IGN, ortofotos) van a la caché
  persistente `~/.cache/chiclana-vice/`, con una subcarpeta por fuente (`ign/`, `mdt/`,
  `pnoa/`…), nunca a Git ni a `/tmp`, que se borra al reiniciar. Los resultados
  intermedios y las huellas de revisión sí pueden ir a `/tmp`.
- Python: `uv run --no-project --with pyproj --with shapely python tools/…`; cuatro
  espacios en código nuevo. No reformatees en bloque los scripts existentes.
- Node: módulos ES `.mjs`, sin dependencias de ejecución nuevas.
- Conserva en las salidas los campos de atribución y licencia (`attribution`, `license`,
  `sourceUrls`).
