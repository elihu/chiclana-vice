# Interfaz de Chiclana Vice: diseño y desarrollo por tandas

Actualizado: 28/10/2026. Implementación iniciada en `feat/ui-chiclana`, pendiente de
revisión visual del usuario. Sustituye la propuesta de investigación del 27/10/2026.

## Objetivo

Dar cohesión a la interfaz, resolver solapes y dejar visible la calle, especialmente
al jugar en móvil horizontal. Desarrollo ágil: una tanda visible, revisión del usuario
en navegador y ajustes antes de seguir. No hace falta completar todo el plan para revisar.

Las capturas de la investigación inicial eran temporales y no se conservan. El diagnóstico
se contrastó con el CSS y los módulos de interfaz; no acredita tacto ni rendimiento en móvil.

## Dirección de diseño

- Identidad moderada: paneles azul noche, texto cal y amarillo albero para las acciones y
  el objetivo. Azul mar como apoyo si resulta necesario, sin llenar cada panel de colores.
- Fuente del sistema por ahora: `Avenir Next`, `Segoe UI`, `system-ui`. Barlow queda como
  comparación futura, preferiblemente local; añadirla requiere acordar su licencia y atribución.
- SVG propios para los botones, con el mismo tamaño y trazo. Sin librerías ni peticiones externas.
- Radios, bordes, espaciado y zonas seguras compartidos. Superficies sin desenfoque, también
  en calidad normal, para mantener sencilla la composición en móviles modestos.
- Controles táctiles con objetivos de al menos 48 px, etiquetas legibles y sin partir
  «FRENO / R». Conservar teclado, flechas, pedales y joystick fijo a pie en esta primera tanda.

| Variable    | Valor                         | Uso                                      |
| ----------- | ----------------------------- | ---------------------------------------- |
| `--cal`     | `#f5f2e8`                     | Texto principal                          |
| `--noche`   | `#12232b`                     | Paneles y texto sobre albero             |
| `--albero`  | `#f0c24b`                     | Acción principal, foco y objetivo        |
| `--surface` | Noche con opacidad alta       | Fondo común del HUD                      |
| `--border`  | Cal con opacidad baja         | Bordes discretos                         |
| `--edge`    | 24 px escritorio, 16 px móvil | Margen combinado con `safe-area-inset-*` |
| `--radius`  | 14 px                         | Paneles y botones                        |
| `--tap`     | 48 px                         | Herramientas y cierre                    |

La legibilidad se revisa sobre la escena diurna y al anochecer. Los colores propuestos
no sustituyen una comprobación de contraste, especialmente sobre superficies transparentes.

## Composición

Se toma el móvil horizontal como caso más restrictivo de altura; vertical y escritorio
mantienen las mismas prioridades de información.

- **Encargo:** bloque superior compacto; objetivo y distancia visibles. Permitir varias
  líneas cuando haga falta, sin recortar información para cumplir un límite de caracteres.
- **Herramientas:** conservar las cuatro acciones accesibles en esta tanda para no cambiar
  a la vez distribución y navegación. En horizontal, grupo de dos por dos; en vertical,
  columna derecha. Valorar después agrupar las menos frecuentes si siguen ocupando demasiado.
- **Minimapa:** izquierda, fuera de las zonas de pulgar. Calle actual con truncado visual.
- **Velocidad:** lectura independiente de GAS para que el pulgar no la tape.
- **Avisos:** bajo el encargo, con el centro de la carretera libre. Aspecto compartido,
  funciones distintas: la indicación contextual vuelve al desaparecer el mensaje temporal.
- **Controles:** dos zonas inferiores para conducir; joystick izquierdo a pie. Mantener
  las capacidades y revisar el espacio con varios dedos en el móvil del usuario.
- **Pausa:** resumen y acciones en dos columnas en horizontal; cierre accesible y contenido
  desplazable en pantallas pequeñas. Mantener todas las opciones.
