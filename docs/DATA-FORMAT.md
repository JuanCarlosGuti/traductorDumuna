# Data format

The importer (`npm run importar`) reads the files below from the data folder (`datos/` by default, or `CORPUS_DATOS_DIR`) and rebuilds `corpus.db` (SQLite, git-ignored). All CSV files are UTF-8 **with BOM** and are read with `csv-parse` (`columns: true, bom: true`). Column names are in Spanish because the source material is Spanish–Damana.

## Files

| File | Columns | Required |
| --- | --- | --- |
| `corpus_oraciones.csv` | `id, damana, espanol, estado, fuente` — sentence pairs. `estado` is `aprobado` (approved) or `revisar` (needs review). | yes |
| `corpus_frases_v2.csv` | `fuente, damana, espanol, notas` — everyday phrases. | yes |
| `corpus_vocabulario_v3.csv` | `espanol, damana, categoria, notas, fuente` — dictionary entries. | yes |
| `corpus_conjugaciones.csv` | `damana, espanol, lema, fuente, notas` — conjugated verb forms. | yes |
| `reglas_damana.xlsx` | Sheet `reglas` (type, form, what it does, base example, example with the rule, translation, notes) and sheet `nombres propios` (proper names). | no (a warning is logged) |
| `formato_elicitacion*.xlsx` | Sheet `elicitacion`: `id, ambito, palabra_es, palabra_dm, ejemplo_es, ejemplo_dm, variante, notas`. Batches filled in by native speakers; each row yields a dictionary entry and an everyday sentence, and unfilled rows become "pending" items. | no |
| `pruebas_traduccion.csv` | `espanol, damana_esperado, ambito` — test set for `npm run evaluar`. | no |

## Orthography rules

- `ʉ` (U+0289) is a full letter of the Damana alphabet. Search, tokenization and sorting treat it as a letter; `ʉ` and `u` are never equivalent.
- `ñ` is also a full letter in both languages; `ñ` and `n` are never equivalent.
- Normalization (`backend/src/common/text/normalizer.ts`): lowercase, NFD, recompose `n` + U+0303 into `ñ`, then strip combining marks. Accents are removed (`á` → `a`); `ʉ` and `ñ` are preserved.
- Damana text is tokenized on anything that is not a Unicode letter, `ʉ` or an inner apostrophe.
- The importer rewrites `ü`/`Ü` to `ʉ`/`Ʉ` in Damana columns (some Word sources use `ü` as a stand-in). In elicitation sheets `u+` is also accepted for `ʉ`, and Spanish words that really contain `ü` are protected. A plain `u` is never converted. Source files are not modified.
- Sentences with `estado = revisar` take part in the translator's retrieval with half the score.
