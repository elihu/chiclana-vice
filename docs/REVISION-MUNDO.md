# Revisión del mundo tras v2.0.0

Fecha: 28/10/2026. Rama: `fix/mundo-transitabilidad`. El usuario prioriza agua y elementos
fuera de sitio, junto con calles, rotondas, puentes y peatones. Se trabaja sobre el mapa
actual; no se ha autorizado publicar esta tanda.

## Tanda implementada, pendiente de revisión

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
- **Vallas y murallas:** recuperar geometrías `barrier` disponibles y completar a mano los
  casos sin dato fiable. Evitar levantar muros sobre límites parcelarios por suposición.
- **Comercios:** ya hay clasificación genérica de bajos y tipos de negocio, pero faltan
  nombre/marca en la capa. Se puede ampliar y crear familias de fachada (supermercado,
  bar, panadería, ropa), manteniendo contornos y patios. Modelos específicos por local
  requerirán identificar y anclar cada establecimiento.
- **Ampliación:** el minimapa usa la caja que envuelve tres rectángulos jugables. Completarla
  supone pasar de unos 1,67 a 2,64 km² (aproximadamente +58 %), no estirar la escena actual.
  Requiere regenerar edificios, vías, derivados y vegetación de los huecos, manteniendo el
  origen y las cotas existentes; revisar los presupuestos de móvil antes de publicarlo.
