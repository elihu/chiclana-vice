---
name: integrar-rama
description: Cierra la rama de una tarea y, solo si el usuario lo pide expresamente, la integra en main con merge --no-ff. Úsala cuando el usuario pida cerrar o integrar una rama; para revisar la rama de otro agente, usa revisar-rama; no para trabajo en curso.
---

# Cerrar e integrar una rama

Sigue `docs/GIT_WORKFLOW.md`. Resumen verificable:

## 1. En la rama

1. `git status --short --branch`: identifica cambios ajenos a la tarea y no los incluyas.
2. `npm run check` debe pasar. Si la tarea toca interfaz, cámara o render, indica si se ha
   probado en un navegador real; si no, dilo.
3. `git diff --check` y revisa `git diff`. Añade rutas concretas, nunca `git add -A`.
4. Commit con Conventional Commits en español, sin trailers
   `Co-Authored-By` ni líneas de atribución.
5. Informa: rama, commits (`git log --oneline main..HEAD`), comprobaciones y pendientes.

## 2. Integración (solo con petición explícita del usuario)

Excepción: una rama `docs/` con un plan que va a ejecutar otro agente se integra al
terminarla, sin esperar petición (`docs/GIT_WORKFLOW.md`, «Planes para otro agente»).

Si la rama es de otro agente, revísala antes con `revisar-rama`.

En el repositorio principal (si la rama tiene worktree, desde el principal, no desde él):

```fish
git switch main
git merge --no-ff RAMA -m 'merge: integrar RAMA'
npm run check
```

- Si hay conflictos, resuélvelos, repite `npm run check` y termina el merge; para
  abandonarlo, `git merge --abort`.
- Si el merge cambia algo publicado de `web/` (`git diff --stat HEAD^1 HEAD -- web/`),
  sube la versión de los recursos a `AAAA-MM-DD-tema` en un commit
  `chore: subir la versión de los recursos`:

  ```fish
  sed -i 's/?v=[^"]*"/?v=AAAA-MM-DD-tema"/g' web/index.html
  npm run check
  ```

- Actualiza `docs/ESTADO.md` si la rama cierra o añade pendientes, en un commit
  `docs: actualizar estado tras integrar RAMA`.
- Tras integrar y comprobar, borra la rama con `git branch -d RAMA` y, si tenía worktree,
  `git worktree remove` antes. No hagas `git push` ni crees etiquetas sin petición
  explícita.
