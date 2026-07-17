# Corpus Damana App

Aplicación de estudio del damana (dʉmʉna), lengua del pueblo Wiwa
(Sierra Nevada de Santa Marta, Colombia). Usuario: desarrollador con
experiencia en TypeScript/Angular y backend.

## Estado del despliegue (jul 2026) — leer antes de tocar infra

- **EN PRODUCCIÓN: https://corpus-damana.onrender.com** — Render plan
  gratuito vía [`render.yaml`](render.yaml) (blueprint). Cada push a
  `main` redespliega automáticamente; el build regenera `corpus.db`
  desde los CSV (por eso agregar corpus = editar CSV + `npm run
  importar` para probar en local + push, nada más).
- **Motor de traducción vigente: Groq** `llama-3.3-70b-versatile`
  (~2 s/traducción). Ollama quedó abandonado como motor por lentitud
  (~29 s con qwen2.5:7b), aunque el soporte por variables sigue
  existiendo. La clave vive: en local como variable de usuario de
  Windows `TRADUCTOR_API_KEY`; en Render como secreto del servicio.
- Trampas ya sufridas en Render (no repetir): exige
  `NODE_VERSION >= 24.15.0` (la CLI de Angular rechaza menores) y,
  por ser monorepo con npm workspaces (lock único en la raíz), TODO
  se instala/construye desde la raíz — `npm ci` por subcarpeta deja
  `node_modules` donde el runtime no resuelve (`Cannot find module`).
- El filesystem de Render es efímero: `corpus.db` se regenera en cada
  deploy (bien: es solo-lectura en runtime) y `progreso_srs` NO
  persiste en producción (solo en local).
- `main.ts` acepta `PORT` (en local se usa 3001 cuando otro proyecto
  ocupa el 3000). Demo puntual sin Render:
  `cloudflared tunnel --url http://localhost:<puerto>`.

## Stack (todo TypeScript)
- Monorepo con npm workspaces: /backend y /frontend.
- Backend: NestJS 11, better-sqlite3 (acceso síncrono, sin ORM;
  capa de repositorios propia estilo puertos y adaptadores),
  csv-parse para importación, @nestjs/swagger para documentar.
- Frontend: Angular 18+ standalone components con señales.
- Producción: un solo proceso; NestJS sirve el build de Angular con
  @nestjs/serve-static. Sin autenticación: app local de un usuario.
- Tests: Jest en backend (unitarios + e2e con SQLite en memoria),
  Vitest en frontend.
- Traductor asistido: Claude vía @anthropic-ai/sdk (ANTHROPIC_API_KEY,
  prioridad) o cualquier API compatible OpenAI (TRADUCTOR_BASE_URL +
  TRADUCTOR_MODELO [+ TRADUCTOR_API_KEY]; p. ej. Ollama local).

## Datos — corpus v3 (carpeta /datos, encoding UTF-8 con BOM)
- corpus_oraciones.csv: id, damana, espanol, estado, fuente (~2.800
  pares oración a oración; estado = "aprobado" ~1.957 alta confianza
  o "revisar" ~843 alineación dudosa). Fuente principal.
- corpus_frases_v2.csv: fuente, damana, espanol, notas (~131 frases)
- corpus_vocabulario_v2.csv: espanol, damana, categoria, notas, fuente
  (~918 entradas; categoria: Verbos, Animales, Adverbios…)
- corpus_conjugaciones.csv: damana, espanol, lema, fuente, notas
  (~267 formas verbales de 23 lemas)

## Reglas del dominio (verificadas)
- ʉ (U+0289) es letra plena del alfabeto damana. Búsqueda, tokenización
  y orden la tratan como letra; ʉ ≠ u SIEMPRE.
- ñ también es letra plena (en damana: ñingui, kʉñingui; en español
  año ≠ ano); ñ ≠ n SIEMPRE.
- Normalizar con normalizar() de backend/src/comun/texto/normalizador.ts:
  minúsculas + NFD, recomponer n + U+0303 → ñ (preservarla) y después
  quitar las marcas combinantes U+0300–U+036F. Quita tildes (á→a), NO
  toca la ʉ (no se descompone en NFD) y NO degrada ñ→n. Ojo: quitar
  las marcas sin recomponer antes SÍ convertiría ñ→n (NFD descompone
  ñ en n + tilde combinante); la recomposición previa es obligatoria.
- Tokenizar damana con /[^\p{L}ʉ']+/u (separar por todo lo que no sea
  letra Unicode, ʉ o apóstrofe interno).
- El importador corrige ü/Ü → ʉ/Ʉ en las columnas damana (la ü no existe
  en damana; algunas fuentes Word la usan como apaño para ʉ). Ver
  corregirOrtografiaDamana() en backend/src/comun/texto/ortografia.ts.
  La u simple NUNCA se convierte (u y ʉ son letras distintas) y las
  comillas tipográficas «' '» se conservan (son puntuación de citas,
  no apóstrofes internos). Los CSV fuente no se modifican.
- Leer CSV con csv-parse: { columns: true, bom: true }.
- Las oraciones estado="revisar" participan en el retrieval del
  traductor con la mitad del puntaje (PESO_REVISAR = 0.5).

## Convenciones
- Cada servicio con tests; incluir siempre un caso con ʉ y uno con ñ.
- Commits pequeños por funcionalidad, mensajes en español.
- La base SQLite (datos/corpus.db) va en .gitignore; se regenera con
  el importador. La tabla progreso_srs sobrevive a reimportaciones y
  migraciones (nunca borrarla).
