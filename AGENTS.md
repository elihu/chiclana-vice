# Chiclana Vice
Lee README.md, docs/DESARROLLO.md, docs/CONTINUAR-CODEX.md y docs/MAP_SOURCES.md antes de cambiar el juego.
- Mantén coordenadas reales, edificios, calles y capacidades existentes.
- JavaScript estático: editar dist/game3d.js, dist/style.css, dist/index.html. No introducir frameworks o un pipeline por rutina.
- Prioriza controles táctiles y rendimiento móvil; agrupa geometría repetida y conserva modo ligero.
- No afirmar precisión fotogramétrica ni verificación móvil cuando no se haya hecho.
- Documenta fuentes y qué partes son aproximadas. Conserva licencias y atribuciones.
- Verifica sintaxis y flujos afectados; tools/verify3d.mjs usa DOM/WebGL simulados, no prueba GPU.
- Trabaja localmente; publicar requiere una petición explícita en esta copia.
- Para ejecutar Python, usa `uv run --no-project python` (añade `--with` para dependencias opcionales).
