# RAIZIA

**Nuestras raíces, nuestros derechos.**
Plataforma inteligente de orientación jurídica y protección de derechos colectivos.

Prototipo académico independiente, desarrollado en el marco de ALUNA IA (Universidad del Magdalena). Funciona por completo en el equipo: base de datos SQLite, búsqueda FTS5 e inteligencia artificial local con Ollama.

## Cómo iniciarla (Windows)

1. Doble clic en **`iniciar-raizia.bat`**.
2. Se abre `http://localhost:3000` en el navegador.

La primera vez instala dependencias y compila (uno o dos minutos).

| Comando | Para qué |
| --- | --- |
| `iniciar-raizia.bat` | Uso normal |
| `iniciar-raizia.bat reconstruir` | Después de cambiar código, textos o marca |
| `iniciar-raizia.bat dev` | Desarrollo, con recarga al editar |
| `npm run importar` | Descarga la colección inicial de fuentes oficiales (con la app abierta) |
| `node scripts/importar-normas.mjs` | Descarga una sola vez y guarda como archivos las 85 fuentes oficiales (Constitución, códigos, leyes, decretos y decretos únicos; listas en `src/lib/seed.ts` y `src/lib/seed-normas.ts`), con la app cerrada |
| `node scripts/importar-vigia.mjs` | Carga, ya aprobadas, las sentencias descargadas por `../vigia-sentencias` (con la app cerrada; hace respaldo de la base y omite las que ya estén) |
| `compartir-raizia.bat` | Enlace público temporal para mostrarla a otras personas (requiere `cloudflared`) |
| `npm test` | 150 pruebas automáticas del orientador, las herramientas, la búsqueda y la fragmentación (`tests/`) |

El enlace temporal funciona solo mientras este equipo esté encendido y la ventana abierta. Publicarla de forma permanente (Vercel u otro servicio) exige cambiar la base de datos local y el modelo local por servicios alojados.

Requisitos: Node.js 22 o superior. Para las respuestas con IA: [Ollama](https://ollama.com) y un modelo (`ollama pull qwen3.5:4b`). Sin Ollama, RAIZIA sigue funcionando en modo de búsqueda documental y lo indica en pantalla.

## Configuración (`.env.local`)

```
ADMIN_PASSWORD=...        contraseña de la sección Administración (cámbiala)
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:4b   si no está instalado, se usa otro modelo disponible
```

## Secciones

- **Inicio** — presentación y buscador.
- **Asistente jurídico** (`/asistente`) — pregunta primero la comunidad o grupo étnico (voluntario, se guarda solo en el navegador), conversa y responde con citas de los documentos aprobados.
- **Biblioteca** (`/biblioteca`) — documentos por temática, tipo, entidad y contenido.
- **Herramientas** (`/herramientas`) — un orientador («¿No sabes cuál necesitas?») y ocho entrevistas guiadas que generan borradores en Word: derecho de petición, solicitud sobre consulta previa, reclamación previa, solicitud de acompañamiento, tutela, acción popular, acción de cumplimiento y ficha para acción de grupo. Cada entrevista pregunta primero qué pasó, hace preguntas de seguimiento, redacta el relato con la IA local (la persona lo confirma), sugiere la entidad y avisa si ese documento no es el camino correcto. También puede usarse como formulario.
- **Administración** (`/admin`) — carga de PDF/DOCX, importación desde direcciones oficiales, clasificación, revisión y aprobación, categorías.

Solo los documentos **aprobados** aparecen en la biblioteca y alimentan al asistente.

## Dónde cambiar cada cosa

| Qué | Dónde |
| --- | --- |
| Nombre, eslogan, textos de marca, preguntas sugeridas | `src/brand/brand.ts` |
| Colores, tipografías, radios, sombras | `src/app/globals.css` (bloque `@theme`) |
| Logotipo | `src/components/Logo.tsx` y `src/app/icon.svg` |
| Instrucciones del asistente | `src/lib/rag.ts` |
| Vocabulario cotidiano → jurídico de la búsqueda | `src/lib/search.ts` (`SYNONYMS`) |
| Formularios y textos de los documentos | `src/lib/tools-config.ts` y `src/lib/docgen.ts` |
| Orientador (rutas, señales y entidades sugeridas) | `src/lib/triage.ts` y `src/lib/tools-config.ts` (`ENTITY_GUIDE`) |
| Colección inicial de fuentes | `src/lib/seed.ts` |
| Dominios oficiales admitidos al importar | `src/lib/constants.ts` (`OFFICIAL_DOMAINS`) |

## Arquitectura

```
src/app          páginas y rutas API (Next.js, App Router)
src/components   interfaz (inicio, chat, biblioteca, herramientas, administración)
src/lib          db.ts (SQLite) · ingest.ts (extracción y fragmentos) · search.ts (FTS5)
                 rag.ts (Ollama) · documents.ts (repositorio) · fetcher.ts (importador)
                 docgen.ts (Word) · auth.ts (sesión de administración)
data/            base de datos y archivos originales (no se versiona)
```

La lógica de datos está aislada en `src/lib`, de modo que migrar a la nube implica sustituir `db.ts` (por PostgreSQL, por ejemplo), el almacenamiento de `data/files` y la URL del modelo, sin tocar las pantallas.

## Límites del prototipo

- Es orientación general: no reemplaza a un abogado, a la Defensoría del Pueblo ni a las autoridades propias.
- La colección inicial se verificó de forma automática (dirección oficial y encabezado); **falta la revisión jurídica humana**, incluida la vigencia de cada norma.
- El modelo local es pequeño: puede simplificar de más. Por eso cada respuesta muestra los apartados usados y el enlace oficial.
- La búsqueda es por palabras (FTS5) con un diccionario de equivalencias; no es búsqueda semántica.
- Los PDF escaneados necesitan reconocimiento de texto (OCR) antes de cargarse.
- SUIN-Juriscol y el sitio del Ministerio del Interior no permiten la descarga automática simple; sus documentos pueden cargarse manualmente como PDF.
- El acceso de administración es una contraseña local, pensada para un solo equipo.
