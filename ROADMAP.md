# Roadmap

Corpus Damana started as a dictionary and concordance tool. The goal for the next months is to grow it into a complete **learning app for Damana**, while keeping the speaker-review workflow that feeds the corpus. Estimates are rough and in hours of focused work; items are ordered by priority.

Status legend: 🔲 not started · 🔧 in progress · ✅ done

## 1. Learner experience (≈ 28 h)

| # | Item | Est. | Status |
| --- | --- | --- | --- |
| 1.1 | **Lesson engine**: thematic lessons (greetings, family, food, numbers, verbs) generated from the corpus by semantic domain, with a progress bar per lesson | 8 h | 🔲 |
| 1.2 | **Exercise types** beyond flashcards: multiple choice, fill-the-gap from a corpus sentence, reorder the words, Spanish→Damana typing with ʉ/ñ helper keys | 8 h | 🔲 |
| 1.3 | **Learner profile and streaks**: daily goal, XP, review calendar; persist SRS progress per user (today it is per device) | 5 h | 🔲 |
| 1.4 | **Pronunciation audio**: attach speaker-recorded audio to dictionary entries and flashcards; upload tool for speakers; serve from object storage | 7 h | 🔲 |

## 2. Public learner mode (≈ 10 h)

| # | Item | Est. | Status |
| --- | --- | --- | --- |
| 2.1 | Replace the single shared login with **roles**: anonymous learner (read + own progress), reviewer (pending items), admin (imports) | 6 h | 🔲 |
| 2.2 | Rate limiting and caching for the public translator endpoint | 2 h | 🔲 |
| 2.3 | Offline-friendly PWA shell (manifest, service worker, cached dictionary) | 2 h | 🔲 |

## 3. Speaker review tooling (≈ 12 h)

| # | Item | Est. | Status |
| --- | --- | --- | --- |
| 3.1 | **In-app review** of pending items (today speakers fill Excel files): mobile-first form, one item per screen, works on low-end phones | 6 h | 🔲 |
| 3.2 | Import reviewed Excel/forms back automatically with a diff preview before committing to the CSVs | 4 h | 🔲 |
| 3.3 | Per-speaker contribution log (needed for fair payment per reviewed word) | 2 h | 🔲 |

## 4. Translator quality (≈ 10 h)

| # | Item | Est. | Status |
| --- | --- | --- | --- |
| 4.1 | Extend the grammar-rule retrieval: negation, questions, possessives, plural — rules confirmed by speakers in batch 2 | 4 h | 🔲 |
| 4.2 | Evaluation dashboard: chrF over the validated test set per release, so regressions are visible | 3 h | 🔲 |
| 4.3 | Damana → Spanish direction (currently Spanish → Damana only) | 3 h | 🔲 |

## 5. Engineering health (≈ 12 h)

| # | Item | Est. | Status |
| --- | --- | --- | --- |
| 5.1 | Grow the sample corpus into a self-contained demo data set (enough entries to exercise lessons and flashcards without the private corpus) | 3 h | 🔲 |
| 5.2 | English migration of the codebase: comments, tests, class/function/file names, API routes and JSON field names. Database columns, CSV/Excel headers and stored values intentionally stay in Spanish (they are language data shared with the speakers) | — | ✅ |
| 5.3 | CI on GitHub Actions for PRs (lint, unit, e2e) separate from the deploy workflow | 2 h | 🔲 |
| 5.4 | Persistent storage for runtime data (SRS progress, validated translations) instead of baking SQLite into the image | 2 h | 🔲 |

**Total planned: ≈ 67 h.**

## Done recently

- ✅ Real corpus moved out of the public repository (private data repo fetched at build time); documented data format
- ✅ Corpus-grounded translator with dictionary + rules + examples retrieval, prompt caching and per-call token/latency logging
- ✅ Quality "traffic light" for translations with weak corpus support
- ✅ chrF evaluation script and validated test set
- ✅ Pending-items view and Excel export/import cycle with native speakers
- ✅ Single-user auth, Playwright browser tests, Docker + Kamal deployment
