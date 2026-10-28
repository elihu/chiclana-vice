# Interfaz de Chiclana Vice: diseño, revisión y pendientes

Actualizado: 28/10/2026. Implementado en `feat/ui-chiclana`, con revisiones del usuario
en su móvil por red local y aceptado para preparar la v2.0.0. Pendiente de integrar y
publicar. Este documento sustituye
la propuesta de investigación del 27/10/2026 y describe el resultado actual.

## Objetivo y alcance

Dar cohesión a la interfaz, resolver solapes y dejar visible la calle. La prioridad es
jugar cómodamente en móvil, también con las barras del navegador visibles. El trabajo
se hace por tandas visibles: el usuario prueba y dirige el siguiente ajuste.

El alcance principal —sistema visual, HUD adaptable, menús y conducción con joystick—
está implementado. Las ampliaciones opcionales del final no son requisitos para cerrar
esta rama.

## Decisiones vigentes

- Paneles azul noche, texto cal y albero como acento. El azul mar identifica lugares en
  el mapa. Bordes, radios, espaciados y zonas seguras compartidos.
- Fuente del sistema: `Avenir Next`, `Segoe UI`, `system-ui`. No se ha incorporado Barlow
  ni Google Fonts. No hay una decisión de tipografía pendiente que bloquee el trabajo.
- SVG propios para las herramientas y los controles principales, sin librerías externas.
- Superficies sin desenfoque, también en calidad normal. Conservar el modo ligero.
- Objetivos táctiles de al menos 48 px y etiquetas que no partan «FRENO / R».
- Conservar teclado, funciones del juego y la alternativa de flechas y pedales.
- Mantener íntegros los contenidos de fuentes, atribuciones y aproximaciones. Esta rama
  reorganiza su acceso, sin cambiar licencias ni atribuciones.

| Variable                              | Uso                                       |
| ------------------------------------- | ----------------------------------------- |
| `--cal` / `--noche` / `--albero`      | Texto, superficies y acento               |
| `--surface` / `--border` / `--radius` | Componentes comunes                       |
| `--edge` / `--safe-*`                 | Márgenes combinados con las zonas seguras |
| `--tap` / `--joy-size`                | Tamaño de herramientas y joystick         |
| `--map-*`                             | Paleta del mapa y del minimapa            |

Los valores vigentes están en `web/style.css`. Canvas resuelve la paleta al preparar el
mapa; no consulta estilos en cada frame. La coherencia de colores está implementada;
no se ha hecho una auditoría completa de contraste.

## Implementado

### HUD y herramientas

- **Vertical:** objetivo compacto y velocímetro en la parte superior; minimapa a la
  izquierda y menú hamburguesa en el borde derecho. El menú abre hacia abajo con las
  opciones de pantalla completa, cámara, mapa, hora y pausa.
- **Horizontal:** menú que abre de derecha a izquierda y minimapa de 144 × 104 px.
  Con hasta 320 px de altura disponible, el minimapa pasa a 128 × 72 px y los controles
  se compactan para convivir con las barras del navegador.
- **Escritorio:** herramientas visibles, ayuda de teclado, minimapa y telemetría.
- **Avisos:** presentación común bajo la zona superior. Los mensajes temporales tienen
  prioridad sobre las indicaciones contextuales; estas vuelven cuando termina el aviso.
  Mientras se despliega el menú se ocultan los avisos para evitar superposiciones.
- **Búsqueda policial:** en táctil, las estrellas aparecen solo cuando hay búsqueda activa.
- **Menú:** se cierra al elegir una opción, tocar fuera, pulsar Escape o cambiar de tamaño.
  Desde un diálogo, el foco puede volver al botón del menú.
- **Minimapa y mapa:** comparten la nueva paleta; ruta albero, jugador cal y lugares azul mar.

### Bienvenida, pausa, ayuda y mapa

- Bienvenida breve con chips, botón «Empezar a jugar» y acceso a «Cómo se juega».
  En horizontal con poca altura, se organiza en dos columnas.
- Pausa con resumen de encargos, lugares y dinero; acciones en dos columnas en horizontal.
  Conserva sonido, calidad, pantalla completa, reparación y nueva partida.
- Guía con pestañas «Controles», «Sobre el mapa» y «Fuentes», navegación de teclado y
  cabecera y botón de volver fijos. Solo se desplaza el contenido largo.
- Controles explicados en tarjetas. Los textos de fuentes y aproximaciones se mantienen
  íntegros. Desde pausa, «Volver» regresa a pausa; el acceso de créditos abre «Fuentes».
- Mapa y búsqueda en columnas en horizontal y apilados en vertical. El cierre queda
  accesible, Callejero/Ortofoto tienen selección explícita y la búsqueda cuenta destinos.
  Se avisa de que elegir uno traslada al jugador.

