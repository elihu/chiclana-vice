# Propuesta: repaso de la interfaz de Chiclana Vice

Fecha: 27/10/2026. Estado: propuesta de investigación, **pendiente de las decisiones del usuario**
(sección 6); nada implementado. Las capturas de apoyo (Chrome sin interfaz, 1280×720, 390×844 y
844×390) eran temporales y no se conservan. Comentario del coordinador sobre la decisión 2: cargar
Barlow desde Google Fonts es una dependencia externa (`AGENTS.md` pide preguntar); alternativa:
letras del sistema primero y, si se quiere más carácter, incluir la fuente en `web/` con su licencia.

## En una frase

La interfaz funciona, pero está hecha por capas: cada pieza se añadió con su propio tamaño, color y
símbolo, y en móvil se recoloca con «parches» (`top: 190px`, `bottom: 230px`) que chocan entre sí.
Propongo un sistema pequeño y propio (colores, tamaños, tipos de botón y de panel definidos una vez)
y rehacer el HUD y el control táctil sobre él, en 5 fases que se prueban una a una en el móvil.

## 1. Diagnóstico

- **Tipografía.** Todo es `Arial` (`style.css:20`). Solo hay 3 pesos y unos 25 tamaños distintos
  (9, 10, 11, 12, 13, 14, 16…26 px, 46 y 63 px en títulos). No hay escala: el rótulo del encargo es de
  9 px en una regla y 12 px en otra.
- **Colores sueltos.** Solo 4 variables (`--lime`, `--white`, `--dark`, `--muted`); el resto son
  38 `rgba(...)`/hex sueltos: fondos `#122730d9`, `#102630b8`, `#172f39b8`, `#192e37cb`... para
  paneles que deberían ser el mismo. El lima sirve para todo (botón primario, acento de texto,
  GAS, enlaces, borde del encargo), así que nada destaca.
- **Iconos.** Son caracteres Unicode que cambian según el móvil: `◉ ⌖ ☀ Ⅱ` (barra superior), `▬ ▥`
  (freno y gas, `index.html`), `↥ »` (bajar y turbo), `‹ ›` (giro), `◆`, `☆☆☆☆☆`. Tienen distinto
  grosor, tamaño y alineación, y algunos pueden salir como emoji en ciertos teléfonos.
- **Formas.** Radios de borde: 3, 4, 8, 10, 12, 16, 18, 20 px y 50 %. Los botones del HUD (12 px),
  los pedales (18) y el giro (20) no se parecen. Solo hay 6 `z-index` y 3 `!important`, pero ninguna
  capa está nombrada.
- **Posiciones y solapes (visto en las capturas).**
  - Vertical: el minimapa (`#miniButton`, `top:190px`) y los botones (`.topButtons`, `top:190px`)
    están a mano a la misma altura; la etiqueta de lugar («Puente Chico», `#poiLabels`) se sale por
    la derecha; el aviso central (`#hint`) tapa la carretera justo delante del coche; el velocímetro y
    TURBO/BAJAR se apilan encima de los pedales; «FRENO / R» se parte en dos líneas.
  - Horizontal: el recuadro de encargo, los 4 botones, el aviso y el velocímetro compiten por la
    mitad superior; el velocímetro queda pegado a BAJAR/TURBO; «Fuentes: © OSM…» (`#credits`) se
    solapa con la zona del pulgar izquierdo.
  - Pausa en horizontal: el panel (`.modalPanel`) es más alto que la pantalla (390 px) y los botones
    de abajo quedan fuera: hay que desplazarse con el menú abierto.
  - Escritorio: texto de ayuda de teclas (`#desktopHelp`, 11 px, casi ilegible) y fuentes flotando abajo
    en la esquina.
- **Textos.** Mezcla de mayúsculas con tracking amplio (`SALIR A LA CALLE`, `GAS`), frases largas
  («Alameda del Río. GAS para avanzar, flechas para girar…») y «Eyebrow / Titular» estilo póster en
  menús donde no hace falta. Los diálogos de Ayuda (`js/ui/dialogs.js`) son un bloque enorme de
  `innerHTML` de ~6 000 caracteres con créditos mezclados con controles.
- **Estructura de CSS.** Cuatro bloques de `@media` independientes (`max-width:650px`,
  `max-height:540px landscape`, `any-pointer: coarse` y sus variantes vertical/horizontal) que se
  pisan; el diseño táctil depende de `any-pointer: coarse`, no de un único estado «modo táctil».

