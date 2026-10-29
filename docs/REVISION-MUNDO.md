# Revisión del mundo tras v2.0.0

Fecha: 28/10/2026. Rama: `fix/mundo-transitabilidad`. El usuario prioriza agua y elementos
fuera de sitio, junto con calles, rotondas, puentes y peatones. Se trabaja sobre el mapa
actual; el usuario dio el visto bueno el 29/10/2026 y está integrada en `main` sin publicar.

## Tanda implementada (integrada el 29/10/2026, sin publicar)

- Río más claro, reflejo conectado al cielo de cada hora y ondulación fina con menos
  deformación. Material compartido, sin pases adicionales de reflejo.
- Retirada de la cubeta de agua de la Alameda por petición del usuario, manteniendo el
  dato de origen y una corrección de autor con guarda.
- Exclusión de 145 troncos de las vías pavimentadas (también peatonales y caminos),
  para todas las fuentes de arbolado. Se conserva
  el azar de los ejemplares restantes y la capa de copas publicada.
- Recorte geométrico de pavimento peatonal y aceras contra las calzadas, respetando cotas
  separadas. Caso de referencia del usuario: La Vega con Alameda del Río.
- Recuperación de las etiquetas OSM de glorietas, túneles y niveles. Isletas en anillos
  cerrados, sin añadir círculos arbitrarios ni alterar las conexiones de tráfico.
- Tablero y pasos inferiores del VII Centenario separados, incluida la banda de asfalto.
- Peatones sobre recorridos continuos de acera o vía peatonal. Se conserva la población;
  todavía no simulan cruzar por pasos de cebra ni caminan de un extremo de la ciudad a otro.
- Separadores entre ramales: relleno de asfalto y franjas cebreadas, sin baldosa, bordillo
  ni faldón. La misma superficie sostiene el coche y excluye recorridos de peatones.
  La detección usa caras pequeñas de la red vial en todo el mapa, también cuando dos
  ramales quedan cortados por el borde del mapa. Excluye edificios, jardines, agua,
  arbolado; conserva las isletas centrales de las glorietas. Los caminos que cruzan estos
  separadores conservan su eje, pero su pavimento se sustituye por calzada.
  Referencias de revisión: ambos extremos del VII Centenario, Descubrimientos y Calle Iro.
  Es una aproximación por topología, no un inventario completo de marcas viales.
- Seguimiento con capturas del usuario en Virgen del Carmen, Reyes Católicos y
  Diputación: recorte de caras verticales de bordillo y de cuñas en curvas; rasante
  de cada separador interpolada entre sus dos calzadas próximas, sin tomar el cierre
  lejano. La revisión continúa jugando; no se repiten comprobaciones completas durante
  estos ajustes. Las huellas de actores se renuevan al cerrar la tanda.
- Junta del tranvía con Remedios: los ejes del tranvía participan como soportes internos
  de rasante en el modelo de superficies, sin añadir calles ni conexiones de tráfico.
  Franja y raíles usan ese perfil; el tablero se prolonga 2 m para incluir la junta oblicua.

La referencia de vegetación/actores de los verificadores se renueva por los troncos
retirados y los recorridos nuevos; se conservan los índices de edificios y la semilla.
Las cotas, anchuras y desplazamientos de autor se documentan en `MAP_SOURCES.md`.

## Revisión que dirige el siguiente ajuste

1. Agua por la mañana, mediodía, tarde y anochecer; movimiento y tono en el móvil.
2. La Vega con la Alameda y otros cruces que señale el usuario.
3. Ambos extremos del VII Centenario, sobre el tablero y en los pasos peatonales inferiores.
4. Rotondas y peatones: comprobar las isletas y que no invadan calzadas.

Una comprobación de cierre y una tanda visual. Las pruebas con DOM/WebGL simulados o
SwiftShader no acreditan fluidez, GPU real ni tacto físico.

## Otras observaciones del usuario, para siguientes tandas

- **Palmeras:** el detector actual pierde copas y no clasifica especies. Combinar etiquetas
  OSM, revisión de ortofoto y colocación de autor; no deducirlas solo de la sombra.
- **Vallas y murallas:** las de OSM, dibujadas y con colisión en `v3.0.0`
  ([PLAN-VALLAS.md](PLAN-VALLAS.md)); quedan los cajeros del Iro y completar a mano los casos
  sin dato fiable, sin levantar muros sobre límites parcelarios por suposición.
- **Comercios:** locales por tipo, rótulos con el nombre de OSM, naves, grandes superficies,
  bodegas y gasolineras en `v3.0.0` ([PLAN-COMERCIOS.md](historico/PLAN-COMERCIOS.md)).
  Modelos específicos por local requerirán identificar y anclar cada establecimiento.
- **Ampliación:** publicada en `v3.0.0`: el mundo es la caja completa del minimapa (de unos
  1,67 a 2,64 km²), con el mismo origen y las mismas cotas.
