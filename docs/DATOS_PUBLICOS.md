# Datos de juego y edición pública

## Separación actual

El navegador carga `dist/world.json`, seguido de dos capas independientes:
`buildings.json` (7.448 partes transformadas de Catastro) y `osm-world.json`
(616 vías, 69 áreas, 20 hitos y 14 árboles cartografiados). El motor las compone
sin cambiar coordenadas, plantas, patios ni capacidades. La población completa
de 310 árboles y el mobiliario siguen incluyendo recreaciones procedurales.

`height-samples.json` aplica 15 estimaciones independientes IGN al piloto;
`facade-profiles.json` reúne paleta, variantes, ancho de huecos, tamaño de celdas,
posición/escala cívica, contorno Mercado y alturas de naves. Las recetas de mallas
siguen en JavaScript: separar parámetros no equivale a hornear toda la escena,
ni demuestra una mejora de FPS. Las instancias/materiales compartidos y el
agrupamiento por celdas se conservan.

`source-data/facade-catalog.json` identifica los 276 frentes mediante edificio/arista,
huella, normal, dimensión, plantas y fuente de altura. Nombres de calle: OSM;
contornos: Catastro; estimaciones LiDAR: IGN. La licencia MIT del motor no cambia
esas condiciones. `dist/data-sources.json` y THIRD_PARTY_NOTICES.md delimitan fuentes.
Cada ID está ligado a esta instantánea; hashes permiten detectar cambios.

## Reproducir sin originales en el repositorio público

Python siempre se ejecuta con uv. Fuentes originales se descargan localmente
fuera de Git; mantener URLs/fechas/licencias y checksums, no credenciales.

1. Si se necesita regenerar los contornos, descargar los originales Catastro y OSM
   desde las URLs de MAP_SOURCES.md a una carpeta externa y ejecutar:

```fish
uv run --no-project --with pyproj --with shapely python extras/rebuild-map.py --catastro /ruta/local/catastro.zip --osm /ruta/local/osm.xml
```

El resultado es `rebuilt-city.json`; revisar antes de usarlo. No cambia el juego.
Para dividir una instantánea revisada: `node tools/prepare-world.mjs rebuilt-city.json`.
Para regenerar las capas actuales sin originales: `node tools/prepare-world.mjs`.

2. Alturas: solo un recorte WCS de 551 × 417 píxeles, unos 450 KB; nunca el mosaico
   nacional. Caché predeterminada `/tmp/chiclana-ign`, fuera del repositorio:

```fish
uv run --no-project --with rasterio --with pyproj --with shapely python tools/audit-ign-heights.py --download --overlay dist/height-samples.json
```

MDSnE2,5 está ya normalizado al terreno. P80 dentro de huella erosionada 1 m,
≥12 muestras, ≥95% cobertura válida, P90−P10 ≤1,5 m, altura/planta 2,5–4,5 m,
corrección absoluta 0,6–2 m. Excluir hitos protegidos. 1.399 candidatos, 274 con
al menos 12 muestras y 15 aceptados; no se han relajado filtros para obtener esa cifra.
Fuente: primera cobertura 2008–2015; vuelo local exacto sin confirmar. Píxeles ~2,5 m,
valores en pasos de 1 m; no afirmar precisión de 10 cm porque la salida use decimales.
La segunda cobertura está catalogada, pero no se obtuvo una tesela verificable;
el proceso actual no la utiliza. No copia alturas ni auditorías REDIAM anteriores.

3. Actualizar catálogo y comprobar capas/juego:

```fish
node tools/export-facades.mjs
node tools/verify-world.mjs
node tools/verify3d.mjs
```

Actualizar también checksums de `data-sources.json` si se modifican sus archivos:
`node tools/export-provenance.mjs`.
Las comprobaciones CPU no acreditan GPU ni móvil físico. Probar el navegador.

## Exportación pública

```fish
node tools/export-public.mjs /ruta/nueva/chiclana-vice-public
```

El destino debe ser nuevo y estar fuera del repositorio local. Se copia una lista
explícita de archivos; no .git, originales ZIP/GML/ráster, configuración del hosting
anterior, credenciales, mediciones históricas ni auditorías REDIAM. No se sobrescribe
una carpeta existente. Se conserva el historial local completo para investigación.
El exportador copia README.md y las guías actuales de docs/, sin plantillas duplicadas.

En la copia nueva se puede inicializar un Git convencional con rama main y un
commit inicial. Publicar requiere remoto/cuenta GitHub y seleccionar Pages →
GitHub Actions. El workflow verifica el juego antes de publicar solo dist;
las ramas de features no despliegan. No hay pagos ni dominio de pago necesarios.

## Validación de esta conversión

`verify-world` compara las capas con la instantánea local anterior: contornos,
patios, plantas, vías, áreas, árboles cartografiados e hitos idénticos. Verifica
checksums de capas/manifiesto y que los 276 frentes usan las alturas actuales.
Los flujos CPU (misiones, colisiones, táctil simulado y cámaras) pasan también
en la exportación pública, que no incluye city.json.

Chrome headless desktop 1366×768 DPR1, GPU Intel Iris Xe: capturas de Ayuntamiento,
Mercado, Nazareno y primera persona al volante/a pie inspeccionadas; cero errores
JavaScript. La copia pública se ha servido bajo /chiclana-vice/ para comprobar
rutas relativas como en GitHub Pages, con carga y cambios de cámara correctos.
Esto no mide FPS, no acredita móvil físico ni es un despliegue externo.
