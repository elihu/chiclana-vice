# Estado y pendientes

Revisión: 9/10/2026. Este archivo describe solo el estado actual; la historia está en Git
y en las releases. Se actualiza en `main` al integrar ramas.

## Estado

- Publicado en https://elihu.github.io/chiclana-vice/ desde `main` mediante GitHub
  Actions. Última release: `v1.3.0` (9/10/2026). La CI (`ci.yml`), el despliegue y
  Dependabot se ejecutan en GitHub sin errores.
- `npm run check` pasa en CPU con DOM y WebGL simulados. Chrome sin interfaz
  (SwiftShader) arranca sin errores en la raíz, bajo `/chiclana-vice/` y en la web publicada. El usuario probó
  la `v1.1.0` el 7/10/2026 en Chrome de escritorio con GPU y en un móvil Android, y el
  relieve de la `v1.2.0` el 8/10/2026 en el navegador de escritorio; la ampliación y los
  modelos de la `v1.3.0`, el 8 y el 9/10/2026 en el navegador de escritorio.
- No verificado: iOS, FPS medidos en un móvil físico, y el relieve y la ortofoto por
  teselas en móvil.

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

## Novedades de `v1.3.0`

- **Mapa ampliado** a Santa Ana y al norte (Puente VII Centenario y ferial), con los
  límites del mundo como lista de rectángulos ([PLAN-AMPLIACION.md](PLAN-AMPLIACION.md)).
- **Ortofoto por teselas** PNOA 2022-07 a 0,25 m alrededor del jugador (0,5 m en modo
  ligero y táctil), con una vista general de respaldo.
- **Relieve** desde la rejilla nativa del MDT por teselas: ampliar el mapa ya no cambia
  las cotas existentes.
- **Monumentos** descritos en `facade-designs.json`: Ermita de la Veracruz, Iglesia Mayor
  rehecha con su cúpula, Ermita de Santa Ana y Puente VII Centenario; la portada de Jesús
  Nazareno mira ya a su plaza.
- **Juego**: Santa Ana y el puente como lugares y miradores, y el encargo «La subida a
  Santa Ana».
- **Datos**: variación de edificios precalculada por parte y 44 vías con el sentido único
  de OSM.

## Relieve del terreno

Publicado en la `v1.2.0`. **Validado para el juego el 8/10/2026** tras la revisión
visual del usuario, que lo considera realista con pequeños defectos visuales. La capa
(`web/terrain.json` y `web/terrain.bin`) está en Git y activa por defecto. Sin esos dos archivos se vuelve al modo plano.

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

- Ampliación ([PLAN-AMPLIACION.md](PLAN-AMPLIACION.md)): fases 0–5 publicadas en la
  `v1.3.0`. Falta probar la ortofoto por teselas en un móvil Android. Veracruz: el patio
  delante de la puerta queda unos 6,5 m sobre la calle (en la realidad, algo elevado y
  con la verja casi a pie de calle), porque la parte catastral 4909 incluye el patio y la
  ermita se apoya en la cota máxima; el usuario no quiere recortar el dato catastral ni
  añadir código para este caso y se revisará más adelante. El podio de la Iglesia Mayor
  no tiene colisión. Revisar en el navegador la flecha y el color de los arcos del
  Puente VII Centenario; el ferial solo si el usuario lo pide.
- Relieve: localizar y corregir los pequeños defectos visuales señalados en la revisión
  del 8/10/2026; zócalos y accesos de edificios en pendiente (`baseY` máximo); probarlo
  en un móvil físico (las comprobaciones con SwiftShader no acreditan GPU).
- Mejora gráfica y presupuesto de render: plan en
  [PLAN-MEJORA-GRAFICA.md](PLAN-MEJORA-GRAFICA.md), sin empezar. Con la fase 5 integrada,
  pueden empezar todas sus fases. Referencia del 9/10/2026 en la Plaza Mayor: 753 llamadas por frame (653 sin
  sombras), el 40 % en fachadas detalladas; el modo ligero solo las reduce un 7 %.

- Variables CSS por contexto para `#miniButton` (pendiente de comprobar `env()` en iOS).
- Verificación en iOS y revisión visual de las fachadas en FrontSide.
