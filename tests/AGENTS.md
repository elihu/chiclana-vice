# Verificadores

- `runtime-harness.mjs` es el entorno común de DOM y WebGL simulados para pruebas
  y exportadores. Genera el módulo instrumentado en `/tmp` y lo elimina al terminar.
- No copiar el setup ni extraer fragmentos de otro verificador. Los ganchos deben
  coincidir exactamente una vez y fallar con un mensaje claro en caso contrario.
- Comprobar relaciones y comportamiento, no totales de la instantánea. Usar los
  datos compartidos de `web/game-data.js` para las capacidades planificadas.
- La huella geográfica fija permite detectar cambios aunque se recalculen los
  checksums. No actualizarla para ocultar una regresión; revisar su alcance primero.
- Estas pruebas no acreditan render en GPU, rendimiento ni móvil físico.
