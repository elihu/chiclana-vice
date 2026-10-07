# Propuesta de convenciones: agentes, documentación, estructura, Git y CI

> **Aplicada.** Se conserva como registro de las decisiones; las reglas vigentes están en
> [AGENTS.md](../AGENTS.md), [GIT_WORKFLOW.md](GIT_WORKFLOW.md) y
> [PUBLICACION.md](PUBLICACION.md).

Rama `docs/convenciones-agentes`, creada desde `main` (5c727d1). Fecha: 6/10/2026.

## Resumen

- **Agentes**: `AGENTS.md` es la fuente única y breve de instrucciones (comandos, límites
  «siempre / preguntar / nunca», estructura y Git). `CLAUDE.md` solo lo importa con
  `@AGENTS.md`. `tools/` tiene su propio `AGENTS.md`. Una habilidad compartida,
  `integrar-rama`, en `.agents/skills/` y enlazada desde `.claude/skills/`. Permisos de
  Claude Code en `.claude/settings.json`: piden confirmación para `git push`, etiquetas,
  `filter-repo` y releases.
- **Documentación**: estructura ligera inspirada en Diátaxis (trabajar / referencia /
  estado), una sola fuente por afirmación (SP-12). Se fusiona `ESTRUCTURA.md` en
  `DESARROLLO.md`, `CONTINUAR-CODEX.md` pasa a `ESTADO.md` (estado y pendientes, sin
  historia), se añade `CONTRIBUTING.md` y se documentan el modo ligero y `measure.js`. Sin
  `CHANGELOG.md`: las releases de GitHub generan las notas.
- **Estructura**: se borra `tools/export-public.mjs` y `extras/rebuild-map.py` pasa a
  `tools/`. El resto de movimientos, que tocan datos o el juego, quedan descritos.
- **Git**: _trunk-based_ con ramas cortas, un worktree por agente, `merge --no-ff` local
  tras `npm run check`, Conventional Commits en español, etiquetas `vX.Y.Z` con releases
  de GitHub y política de reescritura solo por motivos legales o de privacidad.
- **CI**: `ci.yml` con `check` (todas las ramas y PR, solo lectura, Node 22.13.0 y LTS,
  `npm ci --ignore-scripts`, sin caché) y `deploy` (solo `main`, `needs: check`, sin npm).
  Acciones fijadas por SHA verificado; Dependabot mensual y agrupado.
- **Licencias**: P1 como riesgo asumido con procedimiento de retirada; P2 resuelto en
  local con push forzado pendiente; P3 y la eliminación de `roads-osm.json` como
  decididas, pendientes de aplicar en los datos.

## Qué se investigó

Consultas del 6/10/2026.

| Tema                                                                      | Fuente                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estándar AGENTS.md: secciones, archivos anidados, el más cercano manda    | https://agents.md/                                                                                                                                                                                                                           |
| Claude Code: CLAUDE.md, `@imports`, lectura nativa de AGENTS.md, tamaño   | https://code.claude.com/docs/en/memory                                                                                                                                                                                                       |
| Claude Code: habilidades y comandos fusionados, estándar Agent Skills     | https://code.claude.com/docs/en/skills                                                                                                                                                                                                       |
| Claude Code: `.claude/settings.json` y permisos                           | https://code.claude.com/docs/en/settings                                                                                                                                                                                                     |
| Codex: descubrimiento de AGENTS.md, `AGENTS.override.md`, límite 32 KiB   | https://learn.chatgpt.com/docs/agent-configuration/agents-md                                                                                                                                                                                 |
| Codex: habilidades en `.agents/skills`                                    | https://learn.chatgpt.com/docs/build-skills                                                                                                                                                                                                  |
| Copilot: soporte de AGENTS.md anidados                                    | https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/                                                                                                                                    |
| Cursor: AGENTS.md en raíz y subdirectorios                                | https://cursor.com/docs/rules                                                                                                                                                                                                                |
| Conventional Commits 1.0                                                  | https://www.conventionalcommits.org/es/v1.0.0/                                                                                                                                                                                               |
| Ramas cortas en _trunk-based development_                                 | https://trunkbaseddevelopment.com/short-lived-feature-branches/                                                                                                                                                                              |
| Diátaxis                                                                  | https://diataxis.fr/                                                                                                                                                                                                                         |
| Keep a Changelog (alternativa descartada)                                 | https://keepachangelog.com/es-ES/1.1.0/                                                                                                                                                                                                      |
| Reglas de rulesets de GitHub                                              | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets                                                                                                    |
| Uso seguro de Actions y fijación por SHA                                  | https://docs.github.com/en/actions/reference/security/secure-use y https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/                                                             |
| Dependabot: opciones (`cooldown`, `groups`) y comentarios de versión      | https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference y https://github.blog/changelog/2022-10-31-dependabot-now-updates-comments-in-github-actions-workflows-referencing-action-versions/ |
| `setup-node` v7: caché automática y recomendación de desactivarla         | https://github.com/actions/setup-node                                                                                                                                                                                                        |
| Calendario de Node.js (22 en mantenimiento, 24 LTS, 26 LTS el 28/10/2026) | https://github.com/nodejs/Release/blob/main/schedule.json                                                                                                                                                                                    |

