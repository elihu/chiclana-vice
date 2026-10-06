# Verificadores

- `runtime-harness.mjs` es el entorno común de DOM y WebGL simulados para pruebas
  y exportadores. No parchea el texto del juego: importa `web/js/app.js` y llama a
  `startGame()`, que devuelve la API de pruebas (`web/js/test-api.js`). Admite una sola
  ejecución del juego por proceso.
- No copiar el setup ni extraer fragmentos de otro verificador.
- `verify-modules.mjs` comprueba importmap, versión común, ausencia de ciclos y de
  efectos de nivel superior en los módulos de `web/js/`.
- Comprobar relaciones y comportamiento, no totales de la instantánea. Usar los
  datos compartidos de `web/game-data.js` para las capacidades planificadas.
- La huella geográfica fija permite detectar cambios aunque se recalculen los
  checksums. No actualizarla para ocultar una regresión; revisar su alcance primero.
- Estas pruebas no acreditan render en GPU, rendimiento ni móvil físico.
