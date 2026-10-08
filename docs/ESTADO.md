# Estado y pendientes

Revisión: 8/10/2026. Este archivo describe solo el estado actual; la historia está en Git
y en las releases. Se actualiza en `main` al integrar ramas.

## Estado

- Publicado en https://elihu.github.io/chiclana-vice/ desde `main` mediante GitHub
  Actions. Última release: `v1.1.0` (7/10/2026). La CI (`ci.yml`), el despliegue y
  Dependabot se ejecutan en GitHub sin errores.
- `npm run check` pasa en CPU con DOM y WebGL simulados. Chrome sin interfaz
  (SwiftShader) arranca sin errores en la raíz, bajo `/chiclana-vice/` y en la web publicada. El usuario lo ha
  probado el 7/10/2026 en Chrome de escritorio con GPU y en un móvil Android.
- No verificado: iOS y FPS medidos en un móvil físico.

## Decisiones vigentes

- **P1, riesgo asumido**: las figuras de la portada de Jesús Nazareno y la escala vertical
  del Ayuntamiento se mantienen. Se actuará si un titular lo reclama, según
  [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md#reclamaciones-y-retirada).
- **P3**: `web/frontages.json` es ODbL 1.0 en conjunto y `osm-world.json` es la única
  descarga ODbL de las vías.
- **Mercado**: la fachada se mantiene como aproximación de cuatro esquinas
  ([MAP_SOURCES.md](MAP_SOURCES.md#fachadas-y-monumentos)); el reanclaje a las aristas
  catastrales queda descartado por ahora.
- **Muros en DoubleSide**: la orientación de los contornos es correcta, pero con
  FrontSide se vería a través de los edificios con la cámara pegada a un muro o en
  pantallas de proporción 2,4 o más. Cambiarlo exigiría rehacer las colisiones de la
  cámara.

## Novedades de `v1.1.0`

- **Juego en módulos ES** bajo `web/js/`, sin cambios de escena ni de comportamiento
  ([DESARROLLO.md](DESARROLLO.md#módulos-del-juego)).
- **Diseño desde datos**: fachadas, reglas de calle y correcciones del mapa en
  `facade-designs.json`, `city-design.json` y `map-corrections.json`, con un modo
  `?debug` para editarlos ([DATOS.md](DATOS.md#diseños-y-correcciones-a-mano)). La escena
  es idéntica a la anterior.
- **Interfaz de terreno** plano (`world.terrain`), todavía sin usar
  ([DESARROLLO.md](DESARROLLO.md#terreno)).
- **Correcciones**: al bajar del coche ya no se puede aparecer dentro de un patio
  cerrado (había 11 casos); los muros de los patios tienen margen de colisión, también
  para la cámara; la ortofoto se recarga al cambiar de calidad en caliente; `nearestRoad`
  no crea objetos por tramo en cada frame.

## Relieve del terreno

Integrado en `main` local desde `feat/relieve-terreno`, `fix/relieve-datos`,
`fix/superficies-terreno` y `chore/validar-relieve`, sin publicar. **Validado para el
juego el 8/10/2026** tras la revisión visual del usuario, que lo considera realista con
pequeños defectos visuales. La capa (`web/terrain.json` y `web/terrain.bin`) está en Git
y activa por defecto; un push la publica. Sin esos dos archivos se vuelve al modo plano.

Implementados la carga, malla, bases, pavimentos, actores, cámaras e inspector, con
superficies y niveles declarados en diseño. La auditoría del 8/10/2026 dejó las uniones
entre vías sin saltos (límite de 5 cm en `npm run check`) y un único modelo de puentes.
También permitió varias plataformas por vía y láminas de agua por polígono, y redujo
el coste de construcción y de consultas por frame.

Es una validación de juego, no topográfica: referencia vertical y fecha de adquisición
del MDT sin confirmar. Siguen como límites documentados los tableros horizontales y el
eje de agua común.

Auditoría y reproducción: [TERRENO_PILOTO.md](TERRENO_PILOTO.md). Contrato genérico
y evidencia: [SUPERFICIES_TERRENO.md](SUPERFICIES_TERRENO.md). Plan original:
[PLAN-TERRENO.md](PLAN-TERRENO.md).

## Pendientes

- Relieve: localizar y corregir los pequeños defectos visuales señalados en la revisión
  del 8/10/2026; zócalos y accesos de edificios en pendiente (`baseY` máximo); probarlo
  en un móvil físico (las comprobaciones con SwiftShader no acreditan GPU).

- Variables CSS por contexto para `#miniButton` (pendiente de comprobar `env()` en iOS).
- Verificación en iOS y revisión visual de las fachadas en FrontSide.
