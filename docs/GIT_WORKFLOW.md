# Flujo de Git

Desarrollo basado en tronco (_trunk-based_) con ramas cortas. `main` es la versión
integrada y cada push a `main` publica el juego en Pages tras pasar la CI. No hay rama
`develop` ni ramas de release.

Repositorio: https://github.com/elihu/chiclana-vice (remoto `origin`). La identidad de Git
se configura en el propio repositorio, no se hereda la global:

```fish
git config user.name elihu
git config user.email 4126552+elihu@users.noreply.github.com
```

## Ramas

- Nombre `tipo/tema-concreto`, con el mismo tipo que los commits: `feat/`, `fix/`,
  `perf/`, `docs/`, `test/`, `ci/`, `chore/`, `refactor/`.
- Una rama, un objetivo revisable. Vida corta: horas o pocos días.
- Las ramas parten de `main` y vuelven a `main` con `merge --no-ff`, que deja un commit de
  integración por tarea y permite revertirla de una vez.

## Un worktree por agente

Cada agente trabaja en su propio worktree y su propia rama, de modo que varios agentes
pueden avanzar en paralelo sin pisarse el árbol de trabajo. El repositorio principal
(`chiclana-vice-public`) queda en `main` y es donde se integra.

Crear el worktree (la barra de la rama se sustituye por un guion en la carpeta):

```fish
cd /home/elihu/GIT/chiclana-vice-public
git switch main
git worktree add ../chiclana-vice-wt/feat-tema -b feat/tema main
ln -s /home/elihu/GIT/chiclana-vice-public/node_modules ../chiclana-vice-wt/feat-tema/node_modules
```

`node_modules` está ignorado; el enlace evita instalar las herramientas en cada worktree.
Dentro de un worktree no se ejecuta `npm install`.

Reglas para el agente:

- Trabajar solo en su worktree y su rama. No tocar `main`, otros worktrees ni el remoto.
- No hacer merge, rebase ni push salvo petición explícita.
- Hacer commits pequeños y dejar `npm run check` en verde en el último.
- Al terminar, informar de la rama, los commits (`git log --oneline main..HEAD`), lo
  verificado y lo pendiente.

## Commits

[Conventional Commits 1.0](https://www.conventionalcommits.org/es/v1.0.0/) en español:

```text
tipo(ámbito opcional): descripción breve en minúscula y sin punto final

Cuerpo opcional: por qué se hace el cambio y qué se ha verificado.
```

- Tipos: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `ci`, `chore`. Ámbitos útiles:
  `juego`, `datos`, `movil`, `tests`, `tools`.
- Un cambio rompe compatibilidad si invalida partidas guardadas, URL públicas o el formato
  de las capas de datos. Se marca con `!` (`feat(datos)!: …`) y se explica en el cuerpo.
- Los commits de integración usan `merge: integrar tipo/tema`.
- Nunca trailers `Co-Authored-By` ni líneas de atribución, tampoco de agentes de IA, en
  commits, merges o pull requests.
- Revisar antes de confirmar y añadir rutas concretas:

```fish
git status --short --branch
git diff --check
git add ruta/concreta otra/ruta
git diff --cached
git commit -m 'fix(juego): describir el comportamiento corregido'
```

## Integrar

Lo hace el usuario o un agente al que se le pida expresamente (habilidad `integrar-rama`).
No hay pull requests obligatorios: la integración es un merge local `--no-ff` tras
`npm run check`, y la CI vuelve a comprobar `main` antes de desplegar.

```fish
cd /home/elihu/GIT/chiclana-vice-public
git switch main
git merge --no-ff feat/tema -m 'merge: integrar feat/tema'
npm run check
```

- Con varias ramas en paralelo, integrar de una en una y repetir `npm run check` tras cada
  merge. Si hay conflictos, resolverlos, comprobar y terminar el merge; para abandonarlo,
  `git merge --abort`.
- `docs/ESTADO.md` se actualiza en `main` tras integrar, no en cada rama.
- Para cambios grandes, conviene subir antes la rama (`git push -u origin feat/tema`) para
  que la CI la compruebe también con la versión mínima de Node.
- Publicar es `git push origin main` y requiere petición explícita: dispara el despliegue.
- Limpiar después:

```fish
git worktree remove ../chiclana-vice-wt/feat-tema
git branch -d feat/tema
```

Para deshacer una tarea ya integrada sin reescribir historial:
`git revert -m 1 HASH_DEL_MERGE`.

## Etiquetas y releases

- Etiquetas anotadas `vMAYOR.MENOR.PARCHE` sobre commits de `main` ya desplegados.
  MAYOR: rompe partidas guardadas, URL o formato de datos; MENOR: funcionalidad o datos
  nuevos; PARCHE: correcciones.
- Crear la release con notas generadas a partir de los commits:

```fish
git tag -a vX.Y.Z -m 'Descripción y validación realizada'
git push origin vX.Y.Z
gh release create vX.Y.Z --verify-tag --notes-file notas.md
```

- Una etiqueta no despliega nada y no implica una prueba en móvil.
- La versión de `package.json` coincide con la etiqueta y se sube en un commit
  `chore: preparar la versión X.Y.Z` antes del push, junto con la versión de los
  recursos (`?v=`, ver [DESARROLLO.md](DESARROLLO.md#módulos-del-juego)). La etiqueta se
  crea cuando `npm run check` pasa en `main` y el despliegue ha terminado.
- Las notas resumen los cambios para quien juega y lo verificado; `--generate-notes`
  solo lista pull requests, y aquí se integra en local.
- No hay `CHANGELOG.md`: las notas de cada release y el historial de Conventional Commits
  cumplen esa función sin provocar conflictos entre ramas paralelas.

## Reescritura de historial

`main` publicado no se reescribe. Excepciones: credenciales, datos personales o contenido
de terceros que deba retirarse. En ese caso:

1. Copia de seguridad: `git bundle create ../chiclana-vice-AAAAMMDD.bundle --all`.
2. Reescribir con `git filter-repo` en un clon limpio.
3. Revisar el resultado y que `npm run check` pase.
4. Publicar desde la cuenta propietaria (la única en la lista de omisión de la regla que
   bloquea el push forzado; ver [PUBLICACION.md](PUBLICACION.md)), con protección contra
   pisar cambios ajenos:
   `git push --force-with-lease=main:SHA_REMOTO_ACTUAL origin main` (obtener el SHA con
   `git ls-remote origin main`).
5. Recrear los worktrees y documentarlo en `docs/ESTADO.md`.

GitHub puede conservar un tiempo los commits antiguos accesibles por su SHA; si hace falta
purgarlos, hay que pedirlo a su soporte.

La única reescritura hasta ahora quitó el nombre «Gerion Dev Team» de versiones antiguas
de `LICENSE` y `THIRD_PARTY_NOTICES.md`; se publicó antes de `v1.0.0`.
