# Pruebas de lógica pura de RAIZIA

Ejecutar `npm test` con Node 26. En PowerShell con scripts deshabilitados, usar
`npm.cmd test`; también funciona `npm test` desde CMD. No se necesitan dependencias
adicionales. El comando ejecuta únicamente `tests/*.test.mjs` y termina sin iniciar
servidores, compilar Next.js ni cargar archivos de entorno.

Se prueban directamente los módulos TypeScript originales. El registro de
`support/register.mjs` resuelve imports sin extensión y el alias `@/` únicamente
dentro de `src/`. Intercepta `db.ts` antes de evaluarlo y bloquea `node:sqlite`.
El módulo simulado lanza un error ante cualquier consulta; las pruebas de búsqueda
también comprueban que el contador de accesos permanezca en cero.

Archivos:

- `triage.test.mjs`: rutas ordenadas, pasos condicionales, dudas y compatibilidad.
- `fixtures/relatos.mjs`: 36 relatos con expectativas explícitas, incluidas las regresiones solicitadas.
- `tools-config.test.mjs`: catálogo, campos obligatorios, correo, contactos y sugerencias.
- `search.test.mjs`: normalización, términos y extractos, sin consultas a datos.
- `ingest.test.mjs`: artículos, sentencias, tamaño, conservación de texto y espacios.
- `support/register.mjs` y `support/db-stub.mjs`: ejecución nativa y aislamiento de datos.

Resultado verificado: **150 pruebas; 139 aprobadas, 0 fallidas, 0 omitidas y
11 pendientes (`TODO`); salida 0**. Los pendientes tienen una aserción ejecutable
del comportamiento deseado y un comentario con la causa. Node muestra sus
diagnósticos como `TODO`, sin contarlos como fallos de la batería. Tras corregir
un defecto en una tarea posterior, retirar `.todo` de su prueba.

## Defectos reproducidos, por prioridad

P1 identifica pérdida de información o de una ruta urgente; P2 identifica
clasificación u orientación incorrectas y validación insuficiente. No se evalúa
la vigencia jurídica de los textos.

| Prioridad | Ubicación | Reproducción y resultado actual | Cambio mínimo sugerido |
| --- | --- | --- | --- |
| P1 | `src/lib/ingest.ts:136` | `ARTÍCULO 1°. Objeto.` y `ARTÍCULO 2. Vigencia.` producen `[]`; también desaparece una cola de menos de 40 caracteres tras 1200 caracteres. Dos pendientes. | Conservar fragmentos cortos con encabezado propio; unir las colas al fragmento compatible anterior, respetando el tamaño. |
| P1 | `src/lib/triage.ts:196` | `La EPS\nno me autoriza\nla cirugía de mi hija` produce `[]` en vez de `['tutela']`. | Colapsar espacios y saltos de línea antes de aplicar las reglas. |
| P2 | `src/lib/triage.ts:191` y `:80` | `me amenazaron pero no me pegaron y no hubo insultos` añade `denuncia`; al negar además participación policial, `buildRoute` incluye los tres pasos negados. Dos pendientes. | Excluir hechos expresamente negados tanto de las puntuaciones como de los pasos, conservando las demás señales de riesgo. |
| P2 | `src/lib/triage.ts:191` | `mi abuelo tuvo un golpe de calor trabajando al sol` produce `['denuncia']`. | Excluir la expresión médica «golpe de calor» de la señal de agresión. |
| P2 | `src/lib/triage.ts:178` | `la EPS no me autoriza la cirugia y tengo mucho dolor` añade `popular` por la subcadena «olor». | Delimitar la palabra «olor» y sus plurales. |
| P2 | `src/lib/triage.ts:161` | `la obra de teatro de la comunidad quedo bonita` produce `['consulta-previa']`. | Excluir «obra de teatro» como señal de proyecto territorial. |
| P2 | `src/lib/triage.ts:208` | `nos pegaron y no cumple la resolucion tampoco nos responden` omite `peticion`. | Admitir «tampoco» como negación de respuesta. |
| P2 | `src/lib/tools-config.ts:766` | `derechos: [' ', '']` satisface un campo obligatorio de tutela. | Comprobar que exista al menos una opción no vacía después de recortar espacios. |
| P2 | `src/lib/ingest.ts:179` | Un párrafo de 150 caracteres seguido de uno de 2400 genera un fragmento de **1351** caracteres. | Vaciar el búfer antes de superar `MAX` aunque todavía no alcance `MIN`, preservando su contenido corto. |

Los controles «matrícula», «robusto», «violín» y «pegamento» no activan rutas:
quedan como pruebas aprobadas. «Abuso de confianza del vecino» activa denuncia,
pero no añade pasos de lesiones, policía o discriminación; no se reporta como
falso positivo porque el relato sí plantea un posible abuso de confianza.

No se modificaron las fuentes de la aplicación ni `package-lock.json`; el único
cambio fuera de `tests/` es el script `test` en `package.json`.
