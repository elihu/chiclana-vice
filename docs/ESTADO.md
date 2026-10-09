# Estado y pendientes

Revisión: 9/10/2026. Este archivo describe solo el estado actual; la historia está en Git
y en las releases. Se actualiza en `main` al integrar ramas.

## Estado

- Publicado en https://elihu.github.io/chiclana-vice/ desde `main` mediante GitHub
  Actions. Última release: `v1.2.0` (8/10/2026). La CI (`ci.yml`), el despliegue y
  Dependabot se ejecutan en GitHub sin errores.
- `npm run check` pasa en CPU con DOM y WebGL simulados. Chrome sin interfaz
  (SwiftShader) arranca sin errores en la raíz, bajo `/chiclana-vice/` y en la web publicada. El usuario probó
  la `v1.1.0` el 7/10/2026 en Chrome de escritorio con GPU y en un móvil Android, y el
  relieve de la `v1.2.0` el 8/10/2026 en el navegador de escritorio.
- No verificado: iOS, FPS medidos en un móvil físico y el relieve en móvil.

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

## Novedades de `v1.2.0`

- **Relieve real del terreno** a partir del MDT de 5 m del IGN, remuestreado a unos
  10 m: calles, edificios, vegetación, mobiliario, vehículos, peatones, cámaras y
  marcadores siguen las cuestas ([TERRENO_PILOTO.md](TERRENO_PILOTO.md)).
- **Plataformas con paso inferior** (Gran Plaza sobre el Iro y tablero de Remedios
  sobre San Sebastián), lámina de agua por tramos y estanque de la Alameda, declarados
  en `city-design.json` ([SUPERFICIES_TERRENO.md](SUPERFICIES_TERRENO.md)).
- **Créditos** con la atribución del MDT del IGN.

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

- Ampliación del mapa y ortofoto por teselas: plan en
  [PLAN-AMPLIACION.md](PLAN-AMPLIACION.md). Fase 0 integrada el 8/10/2026 (rejilla del
  relieve anclada al origen, revisada por el usuario, y rampas de acceso a plataformas
  sin escalones) y fase 1 el 8/10/2026 (límites del mundo como lista de rectángulos en
  `world.json`, con márgenes medidos sobre la unión; escena idéntica). Fase 2 integrada
  el 8/10/2026: 24 teselas PNOA 2022-07 en `web/aerial/` (12 MB). Fase 3 integrada el
  8/10/2026: el suelo y los tejados cargan teselas a 0,25 m (0,5 m en ligero y táctil)
  alrededor del jugador, con la vista general de respaldo; retirada la ortofoto única.
  Revisada por el usuario en escritorio; **falta probarla en un móvil Android**. Fase 4
  integrada el 9/10/2026: anexos de Santa Ana y del norte (Puente VII Centenario y
  ferial), capas reconstruidas desde los originales (44 vías ganan el sentido único de
  OSM), relieve desde la rejilla nativa del MDT por teselas (ampliar ya no cambia las
  cotas existentes) validado por el usuario, Puente VII Centenario modelado con sus dos
  arcos y Santa Ana como lugar, mirador y encargo. Fase 5: paso 5.0 integrado (monumentos desde
  los datos), junto con la variación de edificios precalculada por parte fuera del
  navegador; huellas con relieve y sin él idénticas, paleta, vegetación y actores
  conservados. Paso 5.1 detenido al comprobar que el contorno OSM de Veracruz incluye
  el atrio: hay que separar la planta visual de la nave de ese contorno antes de usar
  la portada retranqueada; conservar el contorno y la colisión catastral. Siguen
  pendientes los modelos de Veracruz, Santa Ana e Iglesia Mayor. Sin publicar: `?v=` se sube al sacar la
  versión.
- Relieve: localizar y corregir los pequeños defectos visuales señalados en la revisión
  del 8/10/2026; zócalos y accesos de edificios en pendiente (`baseY` máximo); probarlo
  en un móvil físico (las comprobaciones con SwiftShader no acreditan GPU).
- Mejora gráfica y presupuesto de render: plan en
  [PLAN-MEJORA-GRAFICA.md](PLAN-MEJORA-GRAFICA.md), sin empezar. G0 (medición) y G2 (luz
  y muros) pueden empezar ya; G1 y G3 tocan `facades.js` y esperan a que se integre la
  fase 5. Referencia del 9/10/2026 en la Plaza Mayor: 753 llamadas por frame (653 sin
  sombras), el 40 % en fachadas detalladas; el modo ligero solo las reduce un 7 %.

- Variables CSS por contexto para `#miniButton` (pendiente de comprobar `env()` en iOS).
- Verificación en iOS y revisión visual de las fachadas en FrontSide.
