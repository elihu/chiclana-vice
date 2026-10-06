# Estado de la edición pública — 2026-10-05

Leer AGENTS.md, DESARROLLO.md, MAP_SOURCES.md, DATOS_PUBLICOS.md y
THIRD_PARTY_NOTICES.md. JavaScript estático en web; conservar coordenadas,
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
Servir con uv; detalles en DESARROLLO.md.

Edición exportada sin historial privado, originales Catastro, rásteres ni auditorías
de otras fuentes. Código propio MIT; datos y referencias mantienen condiciones.
Workflow Pages verifica y publica web al hacer push a main. Remoto origin configurado en https://github.com/elihu/chiclana-vice.git, cuenta
personal elihu. Pages con Actions: https://elihu.github.io/chiclana-vice/.
Publicación autorizada el 6/10/2026; push a main despliega automáticamente.

Revisión 6/10/2026: atribuciones fotográficas completadas y fórmula de obra
derivada IGN en créditos/metadatos. ALTURAS_PILOTO.md detalla las 15 partes;
auditoría repetida con igual resultado. Figuras Nazareno y alzado Ayuntamiento
continúan pendientes; ver THIRD_PARTY_NOTICES.md. Servidor público local :8080.

Identidad personal de este repo: elihu, 4126552+elihu@users.noreply.github.com.
Configurada localmente en .git/config; no heredar la identidad global de la org.
Copyright del código propio: elihu. Las atribuciones de terceros se conservan.

Documentación organizada en docs/; README.md es la entrada única. LICENSE
contiene MIT estándar; el alcance y los derechos de terceros están en README.md
y THIRD_PARTY_NOTICES.md. El exportador conserva esta organización.

Estructura: web/ es fuente estática editable y publicable; tests/ contiene los
verificadores, tools/ los conversores. Arcade conserva su game.js; la copia
idéntica sin uso en la raíz web se ha eliminado.

ESLint recomendado + Prettier + EditorConfig: npm ci y npm run check.
Formato aplicado al código propio; datos y Three.js excluidos. El verificador
y el exportador de fachadas admiten el formato legible nuevo.
