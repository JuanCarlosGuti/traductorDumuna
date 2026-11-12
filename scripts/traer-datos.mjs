#!/usr/bin/env node
// Fetches the real corpus from the PRIVATE data repository and copies it over
// datos/ before building (GitHub Actions, Render). The public repository
// only versions a sample corpus: the full corpus belongs to the
// Wiwa community and is not published (see DATA.md).
//
// Environment variables:
//   CORPUS_DATOS_REPO         "owner/repo" of the private data repository.
//   CORPUS_DATOS_TOKEN        token with read permission on that repo.
//   CORPUS_DATOS_OBLIGATORIO  "1" = fail if the corpus cannot be fetched
//                             (on deployment: better not to deploy than
//                             to publish the app with the sample corpus).
//
// Only runs in CI (CI=true or RENDER=true) or with --forzar: in a working
// copy it would overwrite the sample CSVs and the real corpus could end up in
// a commit. Locally, use CORPUS_DATOS_DIR=/path/to/private-repo/datos.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = (process.env.CORPUS_DATOS_REPO ?? '').trim();
const token = (process.env.CORPUS_DATOS_TOKEN ?? '').trim();
const obligatorio = process.env.CORPUS_DATOS_OBLIGATORIO === '1';
const enCi = process.env.CI === 'true' || process.env.RENDER === 'true';
const forzar = process.argv.includes('--forzar');

function salir(mensaje) {
  if (obligatorio) {
    console.error(`traer-datos: ${mensaje}`);
    process.exit(1);
  }
  console.log(`traer-datos: ${mensaje} Se usa el corpus de muestra.`);
  process.exit(0);
}

if (!repo || !token) {
  salir('faltan CORPUS_DATOS_REPO o CORPUS_DATOS_TOKEN.');
}
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error('traer-datos: CORPUS_DATOS_REPO debe tener la forma "dueño/repo".');
  process.exit(1);
}
if (!enCi && !forzar) {
  console.error(
    'traer-datos: fuera de CI no se sobreescribe datos/. ' +
      'Usa CORPUS_DATOS_DIR en local, o --forzar si sabes lo que haces.',
  );
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'corpus-datos-'));
try {
  // The token travels in a header, not in the URL: that way it does not stay in the
  // clone's configuration or in git's error messages.
  const basica = Buffer.from(`x-access-token:${token}`).toString('base64');
  try {
    execFileSync(
      'git',
      [
        '-c',
        `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basica}`,
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
    console.error(
      `traer-datos: no se pudo clonar ${repo} (¿token sin permiso o repo inexistente?).`,
    );
    process.exit(1);
  }

  const origen = join(tmp, 'datos');
  if (!existsSync(origen)) {
    console.error(`traer-datos: ${repo} no tiene la carpeta datos/.`);
    process.exit(1);
  }
  const destino = join(raiz, 'datos');
  cpSync(origen, destino, { recursive: true, force: true });
  const copiados = readdirSync(origen).filter((n) => !n.startsWith('.'));
  console.log(
    `traer-datos: ${copiados.length} archivos copiados desde ${repo} a datos/.`,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