### Conducción y pantalla completa

- Joystick izquierdo fijo por defecto: arriba acelera, abajo frena y retrocede, y los
  lados giran. Turbo, freno y subir/bajar quedan para el otro pulgar.
- Tras la revisión de sensibilidad: zona muerta del 22 %, curva progresiva, giro máximo
  un 25 % menor y suavizado de la dirección (constante de tiempo: 125 ms). A pie se conserva
  la respuesta anterior.
- El freno tiene prioridad aunque el joystick siga hacia delante. Soltar o cancelar un
  contacto no debe cancelar el otro; el giro vuelve al centro al soltar el joystick.
- Pausa permite volver a flechas y pedales. Esa elección dura la sesión; no se guarda.
- Último ajuste: en horizontal, BAJAR se alinea encima de TURBO, en vez de quedar separado
  a su izquierda. En pantallas de poca altura conserva un objetivo mínimo de 48 px.
- Las entradas se limpian al perder foco, ocultar la página, cambiar de tamaño o cambiar
  de pantalla completa.
- Al pulsar «Empezar a jugar» en horizontal con entrada táctil, se intenta activar pantalla
  completa. También está en las opciones del HUD y en Pausa; no se bloquea la orientación.
  Girar el dispositivo por sí solo no garantiza entrar:
  [la API requiere una pulsación del usuario](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen#security_considerations).

## Revisión y evidencia

| Revisión                               | Qué se ha comprobado                                                                                                                    | Límite                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Usuario en móvil por red local         | Distribución vertical y horizontal, barras del navegador, pantalla completa, manejo y sensibilidad; sus comentarios guiaron los ajustes | No se han registrado modelo, navegador ni medidas de FPS de esta sesión       |
| `npm run check`                        | Lint, formato y verificadores; incluye joystick con turbo, prioridad del freno, curva de respuesta, cancelación y Escape del menú       | DOM y WebGL simulados; no prueba GPU ni tacto real                            |
| Chrome sin interfaz                    | Menús, búsqueda, pestañas con teclado, dos contactos táctiles simulados y ausencia de errores JS                                        | SwiftShader; no acredita rendimiento ni comodidad en un móvil físico          |
| Capturas y cajas del HUD               | 1280×720, 390×844, 360×640, 844×390, 844×280 y 640×240 a lo largo de las tandas; menú abierto/cerrado en los tamaños afectados          | Las capturas son temporales en `/tmp`; no todas corresponden al último ajuste |
| Última alineación de BAJAR sobre TURBO | Formato y diff comprobados                                                                                                              | Posterior a las últimas capturas y al último `npm run check` completo         |

No se ha verificado iOS ni medido FPS o GPU real de esta rama. Tampoco se ha completado
la revisión de legibilidad al anochecer. Estos límites se informan, sin convertir todas
las plataformas y mejoras opcionales en requisitos de esta tanda.

## Cierre de la revisión

El usuario considera lista la interfaz para sacar versión el 28/10/2026 y elige v2.0.0
para marcar la renovación de interfaz y manejo. Las partidas guardadas siguen siendo
compatibles. El último ajuste de BAJAR sobre TURBO queda incluido en el cierre de la rama.

La revisión de anochecer, textos largos y dispositivos adicionales sigue como mejora de
validación; los límites constan en la tabla anterior. No bloquean el alcance aceptado.
Las ampliaciones opcionales siguientes tampoco son requisitos de esta versión.

## Mejoras opcionales, sin compromiso de ejecución

- **Ajustes táctiles:** tamaños de controles y modo zurdo. Si se amplían las preferencias,
  valorar guardar también el modo de conducción.
- **Joystick flotante a pie:** probarlo como alternativa al fijo, por separado.
- **Gestos de cámara:** pellizco en aérea y doble toque para centrar, si aportan una mejora
  y no interfieren con los controles.
- **Ayuda inicial:** valorar ocultar la ayuda de teclado tras aprender los controles.
- **Tipografía:** comparar Barlow local con la fuente actual únicamente si se desea más
  carácter; requiere acordar la incorporación y su atribución.
- **Mando y vibración:** para más adelante, con dispositivos reales para probarlos.

## Forma de trabajar

Una tanda visible y revisable por turno. Formatear los archivos modificados y pasar
`npm run check` al cerrar la tanda y antes del commit, sin repetir la batería completa
tras cada cambio pequeño de estilo. Repetir solo las vistas afectadas si aparece un
problema. Las pruebas de comportamiento se amplían cuando cambia la entrada.

Se conserva una sola versión candidata en la red local para las revisiones del usuario;
los servidores temporales de verificación se cierran al terminar. Comando de arranque
en `DESARROLLO.md`. No integrar, publicar ni hacer push sin petición.
