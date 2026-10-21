# Corpus Damana App

Aplicación de estudio del damana (dʉmʉna), lengua del pueblo Wiwa
(Sierra Nevada de Santa Marta, Colombia). Usuario: desarrollador con
experiencia en TypeScript/Angular y backend.

## Estado del despliegue (oct 2026) — leer antes de tocar infra

- **EN PRODUCCIÓN: https://corpus-damana.onrender.com** — Render plan
  gratuito vía [`render.yaml`](render.yaml) (blueprint). Cada push a
  `main` redespliega automáticamente; el build regenera `corpus.db`
  desde los CSV y Excel de `/datos` (por eso agregar corpus = editar los
  archivos de `/datos` + `npm run importar` para probar en local + push).
- **También EN PRODUCCIÓN desde el 21 oct 2026: servidor propio con Kamal 2** →
  `damana.crearcodecesar.com` (VPS netcup 159.195.235.225, usuario
  `deploy`, mismo patrón que cesar-travel y board-checkup: referencias en
  `C:\dev\proyectos\cesar-travel` y `C:\dev\proyectos\infra-servidor\RUNBOOK.md`;
  la llave privada `infra-servidor\llaves\id_crearcode` NO se abre ni se
  imprime). Archivos: `Dockerfile`, `config/deploy.yml`, `.kamal/secrets`,
  `.github/workflows/deploy.yml`. El corpus se hornea en la imagen
  (`npm run importar` en el build, por eso reglas_damana.xlsx y los
  formato_elicitacion*.xlsx NO van en .dockerignore). `GET /api/salud`
  (público) es el healthcheck de kamal-proxy: 503 si la base no tiene
  corpus. Primer deploy el 21 oct 2026 (secretos de Actions creados con
  `gh secret set`; registro A `damana` en Cloudflare con nube gris).
  Render no se cancela hasta una semana estable; ambos sirven el mismo
  `main`, y sus bases de runtime son independientes.
- **Acceso con contraseña, un solo usuario.** El dueño pidió quitarla el
  3 oct 2026 y restaurarla el 5 («que tenga solo acceso yo»); nunca llegó
  a subirse sin ella. AUTH_USUARIO y AUTH_PASSWORD son secretos del panel
  de Render. No quitar la autenticación sin que lo pida.
- **Motor de traducción vigente: Claude** `claude-opus-5-5` vía
  `ANTHROPIC_API_KEY` (tiene prioridad en el código; 5-15 s por
  traducción). Se paga con los créditos API mensuales del plan Max de
  claude.ai (org «Juan's Individual Org» en console.anthropic.com, clave
  llamada «corpus-damana»; los créditos se renuevan el 5 de cada mes y no
  se acumulan). Render ya la tiene como secreto del servicio (desde el
  commit 7a05483). No cambiar el modelo por defecto sin que lo pida;
  `ANTHROPIC_MODELO` lo sobreescribe por entorno.
- **Respaldo: Groq** `openai/gpt-oss-120b` (~2 s/traducción, gratis):
  sigue configurado en Render y en Kamal (TRADUCTOR_BASE_URL +
  TRADUCTOR_MODELO + TRADUCTOR_API_KEY) y el código lo usa solo si falta
  la clave de Anthropic. Ollama quedó abandonado por lentitud (~29 s con
  qwen2.5:7b), aunque el soporte por variables sigue existiendo. En local
  ambas claves son variables de usuario de Windows.
- El secreto `ANTHROPIC_API_KEY` de GitHub Actions (para Kamal) ya existe
  (lo creó Juan el 21 oct 2026). Si algún día faltara, el workflow lo
  exporta vacío y el servidor propio traduciría con Groq.
- Trampas ya sufridas en Render (no repetir): exige
  `NODE_VERSION >= 24.15.0` (la CLI de Angular rechaza menores) y,
  por ser monorepo con npm workspaces (lock único en la raíz), TODO
  se instala/construye desde la raíz — `npm ci` por subcarpeta deja
  `node_modules` donde el runtime no resuelve (`Cannot find module`).
  No poner NODE_ENV=production en Render: `npm ci` omitiría las
  devDependencies y no habría con qué construir.
- El filesystem de Render es efímero: `corpus.db` se regenera en cada
  deploy (bien: es solo-lectura en runtime) y las tablas que se escriben
  en runtime (`progreso_srs`, `traducciones`, `pendientes`, `validadas`)
  NO persisten en producción, solo en local.
