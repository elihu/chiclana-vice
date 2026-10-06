# Estado de la edición pública — 2026-10-05

Leer AGENTS.md, README-PC.md, MAP_SOURCES.md, DATOS_PUBLICOS.md y
THIRD_PARTY_NOTICES.md. JavaScript estático en dist; conservar coordenadas,
contornos, plantas, capacidades, controles táctiles y modo ligero.

Mapa: 7.448 partes Catastro transformadas, 616 vías OSM, origen -6.1485/36.4195.
Capas separadas por procedencia; world.json las compone. Quince alturas de cubierta
estimadas independientemente desde IGN MDSnE2,5, primera cobertura 2008–2015,
CC BY 4.0. Fecha de vuelo local sin confirmar; píxeles ~2,5 m/valores en pasos de 1 m.
Parámetros principales de fachada en facade-profiles.json; 276 frentes catalogados.
Las recetas de geometría siguen en código; visor/editor de fachadas pendiente.

Geometría/materiales compartidos, vegetación instanciada, fachadas agrupadas en
celdas de 170 m. Cámara de seguimiento protegida contra volúmenes catastrales;
primera persona con mirada libre persistente, diferenciada al volante/a pie.
Cuatro encargos, policía, circulación, paseo y versión arcade conservados.

Comprobaciones de capas/geografía/flujos/cámara CPU pasan; Chrome desktop GPU
comprobado, incluida la copia bajo /chiclana-vice/ (rutas Pages). No afirmar verificación móvil física ni FPS estable conduciendo.
Servir con uv; detalles en README-PC.md.

Edición exportada sin historial privado, originales Catastro, rásteres ni auditorías
de otras fuentes. Código propio MIT; datos y referencias mantienen condiciones.
Workflow Pages verifica y publica dist al hacer push a main. Sin remoto configurado
por el exportador; la publicación inicial todavía requiere cuenta/repositorio.

Revisión 6/10/2026: atribuciones fotográficas completadas y fórmula de obra
derivada IGN en créditos/metadatos. ALTURAS_PILOTO.md detalla las 15 partes;
auditoría repetida con igual resultado. Figuras Nazareno y alzado Ayuntamiento
continúan pendientes; ver THIRD_PARTY_NOTICES.md. Servidor público local :8080.
