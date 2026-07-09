# Corpus Damana

Aplicación local de estudio del damana (dʉmʉna), lengua del pueblo Wiwa
(Sierra Nevada de Santa Marta, Colombia): concordancias, diccionario de
frecuencias, flashcards con repetición espaciada y traductor asistido
por IA apoyado en el corpus.

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
necesita un motor de IA. Hay dos opciones (si ambas están configuradas,
gana Claude):

### Opción A — Gratis y local con Ollama

Sin cuentas ni pagos: el modelo corre en tu propio computador
(recomendado ≥16 GB de RAM para un modelo 7B).

1. Instala [Ollama](https://ollama.com) (`winget install Ollama.Ollama`).
2. Descarga un modelo: `ollama pull qwen2.5:7b` (~4.7 GB).
3. Define las variables y reinicia el backend **en una terminal nueva**:

   ```powershell
   setx TRADUCTOR_BASE_URL "http://localhost:11434/v1"
   setx TRADUCTOR_MODELO "qwen2.5:7b"
   setx TRADUCTOR_TIMEOUT_MS "300000"   # los modelos locales son lentos
   ```

Sirve igual **cualquier API compatible con OpenAI** — Google Gemini
(clave gratis sin tarjeta en https://aistudio.google.com), Groq, el
router de Hugging Face… — apuntando `TRADUCTOR_BASE_URL` a su endpoint
y definiendo además `TRADUCTOR_API_KEY`. Ejemplo con Gemini:

```powershell
setx TRADUCTOR_BASE_URL "https://generativelanguage.googleapis.com/v1beta/openai"
setx TRADUCTOR_MODELO "gemini-2.0-flash"
setx TRADUCTOR_API_KEY "AIza..."
```

### Opción B — Claude (mejor calidad, de pago)

> ⚠️ La suscripción de Claude (claude.ai / la app) **no incluye** acceso
> a la API: son productos con facturación separada.

1. Entra en **https://console.anthropic.com** (sirve tu Gmail con
   «Continuar con Google»).
2. En **Billing** añade crédito (mínimo US$5 ≈ 500 traducciones; cada
   una cuesta ~US$0.01 con `claude-sonnet-4-6`).
3. En **API Keys → Create Key** copia la clave (`sk-ant-...`, se muestra
   una sola vez) y defínela:

   ```powershell
   setx ANTHROPIC_API_KEY "sk-ant-..."
   # OJO: setx no afecta la terminal abierta; abre una NUEVA terminal.
   ```

En ambos casos: arranca el backend (`npm start`) desde una terminal
nueva y abre la vista Traductor. Si no hay motor configurado, la propia
vista lo explica y el resto de la app sigue funcionando.

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
