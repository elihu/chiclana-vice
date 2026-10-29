# Plan: vallas, muros y setos

Fecha: 29/10/2026. Cifras tomadas sobre `main` (`509f311`), con el mapa ampliado a la caja
`[-820, 671.835, -1120, 650]`. Sigue a [PLAN-COMERCIOS.md](PLAN-COMERCIOS.md) y recoge la nota
de [REVISION-MUNDO.md](REVISION-MUNDO.md): «recuperar geometrías `barrier` disponibles y
completar a mano los casos sin dato fiable; evitar levantar muros sobre límites parcelarios por
suposición».

Lee antes `AGENTS.md`, `docs/DESARROLLO.md`, `docs/ESTADO.md`, `docs/DATOS.md` y
`tests/AGENTS.md`. Si tocas `tools/`, lee `tools/AGENTS.md`.

## Contexto

Hoy no hay vallas ni muros de parcela: entre edificios, los solares, patios abiertos, huertas y
parques quedan sin cerrar. Datos disponibles en `~/.cache/chiclana-vice/sources/osm-ampliado.xml`
(vías `barrier=*` con algún punto dentro del mundo, 29/10/2026):

| Tipo             | Vías | Longitud | Dónde                                                      |
| ---------------- | ---- | -------- | ---------------------------------------------------------- |
| `wall`           | 36   | 2.641 m  | repartidos; el mayor, 462 m junto a la c/ Agustín Blázquez |
| `fence`          | 7    | 592 m    | huertas del norte (Huerta la Concha, San Nicolás), Ánimas  |
| `hedge`          | 1    | 525 m    | contorno del parque Santa Ana (cerrado)                    |
| `city_wall`      | 1    | 18 m     | plaza de Andalucía                                         |
| `retaining_wall` | 3    | 2.964 m  | cajeros del río Iro (c/ Ribera del Río) y c/ Ánimas        |

Más 3 nodos `barrier=gate` y un `bollard`. Ninguna vía lleva `height`, `material` ni
`fence_type`: alturas y aspecto son aproximaciones del juego, documentadas como tales.

## Cómo ejecutar este plan

- **Una fase = una rama** desde `main` limpio, con el nombre indicado. Un commit por paso.
  Sin push, merge ni rebase: integra quien coordina, cuando el usuario lo pide.
- **Revisión del usuario en cada fase visible** (V1 en adelante), sirviendo la rama. Entrega,
  en lenguaje llano, qué debe mirar y dónde.
- **Verificación mínima**: `npm run check` al final de la fase. En V0 la escena no cambia:
  huellas de escena (`tools/scene-fingerprint.mjs`) con relieve y sin él iguales a `main`.
- **Si algo falla o no cuadra**, para y explica qué pasa, sin improvisar.
- **No afirmes** FPS, rendimiento de GPU ni comportamiento en móvil.

## Decisiones

- **D1. Solo datos.** Se dibujan las vallas y muros de OSM. No se levantan muros sobre límites
  catastrales por suposición. Los que falten se añaden a mano solo con evidencia (V4).
- **D2. Aspecto y altura por tipo**, en `city-design.json` (bloque `barriers`), no en el código:
  muro encalado de 2 m con albardilla; valla metálica de 1,8 m con postes; seto de 1,2 m; muralla
  de piedra de 4 m. Se documentan como aproximaciones en `MAP_SOURCES.md`.
- **D3. Coste acotado.** Geometría fusionada por material (una malla por tipo como mucho), con
  el pie sobre el relieve. Sin texturas nuevas.
- **D4. Calzadas libres.** Un tramo que cruza una calzada rodada se corta en ella (las vías de OSM
  pueden atravesar un muro en una entrada sin `gate`). Las puertas (`gate`) dejan un hueco.
- **D5. Colisiones**: muros, muralla y vallas bloquean al jugador y a los coches; el seto, también.
  Se añaden a la consulta de colisiones existente (`spatial.js`) sin cambiar la de los edificios.

## Fases

### V0. Datos de vallas (`feat/datos-vallas`)

1. **Herramienta** `tools/export-barriers.py`: lee `osm-ampliado.xml`, proyecta como
   `rebuild-map.py` y escribe `web/barriers.json` (ODbL, como `osm-world.json`) con
   `lines: [{id, kind, p}]` recortadas a los límites del mundo (un recorte con varias partes añade
   `.n` al `id`) y `gates: [[x, z]]`; más `version`, `origin`, `source`, `license`, `attribution` y
   `limits`. Sin alturas (OSM no las trae). Verificador `tests/verify-barriers.mjs` (formato, tipos
   conocidos, dentro del mundo), registro en `export-provenance.mjs` y en `npm test`. El juego la
   carga como `world.barriers` (opcional) sin usarla. Commit
   `feat(datos): capa de vallas y muros desde OSM`.
2. **Documentación**: `docs/DATOS.md` (comando, formato) y `docs/MAP_SOURCES.md` (qué se toma y
   sus límites). La capa es ODbL como las demás de OSM; si hiciera falta algo más que añadirla a
   una lista existente de `THIRD_PARTY_NOTICES.md`, para y pregunta. Commit
   `docs(datos): documentar la capa de vallas`.

### V1. Dibujo (`feat/vallas`)

1. **Reglas** en `city-design.json` → `barriers` (esquema y validación): por tipo, altura, grosor,
   color y remate. Commit `feat(diseño): aspecto de vallas y muros`.
2. **Módulo** `world/barriers.js`: muros y muralla como prismas con albardilla, vallas como paño
   bajo, postes cada 2,5 m y malla en el shader (o paño semitransparente si no cabe en el lote),
   seto como prisma verde. Pie sobre el relieve tramo a tramo (`groundHeightAt`), cortes en
   calzadas rodadas y huecos en las puertas (D4). Commit `feat(mundo): vallas, muros y setos`.

Vistas: c/ Agustín Blázquez y parque Santa Ana, huertas del norte (Huerta la Concha), plaza de
Andalucía. Una medida de `scene-budget` frente a `main`.

### V2. Colisiones (`feat/vallas-colision`)

Segmentos de vallas en una rejilla propia de `spatial.js`; `blocked` y `crossesWall` los
consultan (D5). Prueba en `tests/` de que un punto al otro lado no se alcanza en línea recta y
de que el hueco de una puerta sí. Commit `feat(juego): colisión con vallas y muros`.

### V3. Muros de contención del Iro (`feat/cajeros`)

Los dos `retaining_wall` de 1,37 km son los cajeros del río. Se dibujan como paramento entre la
cota de la orilla (modelo de superficies) y la lámina de agua, sin cambiar el relieve ni el agua.
Antes, comprobar con `audit-terrain-surfaces.mjs` que la orilla y el agua dejan ese salto; si no,
parar y entregar las cifras. Commit `feat(mundo): cajeros del río`.

### V4. Completar a mano (solo a petición del usuario)

Muros que el usuario señale y que OSM no tenga, en un archivo de autor con su evidencia
(ortofoto, foto o visita), como `map-corrections.json`. Sin suposiciones sobre parcelas.

## Riesgos

- **Vías de OSM a través de muros**: D4 los corta; revisar las entradas de parcelas.
- **Colisiones**: un muro mal colocado puede cerrar un paso; V2 lleva prueba y revisión a pie.
- **Relieve**: un muro largo en cuesta se apoya tramo a tramo; los cajeros dependen del modelo
  de superficies (V3).