Versiones y SHA de las acciones, obtenidos con `gh api` y `git ls-remote` (etiquetas
ligeras, el SHA es el del commit):

| Acción                          | Versión | SHA                                        |
| ------------------------------- | ------- | ------------------------------------------ |
| `actions/checkout`              | v7.0.1  | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node`            | v7.0.0  | `820762786026740c76f36085b0efc47a31fe5020` |
| `actions/configure-pages`       | v6.0.0  | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` |
| `actions/upload-pages-artifact` | v5.0.0  | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| `actions/deploy-pages`          | v5.0.1  | `368f82528645a54fb793d4d04e342629a3f51346` |

Validación: `actionlint` 1.7.12 (binario oficial descargado al scratchpad con checksum
comprobado) sin avisos; `check-jsonschema` con los esquemas de schemastore para el
workflow, Dependabot y `.claude/settings.json`. El workflow no se ha ejecutado en GitHub.

## Decisiones

### Instrucciones para agentes

- **Un `AGENTS.md` canónico y `CLAUDE.md` con `@AGENTS.md`**. Codex, Copilot y Cursor
  leen AGENTS.md. Claude Code lo lee de forma nativa desde v2.1.277 solo si no hay
  `CLAUDE.md`, y no en todas las sesiones; la importación funciona siempre y nunca carga
  el archivo dos veces. Descartado: enlace simbólico `CLAUDE.md → AGENTS.md` (las
  herramientas de edición se niegan a escribir a través de enlaces y no deja sitio a
  notas propias de Claude); dos archivos independientes (se desincronizan).
- **Contenido**: comandos exactos primero, límites en tres niveles, estructura mínima y
  enlaces a `docs/` en lugar de copiar las guías. Unas 70 líneas, lejos del límite de
  200 líneas que recomienda Claude Code y de los 32 KiB de Codex. Se quitan del archivo
  raíz las referencias a archivos concretos del juego que van a cambiar.
- **AGENTS.md anidado solo en `tools/`**, con un `CLAUDE.md` que lo importa: ahí hay un
  orden de pasos que, si se incumple, rompe la verificación. Codex solo carga los archivos
  entre la raíz y el directorio de trabajo, por eso el `AGENTS.md` raíz pide leerlo antes
  de editar `tools/`.
  - Descartado en `web/`: Pages publica `web/` entero y el archivo acabaría en la web; sus
    reglas caben en el archivo raíz.
  - Aplazado en `tests/`: otra rama está cambiando el arnés de pruebas. Cuando se integre,
    conviene un `tests/AGENTS.md` breve: cómo añadir un invariante, no fijar recuentos y
    no escribir archivos en `tests/`.