## 2. Qué merece la pena de slop-newyork (ideas, no copia)

1. **Un único sistema de variables** (superficie de cristal, texto en tres niveles, un acento,
   radios, borde, sombra): todo el HUD sale de ahí, y por eso se ve de una pieza.
2. **Acento con significado**: un solo color reservado a lo activo/pulsado, el resto neutro. Hoy aquí
   el lima está en todas partes.
3. **Iconos SVG propios en un único `<symbol>` inline**, mismo trazo y tamaño; no dependen de la fuente
   del teléfono ni de librerías.
4. **HUD por esquinas con nombre** (arriba-izquierda marca/lugar, arriba-derecha herramientas,
   abajo-izquierda minimapa, abajo-centro modo) en vez de coordenadas sueltas; un `--edge` común y
   `env(safe-area-inset-*)` en todo.
5. **Estado `body.touch-enabled`** que activa de una vez todas las reglas táctiles (objetivos de 44 px,
   etiquetas ocultas), con un `matchMedia('(any-pointer: coarse)')` más la primera pulsación táctil.
6. **Control táctil modular y por modo**: un joystick analógico con zona muerta, botones de mantener
   que solo se ven en el modo donde sirven, caudal de entradas separado del teclado, `reset()` ante
   `blur`/`resize`/`visibilitychange`, y una línea de ayuda discreta («arrastra para mirar»). Y el
   mando (`gamepad-controls.js`) como entrada más, sin tocar la interfaz.
7. **Pequeños detalles**: `prefers-reduced-motion`, `popover` nativo para listas, tipografía
   dedicada para rótulos de calle (aquí podría ser el nombre de la calle sobre «cartel»).

No copiar: el verde de carteles de la DOT, el amarillo taxi, el grano SVG, ni los iconos. En slop
sobran paneles para móvil (muchos campos en la barra superior); aquí hay que ser más escueto.

## 3. Sistema visual propio: «Chiclana»

**Identidad.** El juego es Chiclana: cal blanca, albero, azul de las rejas y el mar de Cádiz, el verde
de las marismas. Mantengo la noche azulada actual para los paneles (ya está en `--dark #12232b`) y
sustituyo el lima genérico por un **amarillo albero** como único acento.

| Token                            | Valor propuesto                      | Uso                                         |
| -------------------------------- | ------------------------------------ | ------------------------------------------- |
| `--cal`                          | `#f5f2e8`                            | texto principal, panel claro (mapa, ayuda)  |
| `--noche`                        | `#12232b` (84 % opacidad en cristal) | paneles del HUD                             |
| `--salina`                       | `#2f5f6b`                            | secundario: botones en reposo, bordes       |
| `--albero`                       | `#f0c24b`                            | acento: lo activo, GAS, el objetivo         |
| `--mar`                          | `#58a6b5`                            | información: lugares, ruta, agua en el mapa |
| `--ok` / `--aviso` / `--peligro` | `#6fcf97` / `#f0c24b` / `#ef6f5e`    | estados                                     |
| `--texto-2/3`                    | `cal` al 70 % / 45 %                 | texto secundario y apagado                  |

Contraste ≥ 4,5:1 del texto sobre `--noche` y de `--noche` sobre `--albero` (a comprobar al aplicar).

**Tipografía.** Sin dependencias: pila de sistema `ui-rounded/ "Avenir Next"/ "Segoe UI"/ system-ui` para
cuerpo, y un titular condensado con `"Arial Narrow", "Roboto Condensed", Impact`… como fallback. Si
se quiere carácter, **Google Fonts** (la regla permite estilos de Google Fonts): _Barlow Condensed_
(títulos y rótulos de calle) + _Barlow_ (cuerpo), con `font-display: swap`; es una petición externa
más, así que sugiero decidirlo (decisión 2). Escala fija: 12 / 14 / 16 / 20 / 28 / 56 px; mínimo 12 px.

**Tokens CSS.** `--edge: 16px` (móvil) / `24px` (escritorio); `--r-1: 8px`, `--r-2: 14px` (paneles),
`--r-pill: 999px`; `--tap: 48px` (mínimo táctil); `--sombra`, `--z-hud/-ctl/-aviso/-dialogo` con nombre.

**Componentes (solo cuatro formas).**