- **Fuentes:** conservar el acceso y el texto de atribución existente. No cambiar licencias
  ni atribuciones como parte de la reorganización visual.

## Tandas revisables

### Tanda 1: primera composición (implementada)

Rama: `feat/ui-chiclana`.

- Paleta albero/cal/noche, tipografía de sistema y superficies comunes.
- Iconos SVG de herramientas y controles, conservando los identificadores del DOM.
- Reorganización de HUD en escritorio, vertical y horizontal; avisos fuera del centro.
- Un único estado `body.touch-enabled`, conectado a la detección táctil existente.
- Flechas, pedales y joystick actual con estilos coherentes; velocímetro separado.
- Pausa en dos columnas en horizontal y zonas seguras en los diálogos.

Revisión del usuario: bienvenida, conducción, a pie, encargo, aviso y pausa, primero en
horizontal y después en vertical. Ajustar esta composición antes de abrir nuevos frentes.

### Tanda 2: menús y reducción de ruido (implementación iniciada)

El usuario pidió continuar tras revisar la primera tanda. Se mantiene `feat/ui-chiclana`
para revisar el conjunto antes de integrar, sin cambiar de rama ni tocar `main`:

- Ayuda dividida en «Controles», «Sobre el mapa» y «Fuentes», con navegación de teclado,
  cabecera y botón de volver fijos. Textos de manejo reorganizados en tarjetas; fuentes y
  aproximaciones conservadas. Desde pausa, volver regresa a pausa; Fuentes abre su pestaña.
- Bienvenida con presentación breve y chips; dos columnas en móvil horizontal. Pausa con
  resumen de progreso y acciones más claras.
- Mapa y búsqueda con mejor uso del espacio disponible y cierre siempre accesible: mapa
  arriba y búsqueda debajo en vertical, columnas en horizontal. Callejero y Ortofoto con
  selección explícita, contador de destinos y aviso de traslado antes de elegir una calle.
- Pendiente de la revisión: valorar qué herramientas pueden agruparse y qué ayuda inicial
  puede ocultarse al aprenderla.
- Revisar tamaños de texto y prioridades con los nombres y mensajes más largos.

### Tanda 3: alternativas de control

En otra rama, después de estabilizar la distribución:

- Giro analógico opcional con zona muerta; decidir el predeterminado tras conducir en móvil.
- Probar joystick flotante a pie por separado.
- Tamaño de controles y modo zurdo, comprobando también minimapa y velocímetro.
- Pellizco y doble toque solo si aportan una mejora y no chocan con los controles.
- Aprovechar la limpieza de entradas existente en `blur` y `visibilitychange`; completar
  la cancelación que necesiten los nuevos gestos, incluida la rotación de pantalla.

Mando y vibración quedan para después, sin bloquear estas tandas.

## Forma de trabajar y comprobar

- Una tanda visible y revisable por turno; el usuario dirige los siguientes ajustes.
- Formatear los archivos modificados. Ejecutar `npm run check` al cerrar la tanda y antes
  del commit, sin repetir baterías completas tras cada cambio de estilo.
- Una revisión breve en Chrome con los tamaños 1280×720, 390×844 y 844×390, corrigiendo
  solapes evidentes. Repetir solo las vistas afectadas si aparece un problema.
- Sin nuevas dependencias, cambios de datos, huellas de escena ni pruebas de rendimiento
  para esta tanda de interfaz. Si cambia el comportamiento de entrada, comprobarlo de forma
  dirigida y ampliar las pruebas solo cuando haya una razón concreta.
- Servir localmente una sola versión candidata para que el usuario la pruebe. No publicar,
  integrar ni hacer push sin petición. El usuario ha pedido poder revisar en localhost:
  mantener disponible ese servidor durante la revisión; cerrar los servidores temporales
  de verificación al terminar. Comando de arranque en `DESARROLLO.md`.
- Informar de lo verificado y lo pendiente: los verificadores con DOM/WebGL simulados y
  Chrome con SwiftShader no prueban tacto, GPU real, FPS ni iOS.
