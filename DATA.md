# Data in this repository

## What is included

`data/` and `e2e/data/` contain a **very small sample corpus** (a handful of words and sentences) so the app, the importer and the tests run out of the box.

## What is not included, and why

The full Damana corpus (about 1,500 dictionary entries, 2,800 sentence pairs, conjugation tables, grammar rules, and the review spreadsheets exchanged with native speakers) is **not** part of this repository:

- It was compiled with and belongs to the **Wiwa speaker community**. Publishing it requires their explicit permission.
- Parts of it derive from third-party publications whose terms do not allow redistribution under an open license.

The full corpus lives in a private repository. Production builds copy it over `data/` before importing (`scripts/fetch-data.mjs`, driven by the `CORPUS_DATA_REPO` and `CORPUS_DATA_TOKEN` secrets). Without those secrets every build uses the sample corpus. The private repository may keep its files under `data/` or under the older `datos/` folder; both are accepted.

Earlier commits of this repository still contain older versions of the corpus files; they are not licensed for reuse.

If you work with the speaker community or need the data for research, open an issue.

## Using your own corpus

Any corpus that follows [docs/DATA-FORMAT.md](docs/DATA-FORMAT.md) can be imported with `npm run import:corpus`. For local work, point the app at a folder outside the repository instead of overwriting `data/`:

```bash
CORPUS_DATA_DIR=/path/to/your/data npm run import:corpus
CORPUS_DATA_DIR=/path/to/your/data npm start
```
