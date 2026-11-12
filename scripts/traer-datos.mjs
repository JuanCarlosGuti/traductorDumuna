#!/usr/bin/env node
// Trae el corpus real desde el repositorio PRIVADO de datos y lo copia sobre
// datos/ antes de construir (GitHub Actions, Render). El repositorio público
// solo versiona un corpus de muestra: el corpus completo pertenece a la
// comunidad wiwa y no se publica (ver DATA.md).
//
// Variables de entorno:
//   CORPUS_DATOS_REPO         "dueño/repo" del repositorio privado de datos.
//   CORPUS_DATOS_TOKEN        token con permiso de lectura sobre ese repo.
//   CORPUS_DATOS_OBLIGATORIO  "1" = fallar si no se puede traer el corpus
//                             (en el despliegue: mejor no desplegar que
//                             publicar la app con el corpus de muestra).
//
// Solo corre en CI (CI=true o RENDER=true) o con --forzar: en una copia de
// trabajo sobreescribiría los CSV de muestra y el corpus real podría acabar en
// un commit. En local, usar CORPUS_DATOS_DIR=/ruta/al/repo-privado/datos.
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
  // El token viaja en una cabecera, no en la URL: así no queda en la
  // configuración del clon ni en los mensajes de error de git.
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
    // Sin volcar stderr: podría repetir la cabecera.
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
