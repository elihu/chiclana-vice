# Estructura y convenciones

| Ruta          | Contenido                                                       |
| ------------- | --------------------------------------------------------------- |
| web/          | Fuentes estáticas editables y recursos que se publican en Pages |
| web/arcade/   | Versión arcade independiente                                    |
| web/vendor/   | Dependencias de terceros y sus licencias; sin reformatear       |
| web/licenses/ | Licencias completas de los datos                                |
| tools/        | Conversores y exportadores locales                              |
| tests/        | Verificadores CPU de datos y flujos                             |
| docs/         | Guías, fuentes y estado del proyecto                            |
| source-data/  | Catálogo y auditoría usados por los conversores                 |
| extras/       | Reconstrucción opcional desde originales externos               |

README.md presenta el proyecto, AGENTS.md guía el trabajo y LICENSE contiene
MIT estándar. THIRD_PARTY_NOTICES.md es la fuente de los avisos de terceros.

No hay compilación ni directorio dist/: web/ es código fuente, no salida generada.
Separar módulos ES nuevos por responsabilidad cuando el cambio lo requiera;
no dividir el motor entero como parte de una tarea de formato.

Archivos de código nuevos: kebab-case; JavaScript de navegador .js, herramientas
Node .mjs, Python .py. Guías: nombres descriptivos en mayúsculas con guiones bajos,
como las existentes. JavaScript usa camelCase para variables/funciones y PascalCase
para clases. Prettier fija dos espacios, comillas simples y punto y coma.
Python usa cuatro espacios y se ejecuta mediante uv. EditorConfig fija UTF-8 y LF.

Copias intencionadas: LICENSE y THIRD_PARTY_NOTICES.md se copian a web/ con
`node tools/export-provenance.mjs`; el catálogo de source-data/ se publica como
web/frontages.json. Editar los originales, regenerar y verificar; no mantener
manual ni independientemente esas copias. Los hashes de datos no cambian por
formatear JavaScript.

ESLint y Prettier se ejecutan junto a los verificadores antes de desplegar.
No sustituye pruebas de navegador o móvil.