- `main.ts` acepta `PORT` (en local se usa 3001 cuando otro proyecto
  ocupa el 3000). Demo puntual sin Render:
  `cloudflared tunnel --url http://localhost:<puerto>`.

## Stack (todo TypeScript)
- Monorepo con npm workspaces: /backend y /frontend.
- Backend: NestJS 11, better-sqlite3 (acceso síncrono, sin ORM;
  capa de repositorios propia estilo puertos y adaptadores),
  csv-parse para importación, exceljs para los Excel (reglas,
  elicitación, exportar pendientes), @nestjs/swagger para documentar.
- Frontend: Angular standalone components con señales. Vistas: Buscar,
  Diccionario (+ficha), Gramática, Flashcards, Traductor, Pendientes.
- Producción: un solo proceso; NestJS sirve el build de Angular con
  @nestjs/serve-static.
- Autenticación: usuario único (AUTH_USUARIO + AUTH_PASSWORD) con token
  firmado (@nestjs/jwt, AUTH_JWT_SECRET, 30 días). Guard global sobre todo
  /api salvo lo marcado con @Publico(): /api/auth/estado y /api/auth/login.
  Los estáticos del frontend NO pasan por el guard —la SPA debe cargar para
  pintar el login y Render hace el health check contra «/»—. Sin credenciales
  configuradas la auth queda desactivada (desarrollo local, con aviso al
  arrancar), PERO en producción falta = el arranque falla a propósito: una
  API abierta por descuido no se nota, un deploy roto sí. «Producción» se
  detecta con RENDER=true, no con NODE_ENV.
- Tests, cuatro capas (todas deben pasar antes de subir):
  - `npm test` — Jest, backend. Unitarios puros (texto, sm2, apoyo,
    reglas, diccionario, chrF, elicitación) e integración con SQLite en
    memoria (servicios + repositorios; el importador genera sus Excel de
    prueba con exceljs en un directorio temporal).
  - `npm run test:e2e` — Jest + supertest. Rutas HTTP con Nest levantado en
    memoria. Ojo con el nombre: es prueba de API, no e2e de navegador.
  - `npm run test:front` — Vitest. Componentes con TestBed y HttpClient
    simulado. En zoneless, `fixture.whenStable()` NO espera las promesas del
    componente: usar `asentar()` de comun/probar.ts o se lee el DOM a medias.
  - `npm run test:navegador` — Playwright, Chromium real contra el backend
    sirviendo el build de Angular con la auth activa. Es la ÚNICA capa que
    comprueba que frontend y backend se entienden. Usa su propio corpus en e2e/datos (no
    toca /datos) y arranca SIN motor de traducción (vacía TRADUCTOR_* y
    ANTHROPIC_API_KEY) para no gastar llamadas reales.
- Groq gratuito devuelve 429 a la cuarta traducción por minuto: el
  proveedor compatible espera Retry-After (acotado a 30 s) y reintenta 2
  veces; `npm run evaluar --pausa 15000` espacia las llamadas.
- Traductor asistido: Claude vía @anthropic-ai/sdk (ANTHROPIC_API_KEY,
  prioridad; salida estructurada con `output_config.format` json_schema)
  o cualquier API compatible OpenAI (TRADUCTOR_BASE_URL +
  TRADUCTOR_MODELO [+ TRADUCTOR_API_KEY]; se pide `response_format
  json_object` y si el proveedor lo rechaza con 400 se reintenta sin él).
- Ajustes del motor por entorno: `TRADUCTOR_TEMPERATURA` (solo proveedor
  compatible; 0.2 por defecto, acotada a 0-2: misma frase, misma
  traducción) y `ANTHROPIC_ESFUERZO` (solo Claude: low | medium | high |
  xhigh | max; si falta, vale el de la API). A Claude NO se le envía
  temperature: claude-opus-5-5 la rechaza con 400 (pensamiento
  adaptativo). El prompt de sistema va como bloque con `cache_control:
  ephemeral` (claude-opus-5-5 cachea prefijos desde 512 tokens y este
  prompt ronda los 750; la caché dura 5 min, así que solo ahorra en
  rachas). Cada traducción deja una línea de log y guarda en
  `traducciones` (v7: tokens_entrada, tokens_salida, tokens_cache_leidos,
  tokens_cache_creados, duracion_ms) el consumo que informó el proveedor.

