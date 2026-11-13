#!/usr/bin/env node
// Fetches the real corpus from the PRIVATE data repository and copies it over
// data/ before building (GitHub Actions, Render). The public repository
// only versions a sample corpus: the full corpus belongs to the
// Wiwa community and is not published (see DATA.md).
//
// Environment variables:
//   CORPUS_DATA_REPO       "owner/repo" of the private data repository.
//   CORPUS_DATA_TOKEN      token with read permission on that repo.
//   CORPUS_DATA_REQUIRED   "1" = fail if the corpus cannot be fetched
//                          (on deployment: better not to deploy than
//                          to publish the app with the sample corpus).
// The previous Spanish names (CORPUS_DATOS_*) are still accepted, so existing
// CI secrets keep working.
//
// Only runs in CI (CI=true or RENDER=true) or with --force: in a working
// copy it would overwrite the sample CSVs and the real corpus could end up in
// a commit. Locally, use CORPUS_DATA_DIR=/path/to/private-repo/data.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const env = (name, legacyName) => (process.env[name] ?? process.env[legacyName] ?? '').trim();

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = env('CORPUS_DATA_REPO', 'CORPUS_DATOS_REPO');
const token = env('CORPUS_DATA_TOKEN', 'CORPUS_DATOS_TOKEN');
const required = env('CORPUS_DATA_REQUIRED', 'CORPUS_DATOS_OBLIGATORIO') === '1';
const inCi = process.env.CI === 'true' || process.env.RENDER === 'true';
const force = process.argv.includes('--force');

function exitWith(message) {
  if (required) {
    console.error(`fetch-data: ${message}`);
    process.exit(1);
  }
  console.log(`fetch-data: ${message} Using the sample corpus.`);
  process.exit(0);
}

if (!repo || !token) {
  exitWith('CORPUS_DATA_REPO or CORPUS_DATA_TOKEN is missing.');
}
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error('fetch-data: CORPUS_DATA_REPO must have the form "owner/repo".');
  process.exit(1);
}
if (!inCi && !force) {
  console.error(
    'fetch-data: outside CI data/ is not overwritten. ' +
      'Use CORPUS_DATA_DIR locally, or --force if you know what you are doing.',
  );
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'corpus-data-'));
try {
  // The token travels in a header, not in the URL: that way it does not stay in the
  // clone's configuration or in git's error messages.
  const basicAuth = Buffer.from(`x-access-token:${token}`).toString('base64');
  try {
    execFileSync(
      'git',
      [
        '-c',
        `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basicAuth}`,
        'clone',
        '--depth',
        '1',
        '--quiet',
        `https://github.com/${repo}.git`,
        tmp,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch {
    // Not dumping stderr: it could repeat the header.
    console.error(`fetch-data: could not clone ${repo} (token without permission or missing repo?).`);
    process.exit(1);
  }

  // The private repository keeps the corpus in data/ (or in datos/, its
  // original Spanish folder name).
  const origin = ['data', 'datos'].map((name) => join(tmp, name)).find((dir) => existsSync(dir));
  if (!origin) {
    console.error(`fetch-data: ${repo} has no data/ folder.`);
    process.exit(1);
  }
  const target = join(root, 'data');
  cpSync(origin, target, { recursive: true, force: true });
  const copied = readdirSync(origin).filter((n) => !n.startsWith('.'));
  console.log(`fetch-data: ${copied.length} files copied from ${repo} to data/.`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
