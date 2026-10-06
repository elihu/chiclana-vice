# Estado y pendientes

Revisión: 6/10/2026. Este archivo describe solo el estado actual; la historia está en Git
y en las releases. Se actualiza en `main` al integrar ramas.

## Estado

- Publicado en https://elihu.github.io/chiclana-vice/ desde `main` mediante GitHub
  Actions.
- `npm run check` pasa en CPU con DOM y WebGL simulados. Comprobado en Chrome de
  escritorio con GPU, incluida una copia servida bajo `/chiclana-vice/` como en Pages.
- No verificado: móvil físico, FPS estable conduciendo y la primera ejecución en GitHub
  del workflow `ci.yml`.

## Decisiones vigentes

- **P1, riesgo asumido**: las figuras de la portada de Jesús Nazareno y la escala vertical
  del Ayuntamiento se mantienen. Se actuará si un titular lo reclama, según
  [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md#reclamaciones-y-retirada).
- **P2**: historial local reescrito sin «Gerion Dev Team»; el push forzado a `origin` lo
  decidirá el usuario ([GIT_WORKFLOW.md](GIT_WORKFLOW.md#reescritura-de-historial)).
- **P3**: `web/frontages.json` pasa a ODbL 1.0 en conjunto y `web/roads-osm.json` se
  elimina; `osm-world.json` es la única descarga ODbL de las vías. Aplicado.

## Pendientes

Los identificadores remiten a la auditoría del 6/10/2026.

- Una sola copia del catálogo de frentes (SP-8: `source-data/facade-catalog.json` y
  `web/frontages.json` son idénticos).
- Arnés de pruebas común sin escribir `tests/qa3d-runtime.mjs` y pruebas por invariantes
  en lugar de recuentos fijos (SP-6, S17).
- Constantes, lugares y miradores en un solo sitio (SP-4) y parámetros de iglesias en
  `facade-profiles.json` (SP-5); criterio de alturas en un único sitio (SP-11).
- Variables CSS por contexto para `#miniButton` (pendiente de comprobar `env()` en iOS).
- Recargar la ortofoto al cambiar de calidad en caliente; muros de `buildBuildings` aún
  en DoubleSide; `nearestRoad` crea objetos por tramo en cada frame.
- Verificación en móvil físico (iOS y Android), revisión visual de fachadas FrontSide y
  primera ejecución real de `ci.yml` en GitHub.

## Al terminar de integrar las ramas en curso

Tareas del integrador, en este orden y en `main`:

1. `npm run check`, push forzado de `main` (reescritura P2), publicar y, tras el despliegue, crear la etiqueta `v1.0.0` y su
   release ([GIT_WORKFLOW.md](GIT_WORKFLOW.md#etiquetas-y-releases)).
