# Chiclana Vice

Juego web estático 3D ambientado en el centro de Chiclana: conducción, paseo,
cuatro encargos, mapa de calles, cámara libre y modo ligero.

**[Jugar en el navegador](https://elihu.github.io/chiclana-vice/)**

Para probarlo localmente, desde la raíz del repositorio:

```fish
uv run --no-project python -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Abrir http://localhost:8080. No requiere npm, compilación ni backend.

[Documentación](docs/README.md): desarrollo, Git, publicación, fuentes y datos.

El código y la documentación propios tienen [licencia MIT](LICENSE),
Copyright 2026 elihu. MIT no se aplica a los datos geográficos, imágenes,
mediciones derivadas, librerías ni otros recursos de terceros: consultar
[atribuciones y condiciones](THIRD_PARTY_NOTICES.md) y el
[manifiesto de datos](dist/data-sources.json).

Alturas y fachadas aproximadas, sin precisión fotogramétrica ni validez catastral.
Comprobado en Chrome desktop; verificación en móvil físico pendiente.
