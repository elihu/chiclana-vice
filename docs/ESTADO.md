# Estado y pendientes

Revisión: 29/10/2026. Este archivo describe solo el estado actual; la historia está en Git
y en las releases. Se actualiza en `main` al integrar ramas.

## Estado

- Publicado en https://elihu.github.io/chiclana-vice/ desde `main` mediante GitHub
  Actions. Versión actual: `v2.1.0` (29/10/2026); el historial de publicaciones está en
  [Releases](https://github.com/elihu/chiclana-vice/releases).
- `npm run check` pasa en CPU con DOM y WebGL simulados. Chrome sin interfaz
  (SwiftShader) arranca sin errores en la raíz, bajo `/chiclana-vice/` y en la web publicada. El usuario probó
  la `v1.1.0` el 7/10/2026 en Chrome de escritorio con GPU y en un móvil Android, y el
  relieve de la `v1.2.0` el 8/10/2026 en el navegador de escritorio; la ampliación y los
  modelos de la `v1.3.0`, el 8 y el 9/10/2026 en el navegador de escritorio, y la mejora
  gráfica de la `v1.4.0`, el 13/10/2026 en el portátil. El motor WebGPU, la luz y el ahorro
  de render de la `v1.5.0`, el 27/10/2026 en un móvil Android, con WebGPU (por `localhost`)
  y con WebGL 2. Las fases visuales de la `v1.6.0`, el 27/10/2026, una a una, servidas en
  `localhost`. La interfaz de la `v2.0.0` se revisó por tandas en el móvil del usuario por
  red local, con ajustes de distribución y sensibilidad; el usuario la considera lista
  para sacar versión el 28/10/2026. Sin registro de modelo/navegador ni FPS de esa sesión.
  La `v2.1.0` publicada, el 29/10/2026 en un Nothing Phone 3 con Chrome (`#fps`), por la
  Alameda, el puente de los Remedios, la avenida Solano, el Mercado, Santa Ana y San Telmo:
  90 FPS estables y peor frame de 11 ms, igual con WebGPU, con WebGL 2 y en modo ligero;
  sin tirones en giros rápidos y ortofoto por teselas correcta. Los 90 FPS son
  probablemente el tope de la sincronización vertical, así que no miden el margen que queda.
- No verificado: la `v1.5.0` en el portátil, iOS y otros móviles Android.

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

## Integrado en `main` sin publicar

- **Mapa ampliado** a toda la caja del minimapa, `[-820, 671.835, -1120, 650]` (de unos 1,67
  a 2,64 km²): 11.771 partes de edificio (antes 7.862) y 1.019 vías, con el mismo origen;
  los edificios anteriores no cambian ni de forma ni de color y el relieve es el mismo.
  Revisado por el usuario en el navegador el 29/10/2026.
- **Ortofoto PNOA 2025-07** en las 56 teselas (antes 2022-07), con un poco más de contraste en
  el shader (`setOrthoContrast`, 1,15). Misma resolución; la Alameda aparece ya reformada.
  Atribuciones actualizadas con permiso del usuario.
- **Copas** detectadas sobre la imagen de 2025 con un umbral de verdor más bajo (ExG 0,04): 2.872
  árboles y 1.491 arbustos.
- Plan nuevo: [PLAN-COMERCIOS.md](PLAN-COMERCIOS.md).
- Verificación: `npm run check` y Chrome con SwiftShader (normal y ligero). Sin medidas en
  móvil con el mapa ampliado (un 50 % más de edificios).

## Novedades de `v2.1.0`

Versión menor: mundo más transitable y motor más rápido, sin cambios en las partidas
guardadas.

- **Mundo** ([REVISION-MUNDO.md](REVISION-MUNDO.md)): río más claro con reflejo del cielo,
  sin la cubeta de la Alameda; 145 troncos fuera de las vías pavimentadas; pavimento
  peatonal y aceras recortados contra las calzadas; glorietas, túneles y niveles de OSM;
  tablero y pasos inferiores del VII Centenario separados; peatones sobre recorridos
  continuos; separadores entre ramales como calzada; junta del tranvía con Remedios.
  Revisado por el usuario en el navegador.
- **Puente de Remedios:** el extremo norte del tablero se prolonga 5,25 m y cierra el hueco
  hasta el cauce entre el puente y la orilla (`endExtension` admite un par `[inicio, fin]`).
  Revisado por el usuario en el navegador.
- **Rendimiento** ([PLAN-REFACTOR.md](historico/PLAN-REFACTOR.md)), sin cambios visibles
  (huellas de escena idénticas con y sin relieve): rejilla espacial común `core/grid.js`,
  aceras sin comprobaciones repetidas y menos consultas de suelo por fotograma. En Node con
  DOM y WebGL simulados, arranque de unos 10,3 a 7,2 s (−30 %) y `update` de 0,58 a unos
  0,27 ms por paso. Sin FPS medidos ni prueba en móvil.
- **Código y documentación:** arranque en etapas medidas (`tools/bench-startup.mjs`),
  módulos grandes partidos en funciones con nombre, un validador por archivo, código muerto
  retirado, guía de módulos completa y planes ejecutados en `docs/historico/`.
- **Herramientas:** eslint 10.13.0, prettier 3.9.10 y `actions/setup-node` v7.1.0;
  Three.js 0.186.1 sigue siendo la última. El humo de superficies comprueba los tableros con
  su perfil y `verify-bridges.mjs` informa de la caída tras sus extremos (`endDrop`).
- **Verificación:** `npm run check` y Chrome con SwiftShader (normal, ligero, `?debug` y
  superficies). Reglas de complejidad de ESLint sin activar: quedan 11 funciones por encima
  ([RESULTADO-R4.md](historico/RESULTADO-R4.md)).

## Novedades de `v2.0.0`

Versión mayor elegida por el usuario para marcar la renovación de interfaz y manejo.
Las partidas guardadas siguen siendo compatibles.

- **Interfaz** ([PROPUESTA-UI.md](PROPUESTA-UI.md)): paleta albero/cal/noche, iconos SVG,
  HUD móvil compacto, menú desplegable hacia abajo en vertical y hacia la izquierda en
  horizontal, minimapa mayor y controles agrupados a la derecha.
- **Conducción táctil:** joystick con zona neutra y respuesta progresiva, giro suavizado,
  freno prioritario y turbo con el otro pulgar. Flechas y pedales como alternativa en Pausa.
- **Menús:** bienvenida y pausa reorganizadas; guía en Controles, Sobre el mapa y Fuentes;
  mapa con búsqueda de destinos y selector Callejero/Ortofoto. Fuentes y atribuciones íntegras.
- **Puentes:** tablero de Remedios con pendiente entre sus accesos, continuidad comprobada
  en los puentes de prueba y arcos del VII Centenario apoyados en la calzada.
- **Tranvía estático:** 7 tramos (1.037 m), catenaria, parada de Remedios y aceras que
  respetan la franja. Sin tranvía en movimiento.
- **Suelo:** 50 pasos de cebra, cruces sin picos de asfalto, limpieza de copas y sombras
  en la ortofoto cercana y materiales de césped, tierra y baldosa.
- **Verificación:** `npm run check` y Chrome con SwiftShader; menús, varios tamaños y
  dos contactos táctiles simulados. Sin medidas de FPS ni verificación en iOS.

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
- **Mejora gráfica** ([PLAN-MEJORA-GRAFICA.md](historico/PLAN-MEJORA-GRAFICA.md)): luz y
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
  límites del mundo como lista de rectángulos ([PLAN-AMPLIACION.md](historico/PLAN-AMPLIACION.md)).
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
[PLAN-TERRENO.md](historico/PLAN-TERRENO.md).

## Pendientes

- Ampliación ([PLAN-AMPLIACION.md](historico/PLAN-AMPLIACION.md)): fases 0–5 publicadas en la
  `v1.3.0`. Veracruz: el patio
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
  pequeños defectos visuales señalados en la revisión del 8/10/2026; zócalos y accesos de edificios en pendiente (`baseY` máximo).
- Suelo ([PLAN-SUELO.md](PLAN-SUELO.md)): tanda 1 en `v1.7.0`, tandas 2, T y 3 en
  `v2.0.0`. Pendientes: revisar las franjas de acera junto al acceso norte del puente de
  Reyes Católicos (lado oeste); a pie, los pies quedan unos 10 cm bajo la baldosa porque
  la acera es visual; el tráfico puede pisar el carril del tranvía y quedan parches de
  césped en la rotonda de Plaza de España. Sin revisión visual a pie de puente de la tanda 2.
  En la esquina suroeste del tablero de Remedios (x ≈ 329, z ≈ −157, junto a la vía 757857214) hay un escalón de hasta 12,6 cm en medio metro cuadrado; pendiente de revisión
  visual del usuario.
  `tests/verify-bridges.mjs` informa además de la caída justo fuera de los extremos de cada
  tablero (`endDrop`, sin aserción). Quedan dos fosos anteriores: 1,57 m en la esquina
  suroeste de Remedios (x ≈ 329, z ≈ −159), entre el tablero y dos aceras a 1,41 m, y 3,3 m
  en VII Centenario junto a la rampa del túnel peatonal (x ≈ −458, z ≈ −535), que puede ser
  real. Alargar el extremo sur de Remedios lo empeora porque pasa sobre su paso inferior.
- Interfaz ([PROPUESTA-UI.md](PROPUESTA-UI.md)): alcance principal integrado y aceptado
  para `v2.0.0`. Quedan revisión de legibilidad al anochecer y dispositivos adicionales;
  modo zurdo, tamaños, preferencias persistentes, gestos, mando y vibración son opcionales.
- Gráficos ([PLAN-VISUAL.md](PLAN-VISUAL.md)): F1–F4 publicadas en `v1.6.0`. Su F5 pasó a
  [PLAN-SUELO.md](PLAN-SUELO.md); queda la noche cerrada (luces reales
  cercanas, farolas en todas las calles y bloom), apoyo de peatones en aceras, patios y pretiles. Los bajos con
  relieve suben los triángulos un 12–31 % en «sigue» con SwiftShader (más del 25 % en
  Alameda, Mercado y San Telmo), pero el móvil se mantiene a 90 FPS en las tres (ver
  «Estado»): simplificar balcones y postigos solo si un móvil más modesto lo pide.
- Comprobar que la cámara de sombras cubre las sombras más largas del sol bajo.

- Mapa ampliado: medir FPS en el móvil con un 50 % más de edificios; revisar árboles y suelo
  cercano con la ortofoto de 2025 (la limpieza de copas y sombras se ajustó con la de 2022) y
  los 114 tramos de calle que el tráfico excluye por cruzar edificios (antes 58), casi todos
  vías de servicio de OSM a través de naves.
- Comercios y naves ([PLAN-COMERCIOS.md](PLAN-COMERCIOS.md)): sin empezar; antes de C1 el
  usuario decide la altura de las naves (D8). Después, vallas y muros de parcela.

- Verificación en iOS, incluidas zonas seguras con `env()`, y revisión visual de las fachadas en FrontSide.