- **Una habilidad, `integrar-rama`**, porque es el procedimiento de varios pasos que se
  repite con cada agente. Vive en `.agents/skills/` (Codex) y `.claude/skills/` es un
  enlace a esa carpeta (Claude Code no lee `.agents/`). Solo usa campos del estándar Agent
  Skills (`name`, `description`). La documentación oficial de Claude Code confirma que una
  entrada `<skill-name>` de la ubicación de proyecto puede ser un enlace simbólico a un
  directorio y que se lee el `SKILL.md` del destino
  (https://code.claude.com/docs/en/skills, consulta del 6/10/2026), así que se mantiene el
  enlace y no hace falta una copia ni una comprobación en las pruebas.
- **`.claude/settings.json`** con permisos compartidos: permite `npm run check` y
  lecturas de Git; pide confirmación para push, etiquetas, releases, `filter-repo` y
  `npm install`; deniega leer `.env`. Lo personal va en `settings.local.json`, ignorado.
- **Sin `.github/copilot-instructions.md` ni `.cursor/rules/`**: ambos leen AGENTS.md y
  un archivo más sería otra copia que mantener.
- Se ignoran `CLAUDE.local.md`, `AGENTS.override.md`, `.claude/settings.local.json` y
  `.claude/worktrees/`.

### Documentación

- **Diátaxis ligero**: el índice `docs/README.md` agrupa en «trabajar en el proyecto»
  (guías), «referencia» y «estado». Cuatro carpetas separadas serían excesivas para nueve
  documentos.
- **Una afirmación, un sitio**: licencias solo en `THIRD_PARTY_NOTICES.md`; fuentes y
  aproximaciones en `MAP_SOURCES.md`; reproducción en `DATOS_PUBLICOS.md`; estado de
  verificación solo en `ESTADO.md`; remoto y Pages en `PUBLICACION.md`.
- **`ESTADO.md` en lugar de `CONTINUAR-CODEX.md`**: el nombre no depende de una
  herramienta, contiene solo estado, decisiones vigentes y pendientes, y lo actualiza
  quien integra en `main`, no cada rama, para evitar conflictos entre agentes paralelos.
  Descartado: un registro de sesiones (vuelve a crecer y a contradecirse).
- **`CONTRIBUTING.md`** breve para personas; GitHub lo enlaza en issues y PR.
- **Sin `CHANGELOG.md`**: con ramas paralelas, un archivo que todas editan es una fuente
  continua de conflictos. Las notas salen de `gh release create --generate-notes`.
- Se conservan los nombres de `DATOS_PUBLICOS.md` y `MAP_SOURCES.md` para no provocar
  conflictos de borrado y modificación con ramas en curso.

Correcciones de la auditoría:

| ID    | Corrección                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------- |
| D-N1  | `GIT_WORKFLOW.md` reescrito: remoto real, sin etiqueta inexistente ni copia privada; usa fish. |
| D-N2  | `DESARROLLO.md` dice que se publica `web/`.                                                    |
| D-N3  | La CI ya no usa caché; `PUBLICACION.md` lo explica y habla de «unos pocos MB».                 |
| D-N4  | `DATOS_PUBLICOS.md` ordena generador → `export-provenance` → `npm test`; avisa de N1.          |
| D-N5  | Ya no se afirma la comparación con la instantánea anterior; se explica `prepare-world` vacío.  |
| D-N6  | `ESTADO.md` sustituye al registro acumulativo; remoto y cuenta solo en `PUBLICACION.md`.       |
| D-N7  | Requiere editar `web/world.json`: ver «no aplicados».                                          |
| D-N8  | `THIRD_PARTY_NOTICES.md` describe la eliminación decidida de `roads-osm.json`.                 |
| D-N9  | Requiere editar `web/game3d.js`: ver «no aplicados».                                           |
| D-N10 | Sección «Modo ligero» en `DESARROLLO.md`, con sus limitaciones actuales.                       |
| D-N11 | `DESARROLLO.md` separa copias intencionadas y duplicados pendientes.                           |
| D-N12 | `web/measure.js` aparece en la estructura y tiene su sección de uso.                           |
| SP-7  | Exportador y secciones privadas eliminados.                                                    |
| SP-12 | Consolidación descrita arriba.                                                                 |

### Estructura

- **Aplicado**: borrar `tools/export-public.mjs` (SP-7); mover `extras/rebuild-map.py` a
  `tools/` y fusionar `extras/README.md` en `DATOS_PUBLICOS.md`. La carpeta `extras/`
  solo tenía ese script, y el script calcula la raíz como `parent.parent` de su ruta, que
  no cambia.
- **Se mantiene**: `web/` como fuente y sitio a la vez (sin compilación); `source-data/`
  para lo que usan los conversores y no se publica; `web/measure.js` publicado porque se
  importa desde la consola del navegador con ruta relativa.

### Git

- **Trunk-based con ramas cortas y `merge --no-ff` local**: encaja con un solo
  desarrollador que lanza varios agentes en paralelo; cada tarea queda como un merge
  revertible. Descartado: Git Flow (`develop`, ramas de release) por sobrecarga.
- **Sin PR obligatorios** (opción A, decidida por el usuario): los agentes integran en
  local con `merge --no-ff` tras `npm run check` y el push a `main` lo decide el usuario.
  La regla de GitHub solo bloquea el push forzado y el borrado de `main`, con el
  propietario en la lista de omisión. La protección contra publicar algo roto es
  `needs: check`.
  - Descartada (opción B): PR obligatorio con 0 aprobaciones y `check` requerido. Un
    check requerido es incompatible con hacer push de merges locales a `main`.
- **Conventional Commits en español** con ámbitos opcionales y `!` para cambios que rompen
  partidas guardadas, URL o formato de datos; `merge: integrar …` para los merges.
- **Etiquetas anotadas `vX.Y.Z` y releases de GitHub** con notas generadas. La primera,
  `v1.0.0`, la crea el integrador al final, con todas las ramas en curso integradas.
- **Sin trailers `Co-Authored-By` ni líneas de atribución**, tampoco de agentes, en
  commits, merges o PR: norma en `AGENTS.md`, `CONTRIBUTING.md` y `GIT_WORKFLOW.md`.
- **Historial**: `main` publicado no se reescribe salvo por credenciales, datos personales
  o retirada de contenido de terceros; procedimiento con `bundle`, `filter-repo` y
  `--force-with-lease` en `GIT_WORKFLOW.md`.

### CI

- `permissions: {}` global y permisos por job; `npm ci` solo en el job de solo lectura.
- `persist-credentials: false` en `checkout`: ningún paso necesita el token después.
- `npm ci --ignore-scripts`: viable, `package-lock.json` no tiene ningún paquete con
  `hasInstallScript`.
- Sin caché de npm: cuatro herramientas; `setup-node` v7 recomienda desactivarla si no es
  necesaria.
- Matriz `22.13.0` (mínimo de `engines`, que además exige ESLint 10) y `lts/*` (24 hoy, 26
  desde el 28/10/2026). Descartado: solo `'22'`, que no prueba el mínimo declarado.
- `concurrency` por rama, con cancelación salvo en `main`; despliegues en cola en `pages`.
- Dependabot mensual, agrupado y con `cooldown` (7 días; 30 para versiones mayores de
  npm) para no adoptar una versión recién publicada y comprometida. Actualiza el SHA y el
  comentario de versión. Descartado Renovate: requiere instalar una app externa y no
  aporta nada aquí.
- No se cambia `package.json`: `npm run check` ya es el punto de entrada de la CI.

### Licencias

- P1: riesgo conocido y asumido, con procedimiento «Reclamaciones y retirada» en
  `THIRD_PARTY_NOTICES.md`, enlazado desde README, CONTRIBUTING, PUBLICACION y ESTADO.
- P2: historial reescrito en local; falta el push forzado (comando abajo).
- P3 y `roads-osm.json`: decididos y descritos como tales, con `marca temporal de integración`
  hasta que la rama de datos los aplique.

## Cambios aplicados en la rama

- `.github/workflows/ci.yml` (sustituye a `pages.yml`) y `.github/dependabot.yml`.
- `AGENTS.md` reescrito; nuevos `CLAUDE.md`, `tools/AGENTS.md`, `tools/CLAUDE.md`,
  `.agents/skills/integrar-rama/SKILL.md`, `.claude/skills/integrar-rama` (enlace) y
  `.claude/settings.json`; `.gitignore` ampliado.
- Borrados `tools/export-public.mjs`, `extras/README.md` y `docs/ESTRUCTURA.md`;
  `extras/rebuild-map.py` → `tools/rebuild-map.py`; `docs/CONTINUAR-CODEX.md` →
  `docs/ESTADO.md` (reescrito).
- Reescritos `README.md`, `docs/README.md`, `docs/DESARROLLO.md`, `docs/GIT_WORKFLOW.md`,
  `docs/PUBLICACION.md`, `docs/DATOS_PUBLICOS.md` y `docs/MAP_SOURCES.md`; nota de fuente
  de verdad en `docs/ALTURAS_PILOTO.md`; nuevo `CONTRIBUTING.md`.
- `THIRD_PARTY_NOTICES.md` (y su copia en `web/`): P1, retirada, P3, `roads-osm.json` y
  arcade.
- `npm run check` pasa en la rama.

Las frases que dependen de otras ramas llevan `marca temporal de integración`. Buscarlas tras cada
merge con `git grep -n 'marca temporal de integración'`. La copia `web/THIRD_PARTY_NOTICES.md` se
publica, así que esas marcas serían visibles en la web si esta rama se publica antes que
las demás.

## Propuestos y no aplicados

Tocan archivos que otras ramas están editando. Ejecutar tras integrarlas, en una rama
nueva, y terminar siempre con `node tools/export-provenance.mjs` y `npm run check`.

1. **Eliminar `roads-osm.json`** (decidido; rama de datos):

   ```fish
   git rm web/roads-osm.json
   # quitar 'roads-osm.json' de la lista files del registro OSM en tools/export-provenance.mjs
   node tools/export-provenance.mjs
   npm run check
   ```

2. **`frontages.json` bajo ODbL 1.0** (decidido; rama de datos): cambiar `conditions`
   del registro del catálogo en `tools/export-provenance.mjs` (hoy «Mixed provenance…»)
   a `ODbL-1.0` con avisos de Catastro e IGN, y, si se quiere, declararlo también en la
   cabecera que escribe `tools/export-facades.mjs`. Regenerar con
   `node tools/export-facades.mjs` y `node tools/export-provenance.mjs`.
3. **Una copia del catálogo (SP-8)**: hacer canónico `web/frontages.json`:

   ```fish
   git rm source-data/facade-catalog.json
   # export-facades.mjs: destino por defecto web/frontages.json
   # verify-world.mjs y export-provenance.mjs: leer web/frontages.json y quitar la copia
   ```

4. **Favicon del arcade duplicado**: `git rm web/arcade/favicon.svg` y cambiar en
   `web/arcade/index.html` el `href` del icono a `../favicon.svg`.
5. **Objetos de calle desde JSON (SP-1)**: borrar `mappedStreetObjects` de
   `web/game3d.js` y cargar `street-objects.json` (rama del juego).
6. **D-N7**: corregir `meta` en `tools/rebuild-map.py` y regenerar `web/world.json`, o
   eliminar `meta` y remitir a `data-sources.json`.
7. **D-N9**: en la ayuda de `web/game3d.js`, no repetir «CC BY 4.0», calcular los
   contadores y citar los autores del alzado.
8. **Tras el arnés de pruebas**: quitar `tests/qa3d-runtime.mjs` de `.gitignore`,
   `.prettierignore` y `eslint.config.mjs`, y añadir `tests/AGENTS.md`.
9. **ESLint**: `sourceType: 'script'` para `web/arcade/**`.
10. **Opcional**: `.npmrc` con `ignore-scripts=true` para que también `npm ci` local
    ignore scripts de instalación.
11. **Limpiar ramas ya integradas** (en el repositorio principal):

    ```fish
    git branch -d chore/estructura-estatica chore/lint-y-formato docs/orden-y-licencia docs/publicacion-personal fix/atribuciones-y-procedencia fix/autoria-personal
    ```

12. **Renombrar `docs/DATOS_PUBLICOS.md` a `docs/DATOS.md`** (decidido): lo hace el
    integrador al final, ya anotado en `docs/ESTADO.md`:

    ```fish
    git mv docs/DATOS_PUBLICOS.md docs/DATOS.md
    git grep -n DATOS_PUBLICOS
    ```

13. **Push forzado del historial reescrito (P2)**, cuando el usuario lo decida, desde la
    cuenta propietaria (en la lista de omisión de la regla):

    ```fish
    git -C /home/elihu/GIT/chiclana-vice-public ls-remote origin main
    git -C /home/elihu/GIT/chiclana-vice-public push --force-with-lease=main:SHA_OBTENIDO origin main
    ```

    Si se publica antes esta rama, el push forzado ya llevará la nueva CI.

## Acciones manuales en GitHub

1. Settings → Pages → Source: «GitHub Actions» (ya configurado; comprobar).
2. Settings → Environments → `github-pages`: ramas de despliegue, solo `main`.
3. Settings → Actions → General: permisos de workflow de solo lectura; no permitir que
   Actions cree o apruebe PR; permitir solo acciones de GitHub y exigir SHA completo.
4. Settings → Rules → Rulesets → regla para `main` con solo «Restrict deletions» y
   «Block force pushes», y el rol «Repository admin» en la lista de omisión para que el
   propietario pueda hacer el push forzado de P2. Sin «Require a pull request» ni checks
   requeridos.
5. Settings → Advanced Security: alertas y actualizaciones de versión de Dependabot.
6. Primera ejecución: comprobar en Actions que `check` pasa en una rama y que `deploy`
   publica desde `main`; el nombre del workflow cambia de «Publicar Chiclana Vice» a
   «CI y Pages».

## Preguntas resueltas

Respuestas del usuario del 6/10/2026, ya aplicadas en la rama:

1. Reclamaciones: solo mediante un issue público de GitHub, sin correo de contacto.
2. Opción A: merge local `--no-ff` tras `npm run check`, sin PR obligatorio; la regla de
   `main` solo bloquea el push forzado y el borrado, salvo para el propietario.
3. `v1.0.0` se etiqueta tras integrar todas las ramas en curso; lo hace el integrador.
4. Nunca trailers `Co-Authored-By` ni líneas de atribución en commits ni PR, tampoco de
   agentes.
5. Matriz de Node con dos versiones: 22.13.0 (mínimo de `engines`) y la LTS vigente.
6. `.claude/skills` se mantiene como enlace simbólico: la documentación oficial confirma
   que Claude Code los sigue.
7. `DATOS_PUBLICOS.md` se renombrará a `DATOS.md` al final, por el integrador.
