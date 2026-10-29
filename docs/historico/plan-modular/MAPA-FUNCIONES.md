# Anexo: mapa de funciones de `game3d.js` a módulos

Parte de [PLAN-MODULAR.md](../PLAN-MODULAR.md). Cada fila es una función o bloque de
`web/game3d.js` en `main` 5666928, por nombre y en el orden del archivo. «Paso» es el
paso de la fase 1 en que se mueve. Rutas relativas a `web/js/`. Las dependencias de cada
módulo (sus `import`) se deducen de lo que usa el código movido; el reparto está hecho
para que no haya ciclos.

## Núcleo, estado y utilidades

| Función o bloque                                                                                                       | Destino           | Paso    | Notas                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------- | ------- | --------------------------------------------------------------------------- |
| `ASSET_VERSION`, `asset`                                                                                               | `core/assets.js`  | 1.8     | En 1.1 la versión pasa a llegar por `startGame`; `setAssetVersion(v)` nuevo |
| `await import` de Three, `game-data.js`, `progress.js`                                                                 | imports estáticos | 1.1     | Cada módulo importa lo que usa                                              |
| `$`, `domRefs`, `domValues`, `ui`, `domCache`, `setText`, `setStyle`                                                   | `core/dom.js`     | 1.8     | `domRefs` y `domValues` privados                                            |
| `clamp`, `lerp`, `TAU`                                                                                                 | `core/math.js`    | 1.8     |                                                                             |
| Bloque `let city, facadeProfiles, …, routeClock`                                                                       | `core/state.js`   | 1.4–1.6 | Grupos `world`, `gfx`, `session` (ESTADO-COMPARTIDO.md)                     |
| Bloque `let audioOn, audioCtx, engineOsc, engineGain`                                                                  | `core/state.js`   | 1.6     | Objeto `audio`                                                              |
| `let W, H, coarse`                                                                                                     | `core/state.js`   | 1.5     | Valores asignados en `installTouchDetection` (1.2)                          |
| `touchSeen`, `coarseQuery` y oyente `pointerdown` de captura                                                           | `ui/controls.js`  | 1.17    | Función `installTouchDetection()` (creada en 1.2)                           |
| `randSeed`, `rnd`                                                                                                      | `core/random.js`  | 1.8     | `randSeed` privado                                                          |
| `input`, `keys`                                                                                                        | `core/state.js`   | 1.3     | Contenedores                                                                |
| `let joyId, dragId, dragX, dragY`                                                                                      | `core/state.js`   | 1.7     | Objeto `pointer`                                                            |
| `let orbit, lookPitch, orbitAge, firstPersonCar`                                                                       | `core/state.js`   | 1.7     | Objeto `view` (con `mode`)                                                  |
| `stored`, línea de `quality`                                                                                           | `game/save.js`    | 1.10    | `loadSavedProgress()` (creada en 1.2)                                       |
| `state`, `player`, `base`, `camPos`…`labelPoint`                                                                       | `core/state.js`   | 1.3     |                                                                             |
| `cars`, `police`, `traffic`, `vehicles`, `people`, `chunks`, `waterAreas`, `pois`, `graph`, `segments`, `buildingGrid` | `core/state.js`   | 1.3     |                                                                             |
| `let character, sun, ring, beam, arrow`                                                                                | `core/state.js`   | 1.5/1.7 | `sun` en `gfx`; el resto en `actors`                                        |
| `loadProgress`                                                                                                         | `ui/feedback.js`  | 1.10    |                                                                             |
| `sleepFrame`                                                                                                           | `core/dom.js`     | 1.8     |                                                                             |
| `toast`                                                                                                                | `ui/feedback.js`  | 1.10    |                                                                             |
| `save`                                                                                                                 | `game/save.js`    | 1.10    |                                                                             |
| `d`, `pInside`, `pointSeg`                                                                                             | `core/math.js`    | 1.8     | `fold` también va aquí                                                      |

## Espacio y grafo

