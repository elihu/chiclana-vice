# Documentación

Los comandos se ejecutan desde la raíz del repositorio. Cada afirmación vive en un solo
documento; los demás enlazan a él.

## Trabajar en el proyecto

- [Desarrollo, estructura y convenciones](DESARROLLO.md): ejecutar, comprobar, modo ligero,
  herramientas de medición.
- [Flujo de Git](GIT_WORKFLOW.md): ramas, varios agentes, revisión, planes para otro
  agente, integración, commits, etiquetas e historial.
- [Publicación y CI](PUBLICACION.md): GitHub Actions, Pages y ajustes del repositorio.
- [Reproducir los datos](DATOS.md): conversores y orden de los pasos.

## Referencia

- [Fuentes del mapa y aproximaciones](MAP_SOURCES.md).
- [Las 15 correcciones del piloto de alturas](ALTURAS_PILOTO.md).
- [Licencias, atribuciones y retirada](../THIRD_PARTY_NOTICES.md): única fuente legal.

## Estado

- [Estado actual y pendientes](ESTADO.md).
- [Propuesta de convenciones](PROPUESTA-CONVENCIONES.md): decisiones sobre agentes,
  documentación, Git y CI, ya aplicadas; se conserva como registro.
- [Plan de modularización y diseño desde datos](PLAN-MODULAR.md): plan por fases, ya
  ejecutado (fases 0 a 3). Se conserva como registro; la referencia vigente está en
  [DESARROLLO.md](DESARROLLO.md) y [DATOS.md](DATOS.md), salvo el formato de recetas y
  correcciones de [KIT-FACHADAS.md](plan-modular/KIT-FACHADAS.md).

- [Estudio de ampliación y ortofoto por teselas](ESTUDIO-AMPLIACION.md): Santa Ana, Puente VII
  Centenario, ferial y carga de la ortofoto alrededor del jugador; preliminar.
- [Plan de ampliación y ortofoto por teselas](PLAN-AMPLIACION.md): relieve anclado al
  origen, límites con rectángulos, teselas, anexos y modelos; publicado en `v1.3.0`. Se
  conserva como registro.
- [Plan de mejora gráfica y presupuesto de render](PLAN-MEJORA-GRAFICA.md): medición de
  llamadas y triángulos, agrupación de fachadas, luz, modo ligero, suelo cercano y árboles
  sobre la ortofoto; terminado y publicado en `v1.4.0`. Se conserva como registro.
- [Plan de motor WebGPU, eficiencia y gráficos](PLAN-MOTOR-GRAFICOS.md): three.js 0.186.1
  con WebGPU, shaders sin tirones, pase de sombras, llamadas, cielo, luz y color; E0, E1,
  E2, V1 y VL publicadas en `v1.5.0`; lo pendiente pasa al plan siguiente.
- [Plan de río, ventanas, árboles y horas del día](PLAN-VISUAL.md): agua del Iro,
  cristales y persianas, bajos según su uso, viento y contraluz en los árboles, horas del
  día; publicado en `v1.6.0` salvo F5.
- [Plan de implementación del relieve](PLAN-TERRENO.md): datos del MDT, malla, edificios,
  puentes, actores y validación por fases.
- [Superficies transitables del relieve](SUPERFICIES_TERRENO.md): contrato generalizable,
  perfiles de autor y niveles superior/inferior.
- [Relieve: implementación, validación y reproducción](TERRENO_PILOTO.md): historia del
  piloto, auditoría, validación del 8/10/2026 y pendientes.
