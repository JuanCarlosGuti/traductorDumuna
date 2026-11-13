# Corpus Damana App

Study app for Damana (dʉmʉna), the language of the Wiwa people
(Sierra Nevada de Santa Marta, Colombia). User: developer experienced
with TypeScript/Angular and backend work.

The codebase, docs and tooling are in English. What Spanish-speaking users
and the native speakers see stays in Spanish: the UI text, user-facing error
messages, the corpus data and the Excel files exchanged with the speakers
(their sheet names and column headers are part of that data contract).

## Deployment status (Oct 2026) — read before touching infra

- **IN PRODUCTION: https://corpus-damana.onrender.com** — Render free plan
  via [`render.yaml`](render.yaml) (blueprint). Every push to `main`
  redeploys automatically; the build regenerates `corpus.db` from the CSV
  and Excel files in `/data` (so adding corpus = editing the files in
  `/data` + `npm run import:corpus` to test locally + push).
- **Also IN PRODUCTION since Oct 21, 2026: own server with Kamal 2** →
  `damana.crearcodecesar.com` (netcup VPS <SERVER_IP>, user `deploy`, same
  pattern as cesar-travel and board-checkup: references in
  `C:\dev\proyectos\cesar-travel` and `C:\dev\proyectos\infra-servidor\RUNBOOK.md`;
  the private key `infra-servidor\llaves\id_crearcode` is NOT opened or
  printed). Files: `Dockerfile`, `config/deploy.yml`, `.kamal/secrets`,
  `.github/workflows/deploy.yml`. The corpus is baked into the image
  (`npm run import:corpus` during the build, which is why reglas_damana.xlsx
  and the formato_elicitacion*.xlsx files are NOT in .dockerignore).
  `GET /api/health` (public) is the kamal-proxy healthcheck: 503 if the
  database has no corpus. First deploy on Oct 21, 2026 (Actions secrets
  created with `gh secret set`; A record `damana` in Cloudflare, grey
  cloud). Render is not cancelled until a stable week has passed; both
  serve the same `main`, and their runtime databases are independent.
- **Password access, single user.** The owner asked to remove it on
  Oct 3, 2026 and to restore it on Oct 5 ("only I should have access"); it
  was never deployed without it. AUTH_USERNAME and AUTH_PASSWORD are
  secrets in the Render dashboard. Do not remove authentication unless asked.
- **Current translation engine: Claude** `claude-opus-5-5` via
  `ANTHROPIC_API_KEY` (it takes priority in the code; 5-15 s per
  translation). Paid with the monthly API credits of the claude.ai Max
  plan (org "Juan's Individual Org" on console.anthropic.com, key named
  "corpus-damana"; credits renew on the 5th of each month and do not
  roll over). Render already has it as a service secret (since commit
  7a05483). Do not change the default model unless asked; `ANTHROPIC_MODEL`
  overrides it through the environment.
- **Fallback: Groq** `openai/gpt-oss-120b` (~2 s/translation, free): still
  configured on Render and Kamal (TRANSLATOR_BASE_URL + TRANSLATOR_MODEL +
  TRANSLATOR_API_KEY) and the code only uses it when the Anthropic key is
  missing. Ollama was dropped for being slow (~29 s with qwen2.5:7b),
  although support through the variables still exists. Locally both keys
  are Windows user variables.
- **Legacy Spanish environment names** (TRADUCTOR_*, AUTH_USUARIO,
  AUTH_DIAS_SESION, ANTHROPIC_MODELO, ANTHROPIC_ESFUERZO, CORPUS_DATOS_*)
  are still read as a fallback (`backend/src/common/env.ts`,
  `scripts/fetch-data.mjs`), and the workflow falls back to the old GitHub
  secret names, so existing Render variables and secrets keep working.
  Renaming them is optional.
- The GitHub Actions secret `ANTHROPIC_API_KEY` (for Kamal) already exists
  (Juan created it on Oct 21, 2026). If it were ever missing, the workflow
  exports it empty and the own server would translate with Groq.
