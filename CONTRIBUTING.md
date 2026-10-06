# Cómo contribuir

Proyecto personal mantenido por elihu, desarrollado sobre todo con agentes de IA. Las
reglas para personas y agentes son las mismas; [AGENTS.md](AGENTS.md) es la versión
compacta.

## Antes de empezar

1. Leer [docs/DESARROLLO.md](docs/DESARROLLO.md) y [docs/ESTADO.md](docs/ESTADO.md).
2. Crear una rama corta desde `main` (ver [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)).
3. Instalar las herramientas con `npm ci --ignore-scripts`.

## Cambios

- Juego: editar directamente `web/`. No hay compilación ni frameworks.
- Datos: regenerarlos con `tools/`, nunca a mano (ver
  [docs/DATOS_PUBLICOS.md](docs/DATOS_PUBLICOS.md)).
- Fuentes y aproximaciones: [docs/MAP_SOURCES.md](docs/MAP_SOURCES.md). Licencias:
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- Ejecutar `npm run check` antes de cada commit que cierre trabajo. Si el cambio afecta a
  interfaz, cámara, render o controles táctiles, probarlo en un navegador real e indicar
  qué no se ha podido probar (por ejemplo, un móvil físico).

## Commits y pull requests

- [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) en español:
  `feat:`, `fix:`, `perf:`, `docs:`, `test:`, `ci:`, `chore:`, `refactor:`.
- Un commit por cambio coherente; sin credenciales, archivos temporales ni originales de
  Catastro o rásteres.
- Nunca trailers `Co-Authored-By` ni líneas de atribución en commits, merges o pull
  requests, tampoco de agentes de IA.
- No hay pull requests obligatorios: el mantenedor integra en local con `merge --no-ff`
  tras `npm run check` ([docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)). Si se abre un pull
  request, debe pasar el job `check` de la CI y describir qué cambia, cómo se ha
  verificado y qué queda pendiente.

## Derechos de terceros

Si eres titular de derechos sobre algún contenido y quieres que se retire, sigue el
procedimiento de [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md#reclamaciones-y-retirada).
