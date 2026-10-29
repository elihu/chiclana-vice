# Fase R4: coste por fotograma

Base: `main` en `9a8da1f`, Node v26.8.2. Artefactos de medición y huellas en
`/tmp/chiclana-r4/`, fuera del repositorio. CPU con DOM y WebGL simulados; sin
capturas ni Chrome. Estas medidas no acreditan GPU, FPS ni móvil.

## Paso 1: perfil de referencia

Perfil con `node --cpu-prof --cpu-prof-interval=100` sobre `tools/bench-startup.mjs`.
Se cuentan solo muestras descendientes de `game/update.js:update`, incluidos los 60
pasos de calentamiento y los 1.200 medidos. La clasificación suma tiempo propio,
excluyendo Three.js y el arnés. El arranque queda fuera de la clasificación.

| Función propia    | Archivo y línea en main      | Tiempo propio muestreado (ms) |
| ----------------- | ---------------------------- | ----------------------------: |
| `roadAt`          | `world/surface-model.js:716` |                       129,514 |
| `inBuilding`      | `world/spatial.js:49`        |                        34,939 |
| `updateCamera`    | `engine/camera.js:112`       |                        27,590 |
| `dividerHeightAt` | `world/surface-model.js:807` |                        14,467 |
| `cameraSweep`     | `engine/camera.js:61`        |                        13,439 |

Total de muestras dentro de `update`: 362,207 ms. Los tiempos del perfil son
estadísticos; las medianas del banco se miden por separado, sin perfilador.

## Paso 2: optimización descartada por el umbral de arranque

Se ensayó reutilizar la altura de origen en los barridos de cámara y un `Set` por
barrido, aplazar el cálculo de dirección a pie hasta que hubiera movimiento,
compartir la distancia al objetivo del HUD y reutilizar la pendiente del vehículo
cuando solo cambiaba su balanceo. Un caso añadido a `verify-surfaces.mjs`
contrastó el balanceo con la colocación completa y comprobó que no consultaba de
nuevo el suelo. Lint y el verificador de superficies pasaron.

Las dos huellas fueron idénticas a main, incluidos los 600 pasos de simulación.
Sin embargo, se **descarta el paso completo**: el arranque total empeora un
3,017985 %, superior al 3 % permitido, aunque el coste por paso baja.
No se aplica el umbral a etapas sueltas ni se redondea para admitir el cambio.
La implementación y su prueba se revierten antes de confirmar este paso.
El parche ensayado se conserva fuera del repositorio en
`/tmp/chiclana-r4/paso-2-descartado.patch`.

Medianas de tres procesos por revisión, misma máquina y Node v26.8.2, alternando
main y rama sin verificaciones concurrentes:

| Medida              |         main | Ensayo descartado |  Diferencia |
| ------------------- | -----------: | ----------------: | ----------: |
| Arranque total (ms) | 6.638,575014 |      6.838,926186 | +3,017985 % |
| update (ms/paso)    |  0,266123016 |       0,246455113 | −7,390530 % |

| Ejecución | main: arranque (ms) | Ensayo: arranque (ms) | main: update (ms/paso) | Ensayo: update (ms/paso) |
| --------- | ------------------: | --------------------: | ---------------------: | -----------------------: |
| 1         |        7.231,996594 |          6.838,926186 |            0,266123016 |              0,232954112 |
| 2         |        6.638,575014 |          6.640,796807 |            0,270694128 |              0,246455113 |
| 3         |        6.628,246288 |          7.391,542645 |            0,256596713 |              0,251753543 |

Los JSON de esta tanda son `final-main-{1,2,3}.json` y
`final-rama-{1,2,3}.json`. La primera tanda (`main-*.json`, `rama-*.json`) coincidió
con otras verificaciones; se descarta por contención y no se usa para decidir.

Perfil del ensayo descartado, con el mismo procedimiento del paso 1:

| Función propia | Archivo y línea en el ensayo | Tiempo propio muestreado (ms) |
| -------------- | ---------------------------- | ----------------------------: |
| `roadAt`       | `world/surface-model.js:716` |                       116,050 |
| `inBuilding`   | `world/spatial.js:49`        |                        33,692 |
| `updateCamera` | `engine/camera.js:116`       |                        27,574 |
| `cameraSweep`  | `engine/camera.js:61`        |                        14,598 |
| `stepAgent`    | `game/traffic.js:90`         |                        14,268 |
