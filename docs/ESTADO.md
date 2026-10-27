# Estado y pendientes

Revisión: 27/10/2026. Este archivo describe solo el estado actual; la historia está en Git
y en las releases. Se actualiza en `main` al integrar ramas.

## Estado

- Publicado en https://elihu.github.io/chiclana-vice/ desde `main` mediante GitHub
  Actions. Última release: `v1.7.0` (27/10/2026). La CI (`ci.yml`), el despliegue y
  Dependabot se ejecutan en GitHub sin errores.
- `npm run check` pasa en CPU con DOM y WebGL simulados. Chrome sin interfaz
  (SwiftShader) arranca sin errores en la raíz, bajo `/chiclana-vice/` y en la web publicada. El usuario probó
  la `v1.1.0` el 7/10/2026 en Chrome de escritorio con GPU y en un móvil Android, y el
  relieve de la `v1.2.0` el 8/10/2026 en el navegador de escritorio; la ampliación y los
  modelos de la `v1.3.0`, el 8 y el 9/10/2026 en el navegador de escritorio, y la mejora
  gráfica de la `v1.4.0`, el 13/10/2026 en el portátil. El motor WebGPU, la luz y el ahorro
  de render de la `v1.5.0`, el 27/10/2026 en un móvil Android, con WebGPU (por `localhost`)
  y con WebGL 2. Las fases visuales de la `v1.6.0`, el 27/10/2026, una a una, servidas en
  `localhost`.
- No verificado: la `v1.6.0` junta con FPS medidos, la `v1.5.0` en el portátil, iOS, FPS medidos en un móvil físico, y el relieve y la ortofoto por
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

## Novedades de `v1.7.0`

Plan: [PLAN-SUELO.md](PLAN-SUELO.md), tanda 1, revisada por el usuario con capturas.

- **Aceras con bordillo** a ambos lados de las vías rodadas, con la cota de la calzada,
  recortadas contra edificios, agua, tableros y otras calzadas (`sidewalks.js`, parámetros en
  `pavements.sidewalks` de `city-design.json`).
- **Faldones** en los bordes de calzadas y aceras donde el terreno queda por debajo.
- **Plazas peatonales pavimentadas** en toda la ciudad.
- Unos 33 km de acera; una llamada de dibujo más (`street-curbs`). Sin FPS medidos.

## Novedades de `v1.6.0`

Plan: [PLAN-VISUAL.md](PLAN-VISUAL.md). Cada fase la revisó el usuario antes de integrarla.

- **Río Iro** con ondas, reflejo del cielo y orillas oscuras (`water.js`).
- **Ventanas**: cristales que reflejan el cielo, persianas con tono y estado habitual por
  edificio y cornisa en los muros genéricos (`windows.js`).
- **Bajos según su uso**: local, portal de bloque, casa o cochera a partir del Catastro
  (uso, inmuebles y viviendas), los comercios de OSM y el tipo de calle (capa
  `ground-floors.json` y reglas `groundFloors` en `city-design.json`). Fachadas con relieve
  en las 45 calles del centro (de 277 a 796 frentes) y bajos pintados en el resto.
- **Árboles** que se mecen con el viento y luz cálida a contraluz (`foliage.js`).
- **Horas del día**: mañana, mediodía, tarde y anochecer con el botón «Hora» (y `#hora=`);
  al anochecer, ventanas, escaparates y farolas encendidos y haz de faros y pilotos
  (`time-of-day.js`, `night-glow.js`).

## Novedades de `v1.5.0`

- **Motor**: three.js 0.186.1 con WebGPURenderer, que usa WebGPU donde el navegador lo
  ofrece (solo en HTTPS o `localhost`) y WebGL 2 si no. `#fps` muestra el motor y los FPS;
  `#motor=webgl` fuerza WebGL 2.
- **Sin tirones al girar**: las mallas instanciadas comparten shader (de 194 a 25
  pipelines con SwiftShader). El usuario lo probó el 27/10/2026 en su Android con WebGPU
  real (por `localhost` con `adb reverse`) y con WebGL 2 de respaldo: sin tirones y, en
  sus palabras, «va bien»; `main` anterior iba a 90 FPS fijos. Además, los shaders se
  compilan en la pantalla de carga («Compilando los shaders…», del 80 al 99 %): con
  SwiftShader el peor frame del primer giro baja de 94 a 28 ms y en ligero desaparecen los
  atascos de varios segundos; la carga en ligero sube de 10,6 a 12,4 s. El usuario lo
  probó en el móvil el 27/10/2026: «va bien». No probado en iOS ni en el portátil.
- Medianeras ciegas y muros compartidos ocultos, coche por secciones (adaptado de
  slop-newyork) y personas con esqueleto en una sola malla.
- **Cielo, luz y sombras** (`feat/luz-visible`, fase VL): cúpula de cielo azul con halo del
  sol, luz ambiente horneada desde el cielo, niebla con su color, sol de tarde más bajo y
  cálido, gradación de color con viñeta (no en ligero), base de los muros más oscura
  (`wall-ao.js`) y sombras de contacto bajo coches y personas, también en ligero
  (`contact-shadows.js`). +2 llamadas por vista con SwiftShader. Integrado a petición del
  usuario el 27/10/2026; sin medida de FPS en el móvil con este cambio.