- **Botón**: primario (albero, texto noche), secundario (cristal, borde sutil), icono (cuadrado 48 px),
  _mantener_ (circular 64–72 px, se ilumina al pulsar). Un solo `:focus-visible`.
- **Panel**: cristal `--noche` con borde de 1 px y radio `--r-2`; versiones compacta (HUD) y de
  diálogo (modal).
- **Aviso**: tira pequeña arriba al centro con icono + una línea (máx. 60 caracteres) y barra de
  vida; sustituye a `#hint` y `#toast` (hoy tapan el centro).
- **Chip**: píldora de 28 px para dato (`COSTA GT`, `469 m`, `★★☆`, hora del día).
- **Iconos**: ~14 SVG propios en un `<svg>` sprite (cámara, mapa, hora/sol/luna, pausa, turbo,
  bajar/subir, sonido, cerrar, buscar, ubicación, volante, flechas) con trazo de 2 px.

**Pantallas.**

- _Bienvenida_: mantener la idea (título grande a la izquierda, escena detrás); un título, una línea,
  tres chips, un botón primario y un enlace «Cómo se juega». Pasar la nota de controles a una línea y
  mover créditos al pie. En móvil vertical, el título pasa a 44 px y el botón ocupa el ancho.
- _HUD escritorio_: izquierda arriba: marca pequeña + calle actual (chip); centro arriba: encargo
  (panel compacto de 2 líneas); derecha arriba: una barra única con 4 botones icono + dinero/estrellas
  como chips; abajo-izquierda: minimapa con la calle; abajo-derecha: velocímetro; ayuda de teclas
  como pastillas `WASD · E · C · M` que se ocultan tras 10 s.
- _HUD móvil vertical_: franja superior de dos filas: fila 1 marca + dinero + estrellas; fila 2 encargo
  (1 línea + distancia). Los 4 botones pasan a una columna vertical en el borde derecho, bajo la
  franja. Minimapa redondo de 96 px arriba-izquierda bajo la franja. Todo el tercio inferior es de
  control; el centro de la pantalla queda libre (avisos como tira bajo la franja, no sobre el coche).
- _HUD móvil horizontal_: una sola fila arriba (calle, encargo, dinero) y columna de botones a la
  derecha; el minimapa baja a esquina inferior central-izquierda si hay hueco; velocímetro fusionado
  con los pedales (aro alrededor de GAS) para liberar el centro.
- _Pausa_: hoja de 2 columnas en horizontal (resumen + acciones) con _Volver_ fijo arriba y _Partida
  nueva_ como acción discreta; hoy los 7 botones se apilan y desbordan 390 px.
- _Mapa_: panel casi a pantalla completa, mapa grande y lista de calles como hoja inferior en vertical;
  leyenda con iconos y chips; botón ortofoto/callejero como conmutador de dos posiciones.
- _Diálogos y avisos_: un solo componente de diálogo con cabecera, cuerpo desplazable y pie fijo con
  botones; la ayuda se divide en pestañas «Controles», «Qué es real», «Fuentes» (hoy todo en un bloque).

## 4. Controles en el móvil

**Hoy (`js/ui/controls.js`, `style.css` bloque `any-pointer: coarse`).** Conduciendo: dos flechas
(izquierda) y dos pedales GAS/FRENO (derecha) más BAJAR/TURBO; a pie: un joystick fijo de 132 px
abajo a la izquierda. Se mira arrastrando en cualquier punto del mundo. No hay mando, ni zoom con dos
dedos, ni zona muerta en el joystick, ni vibración, ni opción de zurdos. Los botones se solapan con el
velocímetro y el texto «FRENO / R» se rompe; las `env(safe-area-*)` ya se usan en los bloques
táctiles, pero no en pausa/mapa/avisos.

**Propuesta.**

1. **Conducir con dos zonas de pulgar**: izquierda, un único _control de giro_ (joystick horizontal
   de 160 px con zona muerta del 15 % y respuesta suavizada) en lugar de dos flechas; derecha, GAS grande
   (72 px) y FRENO debajo-izquierda de GAS (64 px); TURBO y BAJAR en arco encima de GAS, sin tapar.
   Alternativa opcional «giro por botones» en Ajustes para quien prefiera lo actual.
