# Publicación y CI

- Repositorio público: https://github.com/elihu/chiclana-vice (cuenta personal elihu).
- Juego publicado: https://elihu.github.io/chiclana-vice/
- Pages con origen «GitHub Actions»; se publica la carpeta `web/` tal cual.

## Workflow `.github/workflows/ci.yml`

| Job      | Cuándo                                       | Permisos                                            | Qué hace                                                           |
| -------- | -------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `check`  | Push a cualquier rama, PR y ejecución manual | `contents: read`                                    | `npm ci --ignore-scripts` y `npm run check` con Node 22.13.0 y LTS |
| `deploy` | Solo en `main`, fuera de PR, si `check` pasa | `contents: read`, `pages: write`, `id-token: write` | Empaqueta `web/` y lo publica; no instala dependencias npm         |

- Las acciones están fijadas por SHA de commit, con la versión en un comentario.
  Dependabot (`.github/dependabot.yml`) propone cada mes las actualizaciones de acciones y
  de herramientas npm, agrupadas y con unos días de espera tras cada versión nueva.
- `concurrency`: en ramas de trabajo un push nuevo cancela la comprobación anterior; en
  `main` no se cancela nada, y los despliegues van en cola en el grupo `pages`.
- La CI no usa caché de npm: son pocas herramientas y así se evita reutilizar una caché
  envenenada.
- Matriz de Node: `22.13.0` es el mínimo de `engines` en `package.json`; `lts/*` sigue la
  LTS vigente. Si cambia `engines`, cambiar también la matriz.

Seguir una ejecución: `gh run list --workflow ci.yml` o la pestaña Actions.

## Publicar

Publicar es integrar en `main` y ejecutar, solo con petición explícita:

```fish
git push origin main
```

Una rama o un PR nunca publican. Si `check` falla en `main`, `deploy` no se ejecuta y Pages
sigue sirviendo la versión anterior.

Para retirar la web de inmediato (por ejemplo, ante una reclamación de derechos): Settings
→ Pages → «Unpublish site», o revertir el cambio y publicar. Ver el procedimiento en
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md#reclamaciones-y-retirada).

## Ajustes manuales en GitHub

No se pueden versionar en el repositorio; comprobar que están así:

1. Settings → Pages → Source: «GitHub Actions».
2. Settings → Environments → `github-pages` → Deployment branches: solo `main`.
3. Settings → Actions → General:
   - Workflow permissions: «Read repository contents and packages permissions».
   - Desactivar «Allow GitHub Actions to create and approve pull requests».
   - Política de acciones: permitir solo acciones de GitHub y exigir fijación por SHA
     completo.
4. Settings → Rules → Rulesets → nueva regla de rama para `main` (sin lista de omisión):
   «Restrict deletions» y «Block force pushes». Ver las alternativas en
   [GIT_WORKFLOW.md](GIT_WORKFLOW.md) y la propuesta.
5. Settings → Advanced Security: activar alertas de Dependabot y «Dependabot version
   updates» (usa `.github/dependabot.yml`).

## Coste y límites

Repositorio público, Pages y runners Ubuntu estándar: sin coste. No se necesita dominio
propio. GitHub aplica límites de uso (sitio de hasta 1 GB y un ancho de banda orientativo
de 100 GB al mes); no es alojamiento ilimitado. El artefacto publicado ocupa unos pocos MB
y se conserva un día. Si la cuenta tiene pagos activados para otros usos, mantener
bloqueado el gasto adicional de Actions.

- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- https://docs.github.com/en/billing/concepts/product-billing/github-actions

## Privacidad

El juego no tiene cuentas, backend, analítica ni multijugador. El progreso se guarda en el
navegador de cada jugador. No enviar tokens ni contraseñas a agentes ni al chat.
