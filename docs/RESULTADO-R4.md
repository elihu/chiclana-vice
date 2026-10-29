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
