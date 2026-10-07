# Plan de implementación del relieve del terreno

Fecha: 7/10/2026. Base revisada: `main` en `d11e1d0` (versión 1.1.0). Estado: **plan, no
implementado**. Este documento permite ejecutar la incorporación del terreno tras la
fase 3 del [plan modular](PLAN-MODULAR.md). Complementa el inventario de
[plan-modular/TERRENO.md](plan-modular/TERRENO.md); en las decisiones de implementación
que difieran, seguir este documento y actualizar después el inventario.

## 1. Resultado y límites

Incorporar desniveles reales al sector actual, con una rejilla estática derivada del MDT
del IGN y una malla de aproximadamente 10 m. Edificios, fachadas, pavimentos, objetos,
actores y cámaras deben compartir la referencia vertical. Conservar coordenadas en
planta, contornos, patios, plantas, calles, misiones, controles y modo ligero.

La física y las rutas seguirán en 2D. No implementar gravedad, saltos, dinámica de
suspensión, túneles ni circulación simultánea encima y debajo de un puente. Las alturas
`b.h`, `visualH` y `renderH` siguen siendo alturas relativas del edificio; la cota del
terreno se suma por separado. No usar `height-samples.json` como terreno: contiene
alturas de edificios normalizadas al suelo.

La ejecución está solicitada el 7/10/2026, en una rama y worktree propios. No autoriza
push, etiquetas, publicación, nuevas dependencias ni cambios de atribuciones. Preparar
las propuestas concretas y pedir las autorizaciones que exige `AGENTS.md` cuando
corresponda. Los textos legales se mantienen exclusivamente en
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## 2. Datos comprobados y decisiones

Revisión contra la versión 1.1.0: conservar `crossesWall` al salir del coche, los
márgenes de colisión de patios también en `cameraSweep`, la optimización de
`nearestRoad` y `reloadGroundTexture` al cambiar de calidad. No reintroducir FrontSide
en los muros: la decisión vigente mantiene DoubleSide. La CI y el despliegue ya se han
verificado en GitHub; Android ha probado la versión plana, sin FPS medidos. Eso no
acredita el futuro relieve ni iOS.

