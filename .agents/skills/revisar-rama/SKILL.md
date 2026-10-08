---
name: revisar-rama
description: Revisa de forma independiente la rama que ha terminado otro agente, antes de integrarla, comparándola con main en copias fuera del repositorio. Úsala cuando el usuario pida revisar una rama o una fase hecha por otro agente; no modifica el repositorio.
---

# Revisar una rama ajena

El informe del autor no basta: cada conclusión sale de una comprobación propia, con cifras.
Mientras la rama siga en curso, no se escribe en el repositorio principal ni se cambia de
rama (`docs/GIT_WORKFLOW.md`, «Una rama en curso»).

## 1. Contexto

1. `git status --short --branch`, `git log --oneline main..RAMA` y
   `git diff --stat main...RAMA`. Si el árbol tiene cambios, el autor no ha terminado:
   pregunta.
2. Lee el paso o la fase del plan (`docs/PLAN-*.md`) y su verificación. Revisa
   `git diff main...RAMA` completo contra lo pedido: qué falta, qué sobra y qué cambia de
   comportamiento sin decirlo.

## 2. Copias fuera del repositorio

En el scratchpad de la sesión (o en `/tmp`), con `node_modules` enlazado:

```sh
git archive BASE | tar -x -C DIR/base     # BASE: el commit de main del que partió la rama
git archive RAMA | tar -x -C DIR/rama
ln -s "$PWD/node_modules" DIR/base/node_modules
ln -s "$PWD/node_modules" DIR/rama/node_modules
```

## 3. Comprobaciones

- **`npm run check`** en la copia de la rama; anota el código de salida.
- **Huella de escena**, si es un refactor o no debe cambiar la escena: en `DIR/base`,
  `node tools/scene-fingerprint.mjs --out REF.json`; en `DIR/rama`, `--compare REF.json`.
  Repite sin relieve, apartando `web/terrain.json` y `web/terrain.bin` en ambas copias y
  restaurándolos. Comprueba que las dos referencias difieren entre sí.
- **Superficies**, si toca relieve, puentes o actores:
  `node tools/bench-terrain-surfaces.mjs . OUT.json --compare REF.json`.
- **Datos generados**: vuelve a ejecutar el generador en la copia (`tools/AGENTS.md`) y
  compara bytes con lo confirmado. El terreno se reexporta desde
  `~/.cache/chiclana-vice/mdt/original.bin`; si el original no está, dilo sin
  descargarlo.
- **Prueba de humo en Chrome**: sirve `DIR/rama/web` en un puerto libre y ejecuta
  `node tools/browser-smoke.mjs URL google-chrome-stable --surfaces` y con
  `--surfaces --low`. Cierra el servidor que arrancaste al terminar.
- **`grep`** de los usos que la tarea debía eliminar o centralizar.
- **Casos sin cubrir**: escribe en el scratchpad scripts propios para lo que los tests no
  prueban (bordes, escalones, pendientes, datos que llegarán en fases futuras). Si
  encuentras un fallo, deja el script que lo reproduce.

## 4. Informe

- Tabla de comprobaciones con resultado y cifras.
- Fallos, con su escenario concreto y propuesta de arreglo; después, detalles menores.
- Lo no verificado: GPU, rendimiento, móvil y prueba visual del usuario si el paso la
  exige.
- Pregunta si se corrige en la misma rama (y quién) o si se integra con
  `integrar-rama`. No corrijas ni integres sin petición.