- **Ahorro de render** (`perf/ahorro-render`, E1 + E2 rehechas sobre `main`): sustitutos
  solo de sombra por celdas (`shadow-proxies.js`), copas de 20 triángulos en la sombra,
  piezas pequeñas sin sombra, coches agrupados por material (`car-batch.js`) y mobiliario
  en una malla. Con SwiftShader, en «sigue»: de 479 a 290 llamadas (Alameda), de 378 a 207
  (Mercado), de 558 a 351 (Plaza Mayor), de 438 a 249 (Santa Ana) y de 432 a 239 (San
  Telmo); capturas iguales salvo bordes de sombras de copas (hasta 2 % de píxeles en
  Santa Ana). El usuario lo probó en el móvil el 27/10/2026: «va bien».

## Novedades de `v1.4.0`

- **Relieve junto a las calzadas**: el terreno ya no queda escalonado respecto a las
  calles en cuesta ([SUPERFICIES_TERRENO.md](SUPERFICIES_TERRENO.md)).
- **Mejora gráfica** ([PLAN-MEJORA-GRAFICA.md](PLAN-MEJORA-GRAFICA.md)): luz y
  exposición nuevas, ventanas continuas en los muros genéricos, sombras más estables,
  grano cercano en suelo y pavimento, menos llamadas de dibujo en las fachadas, y el modo
  ligero oculta fachadas y vegetación lejanas.
- **Árboles sobre las copas reales**: 2.347 árboles y 766 arbustos detectados en la
  ortofoto PNOA y filtrados con la altura de vegetación del IGN (`web/vegetation.json`).

## Novedades de `v1.3.1`

- **Retirada la versión arcade anterior** (`web/arcade/`), con otro mapa y sin relación
  con el juego actual; sigue en el historial y en las etiquetas hasta `v1.3.0`.
- **Créditos** actualizados con los monumentos modelados y las fotografías de referencia
  de la Iglesia Mayor, la Veracruz y Santa Ana.

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
- Relieve: integrado sin publicar el 9/10/2026 y aprobado por el usuario, el terreno
  junto a las calzadas en cuesta ya no se hunde (a 1 m del borde, los puntos más de 1 m
  por debajo de la calzada bajan del 6,4 % al 1,2 %;
  [SUPERFICIES_TERRENO.md](SUPERFICIES_TERRENO.md)). Pendiente: localizar y corregir los
  pequeños defectos visuales señalados en la revisión del 8/10/2026; zócalos y accesos de edificios en pendiente (`baseY` máximo); probarlo
  en un móvil físico (las comprobaciones con SwiftShader no acreditan GPU).
- Suelo ([PLAN-SUELO.md](PLAN-SUELO.md)): tanda 1 publicada en `v1.7.0`. Quedan unas franjas de
  acera sueltas junto al acceso norte del puente de Reyes Católicos (lado oeste) y, a pie, los
  pies quedan 10 cm bajo la baldosa (la acera es solo visual). Tanda 2 integrada sin publicar el
  27/10/2026: tablero de `tablero-remedios` con pendiente entre sus accesos (`profile:
"linear"`), arcos del VII Centenario apoyados en la calzada, sin tramos de acera cortos
  (`minimumRun`) y `tests/verify-bridges.mjs` (escalón máximo en 1 m en Reyes Católicos de 0,134
  a 0,095 m); sin revisión visual a pie de puente. Tanda T integrada sin publicar el
  27/10/2026: `web/tram.json` (7 tramos, 1.037 m, 1 parada) y vías con césped o carril exclusivo,
  catenaria, parada de Remedios y aceras que respetan la franja; sin línea propia en
  `THIRD_PARTY_NOTICES.md` (registrada como ODbL en `data-sources.json`), el tráfico puede pisar
  el carril del tranvía y quedan parches de césped en la rotonda de Plaza de España. Tanda 3 hecha en la rama `feat/suelo-cerca` (sin integrar, pendiente
  de revisión del usuario): 50 pasos de cebra (antes 44), cruces sin picos de asfalto, limpieza
  de copas y sombras de la ortofoto de cerca (`ground-clean.js`, `ground-near.js`) y materiales
  de cerca por color (césped, tierra, baldosa). En capturas las manchas de copas siguen
  viéndose de cerca y la baldosa puede quedar fría; se ajusta con `setGroundNear`. Después: la interfaz
  ([PROPUESTA-UI.md](PROPUESTA-UI.md)) y la noche cerrada.
- Gráficos ([PLAN-VISUAL.md](PLAN-VISUAL.md)): F1–F4 publicadas en `v1.6.0`. Su F5 pasó a
  [PLAN-SUELO.md](PLAN-SUELO.md); queda la noche cerrada (luces reales
  cercanas, farolas en todas las calles y bloom), aceras y patios, y pretiles. Los bajos con
  relieve suben los triángulos un 12–31 % en «sigue» con SwiftShader (más del 25 % en
  Alameda, Mercado y San Telmo): medir FPS en el móvil y, si hace falta, simplificar balcones
  y postigos de las plantas altas.
- Comprobar que la cámara de sombras cubre las sombras más largas del sol bajo y medir FPS en
  el móvil con la luz y el ahorro de render juntos.

- Variables CSS por contexto para `#miniButton` (pendiente de comprobar `env()` en iOS).
- Verificación en iOS y revisión visual de las fachadas en FrontSide.
