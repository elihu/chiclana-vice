# Chiclana Vice

Juego web estático 3D ambientado en coordenadas reales del centro de Chiclana.
Incluye conducción, paseo a pie, cuatro encargos, mapa/buscador, cámara libre
y modo ligero. No requiere npm, compilación ni backend.

Desde la raíz del repositorio:

```fish
uv run --no-project python -m http.server 8080 --bind 127.0.0.1 --directory web
```

Abrir http://localhost:8080; Ctrl+C termina el servidor. Para acceso LAN de confianza,
usar `--bind 0.0.0.0` y la IP local del PC. El progreso se guarda por navegador.

Datos y conversores: [DATOS_PUBLICOS.md](DATOS_PUBLICOS.md).
Fuentes: [MAP_SOURCES.md](MAP_SOURCES.md).
Licencias: [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
Código propio MIT; datos y recursos de terceros mantienen sus condiciones.
La copia pública no incluye originales Catastro, rásteres ni fotografías de referencia.

```fish
node tests/verify-world.mjs
node tests/verify3d.mjs
```

El verificador utiliza DOM/WebGL simulados; no mide GPU. Chrome desktop con GPU
Intel Iris Xe ha sido comprobado; móvil físico pendiente. Alturas LiDAR de primera
cobertura 2008–2015 aproximadas, fachadas interpretativas, terreno plano; sin
precisión fotogramétrica ni validez catastral.

Publicación: [PUBLICACION.md](PUBLICACION.md). El workflow despliega dist al hacer
push a main tras pasar comprobaciones. Trabajar en ramas y hacer commits antes
de integrar; [GIT_WORKFLOW.md](GIT_WORKFLOW.md). No se incluyen sesiones ni tokens.
