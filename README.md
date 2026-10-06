# Chiclana Vice

Juego web 3D estático ambientado en el centro de Chiclana: conducción, paseo, encargos,
mapa de calles, cámara libre y modo ligero.

**[Jugar en el navegador](https://elihu.github.io/chiclana-vice/)**

## Ejecutar en local

Desde la raíz del repositorio:

```fish
uv run --no-project python -m http.server 8080 --bind 127.0.0.1 --directory web
```

Abrir http://localhost:8080. El juego no necesita npm, compilación ni backend.

## Comprobar cambios

```fish
npm ci --ignore-scripts
npm run check
```

## Documentación

- [Guías del proyecto](docs/README.md): desarrollo, datos, fuentes, Git y publicación.
- [Cómo contribuir](CONTRIBUTING.md).
- [Estado y pendientes](docs/ESTADO.md).
- Instrucciones para agentes de IA: [AGENTS.md](AGENTS.md).

## Licencias

El código y la documentación propios tienen [licencia MIT](LICENSE), Copyright 2026 elihu.
MIT no se aplica a los datos geográficos, imágenes, mediciones derivadas, librerías ni otros
recursos de terceros: consultar [atribuciones, condiciones y retirada](THIRD_PARTY_NOTICES.md)
y el [manifiesto de datos](web/data-sources.json).

Alturas y fachadas aproximadas, sin precisión fotogramétrica ni validez catastral.
