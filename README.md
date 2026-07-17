# Corpus Damana

Aplicación de estudio del damana (dʉmʉna), lengua del pueblo Wiwa
(Sierra Nevada de Santa Marta, Colombia): concordancias, diccionario de
frecuencias, flashcards con repetición espaciada y traductor asistido
por IA apoyado en el corpus.

> **🌍 En producción: https://corpus-damana.onrender.com** (Render, plan
> gratuito — tras ~15 min sin visitas el servicio se duerme y la primera
> petición tarda ~30-60 s en despertarlo). Motor de traducción actual:
> **Groq** (`llama-3.3-70b-versatile`). Ver [Despliegue](#despliegue-render)
> y, sobre todo, [Actualizar el corpus](#actualizar-el-corpus-agregar-palabrasoraciones).

## Requisitos

- Node.js 22 o superior (probado con Node 24)
- Windows, macOS o Linux

## Puesta en marcha

```bash
npm install          # instala backend y frontend (workspaces)
npm run importar     # crea datos/corpus.db desde los CSV de /datos
npm run build        # compila el frontend hacia backend/public
npm start            # backend en modo desarrollo (sirve también la web)
```

Abrir **http://localhost:3000** — ahí están las cuatro vistas (Buscar,
Diccionario, Flashcards, Traductor) y la documentación de la API en
`/api/docs`.

Para desarrollo del frontend con recarga automática: `npm run front`
(Angular en http://localhost:4200 con proxy hacia el backend en :3000).

Para producción: `npm run build` y luego `npm run start:prod`.

## Configurar el traductor

Las tres primeras vistas funcionan sin configuración. El **Traductor**
necesita un motor de IA, elegido por variables de entorno.

### Motor actual: Groq (gratis, ~2 s por traducción)

Es la configuración vigente **tanto en local como en Render** desde
julio 2026 (reemplazó al Ollama local, que tardaba ~29 s por traducción
con qwen2.5:7b). Clave gratis sin tarjeta en https://console.groq.com
(API Keys → Create):

```powershell
setx TRADUCTOR_BASE_URL "https://api.groq.com/openai/v1"
setx TRADUCTOR_MODELO "llama-3.3-70b-versatile"
setx TRADUCTOR_API_KEY "gsk_..."
# OJO: setx no afecta la terminal abierta; abre una NUEVA terminal.
```

### Alternativas (mismo mecanismo, otras variables)

- **Cualquier API compatible con OpenAI**: Google Gemini
  (https://aistudio.google.com, gratis sin tarjeta,
  `TRADUCTOR_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`,
  `TRADUCTOR_MODELO=gemini-2.0-flash`), el router de Hugging Face, etc.
- **Ollama local** (sin internet, lento): `ollama pull qwen2.5:7b`,
  `TRADUCTOR_BASE_URL=http://localhost:11434/v1`,
  `TRADUCTOR_MODELO=qwen2.5:7b`, `TRADUCTOR_TIMEOUT_MS=300000`.
- **Claude por API** (mejor calidad, de pago — la suscripción de
  claude.ai NO incluye API): crédito en https://console.anthropic.com
  y `ANTHROPIC_API_KEY=sk-ant-...`. Si está definida, **tiene prioridad**
  sobre las variables TRADUCTOR_*.

Sin motor configurado, la vista Traductor lo explica y el resto de la
app sigue funcionando.

## Despliegue (Render)

El repo incluye [`render.yaml`](render.yaml): un *blueprint* del plan
gratuito de Render que construye y publica todo automáticamente en
**https://corpus-damana.onrender.com**.

- **Cada `git push` a `main` redespliega solo** (build ~5-10 min):
  `npm ci` en la raíz → `npm run build` (Angular → `backend/public` +
  Nest) → `npm run importar` (regenera `datos/corpus.db` desde los CSV)
  → `npm run start:prod`.
- La única variable secreta es `TRADUCTOR_API_KEY` (se configura en el
  dashboard de Render, nunca en el repo). Las demás (`TRADUCTOR_BASE_URL`,
  `TRADUCTOR_MODELO`, `NODE_VERSION`) viven en el `render.yaml`.
- Lecciones aprendidas del primer despliegue (no repetir): Render
  necesita `NODE_VERSION >= 24.15.0` (la CLI de Angular rechaza
  versiones menores), y al ser un monorepo con **npm workspaces**
  (un solo `package-lock.json` en la raíz) todo se instala y construye
  **desde la raíz** — instalar por subcarpetas deja `node_modules`
  donde el runtime no los encuentra.

Para una demo puntual desde el propio PC sin Render:
`npm run start:prod` (o con `PORT=3001` si el 3000 está ocupado) +
`cloudflared tunnel --url http://localhost:3000`.

## Actualizar el corpus (agregar palabras/oraciones)

**Este es el flujo de trabajo habitual.** Los archivos fuente son los
CSV de [`datos/`](datos/) (UTF-8 con BOM; estructura de columnas en
[CLAUDE.md](CLAUDE.md)) — `corpus.db` nunca se edita a mano, es
regenerable y está fuera de git.

1. Editar el CSV que corresponda: `corpus_vocabulario_v2.csv` (palabras
   sueltas), `corpus_oraciones.csv` (pares oración a oración, con
   columna `estado`), `corpus_frases_v2.csv` o
   `corpus_conjugaciones.csv`.
2. Regenerar la base y probar en local:
   ```bash
   npm run importar
   npm start        # revisar en http://localhost:3000 que lo nuevo aparezca
   ```
3. Publicar:
   ```bash
   git add datos/
   git commit -m "Corpus: <qué se agregó>"
   git push
   ```
   Render detecta el push, reconstruye y **regenera la base en el
   servidor con los CSV nuevos** — en ~10 min los cambios están en
   https://corpus-damana.onrender.com sin ningún paso manual extra.

Notas: el importador corrige ü→ʉ automáticamente en las columnas damana
y respeta ʉ y ñ como letras plenas (reglas completas en CLAUDE.md). La
tabla de progreso de flashcards (`progreso_srs`) sobrevive a las
reimportaciones locales; en Render no hay progreso persistente (el
filesystem es efímero y la base se regenera en cada deploy).

## Tests

```bash
npm test             # unitarios del backend (Jest)
npm run test:e2e     # e2e del backend (SQLite en memoria + supertest)
npm run test:front   # frontend (Vitest)
```

## Estructura

- `datos/` — CSV fuente del corpus (UTF-8 con BOM) y `corpus.db`
  (regenerable, fuera de git)
- `backend/` — NestJS 11: importador, API de consulta, SRS y traductor
- `frontend/` — Angular (standalone + señales); su build sale a
  `backend/public`

Más contexto y reglas del dominio (ʉ, ñ, normalización) en
[CLAUDE.md](CLAUDE.md).