- Render pitfalls already hit (do not repeat): it requires
  `NODE_VERSION >= 24.15.0` (the Angular CLI rejects lower versions) and,
  being a monorepo with npm workspaces (single lock at the root),
  EVERYTHING is installed/built from the root — `npm ci` per subfolder
  leaves `node_modules` where the runtime cannot resolve them
  (`Cannot find module`). Do not set NODE_ENV=production on Render: `npm ci`
  would skip the devDependencies and there would be nothing to build with.
- Render's filesystem is ephemeral: `corpus.db` is regenerated on every
  deploy (fine: it is read-only at runtime) and the tables written at
  runtime (`srs_progress`, `translations`, `pending_items`,
  `validated_pairs`) do NOT persist in production, only locally.
- `main.ts` accepts `PORT` (locally 3001 is used when another project
  holds 3000). One-off demo without Render:
  `cloudflared tunnel --url http://localhost:<port>`.

## Stack (all TypeScript)
- Monorepo with npm workspaces: /backend and /frontend.
- Backend: NestJS 11, better-sqlite3 (synchronous access, no ORM; own
  repository layer in a ports-and-adapters style), csv-parse for import,
  exceljs for the Excel files (rules, elicitation, pending export),
  @nestjs/swagger for documentation.
- Frontend: Angular standalone components with signals. Views: Search,
  Dictionary (+entry), Grammar, Flashcards, Translator, Pending.
- Production: a single process; NestJS serves the Angular build with
  @nestjs/serve-static.
- Authentication: single user (AUTH_USERNAME + AUTH_PASSWORD) with a
  signed token (@nestjs/jwt, AUTH_JWT_SECRET, 30 days). Global guard over
  all of /api except what is marked with @Public(): /api/auth/status and
  /api/auth/login. The frontend static files do NOT go through the guard —
  the SPA must load to show the login and Render runs the health check
  against "/". Without configured credentials auth is disabled (local
  development, with a warning at startup), BUT in production missing
  credentials = startup fails on purpose: an API left open by accident goes
  unnoticed, a broken deploy does not. "Production" is detected with
  RENDER=true, not with NODE_ENV.
- Tests, four layers (all must pass before pushing):
  - `npm test` — Jest, backend. Pure unit tests (text, sm2, support,
    rules, dictionary, chrF, elicitation) and integration with in-memory
    SQLite (services + repositories; the importer generates its test Excel
    files with exceljs in a temporary directory).
  - `npm run test:e2e` — Jest + supertest. HTTP routes with Nest running in
    memory. Mind the name: it is an API test, not a browser e2e.
  - `npm run test:front` — Vitest. Components with TestBed and a mocked
    HttpClient. In zoneless mode, `fixture.whenStable()` does NOT wait for
    the component's promises: use `settle()` from shared/testing.ts or the
    DOM is read half-rendered.
  - `npm run test:browser` — Playwright, real Chromium against the backend
    serving the Angular build with auth enabled. It is the ONLY layer that
    checks that frontend and backend understand each other. It uses its own
    corpus in e2e/data (it does not touch /data) and starts WITHOUT a
    translation engine (it clears TRANSLATOR_* and ANTHROPIC_API_KEY) so no
    real calls are spent.
- Free Groq returns 429 on the fourth translation per minute: the
  compatible provider waits for Retry-After (capped at 30 s) and retries
  twice; `npm run evaluate -- --pause 15000` spaces out the calls.
- Assisted translator: Claude via @anthropic-ai/sdk (ANTHROPIC_API_KEY,
  priority; structured output with `output_config.format` json_schema) or
  any OpenAI-compatible API (TRANSLATOR_BASE_URL + TRANSLATOR_MODEL
  [+ TRANSLATOR_API_KEY]; `response_format json_object` is requested and if
  the provider rejects it with 400 the call is retried without it).
- Engine settings through the environment: `TRANSLATOR_TEMPERATURE`
  (compatible provider only; 0.2 by default, clamped to 0-2: same sentence,
  same translation) and `ANTHROPIC_EFFORT` (Claude only: low | medium |
  high | xhigh | max; if missing, the API default applies). Claude is NOT
  sent a temperature: claude-opus-5-5 rejects it with 400 (adaptive
  thinking). The system prompt goes as a block with `cache_control:
  ephemeral` (claude-opus-5-5 caches prefixes from 512 tokens and this
  prompt is around 750; the cache lasts 5 min, so it only saves during
  bursts). Every translation writes one log line and stores in
  `translations` (v7: input_tokens, output_tokens, cache_read_tokens,
  cache_creation_tokens, duration_ms) the usage reported by the provider.