| Función o bloque                                       | Destino            | Paso | Notas                                                                  |
| ------------------------------------------------------ | ------------------ | ---- | ---------------------------------------------------------------------- |
| `inBuilding`, `nearestRoad`, `blocked`, `safePoint`    | `world/spatial.js` | 1.11 |                                                                        |
| `buildGraph`, bucle de `city.roads`                    | `game/graph.js`    | 1.11 | Pasa a `buildRoadGraph()`                                              |
| `buildGraph`, bucle de `city.buildings` y `waterAreas` | `world/spatial.js` | 1.11 | Pasa a `indexBuildings()`, llamada justo después de `buildRoadGraph()` |
| `connectOpenSpaces`                                    | `game/graph.js`    | 1.11 |                                                                        |
| `driveNetwork`                                         | `core/state.js`    | 1.3  |                                                                        |
| `driveComponents`, `orientDriveGraph`, `nearestNode`   | `game/graph.js`    | 1.11 |                                                                        |
| `routeDist`…`heapNode`, `findRoute`                    | `game/graph.js`    | 1.11 | Las matrices de trabajo quedan privadas                                |

## Motor: materiales, geometría, texturas, render

| Función o bloque                                                                                                                                                      | Destino               | Paso | Notas                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---- | ---------------------------------------------------- |
| `mat`, `flatGeometry`, `flatPolygon`                                                                                                                                  | `engine/materials.js` | 1.9  |                                                      |
| `modelGeometryCache`, `modelMaterialCache`, `modelGeometry`, `modelMaterial`, `modelCylinder`, `modelBox`, `bevelGeometry`, `sculptedBox`, `mergeParts`, `modelParts` | `engine/materials.js` | 1.9  | Cachés privadas                                      |
| `facadeTexture`, `surfaceTexture`                                                                                                                                     | `engine/textures.js`  | 1.9  |                                                      |
| `init`: `new WebGLRenderer` … `scene.add(sun, sun.target)`, `applyQuality()`                                                                                          | `engine/renderer.js`  | 1.13 | `setupRenderer()`                                    |
| `init`: suelo con ortofoto y plano exterior                                                                                                                           | `engine/renderer.js`  | 1.13 | `addGroundPlanes()`                                  |
| `applyQuality`                                                                                                                                                        | `engine/renderer.js`  | 1.13 |                                                      |
| Oyente `resize` (parte del renderizador)                                                                                                                              | `engine/renderer.js`  | 1.13 | `resizeRenderer()`; el oyente sigue en `controls.js` |

## Mundo: datos y constructores

| Función o bloque                                                                                                                                           | Destino                   | Paso    | Notas                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------- | -------------------------------------------------------------------- |
| `originalFacadeStreets`                                                                                                                                    | `world/facades.js`        | 1.14    | Exportada; la usa `furniture.js`. En 2.8 pasa a `city-design.json`   |
| `facadeWork`                                                                                                                                               | `core/state.js`           | 1.3     |                                                                      |
| `applyHeightSamples`                                                                                                                                       | `world/loader.js`         | 1.12    |                                                                      |
| `prepareFacades`                                                                                                                                           | `world/facades.js`        | 1.14    |                                                                      |
| `buildDetailedFacades`                                                                                                                                     | `world/facades.js`        | 1.14    | En 2.2 sus funciones internas pasan a `world/facade-kit.js`          |
| — internas `material`, `cube`, `geo`, `wall`, `pane`, `balcony`, `archShape`, `arch`, `pediment`, `sign`, `civicPane`, `cross`, `column`, `door`, `belfry` | `world/facade-kit.js`     | 2.2     | `createFacadeKit({ staging, palette })`                              |
| — bloques Ayuntamiento, Mercado, `nave`, Jesús Nazareno, San Telmo, San Juan Bautista, frentes de calle                                                    | `web/facade-designs.json` | 2.4–2.8 | Recetas                                                              |
| — `closedSolid`, `frontSide`, lotes por material y celda                                                                                                   | `world/facades.js`        | 1.14    | Se quedan en el motor de fachadas                                    |
| `buildBuildings`                                                                                                                                           | `world/buildings.js`      | 1.14    | La paleta y las alturas especiales pasan a `city-design.json` en 2.9 |
| `buildRoadDetails`                                                                                                                                         | `world/streets.js`        | 1.14    | Marcas viales, agua y puentes                                        |
| `mappedStreetObjects`                                                                                                                                      | `core/state.js`           | 1.4     | `world.mappedStreetObjects`                                          |
| `streetEnvironment`                                                                                                                                        | `core/state.js`           | 1.3     |                                                                      |
| `buildStreetSurfaces`                                                                                                                                      | `world/streets.js`        | 1.14    |                                                                      |
| `buildUrbanFurniture`                                                                                                                                      | `world/furniture.js`      | 1.14    |                                                                      |
| `addVegetationCells`, `buildTrees`                                                                                                                         | `world/vegetation.js`     | 1.14    |                                                                      |
| `addSigns`                                                                                                                                                 | `world/signs.js`          | 1.14    |                                                                      |
| `loadWorld`                                                                                                                                                | `world/loader.js`         | 1.12    | En 2.10 aplica `map-corrections.json`                                |
| `init`: `Promise.all` de capas                                                                                                                             | `world/loader.js`         | 1.12    | `loadLayers()`                                                       |