## Traductor de propósito general (oct 2026) — cómo funciona
- El corpus bíblico (lfb) sigue siendo la fuente principal de gramática
  y morfología, pero ya NO la fuente principal de ejemplos.
- Retrieval (`consulta/retrieval.service.ts`, `recuperarContexto`), en
  este orden: (a) diccionario palabra por palabra
  (`consulta/diccionario.ts`: exacta → sin tildes → sinónimo coloquial
  del español (mamá→madre, lista corta SINONIMOS_ES) → singular → prefijo
  de 5 letras marcado «posible»; las entradas de varias palabras entran
  si todas sus palabras están en la frase), (b) nombres propios con la
  grafía de la tabla, (c) reglas aplicables (`consulta/reglas.ts`:
  disparadores plural/posesivo/negacion/pregunta/pasado/futuro por
  heurísticas en español y por sufijo en damana; el disparador de cada
  regla se infiere al importar del «tipo» + «qué hace»), (d) ejemplos
  TF-IDF repartidos por dominio: ≤6 cotidianos, ≤4 gramática, ≤4
  bíblicos (2 si hay ≥4 cotidianos), ≤14 en total, sin casi-duplicados.
- Negación (diagnóstico oct 2026): reglas_damana.xlsx solo trae -ndzina
  (plural, dos filas) y -nzhe (posesivo). NO hay regla de negación,
  pregunta, pasado ni futuro. Cuando la frase trae un rasgo sin regla, el
  prompt lo dice tal cual («rasgo detectado, pero el corpus no tiene regla
  registrada, pendiente de confirmar con las hablantes») y, para la
  negación, remite a las formas negativas del diccionario (No quiero →
  Nandunun, No hay → Nanún…) y de las conjugaciones (-nún/-nuñí). Las
  negaciones del español (`esNegacionEspanol`, comun/texto/stopwords-es.ts)
  cuentan como contenido al indexar entradas de varias palabras: «No
  quiero» solo entra si la frase trae «no» (antes salía también para la
  afirmativa). La regla la deben dar las hablantes (el lote 2 de gramática
  ya pide los pares negativos); no inventarla.
- Prompt (`traduccion/prompt.ts`) con secciones fijas: REGLAS
  GRAMATICALES, DICCIONARIO DE ESTA FRASE, EJEMPLOS COTIDIANOS, EJEMPLOS
  DE GRAMÁTICA, EJEMPLOS DEL CORPUS BÍBLICO, FRASE A TRADUCIR. Respuesta
  JSON: traduccion, glosa, palabras_sin_equivalente, reglas_aplicadas,
  confianza, explicacion_breve. Lo que no está en el corpus va entre
  corchetes `[palabra]` y se registra en `pendientes`.
- Ciclo con las hablantes: vista /pendientes → «exportar lote» genera
  `formato_elicitacion_pendientes_<fecha>.xlsx` (columnas del formato de
  elicitación, celdas por llenar en amarillo). El lote vuelto lleno se
  deja en /datos y `npm run importar` lo absorbe (idempotente por id).
- Botones «esta traducción es correcta» / «corregir» guardan en
  `validadas` (futura fuente cotidiana; aún no entra al retrieval).
- `npm run evaluar`: traduce `datos/pruebas_traduccion.csv` (español →
  damana) y guarda en `/evaluaciones/<fecha>_<modelo>.{json,md}` la
  coincidencia exacta, el chrF (propio, `evaluacion/chrf.ts`) y el % de
  palabras sin equivalente por ámbito. No registra traducciones ni
  pendientes. Las pruebas salen del importador: 1 de cada 10 filas de
  elicitación completas, elegida por hash estable del id (no por
  posición) para que una prueba no pase a ser ejemplo en el lote
  siguiente; también se pueden añadir filas a mano (nunca se borran).
- `npm run pruebas:desde-validadas`: vuelca los pares de `validadas` a
  `datos/pruebas_traduccion.csv` con ámbito «validadas» (idempotente:
  funde por pareja normalizada y nunca borra filas), para que `npm run
  evaluar` los mida aparte.

## Normalización con hablantes (oct 2026) — decisiones del dueño
- Objetivo: normalizar los datos aunque implique borrar o corregir, y
  recaudar lo que falta para un traductor multipropósito. El damana tiene
  poco vocabulario y una gramática muy distinta: lo que más falta es
  gramática. El lenguaje religioso no está prohibido (es lo que más hay);
  solo no debe ser lo único que el traductor sepa decir.