## General-purpose translator (Oct 2026) — how it works
- The biblical corpus (lfb) is still the main source of grammar and
  morphology, but NO longer the main source of examples.
- Retrieval (`query/retrieval.service.ts`, `retrieveContext`), in this
  order: (a) word-by-word dictionary (`query/dictionary.ts`: exact →
  without accents → colloquial Spanish synonym (mamá→madre, short list
  SYNONYMS_ES) → singular → 5-letter prefix marked "possible"; multi-word
  entries are included if all their words are in the sentence), (b) proper
  names with the table's spelling, (c) applicable rules (`query/rules.ts`:
  plural/possessive/negation/question/past/future triggers from heuristics
  in Spanish and by suffix in Damana; each rule's trigger is inferred at
  import time from its "tipo" + "qué hace"), (d) TF-IDF examples spread by
  domain: ≤6 everyday, ≤4 grammar, ≤4 biblical (2 if there are ≥4
  everyday), ≤14 in total, without near-duplicates.
- Negation (diagnosis Oct 2026): reglas_damana.xlsx only has -ndzina
  (plural, two rows) and -nzhe (possessive). There is NO rule for
  negation, questions, past or future. When the sentence has a feature
  without a rule, the prompt says so plainly ("feature detected, but the
  corpus has no recorded rule; pending confirmation with the speakers")
  and, for negation, points to the negative forms in the dictionary
  (No quiero → Nandunun, No hay → Nanún…) and in the conjugations
  (-nún/-nuñí). Spanish negations (`isSpanishNegation`,
  common/text/stopwords-es.ts) count as content when indexing multi-word
  entries: "No quiero" is only included if the sentence has "no" (it used
  to show up for the affirmative too). The rule must come from the
  speakers (grammar batch 2 already asks for the negative pairs); do not
  invent it.
- Prompt (`translation/prompt.ts`) with fixed sections: GRAMMAR RULES,
  DICTIONARY FOR THIS SENTENCE, EVERYDAY EXAMPLES, GRAMMAR EXAMPLES,
  BIBLICAL CORPUS EXAMPLES, SENTENCE TO TRANSLATE. JSON response:
  translation, gloss, words_without_equivalent, applied_rules, confidence,
  brief_explanation. Whatever is not in the corpus goes in brackets
  `[word]` and is recorded in `pending_items`.
- The speakers are paid per word: the importer does NOT record as pending
  an unfilled elicitation row whose word is already in the vocabulary
  (including one brought by the same batch), and it closes open pending
  items that the vocabulary covers (`importer/vocabulary-coverage.ts`:
  Spanish alternatives, parentheses, singular; ʉ ≠ u, ñ ≠ n). On Oct 21,
  2026 that closed 277 of the 515 items in batch 1 that the corpus already
  knew, and about as many more when external vocabulary was loaded. A
  resolved pending item that the translator asks for again reopens by
  itself.
- Cycle with the speakers: /pendientes view → "exportar lote" generates
  `formato_elicitacion_pendientes_<date>.xlsx` (columns of the elicitation
  format, cells to fill in yellow). The batch that comes back filled is
  placed in /data and `npm run import:corpus` absorbs it (idempotent by id).
- The "esta traducción es correcta" / "corregir" buttons save to
  `validated_pairs` (a future everyday source; not yet used by retrieval).
- `npm run evaluate`: translates `data/pruebas_traduccion.csv` (Spanish →
  Damana) and saves in `/evaluations/<date>_<model>.{json,md}` the exact
  match, chrF (own implementation, `evaluation/chrf.ts`) and the % of words
  without equivalent per scope. It does not record translations or pending
  items. The tests come from the importer: 1 out of every 10 complete
  elicitation rows, chosen by a stable hash of the id (not by position) so
  a test never becomes an example in the next batch; rows can also be
  added by hand (they are never deleted).
- `npm run tests:from-validated`: dumps the pairs in `validated_pairs` into
  `data/pruebas_traduccion.csv` with scope "validadas" (idempotent: merges
  by normalized pair and never deletes rows), so that `npm run evaluate`
  measures them separately.

## Normalization with the speakers (Oct 2026) — owner decisions
- Goal: normalize the data even if that means deleting or correcting, and
  collect what is missing for a multi-purpose translator. Damana has little
  vocabulary and a very different grammar: grammar is what is missing the
  most. Religious language is not forbidden (it is what there is most of);
  it just must not be the only thing the translator can say.
- Workflow: many inexperienced speakers do the first pass (they are
  cheaper) and ONE person experienced in translating publications reviews.
  What is validated in the app only enters retrieval after that review.
  They work on a laptop with Excel.
- `npm run doubts` (`backend/src/review/`) does NOT correct anything: it
  generates `data/dudas_para_hablantes_<date>.xlsx` with whatever is
  unclear, one sheet per question type and the answers in yellow:
  1 spelling (same word with several spellings: u/ʉ, w/u, y/i,
  ndzina/nyina, h/j), 2 a Spanish word with several Damana words, 3 a
  Damana form with several meanings (including those that only differ by
  the accent: Ako "córtelo" / Akó "lo cortó"), 4 entries to clarify (same
  as the Spanish, several forms in one cell, notes shifted across rows),
  5 repeated endings (-mba, -win, -ga…). Sheet 1 is for any speaker; the
  rest are for the reviewer.
- `spellingSkeleton()` (common/text/skeleton.ts) merges u with ʉ ONLY to
  detect those doubts; do not use it to search, index or correct.
- `formato_elicitacion_lote2_gramatica.xlsx`: minimal sentences that change
  just one thing (person, tense, negation, question) to extract rules. It
  comes from `review/paradigms.ts`, an APPEND-ONLY list (the id is the
  position). The importer absorbs it like any other batch.
- Pending owner decision: Render persistent disk (paid) so that pending
  items and validated pairs survive deploys.

## External material (Oct 2026)
- `material-externo/`: external sources about Damana (Living Dictionary,
  SIL 1973/74/1990/2012, Trillos 2004-05, Wiwa Gago). Inventory in
  `FUENTES.md`, reading notes in `INFORME-LECTURA.md`, result in
  `INFORME-INTEGRACION.md`, outputs in `salida/` (vocabulario_nuevo,
  vocabulary divergences and matches, frases_nuevas, reglas_propuestas,
  preguntas_hablantes.xlsx). `pdf/` and `texto/` are kept out of git (the
  repo is public and Hoppe 1973/74 is copyrighted) and out of the Docker
  image. NOTHING goes into /data without going through the cross-check
  (`herramientas/cruzar_vocabulario.js`) and without the owner's approval;
  anything doubtful goes to the speakers. Watch out: the extracted PDFs
  have ᵾ (U+1D7E) instead of ʉ; the tools normalize it, the importer does
  not yet.
- To add another source: PDF in `pdf/`, text in `texto/`, a row in
  FUENTES.md, its words in `salida/fuentes/<source>.csv` and run the
  cross-check again; the approved NEW ones are added to
  corpus_vocabulario_v3.csv with their `fuente`.

## Data — /data folder (UTF-8 CSV with BOM)
The file names and column headers below are the shared data format (also
used by the private data repo and by the speakers), so they stay in
Spanish. The importer maps the CSV headers to English names when reading.
- corpus_oraciones.csv: id, damana, espanol, estado, fuente (~2,800
  pairs; estado = "aprobado" ~1,957 or "revisar" ~843, stored as
  `approved` / `review`). Biblical domain.
- corpus_frases_v2.csv: fuente, damana, espanol, notas (~131 phrases from
  meetings/questions). Everyday domain.
- corpus_vocabulario_v3.csv: espanol, damana, categoria, notas, fuente
  (1,508 entries; it replaced v2 in Oct 2026: 918 from the Wiwa dictionary
  + 590 "nativas 2026-10").
- corpus_conjugaciones.csv: damana, espanol, lema, fuente, notas
  (~267 verb forms of 23 lemmas). Grammar domain.
- reglas_damana.xlsx: sheet "reglas" (tipo, forma, qué hace, ejemplo base,
  ejemplo con la regla, traducción, notas) and sheet "nombres propios".
- formato_elicitacion*.xlsx: batches filled in by native speakers, sheet
  "elicitacion" (id, ambito, palabra_es, palabra_dm, ejemplo_es,
  ejemplo_dm, variante, notas). Each row yields one vocabulary entry and
  one everyday sentence; whatever is missing stays in `pending_items`. The
  ʉ may come as "ü" or "u+" (it is normalized, protecting
  vergüenza/pingüino…). Batch 1 (514 rows) is in /data UNFILLED: that is
  why there are 514 pending items of elicitation origin.
- pruebas_traduccion.csv: espanol, damana_esperado, ambito (written by the
  importer; can be extended by hand).
- corpus.db (gitignored) is regenerated with `npm run import:corpus`.

## Domain rules (verified)
- ʉ (U+0289) is a full letter of the Damana alphabet. Search, tokenization
  and sorting treat it as a letter; ʉ ≠ u ALWAYS.
- ñ is also a full letter (in Damana: ñingui, kʉñingui; in Spanish
  año ≠ ano); ñ ≠ n ALWAYS.
- Normalize with normalize() from backend/src/common/text/normalizer.ts:
  lowercase + NFD, recompose n + U+0303 → ñ (preserve it) and then strip
  the combining marks U+0300–U+036F. It strips accents (á→a), does NOT
  touch ʉ (it does not decompose in NFD) and does NOT degrade ñ→n. Careful:
  stripping the marks without recomposing first WOULD turn ñ→n (NFD
  decomposes ñ into n + combining tilde); the prior recomposition is
  mandatory.
- Tokenize Damana with /[^\p{L}ʉ']+/u (split on everything that is not a
  Unicode letter, ʉ or an internal apostrophe).
- The importer turns ü/Ü → ʉ/Ʉ in the Damana columns (ü does not exist in
  Damana; some Word sources use it as a workaround for ʉ). See
  fixDamanaSpelling() in backend/src/common/text/spelling.ts; for
  elicitation, normalizeWrittenDamana() adds "u+" → ʉ and protects Spanish
  words with ü. A plain u is NEVER converted (u and ʉ are different
  letters) and typographic quotes are kept. The source files are not
  modified.
- Read CSVs with csv-parse: { bom: true } and header mapping to English
  column names (`CSV_COLUMNS` in importer.service.ts).
- Sentences with status `review` take part in the translator's retrieval
  with half the score (REVIEW_WEIGHT = 0.5).
- Owner decision (Oct 21, 2026): when the same word appears in one source
  with ʉ and in another with u in the same position, **the form with ʉ
  prevails**, whether the source is old or new; dropping it is an error
  because it changes the sound (ʉ sounds roughly "half guttural"; u as in
  Spanish). The ʉ was an improvement in the writing system and old texts,
  including the Bible booklet, sometimes write u where ʉ belongs: when
  READING old text one must allow that a u may be ʉ, but what is kept and
  written is the form with ʉ. Nobody is asked, except when the variant
  with u could be ANOTHER word (e.g. "duma" versus "dʉma"): the reviewer
  decides that with `material-externo/herramientas/variantes_u_en_corpus.js`.
  The external-material cross-check applies it on its own
  (`correcciones_u_partida.csv`); the same rule applies when resolving
  sheet 1 of the doubts document (u/ʉ). Already applied: Sal "Nungu" →
  "Nʉngu" in the vocabulary and in the two lfb sentences of p033. This
  does NOT change that u ≠ ʉ in search and indexing: it is only for
  deciding which of two variants is kept.

## Conventions
- Every service has tests; always include one case with ʉ and one with ñ.
- Small commits per feature, messages in English.
- Code, comments, docs and tooling in English; UI text, user-facing error
  messages and speaker-facing files in Spanish.
- The SQLite database (data/corpus.db) is in .gitignore; it is regenerated
  with the importer. The tables srs_progress, translations,
  validated_pairs and pending_items survive re-imports and migrations
  (never drop them; the importer only adds elicitation pending items and
  closes the ones that come back complete). Exception: a database still on
  the old Spanish schema (table `oraciones`) is dropped and rebuilt once by
  `runMigrations`.
