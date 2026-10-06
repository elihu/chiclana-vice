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
  elimina; `osm-world.json` es la única descarga ODbL de las vías. TODO(integración):
  pendiente de aplicar en los datos.

## Pendientes

Los identificadores remiten a la auditoría del 6/10/2026.

- Ramas en curso: rendimiento y draw calls, juego en móvil y accesibilidad, datos y
  pruebas. TODO(integración): actualizar esta lista al integrarlas.
- Modo ligero completo (F1, F9) y documentación final del modo ligero.
- Una sola fuente para objetos de calle (SP-1) y para el catálogo de frentes (SP-8).
- Atribución reproducible de las alturas IGN (N1) y huella geométrica fija (N2).
- Metadatos desfasados de `web/world.json` (N8) y textos fijos de la ayuda del juego.
- Verificación en móvil físico (iOS y Android) y medición en GPU real con `measure.js`.
