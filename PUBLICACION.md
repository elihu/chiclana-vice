# Publicación gratuita con GitHub Pages

Repositorio público personal: https://github.com/elihu/chiclana-vice
Remoto origin: https://github.com/elihu/chiclana-vice.git
GitHub Pages configurado con GitHub Actions: https://elihu.github.io/chiclana-vice/
Configuración realizada el 6/10/2026 en la cuenta personal elihu, fuera de organizaciones.
El workflow .github/workflows/pages.yml verifica capas y juego, publica únicamente
`dist/` al hacer push a `main` y permite ejecución manual desde main. Las ramas de
features no publican; integrarlas tras revisar y probar. Sin compilación/frameworks.

## Coste

Usar repositorio público, Pages y runner Ubuntu estándar. No hace falta comprar
un dominio: URL habitual https://USUARIO.github.io/chiclana-vice/.
Sin cachés, LFS ni runners grandes; artefacto pequeño retenido un día.
No se activa presupuesto ni servicio de pago. GitHub puede aplicar límites de
uso (sitio ≤1 GB, ancho de banda orientativo 100 GB/mes); no es alojamiento ilimitado.
La copia estática ocupa unos pocos MB. Si la cuenta tiene pagos activados para
otros usos, mantener gasto adicional de Actions bloqueado para este proyecto.

Referencias oficiales:
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

## Edición pública preparada

Código propio MIT, excluyendo derechos de terceros. Catastro: volúmenes de juego
transformados, sin ZIP/GML originales. Alturas recalculadas independientemente
con IGN / PNOA-LiDAR primera cobertura, CC BY 4.0; no usa alturas/auditorías REDIAM.
OSM: capa completa utilizada disponible bajo ODbL; créditos IGN, Catastro, OSM,
Three y referencias visibles. Fotos de referencia no empaquetadas ni usadas como
texturas; no se concede bajo MIT una licencia sobre fotografías ajenas.
Ver THIRD_PARTY_NOTICES.md y DATOS_PUBLICOS.md para alcances y límites.

El exportador crea una carpeta nueva mediante lista explícita. Excluye .git,
ZIP originales, configuración del sitio anterior, credenciales, capturas y
mediciones antiguas. No basta borrar un original y subir el historial viejo.
El Git local se conserva completo; el Git público empieza con un snapshot revisado.
No se reescribe ni destruye el historial local.

## Primer despliegue

GitHub CLI instalado y autenticado localmente. Repositorio creado desde esta
copia pública, con historial independiente; Pages usa build_type=workflow.
Para publicar cambios verificados, integrarlos en main y ejecutar:

```fish
git push origin main
```

Seguir el despliegue con `gh run list` o la pestaña Actions del repositorio.
No enviar tokens ni contraseñas al chat.

El progreso se guarda por navegador/origen; no hay cuentas, backend, analytics ni
multijugador. Tu amigo puede jugar su propia partida al abrir la URL.