## Jugabilidad

| Función o bloque                                                   | Destino            | Paso | Notas                                                       |
| ------------------------------------------------------------------ | ------------------ | ---- | ----------------------------------------------------------- |
| `carCabin`, `createCar`                                            | `game/vehicles.js` | 1.15 |                                                             |
| `createPerson`                                                     | `game/people.js`   | 1.15 |                                                             |
| `setupPOIs`, `target`                                              | `game/jobs.js`     | 1.17 | `target` aquí para que `hud.js` no dependa de `missions.js` |
| `init`: anillo, haz y flecha                                       | `game/jobs.js`     | 1.17 | `createMissionMarkers()`                                    |
| `spawnTraffic`                                                     | `game/traffic.js`  | 1.15 |                                                             |
| `start`                                                            | `game/flow.js`     | 1.17 |                                                             |
| `setHeat`, `dropPolice`, `updatePolice`                            | `game/police.js`   | 1.17 |                                                             |
| `advanceStage`                                                     | `game/missions.js` | 1.17 |                                                             |
| `rescue`, `interact`, `updatePlayer`                               | `game/player.js`   | 1.17 |                                                             |
| `nearestCar`, `carCollision`                                       | `game/vehicles.js` | 1.15 |                                                             |
| `updatePlayer`: bloque de audio del motor                          | `engine/audio.js`  | 1.16 | `updateEngineSound()`                                       |
| `stepAgent`                                                        | `game/traffic.js`  | 1.15 |                                                             |
| `update`: bucle de peatones                                        | `game/traffic.js`  | 1.15 | `updatePedestrians(dt)`                                     |
| `update`: objetivo, temporizador, entrega, lugares                 | `game/missions.js` | 1.17 | `updateMissions(dt)`, devuelve `goal`                       |
| `update`: anillo, haz y flecha                                     | `game/missions.js` | 1.17 | `updateMarkers(goal)`                                       |
| `update`: ruta del minimapa, órbita, `updateCamera`                | `game/update.js`   | 1.17 | Se quedan en `update`                                       |
| `update`: velocidad, modo, estado, distancia, tiempo, calle, pista | `ui/hud.js`        | 1.17 | `updateHudReadouts(goal)`                                   |
| `update`: guardado periódico                                       | `game/update.js`   | 1.17 | Se queda en `update`                                        |
| `update` (resto)                                                   | `game/update.js`   | 1.17 |                                                             |

## Cámara, audio e interfaz

