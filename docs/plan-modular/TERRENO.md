# Anexo: supuestos de suelo plano y entrada de la capa de terreno

Parte de [PLAN-MODULAR.md](../PLAN-MODULAR.md), decisión D11 y fase 3. No diseña el
modelo de alturas (lo investiga otro trabajo); solo localiza dónde el código supone
`y = 0` y deja preparado el punto de entrada. Funciones por nombre de `main` 5666928 y
módulo destino tras la fase 1.

## T1. Dónde se supone suelo plano

| Módulo destino                                         | Función                                   | Supuesto actual                                                                                                                      | Con terreno                                                                                                                          |
| ------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `engine/renderer.js`                                   | `addGroundPlanes`                         | Suelo: `PlaneGeometry` horizontal en `y = 0`; exterior en `y = -0,1`                                                                 | Malla de terreno con la ortofoto; el plano exterior, en la cota del borde                                                            |
| `world/buildings.js`                                   | `buildBuildings`                          | Muros de `y = 0,02` a `h`; cubierta en `h + 0,02`, todo absoluto                                                                     | Cota base por parte (`b.baseY`, p. ej. mínimo del terreno en el contorno); muros de `baseY` a `baseY + h`                            |
| `world/facades.js`                                     | `wall` (kit), naves, cúpula               | Grupo del muro en `y = 0`; cubierta de nave en `h`; cúpula en `y = 14,3`                                                             | Grupo en la cota de `a` (o media del frente); cúpula relativa a la base                                                              |
| `world/streets.js`                                     | `buildStreetSurfaces`, `buildRoadDetails` | Calzada 0,028, piedra 0,05, losas 0,036, línea 0,065, pasos 0,082, agua 0,025, puente 0,02 y barandilla 1                            | Desfase sobre el terreno en cada vértice; tiras de calzada subdivididas para seguir la pendiente                                     |
| `engine/materials.js`                                  | `flatGeometry`, `flatPolygon`             | Polígonos horizontales                                                                                                               | Polígonos drapeados (triangulación con cota por vértice)                                                                             |
| `world/furniture.js`                                   | grupos de mobiliario                      | Grupo en `y = 0`                                                                                                                     | `heightAt(x, z)` en el punto de colocación                                                                                           |
| `world/vegetation.js`                                  | `buildTrees`                              | Tronco en `h / 2`, copas en `h + …`, arbustos en 0,42                                                                                | Sumar `heightAt(x, z)` a cada instancia                                                                                              |
| `world/signs.js`                                       | `addSigns`                                | Placas a 2,45 m, postes a 1,4 m                                                                                                      | Sumar la cota del poste                                                                                                              |
| `game/update.js`, `game/police.js`, `app.js` (`frame`) | posicionado de vehículos                  | `c.mesh.position.set(c.x, 0, c.z)`                                                                                                   | `heightAt(c.x, c.z)`; opcionalmente cabeceo por pendiente                                                                            |
| `game/player.js`                                       | `updatePlayer`                            | Personaje en `y = 0`; física 2D (x, z)                                                                                               | La física sigue en 2D; la cota solo se aplica al dibujar                                                                             |
| `game/traffic.js`                                      | `updatePedestrians`                       | Peatones en `y = 0`                                                                                                                  | `heightAt`                                                                                                                           |
| `game/missions.js`                                     | `updateMarkers`                           | Anillo 0,16, haz 2, flecha 6                                                                                                         | Relativos a `heightAt(goal)`                                                                                                         |
| `engine/camera.js`                                     | `updateCamera`                            | Alturas de cámara absolutas (4,7, 3,2, 45), ojo 1,2 / 1,61, objetivo 1,1, vista aérea mirando a `y = 0`; sol con objetivo en `y = 0` | Relativas a la cota del jugador                                                                                                      |
| `engine/camera.js`                                     | `cameraSweep`                             | Compara la altura del rayo con `renderH` (altura absoluta = sobre `y = 0`)                                                           | Comparar con `baseY + renderH`                                                                                                       |
| `app.js`                                               | `frame` (bienvenida)                      | Cámara de presentación a 22 m mirando a `y = 0`                                                                                      | Relativa a la cota del jugador                                                                                                       |
| `ui/hud.js`                                            | `drawLabels`                              | Etiquetas a 14 m y marcador a 2 m                                                                                                    | Relativas a la cota del lugar                                                                                                        |
| `world/spatial.js`                                     | `inBuilding`, `blocked`, `safePoint`      | 2D, sin cota                                                                                                                         | Sin cambios (la colisión sigue en planta)                                                                                            |
| `world/loader.js`                                      | `loadWorld`, `applyHeightSamples`         | `world.json` declara «Terreno: plano»; alturas IGN normalizadas al terreno (MDSn)                                                    | Nueva capa opcional (p. ej. `terrain.json`) cargada como `height-samples.json`; las alturas de edificio siguen siendo sobre el suelo |
| `ui/map.js`                                            | mapa 2D                                   | Planta                                                                                                                               | Sin cambios                                                                                                                          |

## T2. Dónde entra la capa de terreno

- **Datos**: una capa opcional nueva, cargada en `loadLayers()` como sexta o séptima
  promesa, con el mismo patrón que `height-samples.json` (si falta, terreno plano) y su
  registro en `data-sources.json`.
- **Estado**: `world.terrain`, un objeto con `kind` y `heightAt(x, z)`.
- **Precálculo**: tras `indexBuildings()`, una pasada que fija `b.baseY` por parte; los
  constructores leen `b.baseY ?? 0`.
- **Constructores**: reciben la cota por `heightAt`; ningún constructor lee la capa
  directamente.
- **Jugabilidad**: la física sigue en planta; la cota solo se aplica al colocar mallas y
  la cámara.
- **Huella**: con el terreno plano, la huella debe seguir idéntica; el cambio a terreno
  real será un commit `feat` con huella nueva revisada visualmente.

## T3. `web/js/world/terrain.js` (paso 3.1)

```js
// Terreno: hoy plano. La capa de alturas real se conectará aquí (docs/plan-modular/TERRENO.md).
export const flatTerrain = Object.freeze({
  kind: 'flat',
  heightAt() {
    return 0;
  },
});

export function heightAt(terrain, x, z) {
  return terrain ? terrain.heightAt(x, z) : 0;
}
```

En el paso 3.1 solo se asigna `world.terrain = flatTerrain`; ningún constructor la llama
todavía, para no tocar la aritmética (sumar `0` puede convertir un `-0` en `+0` y cambiar
la huella por bytes sin cambiar nada visible).
