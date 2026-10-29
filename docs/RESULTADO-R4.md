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

## Paso 3: reglas de ESLint sin activar

La comprobación temporal de `complexity: [warn, 40]` y
`max-lines-per-function: [warn, 150]`, limitada a `web/js/`, da 12 avisos en 11
funciones. No se activa ninguna de las reglas ni se amplía esta fase para partir
funciones. ESLint usa los valores predeterminados para contar líneas, incluidos
comentarios y líneas en blanco.

| Función                 | Archivo                            | Líneas si supera 150 | Complejidad si supera 40 |
| ----------------------- | ---------------------------------- | -------------------: | -----------------------: |
| `init`                  | `app.js:55`                        |                  192 |                        — |
| `carModel`              | `game/car-model.js:586`            |                  176 |                        — |
| `buildBody`             | `game/people.js:85`                |                  182 |                        — |
| `composeBuilding`       | `world/facade-composer.js:197`     |                    — |                       43 |
| `createFacadeKit`       | `world/facade-kit.js:39`           |                  257 |                        — |
| `buildUrbanFurniture`   | `world/furniture.js:15`            |                  205 |                        — |
| `validateSurfaceDesign` | `world/surface-validate.js:17`     |                  263 |                      135 |
| `validateCityDesign`    | `world/validate-city.js:11`        |                  388 |                        — |
| `validateCorrections`   | `world/validate-corrections.js:18` |                  153 |                        — |
| `validateFacadeDesigns` | `world/validate-facades.js:80`     |                  353 |                        — |
| `checkNode`             | `world/validate-facades.js:155`    |                    — |                       50 |

## Estado final conservado

Solo cambia este informe. `git diff main -- web tests eslint.config.mjs` está vacío.
No queda ninguna optimización ni cambio de configuración en la rama.

Se repite el perfil sobre el estado final (`conservado-rama.cpuprofile`), con
451,513 ms de muestras dentro de `update`:

| Función propia    | Archivo y línea              | Tiempo propio muestreado (ms) |
| ----------------- | ---------------------------- | ----------------------------: |
| `roadAt`          | `world/surface-model.js:716` |                       163,522 |
| `inBuilding`      | `world/spatial.js:49`        |                        43,490 |
| `updateCamera`    | `engine/camera.js:112`       |                        28,082 |
| `dividerHeightAt` | `world/surface-model.js:807` |                        21,593 |
| `pInside`         | `core/math.js:9`             |                        19,120 |

Medianas finales de tres, misma máquina y Node v26.8.2. La referencia main es la
tanda alternada anterior; la rama conservada se mide después de la reversión,
sin otras verificaciones concurrentes:

| Medida              |         main | Rama conservada |
| ------------------- | -----------: | --------------: |
| Arranque total (ms) | 6.638,575014 |    7.876,531709 |
| update (ms/paso)    |  0,266123016 |     0,291067938 |

| Ejecución de rama conservada | Arranque (ms) | update (ms/paso) |
| ---------------------------- | ------------: | ---------------: |
| 1                            |  6.958,962423 |      0,268369667 |
| 2                            |  9.070,092985 |      0,291067938 |
| 3                            |  7.876,531709 |      0,293326813 |

Los JSON son `conservado-rama-{1,2,3}.json`. Hay dispersión incluso con el código
idéntico a main; los tiempos finales no demuestran una regresión causada por
código ni una mejora. No se repite la medición buscando un resultado favorable.
El ensayo se mantiene descartado por el umbral literal de su comparación.

## Verificación de cierre

- Huella final con relieve: idéntica a `huella-main.json`, sin omitir claves.
- Huella final sin relieve: idéntica a `huella-main-plano.json`, sin omitir claves;
  copia de `git archive HEAD`, sin `terrain.json` ni `terrain.bin`.
- Ambas comparan escena, render, rutas, recursos y comportamiento de 600 pasos,
  incluido el DOM inicial y final.
- Comprobación completa: `npm run check` (lint sin avisos, formato y verificadores).
- Las huellas y los bancos emiten el aviso del arnés sobre `addColorStop` al
  preparar el suelo cercano, tanto en main como en la rama; no impide las huellas.
- Sin capturas, Chrome, push ni merge. No se cambia `docs/ESTADO.md`.
