# Estado y pendientes

Revisión: 7/10/2026. Este archivo describe solo el estado actual; la historia está en Git
y en las releases. Se actualiza en `main` al integrar ramas.

## Estado

- Publicado en https://elihu.github.io/chiclana-vice/ desde `main` mediante GitHub
  Actions.
- `npm run check` pasa en CPU con DOM y WebGL simulados. Comprobado en Chrome de
  escritorio con GPU, incluida una copia servida bajo `/chiclana-vice/` como en Pages.
- No verificado: iOS, FPS estable conduciendo y la primera ejecución en GitHub
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

Integrado en `main` local desde `fix/auditoria-y-pendientes`. Pendiente de revisión
visual del usuario y publicación.

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

Las medidas de las portadas, los campanarios y las naves de iglesia están en
`web/facade-designs.json` (recetas editables sin tocar el código), con lo que se cierra
el pendiente SP-5 de la auditoría.

## Plan modular (fases 0 a 3)

Integrado en `main` local, sin publicar: juego en módulos ES (`refactor/modulos`),
diseño desde datos (`feat/diseno-datos`) e interfaz de terreno plano
(`refactor/terreno-interfaz`). Las fachadas, las reglas de calle y las correcciones del
mapa están en `web/facade-designs.json`, `web/city-design.json` y
`web/map-corrections.json`; el modo `?debug` ayuda a editarlos
([DATOS.md](DATOS.md#diseños-y-correcciones-a-mano)). `world.terrain` existe pero ningún
constructor lo usa ([DESARROLLO.md](DESARROLLO.md#terreno)).

- La huella de escena, rutas y comportamiento es idéntica a la fase 1; solo se añaden las
  descargas de `facade-designs.json`, `city-design.json` y `map-corrections.json`.
- Chrome sin interfaz (SwiftShader), en raíz y bajo `/chiclana-vice/`: arranque sin
  errores, 1421 mallas y 917 276 triángulos como antes. Una corrección válida se aplica y
  una con guarda falsa detiene la carga con «Corrección fix-001 no aplicable».
- El usuario revisó el 7/10/2026 la fase 2 en Chrome de escritorio con GPU (comparación
  visual, fluidez, modo ligero, `?debug` y correcciones) y en un móvil Android por la red
  local (controles táctiles, modo ligero y `?debug`), sin incidencias. No se ha probado
  en iOS.
- Mercado: la fachada sigue el anillo simplificado de 4 esquinas; una está a 6,1 m del
  vértice catastral más cercano del edificio 2615. Se mantiene como aproximación
  (`status: "approximate"`); el reanclaje a las aristas catastrales queda descartado por
  ahora.

## Pendientes

Los identificadores remiten a la auditoría del 6/10/2026.

- Variables CSS por contexto para `#miniButton` (pendiente de comprobar `env()` en iOS).
- Recargar la ortofoto al cambiar de calidad en caliente; muros de `buildBuildings` aún
  en DoubleSide; `nearestRoad` crea objetos por tramo en cada frame.
- Verificación en iOS, revisión visual de fachadas FrontSide y primera ejecución real de
  `ci.yml` en GitHub.
- Repaso de toda la documentación contra el código antes del push y la release.

## Al terminar de integrar las ramas en curso

Tareas del integrador, en este orden y en `main`:

1. `npm run check`, push forzado de `main` (reescritura P2), publicar y, tras el despliegue, crear la etiqueta `v1.0.0` y su
   release ([GIT_WORKFLOW.md](GIT_WORKFLOW.md#etiquetas-y-releases)).
