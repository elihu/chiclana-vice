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

## Cierre de la auditoría local

- Partidas dañadas recuperables, activación nativa del teclado en controles y colisiones
  con margen en celdas vecinas corregidas. Tráfico generado sobre tramos transitables.
- SP-4, SP-6, SP-8, SP-11 y S17: datos de juego compartidos, arnés temporal común,
  catálogo único, política de alturas común y pruebas por invariantes.
- Huella geográfica ampliada sin cambiar las capas publicadas. Conversión de sentidos
  OSM corregida para futuras reconstrucciones.
- Esta tanda pasa `npm run check`, las pruebas Python y la regeneración reproducible
  del catálogo. Chrome sin interfaz confirma arranque con partida inválida, inicio y
  pausa con Espacio y cierre con Escape, sin excepciones JavaScript. No acredita
  rendimiento en GPU, móvil físico o ejecución de CI.

## Pendientes

Los identificadores remiten a la auditoría del 6/10/2026.

- SP-5: revisar qué medidas de portadas y campanarios siguen en las recetas de
  iglesias; las naves ya usan los perfiles.
- Variables CSS por contexto para `#miniButton` (pendiente de comprobar `env()` en iOS).
- Recargar la ortofoto al cambiar de calidad en caliente; muros de `buildBuildings` aún
  en DoubleSide; `nearestRoad` crea objetos por tramo en cada frame.
- Verificación en móvil físico (iOS y Android), revisión visual de fachadas FrontSide y
  primera ejecución real de `ci.yml` en GitHub.

## Al terminar de integrar las ramas en curso

Tareas del integrador, en este orden y en `main`:

1. `npm run check`, push forzado de `main` (reescritura P2), publicar y, tras el despliegue, crear la etiqueta `v1.0.0` y su
   release ([GIT_WORKFLOW.md](GIT_WORKFLOW.md#etiquetas-y-releases)).
