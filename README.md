# Corpus Damana

Aplicación de estudio del damana (dʉmʉna), lengua del pueblo Wiwa
(Sierra Nevada de Santa Marta, Colombia): concordancias, diccionario de
frecuencias, flashcards con repetición espaciada, traductor asistido por
IA apoyado en el corpus y ciclo de pendientes con las hablantes nativas.

> **🌍 En producción: https://corpus-damana.onrender.com** (Render, plan
> gratuito — tras ~15 min sin visitas el servicio se duerme y la primera
> petición tarda ~30-60 s en despertarlo). Pide usuario y contraseña (un
> solo usuario). Motor de traducción actual: **Claude**
> (`claude-opus-5-5`, API de Anthropic; Groq queda de respaldo). Ver
> [Despliegue](#despliegue-render) y
> [Actualizar el corpus](#actualizar-el-corpus).

## Requisitos

- Node.js 22 o superior (probado con Node 24)
- Windows, macOS o Linux

## Puesta en marcha

```bash
npm install          # instala backend y frontend (workspaces)
npm run importar     # crea datos/corpus.db desde los CSV y Excel de /datos
npm run build        # compila el frontend hacia backend/public
npm start            # backend en modo desarrollo (sirve también la web)
```

Abrir **http://localhost:3000** — ahí están las vistas (Buscar,
Diccionario, Gramática, Flashcards, Traductor, Pendientes) y la
documentación de la API en `/api/docs`.

Para desarrollo del frontend con recarga automática: `npm run front`
(Angular en http://localhost:4200 con proxy hacia el backend en :3000).

Para producción: `npm run build` y luego `npm run start:prod`.

## Configurar el traductor

Las demás vistas funcionan sin configuración. El **Traductor** necesita
un motor de IA, elegido por variables de entorno.

### Motor actual: Claude (`claude-opus-5-5`, API de Anthropic)

Es la configuración vigente **tanto en local como en Render**. La clave
se crea en https://console.anthropic.com (API Keys; la de este proyecto
se llama «corpus-damana») y se paga con los créditos API mensuales que
incluye el plan Max de claude.ai (se renuevan cada mes y no se acumulan):

```powershell
setx ANTHROPIC_API_KEY "sk-ant-..."
# OJO: setx no afecta la terminal abierta; abre una NUEVA terminal.
```

Si está definida **tiene prioridad** sobre las variables TRADUCTOR_*.
Tarda entre 5 y 15 s por traducción. Modelo por defecto `claude-opus-5-5`;
se cambia con `ANTHROPIC_MODELO`. Opcional: `ANTHROPIC_ESFUERZO` (low,
medium, high, xhigh o max) regula cuánto razona el modelo; si falta se usa
el valor de la API. A Claude no se le fija temperatura (el modelo la
rechaza). El prompt de sistema queda en la caché de Anthropic 5 minutos,
así que traducir en racha sale más barato. Cada traducción deja en el log
del backend y en la tabla `traducciones` los tokens usados y lo que tardó.

### Respaldo: Groq (gratis, ~2 s por traducción)

Sigue configurado en Render y en el servidor propio: el backend lo usa
solo si falta `ANTHROPIC_API_KEY`. Clave gratis sin tarjeta en
https://console.groq.com (API Keys → Create):

```powershell
setx TRADUCTOR_BASE_URL "https://api.groq.com/openai/v1"
setx TRADUCTOR_MODELO "openai/gpt-oss-120b"
setx TRADUCTOR_API_KEY "gsk_..."
```

`TRADUCTOR_TEMPERATURA` (0.2 por defecto) fija la temperatura: baja para
que la misma frase dé la misma traducción. El plan gratuito devuelve 429
a la cuarta traducción por minuto; el backend espera lo que pida
`Retry-After` y reintenta dos veces.

### Alternativas (mismo mecanismo, otras variables)

- **Cualquier API compatible con OpenAI**: Google Gemini, el router de
  Hugging Face, Ollama local (`TRADUCTOR_BASE_URL=http://localhost:11434/v1`,
  `TRADUCTOR_MODELO=qwen2.5:7b`, `TRADUCTOR_TIMEOUT_MS=300000`; lento).

Sin motor configurado, la vista Traductor lo explica y el resto de la
app sigue funcionando.

## Cómo traduce

El objetivo es un traductor de **propósito general**: el corpus bíblico
sigue siendo la fuente de gramática y morfología, pero los ejemplos
cotidianos (frases de reuniones, elicitación con hablantes) mandan.
Para cada frase el backend arma el prompt en este orden:

1. **Diccionario de esta frase**: cada palabra se busca en el vocabulario
   (exacta → sin tildes → sinónimo coloquial como mamá→madre → singular
   → prefijo de 5 letras, marcado «posible»), con todas sus acepciones; más los nombres propios con la
   grafía de la tabla.
2. **Reglas gramaticales aplicables**: se detectan rasgos de la frase
   (plural, posesivo, negación, pregunta, pasado, futuro) y se incluyen
   las reglas de `reglas_damana.xlsx` que los cubren.
3. **Ejemplos por similitud** repartidos por dominio: hasta 6 cotidianos,
   4 de gramática (conjugaciones) y 4 bíblicos (2 si ya hay cotidianos
   suficientes), nunca más de 14 ni casi repetidos.

El modelo responde JSON con la traducción, la **glosa palabra por
palabra**, las **palabras sin equivalente** (van entre corchetes y se
anotan en Pendientes), las reglas aplicadas, una confianza y una
explicación. La vista muestra todo eso y permite marcar **«esta
traducción es correcta»** o **corregirla**: los pares validados se
acumulan en la tabla `validadas`.

Si la frase trae un rasgo gramatical para el que el corpus todavía no
tiene regla (hoy solo hay reglas de plural y posesivo; faltan negación,
pregunta, pasado y futuro), el prompt lo dice tal cual en vez de callar
y, para la negación, remite a las formas negativas del diccionario («No
quiero → Nandunun»). Las reglas que faltan las confirman las hablantes
con el lote 2 de gramática; no se inventan.

### Pendientes: cerrar el bucle con las hablantes

La vista **Pendientes** lista las palabras que el traductor no pudo
resolver (ordenadas por las veces que se pidieron) y las filas de
elicitación que volvieron sin llenar. El botón **Exportar lote**
descarga `formato_elicitacion_pendientes_<fecha>.xlsx` con las columnas
del formato de elicitación y las celdas por llenar en amarillo. Cuando el
archivo vuelve lleno:

```bash
# dejarlo en datos/ con nombre formato_elicitacion_<lo que sea>.xlsx
npm run importar      # lo absorbe: vocabulario + oraciones cotidianas
```

### Dudas para las hablantes

```bash
npm run dudas         # no corrige nada: escribe datos/dudas_para_hablantes_<fecha>.xlsx
```

Junta en un Excel lo que no está claro en los datos, una hoja por tipo de
pregunta y las respuestas en las casillas amarillas: palabras escritas de
varias maneras, palabras con varias traducciones, formas con varios
significados, entradas confusas y terminaciones que se repiten. La primera
hoja la puede llenar cualquier hablante; las demás son para quien revisa.
El mismo comando crea, si no existe, `formato_elicitacion_lote2_gramatica.xlsx`:
oraciones mínimas para sacar las reglas de la gramática.

### Evaluación medible

```bash
npm run evaluar       # traduce datos/pruebas_traduccion.csv y escribe
                      # evaluaciones/<fecha>_<modelo>.{json,md}
```

Reporta por ámbito la coincidencia exacta, el chrF (implementación
propia sobre n-gramas de caracteres) y el % de palabras sin equivalente.
Las pruebas las reserva el importador: 1 de cada 10 filas de elicitación
con ejemplo completo, elegida por un hash estable del id, no entra al
retrieval. También se pueden añadir filas a mano (`espanol,
damana_esperado, ambito`); nunca se borran.

```bash
npm run pruebas:desde-validadas   # añade al CSV los pares validados en el
                                  # Traductor (tabla validadas), ámbito «validadas»
```

Es idempotente: no repite pares ni borra pruebas existentes.

## Despliegue (Render)

El repo incluye [`render.yaml`](render.yaml): un *blueprint* del plan
gratuito de Render que construye y publica todo automáticamente en
**https://corpus-damana.onrender.com**.

- **Cada `git push` a `main` redespliega solo** (build ~5-10 min):
  `npm ci` en la raíz → `npm run build` (Angular → `backend/public` +
  Nest) → `npm run importar` (regenera `datos/corpus.db`) →
  `npm run start:prod`.
- Los secretos (`TRADUCTOR_API_KEY`, `AUTH_USUARIO`, `AUTH_PASSWORD`) se
  configuran en el dashboard de Render, nunca en el repo. Las demás (`TRADUCTOR_BASE_URL`,
  `TRADUCTOR_MODELO`, `NODE_VERSION`) viven en el `render.yaml`.
- Acceso con usuario único: sin `AUTH_USUARIO` y `AUTH_PASSWORD` el servicio
  no arranca en producción, a propósito. `AUTH_JWT_SECRET` lo genera Render.
- Lecciones aprendidas (no repetir): Render necesita
  `NODE_VERSION >= 24.15.0`, y al ser un monorepo con **npm workspaces**
  todo se instala y construye **desde la raíz**. No poner
  `NODE_ENV=production` (dejaría fuera las devDependencies del build).
- El filesystem es efímero: lo que se escribe en runtime (progreso de
  flashcards, traducciones, pendientes, validadas) no persiste entre
  deploys en Render; en local sí.

Para una demo puntual desde el propio PC sin Render:
`npm run start:prod` (o con `PORT=3001` si el 3000 está ocupado) +
`cloudflared tunnel --url http://localhost:3000`.

## Despliegue en servidor propio (Kamal 2)

En producción desde el 21 oct 2026 en el VPS propio (netcup,
`159.195.235.225`), detrás de kamal-proxy junto a las otras apps:
**https://damana.crearcodecesar.com**. Render sigue vivo hasta que esta
versión lleve una semana estable; los dos sirven el mismo `main`.

- **Cómo se despliega:** cada push a `main` corre
  [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): pruebas
  (Jest, API, Vitest), construcción de la imagen con el corpus horneado
  dentro (`npm run importar` en el [`Dockerfile`](Dockerfile)) y
  `kamal deploy`. La imagen se publica en GHCR como
  `ghcr.io/juancarlosguti/corpus-damana`.
- **Lo que necesita (hecho el 21 oct 2026):** en Cloudflare, registro A `damana` →
  `159.195.235.225` con proxy apagado (nube gris); con la nube naranja
  Let's Encrypt no puede emitir el certificado. Y en GitHub → Settings →
  Secrets and variables → Actions: `SSH_PRIVATE_KEY`, `SERVER_IP`,
  `ANTHROPIC_API_KEY` (si faltara, el servidor propio traduce con Groq),
  `TRADUCTOR_API_KEY`, `AUTH_USUARIO`,
  `AUTH_PASSWORD`, `AUTH_JWT_SECRET`. `KAMAL_REGISTRY_PASSWORD` no se
  crea: es el `GITHUB_TOKEN`.
- **Verificar:** `curl -sI https://damana.crearcodecesar.com/` → 200 con
  `Strict-Transport-Security`, y
  `curl -s https://damana.crearcodecesar.com/api/salud` → `{"estado":"ok"}`
  (503 si la imagen salió sin corpus).
- **Lo que no persiste:** la base va dentro de la imagen. Lo que la app
  escribe (pendientes, validadas, traducciones, progreso de flashcards) se
  pierde en cada deploy, igual que en Render. El siguiente paso es un
  volumen de Kamal con una base de estado aparte.
- **Probar la imagen en local:** `docker build -t corpus-damana .` y luego
  `docker run --rm -p 3000:3000 -e NODE_ENV=production -e AUTH_USUARIO=… -e AUTH_PASSWORD=… -e AUTH_JWT_SECRET=… -e ANTHROPIC_API_KEY=… -e TRADUCTOR_API_KEY=… corpus-damana`.

## Actualizar el corpus

**Este es el flujo de trabajo habitual.** Los archivos fuente viven en
[`datos/`](datos/) (CSV en UTF-8 con BOM; estructura de columnas en
[CLAUDE.md](CLAUDE.md)) — `corpus.db` nunca se edita a mano, es
regenerable y está fuera de git.

1. Editar el archivo que corresponda: `corpus_vocabulario_v3.csv`
   (palabras sueltas), `corpus_oraciones.csv` (pares oración a oración,
   con columna `estado`), `corpus_frases_v2.csv`,
   `corpus_conjugaciones.csv`, `reglas_damana.xlsx` (reglas y nombres
   propios) o dejar un nuevo `formato_elicitacion_*.xlsx` lleno.
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
   servidor** — en ~10 min los cambios están en producción.

Notas: el importador corrige ü→ʉ automáticamente en las columnas damana
(y «u+»→ʉ en los Excel de elicitación, protegiendo palabras españolas
como pingüino) y respeta ʉ y ñ como letras plenas (reglas completas en
CLAUDE.md).

## Tests

```bash
npm test                 # unitarios del backend (Jest)
npm run test:e2e         # API del backend (SQLite en memoria + supertest)
npm run test:front       # frontend (Vitest)
npm run test:navegador   # Playwright: navegador real contra el build
```

## Estructura

- `datos/` — fuentes del corpus (CSV y Excel) y `corpus.db`
  (regenerable, fuera de git)
- `evaluaciones/` — informes de `npm run evaluar`, uno por fecha y modelo
- `backend/` — NestJS 11: importador, API de consulta, SRS, traductor,
  pendientes, evaluación
- `frontend/` — Angular (standalone + señales); su build sale a
  `backend/public`
- `e2e/` — tests de navegador (Playwright) con su propio mini-corpus

Más contexto y reglas del dominio (ʉ, ñ, normalización) en
[CLAUDE.md](CLAUDE.md).