El [MDT de PNOA](https://pnoa.ign.es/pnoa-lidar/modelo-digital-del-terreno) representa el
terreno sin edificios ni vegetación. El [catálogo de servicios del
IGN](https://www.ign.es/web/ign/portal/ide-area-nodo-ide-ign) ofrece descarga WCS a 5 m.
Usar ese producto para la primera versión; no procesar nubes LAZ ni depender de servicios
externos durante la partida.

En la investigación del 6/10 se consultó `Elevacion4258_5` en
`https://servicios.idee.es/wcs-inspire/mdt`, con WCS 2.0.1 y formato `application/asc`.
El recorte de longitudes -6.156 a -6.141 y latitudes 36.415 a 36.424 devolvió 333 × 200
muestras; el servicio envolvió el ASCII en una respuesta multipart. Los valores iban de
0 a 51 m, con percentiles 5 y 95 de aproximadamente 2,1 y 27,4 m. Muestras cercanas al
Mercado y Plaza Mayor dieron aproximadamente 3 y 14 m. **Son observaciones exploratorias,
no cotas verificadas ni criterios de aceptación.** Repetir y conservar la evidencia; no
asumir que esos archivos siguen en `/tmp` ni que los extremos son artefactos.

Decisiones iniciales:

- Rejilla de juego de unos 10 m, cubriendo exactamente `world.size`, con pasos efectivos
  `width / (columns - 1)` y `height / (rows - 1)`. Descarga con margen de 20 m para
  interpolar el borde. No cambiar el tamaño del mapa para redondearlo a la rejilla.
- Una única superficie de terreno en ambos modos de calidad. Sin LOD inicial: así
  actores, pavimentos y dibujo coinciden y cambiar de calidad no mueve nada.
- Cotas relativas a una referencia fija documentada, tomada del MDT en el origen local;
  conservar también la cota absoluta de esa referencia. No exagerar el relieve.
- Interpolación lineal por triángulos, con la misma diagonal que la malla. No interpolar
  bilinealmente para los actores sobre una malla triangular diferente.
- Rejilla binaria pequeña, sin motor GIS en navegador: `terrain.json` como manifiesto y
  `terrain.bin` con enteros Int16 little-endian, escala 0,1 m y alturas relativas. Fallar
  al exportar si exceden el rango; no saturar valores silenciosamente. La cuantización
  no implica precisión geográfica de 10 cm.

## 3. Fase A: auditoría reproducible del MDT

**Archivos nuevos propuestos:** `tools/audit-terrain.py`,
`source-data/terrain-audit.json`. No publicar todavía una capa de terreno.

1. Crear rama y worktree propios. Leer las guías indicadas por `AGENTS.md`, registrar
   commit base, ejecutar `npm run check` y guardar una huella con
   `node tools/scene-fingerprint.mjs --out /tmp/chiclana-terreno-base.json`.
2. Reconsultar GetCapabilities y DescribeCoverage: identificador, orden de ejes, CRS,
   formatos, tamaño de celda, NoData, unidades y referencia vertical. No deducir el CRS
   del nombre del producto: la respuesta exploratoria describía coordenadas geográficas.
3. Descargar únicamente el recorte con margen a una caché fuera de Git. Soportar el
   envoltorio multipart y leer los centros de píxel correctamente; invertir filas al
   convertir norte→sur a `z` creciente. Usar la transformación local del proyecto, sin
   cambiar la proyección de las capas existentes.
4. Registrar URL exacta, fecha de consulta, SHA-256 del original, cabeceras, extensión,
   resolución y transformaciones. Separar fecha de descarga de fecha de adquisición;
   esta última queda «sin confirmar» si no hay evidencia.
5. Auditar huecos, mínimos/máximos, percentiles, pendientes y discontinuidades. Comparar
   calles y zonas de Mercado, Ayuntamiento, Plaza Mayor, iglesias, río y extremos del
   mapa con perfiles y una vista de relieve. No rellenar NoData como cero ni suavizar
   indiscriminadamente las pendientes.
6. Si hay huecos o saltos sospechosos en zonas transitables, investigar el original y
   documentar cualquier corrección. No activar el relieve hasta resolverlos.

**Salida aceptable:** recorte recuperable mediante un comando documentado, auditoría
sin rásteres en Git y decisión explícita de que los datos sirven para el piloto.
Python siempre con `uv run --no-project python`; cualquier necesidad de dependencias
adicionales se tramita conforme a las instrucciones del repositorio.

## 4. Fase B: exportador y contrato de carga

**Archivos:** nuevo `tools/export-terrain.py`, nueva prueba `tests/verify-terrain.mjs`,
`web/js/world/terrain.js`, `world/loader.js`, `app.js`, `core/state.js`,
`tools/export-provenance.mjs` y `tests/verify-world.mjs`.

El manifiesto generado incluirá versión, origen geográfico, tamaño del mundo, límites
locales, filas/columnas, pasos efectivos, orden de filas, diagonal de triangulación,
escala, referencia vertical y cota de referencia, archivo binario, checksum y evidencia
de fuente/transformación. Mantener los campos de procedencia que exige `tools/AGENTS.md`;
el texto de atribución se prepara para aprobación antes de incorporarlo.

- Exportar determinísticamente: mismas entradas y configuración, mismos bytes. No
  introducir la fecha actual en cada regeneración; pasar la fecha de adquisición de
  datos y la consulta registrada como entradas.
- Validar tamaño binario exacto, enteros, versión, nombres de archivo locales, origen y
  extensión frente al mundo. Registrar ambos archivos en procedencia y comprobar sus
  checksums. Añadir una huella de terreno independiente; no renovar la huella geográfica
  de edificios/vías para esconder un cambio accidental.
- Crear en `world/terrain.js` un terreno validado que mantenga la interfaz existente
  `heightAt(terrain, x, z)`. Consultas finitas, sin asignaciones por muestra. Al salir
  ligeramente del mapa, limitar a su borde; no extrapolar pendientes.
- Ausencia de la capa (404): usar `flatTerrain`, sin error fatal. Capa presente pero
  inválida, binario ausente o checksum incorrecto: error claro, sin mundo parcialmente
  elevado. Un fallo de red permite volver al plano con aviso; distinguirlo de datos
  inválidos. Probar cada caso explícitamente.
- `loadLayers` obtiene la capa y `init` fija `world.terrain` antes de construir nada.
  Incorporar el recurso al mock del arnés y la API necesaria a `test-api.js`.

**Aceptación:** pruebas con plano, rampa y celda no coplanaria; centros, esquinas,
diagonal, bordes y orientación norte/sur correctos. Exportación reproducible y consultas
coincidentes con los triángulos. La implementación no depende del MDT remoto en ejecución.

## 5. Fase C: suelo y edificios

**Archivos:** nuevo constructor `world/terrain-mesh.js`, `engine/renderer.js`, `app.js`,
`world/buildings.js`, `world/facades.js`, `world/facade-kit.js`,
`world/facade-composer.js` y validadores de diseño cuando haga falta.

- Mantener la integración con `reloadGroundTexture`: los materiales nuevos deben
  participar en su actualización; cambiar calidad actualiza todo el suelo sin perder
  alturas ni dejar materiales con texturas liberadas.
- Crear una malla indexada con normales y UV de la ortofoto en planta. Un material;
  dividir en celdas compartiendo exactamente los vértices de frontera solo si mejora
  una medición. No convertir cada celda de la rejilla en una malla.
- Conservar las capas del grafo de módulos: `app` puede construir la geometría desde
  `world` y pasarla al renderizador; `engine/renderer` no importa constructores de
  `world`. Los módulos puros de muestreo no deben depender del DOM ni de Three.
- Sustituir el plano exterior por una transición desde el borde real hacia el exterior
  decorativo. No poner un plano grande por encima de las zonas bajas ni dejar una
  discontinuidad visible al pie del sector. Su cota es una aproximación documentada.
- Tras indexar edificios, calcular `baseY` en memoria. Primera regla: cota máxima del
  terreno muestreado dentro del contorno y sobre sus aristas, excluyendo patios, para
  mantener la cubierta horizontal y evitar terreno atravesando la planta. Muestrear
  también a lo largo de aristas largas. Auditar desnivel y separación de bases entre
  partes contiguas; resolver conjuntos monumentales con una base compartida explícita.
- Muros desde el terreno local (con pequeño solape) hasta `baseY + renderH`; zócalo hasta
  `baseY`, cubierta horizontal. Mantener patios abiertos y triangulación de cubierta.
- Fachadas y recetas usan la misma base del edificio, no una base distinta por frente.
  Puertas en pendiente necesitan un acceso/zócalo coherente. Las alturas de anclajes
  `world`, incluida la cúpula, se interpretan explícitamente: no sumar terreno dos veces.
  Si hace falta una regla de base o acceso de autor, añadirla al diseño y su esquema;
  no introducir IDs especiales dispersos en código.
- No cambiar `h`, plantas ni el significado de las alturas de `frontages.json`. Revisar
  el exportador del catálogo para que no convierta alturas relativas en cotas absolutas.

**Aceptación:** tejados horizontales, fachadas alineadas y edificios sin huecos inferiores
ni terreno atravesando puertas principales. Geografía en planta y datos originales
intactos. Con terreno plano, resultado equivalente al anterior; comparar huella y
explicar cualquier diferencia de bytes, sin actualizarla automáticamente.

## 6. Fase D: calles, agua y puentes

**Archivos:** `world/streets.js`, `engine/materials.js`, `world/terrain.js`,
`world/design-validate.js`, `city-design.json` y su esquema si se amplía el diseño.

Calzadas, plazas, pasos y líneas deben sumar sus desfases actuales al suelo. No basta con
asignar altura a las esquinas de un polígono grande: subdividir o cortar su triangulación
contra las celdas del terreno para que el interior no atraviese la malla. Compartir
vértices y mantener continuidad en cruces y límites de material.

El MDT describe el terreno bajo el puente. Añadir una superficie de paso independiente:
`groundHeightAt` equivale a terreno; `surfaceHeightAt(x, z)` añade los tableros y sus
accesos. Construir un índice espacial estático de puentes antes de colocar actores;
el muestreo no recorre todas las vías por frame. Los coches, peatones y mobiliario sobre
el puente utilizan su tablero; sus postes y barandillas parten del mismo perfil.

Determinar el perfil de cada puente con la cota de sus accesos y evidencia disponible;
interpolar longitudinalmente y revisar continuidad y pendiente. Parámetros manuales
solo en diseño validado y con justificación. La lámina de agua tiene una cota propia
coherente por tramo, no se drapea sobre el terreno. No inventar profundidad de cauce ni
nivel de marea como si fueran mediciones. Resolver la ambigüedad arriba/abajo dentro del
alcance 2D antes de activar un puente como superficie transitable.

**Aceptación:** recorrido de ambos sentidos por los puentes, sin salto de cota, coches
hundidos ni agua atravesando tableros. Las pendientes problemáticas bloquean el cierre
de esta fase; no se arreglan cambiando el trazado OSM sin una tarea específica.

## 7. Fase E: actores, objetos, cámaras e inspector

Seguir el inventario de [Desarrollo](DESARROLLO.md#terreno), incluyendo:

- `world/furniture.js`, `vegetation.js`, `signs.js`: sumar la base a las instancias sin
  perder lotes; postes y troncos siguen verticales. Elegir suelo o superficie de paso
  según dónde se colocan.
- `game/player.js`, `update.js`, `traffic.js`, `police.js`, `app.js`: jugador, coches
  propios, aparcados, tráfico, patrullas y peatones consultan la superficie. Cubrir
  aparición, entrada/salida, teletransporte y bienvenida, no solo el bucle normal.
- Vehículos: orientación por muestras delanteras/traseras y laterales de la superficie;
  conservar el rumbo y límites de inclinación documentados. No añadir fuerzas físicas.
  Una carretera plana conserva orientación y posición anteriores.
- `game/missions.js`, `ui/hud.js`: marcadores y etiquetas relativos a su superficie;
  anillos drapeados cuando atraviesen una pendiente. Minimap y búsqueda siguen en planta.
- `engine/camera.js`: ojo, seguimiento, vista aérea, objetivos y sol relativos al
  jugador. `cameraSweep` usa límites `baseY`/`baseY + renderH`; además evita atravesar
  terreno y tableros. Primera persona sobre un coche inclinado debe seguir el asiento.
- `debug/inspector.js`: seleccionar la malla de suelo real, mostrar cota de terreno,
  superficie de paso y referencia vertical. Las coordenadas copiadas en planta conservan
  su significado; indicar si una altura copiada es absoluta o relativa.

**Aceptación:** mismas misiones, controles y rutas; ausencia de saltos al entrar/salir de
coche o pausar; todas las cámaras transitables y selección correcta en `?debug`.

## 8. Fase F: validación, rendimiento y cierre

1. Pruebas puras de terreno, exportador, contrato y superficies de puente; añadirlas al
   comando de tests existente sin cambiar workflows. Probar datos inválidos y modo plano.
2. Verificar geografía, plantas, patios, sentidos, rutas y partidas conservadas. Reutilizar
   el arnés para rampas sintéticas y comprobar bases, ruedas, cámaras y marcadores. No
   fijar recuentos que dependan del número de edificios o muestras.
3. Ejecutar generadores, `node tools/export-provenance.mjs`, `npm run format` y
   `npm run check`. Regenerar catálogo solo si corresponde; revisar todos los diffs.
4. Probar Chrome real en raíz y bajo `/chiclana-vice/`, calidad normal/ligera, `?debug`,
   sin terreno y con la capa activa. `tools/browser-smoke.mjs` complementa esas pruebas,
   pero SwiftShader no acredita GPU ni rendimiento de móvil.
5. Recorrer Mercado→Plaza Mayor, Ayuntamiento, iglesias y ambos puentes; conducir,
   caminar, teletransportarse, completar encargos y probar todas las cámaras. Guardar
   capturas comparables y anotar defectos; no aprobar solo una vista aérea.
6. Medir misma máquina, navegador y ruta con `web/measure.js`. Objetivo inicial: unos
   27.000 triángulos adicionales para el suelo y unas decenas de KB de alturas, sin
   consultas de red ni raycasts por actor/frame. Registrar también el coste de pavimentos
   y zócalos, mallas, memoria y arranque. Como criterio de revisión, investigar una subida
   superior al 10 % en mediana o p95 de tiempo entre frames; no presentarlo como garantía.
7. Probar táctil y modo ligero en Android físico; iOS si se dispone. Si no hay dispositivo,
   registrar la limitación y dejar la verificación pendiente. La cobertura móvil de la
   versión plana no valida el terreno nuevo.
8. Actualizar fuentes/aproximaciones en `MAP_SOURCES.md`, reproducción en `DATOS.md`,
   arquitectura en `DESARROLLO.md` y anexos, y pendientes en `ESTADO.md` según el flujo.
   Tramitar la atribución concreta antes de añadirla y regenerar sus copias. Metadatos de
   `world.json` mediante su generador: dejar de afirmar «terreno plano» solo al activarlo.
9. Entregar rama, commits, comandos, mediciones, evidencias y pendientes. Integración y
   publicación únicamente por petición expresa; no limpiar worktrees ajenos.

## 9. Orden de ejecución y tamaño del trabajo

Ejecutar A → B → C → D → E → F. No activar terreno real por defecto hasta que D y E
estén completos. El piloto intermedio sirve para revisión visual, no para publicar un
mundo con edificios o actores aún a cota cero. Mantener `flatTerrain` como alternativa
completa y verificable.

Estimación orientativa: 1–2 jornadas para datos y piloto; 4–7 para una integración
jugable, más el acabado de accesos y puentes. No es un presupuesto cerrado: comprobar
el MDT y resolver bases de monumentos son los principales factores de incertidumbre.
Si una fase encuentra datos insuficientes, entregar el diagnóstico y mantener el modo
plano; no sustituir las cotas por valores inventados para cerrar los tests.