2. **A pie**: el mismo joystick izquierdo, ahora analógico en dos ejes; CORRER como botón de mantener.
   El joystick **flotante** (aparece donde se toca en la mitad izquierda) evita fallos de pulgar.
3. **Cámara**: arrastrar en la mitad derecha libre; pellizco para acercar en vista aérea; doble toque
   para centrar tras el coche. Ya existe arrastre; hay que limitarlo para no chocar con los botones.
4. **Zonas seguras**: `padding: max(var(--edge), env(safe-area-inset-*))` en todos los lados, también
   en diálogos; el viewport ya usa `viewport-fit=cover`.
5. **Accesibilidad**: objetivos mínimos de 48 px, `aria-label` en todos, `aria-pressed` en los de
   mantener, tamaño de controles ajustable (S/M/L) y modo zurdo (espejo), vibración corta opcional
   (`navigator.vibrate`) y respetar `prefers-reduced-motion`.
6. **Mando**: entrada opcional por `navigator.getGamepads()` (como `gamepad-controls.js` en slop,
   con zona muerta y mapeo estándar); sería una fase aparte y no es imprescindible.

## 5. Plan por fases (cada una se revisa en el móvil)

| Fase              | Qué                                                                                                       | Esfuerzo  | Riesgos                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| **U0**            | Tokens CSS, escala de texto y radios; sustituir colores sueltos por variables. **Sin cambiar el diseño.** | 0,5–1 día | Cambios visuales mínimos; vigilar `style.css` es la fuente de todos los tests de lint/formato                 |
| **U1**            | Iconos SVG en sprite y los 4 componentes (botón, panel, aviso, chip); sustituir glifos Unicode            | 1 día     | Los tests que leen `index.html` o `$('id')` (`tests/verify3d.mjs` con DOM simulado): conservar todos los `id` |
| **U2**            | HUD rehecho por esquinas con nombre; avisos unificados (`#hint`+`#toast`) y escritorio primero            | 1–2 días  | Solapes con el minimapa y las etiquetas `#poiLabels`; el modo ligero no debe mover los elementos              |
| **U3**            | HUD móvil vertical y horizontal + pausa y mapa en hoja; ayuda en pestañas                                 | 2 días    | El más delicado: comprobar en 3 tamaños reales (iPhone con muesca, Android pequeño, tableta)                  |
| **U4**            | Controles táctiles nuevos (giro analógico, joystick flotante, zurdos, tamaño, pellizco)                   | 2 días    | No romper `holdPointers`, `input.jx/jy` ni el soltar al perder foco; mantener el modo de flechas como opción  |
| **U5** (opcional) | Mando y vibración                                                                                         | 1 día     | Solo se puede probar en un mando real                                                                         |

Orden recomendado: U0, U1, U2 en escritorio y móvil rápidos, luego U3, y U4 solo después de ver U3.
Cada fase es una rama `feat/ui-…` con `npm run check`; el usuario la prueba en el móvil con una URL
temporal (una comparación a la vez: publicado frente a candidato). En todas: conservar los `id` del
DOM, los controles táctiles, el modo ligero (no usar `backdrop-filter` ni sombras pesadas en
`gfx.quality === 'low'`; hoy se usa `blur(3px)` en los botones de giro) y los 18 tests de `tests/`.
Las capturas anteriores no prueban tacto ni rendimiento: la verificación real es en el móvil.

## 6. Decisiones para el usuario

1. **¿Cuánto cambiar?** Opción A: solo orden y cohesión (U0–U3, conserva el aspecto de noche azulada +
   amarillo). Opción B: identidad nueva (cal, albero, mar). **Recomiendo B moderada**: mismos paneles
   oscuros, acento albero, y la identidad en el menú y la bienvenida.
2. **Tipografía**: sin dependencias (sistema) o Google Fonts (Barlow). **Recomiendo Barlow Condensed
   - Barlow** con `font-display: swap`, porque da identidad y pesa poco; con fallback a sistema.
3. **Control de giro**: flechas actuales o joystick analógico. **Recomiendo joystick analógico por
   defecto** con opción de flechas en Pausa → Controles.
4. **Mando y vibración**: ahora o dejarlos para después. **Recomiendo después** (U5), una vez
   asentado el táctil.
5. **Ayuda y créditos**: dejar el texto largo en una sola hoja o dividirlo en pestañas. **Recomiendo
   pestañas** y mover los créditos a su propia pestaña, sin recortar su contenido (licencias).
