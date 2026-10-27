# Plan: suelo de cerca, aceras, juntas y puentes

Fecha: 27/10/2026. Sigue a [PLAN-VISUAL.md](PLAN-VISUAL.md) (publicado en `v1.6.0`).

El usuario ve bien la ortofoto desde arriba, pero en primera y tercera persona le parece fea
(borrosa a 25 cm/píxel, con sombras de otra hora y copas y coches aplastados en el suelo), y
ve «feas» las juntas entre calzadas, puentes, cuestas y el terreno. Casos de prueba que
señaló: **Puente VII Centenario** (OSM 142805148) y el **puente de la Avenida de los Reyes
Católicos** sobre el Iro (Puente Nuestra Señora de los Remedios, OSM 50664224).

Lee antes `AGENTS.md`, `docs/DESARROLLO.md` («Terreno», «Modo ligero»),
`docs/SUPERFICIES_TERRENO.md` (contrato de superficies, plataformas y tableros horizontales),
`docs/ESTADO.md` y `tests/AGENTS.md`. Si tocas `tools/` o datos, `tools/AGENTS.md`,
`docs/DATOS.md` y `docs/MAP_SOURCES.md`.

## Cómo ejecutar este plan

- **Una tanda = una rama** desde `main`. Un commit por paso. Sin push, merge ni rebase.
- **Verificación**: solo `npm run check` al final de cada paso. Sin capturas, scene-budget ni
  Chrome salvo que se pida: el usuario lo prueba servido en `localhost` y decide. Si algo se
  atasca más de 15 minutos, para y explica.
- **No cambies la transitabilidad ni las cotas** de calzadas, tableros y terreno salvo donde
  el paso lo diga: lo nuevo es visual. La altura del jugador y de los coches sigue saliendo
  de `surfaceHeightAt`.
- No afirmes FPS ni rendimiento de GPU o móvil.

## Decisiones

- **D1. Geometría agrupada**: aceras, bordillos y faldones van en las mallas agrupadas de
  `streets.js` (por material y celda, como hoy), sin llamadas de dibujo nuevas salvo un
  material nuevo si hace falta (bordillo). Declara los triángulos nuevos.
- **D2. Mismo perfil que la calzada**: todo lo nuevo junto a una vía toma la cota de la
  calzada en ese punto (`surfaceHeightAt(x, z, null, road.id)` o el perfil del modelo de
  superficies), no la del MDT, para seguir la cuesta sin escalones.
- **D3. Reglas en `city-design.json`** (anchos de acera, altura de bordillo, profundidad de
  faldón, tipos de vía con acera), con esquema y validación, para ajustarlas a mano.
- **D4. Ligero**: igual que normal (es geometría barata y estática).

## Tanda 1. Aceras, bordillos y faldones (`feat/aceras`)

Estado de partida: con relieve (`world.surfaces`), `buildStreetSurfaces` ya dibuja todas las
vías (asfalto o adoquín); las plazas peatonales solo dentro de `zones.pavedSquares`; entre la
calzada y las fachadas solo hay terreno con ortofoto.

1. **Aceras con bordillo** a ambos lados de las vías rodadas (no en peatonales, que ya son
   adoquín de borde a borde): banda de baldosa (material `slabs`) desde el borde de la
   calzada hacia fuera, de ancho configurable (p. ej. 1,8 m) y recortada para no meterse en
   edificios (`inBuilding`) ni en otra calzada; bordillo de 10–12 cm con cara vertical hacia
   la calzada. Siguen el perfil de la calzada (D2). En los cruces, corta la acera antes de la
   calzada que cruza (medio ancho de esa vía más un margen) y no dejes solapes. Puentes: el
   tablero ya tiene aceras propias (`platforms[].bands`); no dupliques. Commit
   `feat(calles): aceras con bordillo`.
2. **Faldones**: en el borde exterior de calzadas y aceras, una cara vertical hacia abajo
   (p. ej. 1 m, o hasta el terreno si se puede muestrear barato) del color de la acera o del
   terreno, para que no se vean huecos ni piezas flotando donde el terreno queda por debajo.
   Comprueba de cerca los dos puentes de prueba y sus accesos. Commit
   `feat(calles): faldones en los bordes de calzadas y aceras`.
3. **Plazas en toda la ciudad**: `zones.pavedSquares` deja de limitar las plazas peatonales
   al centro (todas las `areas` de tipo `square` reciben adoquín, con la deduplicación de
   tableros que ya existe). Commit `feat(calles): plazas pavimentadas en toda la ciudad`.

Documenta en `docs/DESARROLLO.md` y, si cambian aproximaciones, en `docs/MAP_SOURCES.md`.

## Tanda 2. Puentes y accesos (`feat/puentes-rampas`)

Los tableros de plataforma son hoy horizontales con la cota media de sus anclajes
([SUPERFICIES_TERRENO.md](SUPERFICIES_TERRENO.md)), y la calle compensa el desnivel en los
extremos. Esta tanda sí toca cotas y transitabilidad, con cuidado:

1. Tablero inclinado (o con perfil por tramos) entre las cotas de sus anclajes, en el
   modelo de superficies y en su dibujo, conservando colisiones, coches y cámara.
2. Rampas de acceso que enlazan sin escalones con las calles, con la pendiente máxima ya
   configurada (`maximumAccessStep`).
3. Verificadores de `tests/` para la continuidad en los dos puentes de prueba.

Se planifica en detalle tras revisar la tanda 1.

## Tanda 3. Suelo de cerca y ortofoto (`feat/suelo-cerca`)

1. **Pasos de cebra** desde los 144 nodos `highway=crossing` del OSM ya descargado
   (`~/.cache/chiclana-vice/sources/osm-ampliado.xml`), con la cadena de datos habitual
   (conversor, capa, provenance, documentación de fuentes).
2. **Ortofoto limpia** al generar las teselas (`tools/aerial-tiles.py`): borrar las copas
   de árboles ya detectadas (`web/vegetation.json`) rellenando con el entorno, y suavizar las
   sombras horneadas. Sin coste al jugar.
3. **Fundido por distancia**: de cerca, materiales propios (tierra, césped, pavimento)
   según la clase del suelo; desde lejos y en vista aérea, la ortofoto tal cual.