- Flujo de trabajo: muchas hablantes sin experiencia hacen la primera
  pasada (son más baratas) y UNA persona con experiencia en traducción de
  publicaciones revisa. Lo validado en la app entra al retrieval solo
  tras esa revisión. Trabajan en un portátil con Excel.
- `npm run dudas` (`backend/src/revision/`) NO corrige nada: genera
  `datos/dudas_para_hablantes_<fecha>.xlsx` con lo que no está claro, una
  hoja por tipo de pregunta y las respuestas en amarillo: 1 escritura
  (misma palabra con varias grafías: u/ʉ, w/u, y/i, ndzina/nyina, h/j),
  2 una palabra española con varias damana, 3 una forma damana con varios
  significados (incluye las que solo cambian la tilde: Ako «córtelo» /
  Akó «lo cortó»), 4 entradas por aclarar (iguales al español, varias
  formas en una casilla, notas corridas de fila), 5 terminaciones que se
  repiten (-mba, -win, -ga…). La hoja 1 es para cualquier hablante; las
  demás, para el revisor.
- `esqueletoOrtografico()` (comun/texto/esqueleto.ts) junta u con ʉ SOLO
  para detectar esas dudas; no usarlo para buscar, indexar ni corregir.
- `formato_elicitacion_lote2_gramatica.xlsx`: oraciones mínimas que
  cambian una sola cosa (persona, tiempo, negación, pregunta) para sacar
  reglas. Sale de `revision/paradigmas.ts`, lista de SOLO AÑADIR (el id
  es la posición). El importador lo absorbe como cualquier lote.
- Pendiente de decidir por el dueño: disco persistente de Render (es de
  pago) para que pendientes y validadas sobrevivan a los deploys.

## Datos — carpeta /datos (CSV en UTF-8 con BOM)
- corpus_oraciones.csv: id, damana, espanol, estado, fuente (~2.800
  pares; estado = "aprobado" ~1.957 o "revisar" ~843). Dominio bíblico.
- corpus_frases_v2.csv: fuente, damana, espanol, notas (~131 frases de
  reuniones/preguntas). Dominio cotidiano.
- corpus_vocabulario_v3.csv: espanol, damana, categoria, notas, fuente
  (1.508 entradas; reemplazó a la v2 en oct 2026: 918 del diccionario
  wiwa + 590 «nativas 2026-10»).
- corpus_conjugaciones.csv: damana, espanol, lema, fuente, notas
  (~267 formas verbales de 23 lemas). Dominio gramática.
- reglas_damana.xlsx: hoja «reglas» (tipo, forma, qué hace, ejemplo base,
  ejemplo con la regla, traducción, notas) y hoja «nombres propios».
- formato_elicitacion*.xlsx: lotes llenados por hablantes nativas, hoja
  «elicitacion» (id, ambito, palabra_es, palabra_dm, ejemplo_es,
  ejemplo_dm, variante, notas). Cada fila da una entrada de vocabulario y
  una oración cotidiana; lo que falte queda en `pendientes`. La ʉ puede
  venir como «ü» o «u+» (se normaliza, protegiendo vergüenza/pingüino…).
  El lote 1 (514 filas) está en /datos SIN llenar: por eso hay 514
  pendientes de origen elicitación.
- pruebas_traduccion.csv: espanol, damana_esperado, ambito (lo escribe el
  importador; se puede ampliar a mano).
- corpus.db (gitignored) se regenera con `npm run importar`.

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
  corregirOrtografiaDamana() en backend/src/comun/texto/ortografia.ts;
  para la elicitación, normalizarDamanaEscrito() añade «u+» → ʉ y
  protege las palabras españolas con ü. La u simple NUNCA se convierte
  (u y ʉ son letras distintas) y las comillas tipográficas «' '» se
  conservan. Los archivos fuente no se modifican.
- Leer CSV con csv-parse: { columns: true, bom: true }.
- Las oraciones estado="revisar" participan en el retrieval del
  traductor con la mitad del puntaje (PESO_REVISAR = 0.5).

## Convenciones
- Cada servicio con tests; incluir siempre un caso con ʉ y uno con ñ.
- Commits pequeños por funcionalidad, mensajes en español.
- La base SQLite (datos/corpus.db) va en .gitignore; se regenera con
  el importador. Las tablas progreso_srs, traducciones, validadas y
  pendientes sobreviven a reimportaciones y migraciones (nunca
  borrarlas; el importador solo añade pendientes de elicitación y cierra
  las que vuelven completas).
