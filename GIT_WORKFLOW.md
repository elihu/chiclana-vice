# Flujo local de Git

## Repositorio de esta copia

Repositorio convencional en `.git`, rama principal `main` y etiqueta inicial
`baseline-2026-10-05`. No hay remoto configurado. Los commits y merges son locales
y no publican la web. Se usa la identidad Git configurada en este equipo.

```bash
git status
git log --oneline --graph --all
```

## Una rama por cambio

Mantener `main` como versión integrada. Crear ramas cortas `feat/tema`,
`fix/tema`, `perf/tema`, `docs/tema` o `research/tema`. Una rama debe tener
un objetivo revisable. Para este proyecto no necesitamos una rama `develop`
permanente ni ramas de releases paralelas.

1. Leer `AGENTS.md`, `README-PC.md`, `CONTINUAR-CODEX.md` y `MAP_SOURCES.md`.
2. Revisar el estado; si hay cambios pendientes, identificarlos antes de cambiar de rama.
3. Partir de `main`:

```bash
git status --short --branch
git switch main
git switch -c feat/nombre-concreto
```

4. Implementar un cambio acotado. Editar directamente `dist`; mantener
   coordenadas, capacidades, modo ligero, atribuciones y controles táctiles.
5. Verificar los flujos afectados. Para cambios del juego:

```bash
node --input-type=module --check < dist/game3d.js
node tools/verify3d.mjs
uv run --no-project python -m http.server 8080 --bind 127.0.0.1 --directory dist
```

El servidor se termina con Ctrl+C. La prueba CPU no acredita render GPU ni móvil.
Si se cambia interfaz, cámara o render, comprobarlo en navegador real; si afecta
controles/rendimiento móvil, registrar también dispositivo, navegador,
orientaciones y pruebas realizadas, o dejar explícitamente pendiente esa validación.
Para documentación basta revisar enlaces, contenido y diff; no repetir pruebas
del juego sin motivo.

6. Actualizar `CONTINUAR-CODEX.md` con estado y pendientes; actualizar
   `MAP_SOURCES.md` cuando cambien datos, referencias o aproximaciones.
7. Revisar y seleccionar archivos, usando rutas concretas:

```bash
git diff --check
git diff
git add dist/game3d.js CONTINUAR-CODEX.md
git diff --cached
git commit -m 'feat: describir el comportamiento añadido'
```

Usar `fix:`, `perf:`, `docs:` o `chore:` según el propósito. Cada commit debe
explicar un cambio coherente. No añadir credenciales ni resultados temporales.
Las fuentes y recursos actuales quedan versionados; si entran nubes LiDAR grandes,
guardar procedencia, versión y checksum y decidir su almacenamiento antes de añadirlas.

8. Integrar una vez revisado y comprobado:

```bash
git switch main
git merge --no-ff feat/nombre-concreto -m 'merge: integrar nombre-concreto'
git branch -d feat/nombre-concreto
git status --short --branch
```

Si hay conflictos, resolverlos y volver a comprobar los flujos afectados antes
de terminar el merge. Para abandonarlo: `git merge --abort`.
Deshacer un cambio integrado mediante `revert` conserva el historial;
para un merge se necesita `revert -m 1 HASH_DEL_MERGE`.
Etiquetar hitos comprobados con `tag -a v0.1.0 -m 'Descripción y validación'`.
Una etiqueta no significa que se haya publicado ni probado en móvil.

Referencia del enfoque de ramas cortas: [Pro Git: Branching Workflows](https://git-scm.com/book/en/v2/Git-Branching-Branching-Workflows).

## Edición pública y despliegue

Esta copia histórica conserva investigación y antiguos originales en commits
anteriores; no subir su historial como repositorio público. `tools/export-public.mjs`
crea un snapshot revisado con lista explícita; su Git nuevo conserva un flujo normal
de ramas/commits. Los originales actuales se guardan en caché externa.

Una vez creado el remoto de la edición pública, trabajar en esa copia, integrar
features verificadas en main y ejecutar `git push origin main`. Eso publica dist
automáticamente mediante GitHub Actions. Un push de una rama feature no publica.
`node tools/verify-world.mjs` verifica también fuentes, capas y licencias.
Las ramas posteriores conservan historial público normal: solo el corte inicial
excluye el historial local con originales restringidos. Véase PUBLICACION.md.
