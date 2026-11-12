# Corpus Damana

A study and language-learning app for **Damana (dʉmʉna)**, the language of the Wiwa people of the Sierra Nevada de Santa Marta, Colombia. It turns a small parallel corpus (Damana ↔ Spanish) into tools for learners and for the speakers who help curate it:

- **Concordance search** – find a word or phrase in context, with the Spanish side aligned.
- **Frequency dictionary** – every attested word, how often it appears, and example sentences.
- **Flashcards with spaced repetition** (SM-2) – learn vocabulary from the corpus.
- **Corpus-grounded translator** – an LLM translates Spanish → Damana using only dictionary entries, grammar rules and example pairs retrieved from the corpus, and flags low-support output with a quality "traffic light".
- **Review workflow** – a "pending items" view and Excel exports so native speakers can confirm spellings, meanings and grammar rules; their answers flow back into the corpus.

Live deployment: https://damana.crearcodecesar.com (behind a login).

## Who it's for

- Learners of Damana (heritage speakers, teachers, students in Wiwa schools).
- The small group of native speakers who review and extend the corpus.
- Anyone building study tools for a low-resource language from CSV data.

## Built with

| Layer | Stack |
| --- | --- |
| Backend | Node 22+, NestJS 11, SQLite (better-sqlite3), Jest + supertest |
| Frontend | Angular (standalone components + signals), Vitest |
| E2E | Playwright |
| Translation engine | Any OpenAI-compatible API (Groq by default) or the Anthropic API; optional local Ollama |
| Deploy | Render blueprint (`render.yaml`) or Docker + Kamal 2 |

The repository is an npm-workspaces monorepo (`backend/`, `frontend/`) with a single `package-lock.json` at the root.

## Quick start

```bash
npm install          # installs backend and frontend (workspaces)
npm run importar     # builds datos/corpus.db from the CSV files in /datos
npm run build        # compiles the frontend into backend/public
npm start            # backend in dev mode (also serves the web app)
```

Open **http://localhost:3000** — the views (Search, Dictionary, Flashcards, Translator, Grammar, Pending) and the API docs at `/api/docs`.

Frontend with hot reload: `npm run front` (Angular on :4200, proxied to the backend on :3000).

Production: `npm run build` then `npm run start:prod`.

### Data

The app needs CSV files in `datos/` (UTF-8 with BOM). This repository ships a **very small sample corpus** so everything runs out of the box; the full Wiwa corpus is maintained separately with the speaker community and is not part of this repository (see [DATA.md](DATA.md)). The live demo runs on the full corpus.

Column layout and normalization rules (ʉ and ñ are full letters; ü→ʉ is auto-corrected on import) are documented in [docs/DATA-FORMAT.md](docs/DATA-FORMAT.md).

### Configuring the translator

The first views work with no configuration. The **Translator** needs an LLM provider, chosen through environment variables:

```bash
# Any OpenAI-compatible API (example: Groq, free tier)
TRADUCTOR_BASE_URL=https://api.groq.com/openai/v1
TRADUCTOR_MODELO=openai/gpt-oss-120b
TRADUCTOR_API_KEY=your_key_here

# Or the Anthropic API (takes priority if set)
ANTHROPIC_API_KEY=your_key_here
```

Copy `.env.example` to `.env` and fill in your own keys. Without a provider the Translator view explains the situation and the rest of the app keeps working.

### Authentication

Production runs behind a single-user login. Set `AUTH_USUARIO`, `AUTH_PASSWORD` and `AUTH_JWT_SECRET`; in production the service refuses to start without them.

## Tests

```bash
npm test             # backend unit tests (Jest)
npm run test:e2e     # backend e2e (in-memory SQLite + supertest)
npm run test:front   # frontend (Vitest)
npm run test:navegador   # browser e2e (Playwright)
```

## Project structure

```
datos/        sample corpus CSVs + corpus.db (generated, git-ignored)
scripts/      build helpers (fetch the private corpus in CI)
docs/         data format, original Spanish README (docs/LEEME.es.md)
backend/      NestJS: importer, query API, SRS, translator, review tools
frontend/     Angular app; builds into backend/public
e2e/          Playwright browser tests and their fixture corpus
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the work planned next: turning the dictionary into a full learning app (lessons, pronunciation audio, progress tracking), a public learner mode, and better tooling for speakers who review the corpus.

## Deployment

The app ships as a single Docker image deployed with Kamal 2 from GitHub Actions (`.github/workflows/deploy.yml`, `config/deploy.yml`); `render.yaml` is an alternative blueprint for Render. Server address, credentials and the private corpus are supplied through secrets. Details (in Spanish) are in [docs/LEEME.es.md](docs/LEEME.es.md).

## Contributing and language policy

Issues and pull requests are welcome. Comments, tests and code names are in English; the API routes and the data field names (JSON, database columns, CSV headers) are still in Spanish (see the roadmap). New code and all documentation should be written in English. The Damana data itself stays in Damana and Spanish.

## License

Code: [MIT](LICENSE).
Language data: see [DATA.md](DATA.md) — the full corpus belongs to the Wiwa speaker community and is not covered by the MIT license.

## Acknowledgements

The Wiwa speakers who review every batch of words and sentences, and the authors of the published reference materials on Damana that the corpus draws on.