| Función o bloque                                                                                        | Destino            | Paso | Notas                                                           |
| ------------------------------------------------------------------------------------------------------- | ------------------ | ---- | --------------------------------------------------------------- |
| `updateCameraVisibility`, `snapCamera`, `cameraSweep`, `constrainCamera`, `updateCamera`, `cycleCamera` | `engine/camera.js` | 1.16 |                                                                 |
| `updateHUD`                                                                                             | `ui/hud.js`        | 1.17 |                                                                 |
| `drawLabels`                                                                                            | `ui/hud.js`        | 1.17 |                                                                 |
| `streetNames`                                                                                           | `core/state.js`    | 1.4  | `world.streetNames`                                             |
| `chart`, `chartCtx`, `trace`, `prepareMap`, `drawMap`, `listStreets`, `openMap`, `closeMap`             | `ui/map.js`        | 1.17 | `chart` privado                                                 |
| `fold`                                                                                                  | `core/math.js`     | 1.8  |                                                                 |
| `mute`, `toggleAudio`                                                                                   | `engine/audio.js`  | 1.16 |                                                                 |
| `dialogOpener`, `openDialog`, `closeDialog`, `trapFocus`, `modal`, `closeModal`, `help`, `pauseMenu`    | `ui/dialogs.js`    | 1.17 |                                                                 |
| `clearInput`                                                                                            | `ui/input.js`      | 1.17 | Separado de `controls.js` para evitar el ciclo con `dialogs.js` |
| Asignaciones `$('start').onclick` … `$('mapStyle').onclick`                                             | `ui/controls.js`   | 1.17 | Dentro de `installControls()`                                   |
| `holdPointers`                                                                                          | `core/state.js`    | 1.3  |                                                                 |
| `bindHold`, prevención de menú contextual, `bindHold(...)`                                              | `ui/controls.js`   | 1.17 |                                                                 |
| `joy`, `joyMove`, oyentes del joystick                                                                  | `ui/controls.js`   | 1.17 |                                                                 |
| Oyentes de arrastre sobre `#world`                                                                      | `ui/controls.js`   | 1.17 |                                                                 |
| `keydown`, `keyup`, `blur`, `visibilitychange`, `pagehide`, `resize`, `webglcontextlost`                | `ui/controls.js`   | 1.17 | Mismo orden de registro                                         |

## Arranque y bucle

| Función o bloque          | Destino       | Paso     | Notas                                                                                 |
| ------------------------- | ------------- | -------- | ------------------------------------------------------------------------------------- |
| `init`                    | `app.js`      | —        | Orquesta: capas, render, grafo, constructores, actores, mapa, bienvenida; mismo orden |
| `window.__cityGame = {…}` | `test-api.js` | 1.1/1.18 | `createPublicApi()` con las mismas claves; dentro de `app.js` hasta 1.18              |
| `frameCount`, `frame`     | `app.js`      | —        | `frame` conserva su nombre                                                            |
| `init().catch(…)`         | `app.js`      | 1.1      | `showStartupError(err)` llamada desde `startGame`                                     |
| (nuevo) `startGame`       | `app.js`      | 1.1      |                                                                                       |
| (nuevo) `createTestApi`   | `test-api.js` | 1.1/1.18 | Sustituye las claves que hoy inyecta el arnés; dentro de `app.js` hasta 1.18          |

## Orden final de `init()` en `app.js`

Debe quedar así, que es el orden actual con las funciones extraídas:

1. `loadProgress('Descargando…', 8)`; `await loadLayers()`.
2. Asignaciones a `world` (ciudad, objetos de calle, perfiles, textura y tamaño), aviso de
   ortofoto ausente y `loadProgress('Preparando el mundo 3D…', 25)`.
3. `setupRenderer()`; `addGroundPlanes()`.
4. `buildRoadGraph()`; `indexBuildings()`; `connectOpenSpaces()`; `orientDriveGraph()`.
5. `applyHeightSamples(heightSamples)`; `prepareFacades()`; `await buildBuildings()`;
   `buildDetailedFacades()`.
6. `loadProgress('Colocando puentes…', 68)`; `await sleepFrame()`.
7. `buildStreetSurfaces()`; `buildRoadDetails()`; `buildUrbanFurniture()`;
   `buildTrees()`; `addSigns()`; `setupPOIs()`.
8. Coche inicial, jugador, `actors.character`, `spawnTraffic()`, `vehicles.push(…)`.
9. `createMissionMarkers()`.
10. Cámara inicial, contador de calles, `loadProgress('Centro de Chiclana listo.', 100)`,
    `updateHUD()`, `prepareMap()`, `await sleepFrame()`, bienvenida, `session.last`,
    `requestAnimationFrame(frame)`, `window.__cityGame = createPublicApi()`.
