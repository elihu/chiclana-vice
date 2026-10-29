# Documentación

Los comandos se ejecutan desde la raíz del repositorio. Cada afirmación vive en un solo
documento; los demás enlazan a él.

## Trabajar

- [Desarrollo, estructura y convenciones](DESARROLLO.md): ejecutar, comprobar, módulos,
  modo ligero y herramientas de medición.
- [Flujo de Git](GIT_WORKFLOW.md): ramas, agentes, revisión, integración, commits y versiones.
- [Publicación y CI](PUBLICACION.md): GitHub Actions, Pages y ajustes del repositorio.
- [Reproducir los datos](DATOS.md): conversores y orden de los pasos.

## Referencia

- [Fuentes del mapa y aproximaciones](MAP_SOURCES.md).
- [Las 15 correcciones del piloto de alturas](ALTURAS_PILOTO.md).
- [Kit de fachadas y correcciones](KIT-FACHADAS.md): recetas, expresiones, compositor y
  anclajes. Los esquemas para el editor están en [`schemas/`](../schemas/).
- [Superficies transitables del relieve](SUPERFICIES_TERRENO.md): contrato, perfiles de
  autor y niveles superior e inferior.
- [Relieve: implementación, validación y reproducción](TERRENO_PILOTO.md): auditoría,
  validación del 8/10/2026 y pendientes.
- [Licencias, atribuciones y retirada](../THIRD_PARTY_NOTICES.md): única fuente legal.

## Estado

- [Estado actual y pendientes](ESTADO.md).
- [Plan de río, ventanas, árboles y horas del día](PLAN-VISUAL.md): F1–F4 publicadas en
  `v1.6.0`; mantiene pendientes gráficos y remite F5 al plan de suelo.
- [Plan de suelo de cerca, aceras, juntas y puentes](PLAN-SUELO.md): tandas integradas y
  revisiones pendientes de suelo y puentes.
- [Interfaz: diseño, revisión y pendientes](PROPUESTA-UI.md): alcance aceptado para
  `v2.0.0`, límites de verificación y mejoras opcionales.
- [Revisión del mundo tras v2.0.0](REVISION-MUNDO.md): agua, arbolado, pavimentos,
  rotondas, pasos inferiores y peatones; integrada sin publicar el 29/10/2026.

## Histórico

Estos documentos conservan decisiones y resultados de ejecución. Los pendientes vigentes
se consultan en [ESTADO.md](ESTADO.md), aunque enlacen a un plan archivado.

- [Convenciones](historico/PROPUESTA-CONVENCIONES.md): propuesta de agentes, documentación, Git y CI ya aplicada.
- [Modularización](historico/PLAN-MODULAR.md): fases 0–3 ejecutadas; inventarios y ejemplos en [sus anexos](historico/plan-modular/).
- [Estudio de ampliación](historico/ESTUDIO-AMPLIACION.md): estudio preliminar de Santa Ana, norte y ortofoto por teselas.
- [Ampliación](historico/PLAN-AMPLIACION.md): fases 0–5 publicadas en `v1.3.0`.
- [Mejora gráfica](historico/PLAN-MEJORA-GRAFICA.md): presupuesto de render, agrupación, luz, suelo y árboles de `v1.4.0`.
- [Motor y gráficos](historico/PLAN-MOTOR-GRAFICOS.md): WebGPU, shaders, sombras y luz de `v1.5.0`; pendientes derivados al plan visual.
- [Terreno](historico/PLAN-TERRENO.md): plan original del MDT y la integración del relieve.
- [Rendimiento y mantenimiento](historico/PLAN-REFACTOR.md): fases R0–R5; arranque medido, índices, módulos, validadores y documentación.
- [Resultado de R4](historico/RESULTADO-R4.md): medidas de CPU y motivos para no activar los avisos de complejidad.
