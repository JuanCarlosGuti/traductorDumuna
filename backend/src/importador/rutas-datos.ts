import * as path from 'path';

/**
 * Resuelve la carpeta /datos del monorepo. Los scripts de workspace de npm
 * siempre se ejecutan con cwd en backend/, así que '../datos' es
 * determinista. CORPUS_DATOS_DIR permite sobreescribirla (tests, etc.).
 * La ruta nunca pasa por un shell, así que el espacio en el nombre del
 * proyecto no es problema.
 */
export function resolverDirDatos(): string {
  return (
    process.env.CORPUS_DATOS_DIR ?? path.resolve(process.cwd(), '..', 'datos')
  );
}

export function rutaDbPorDefecto(): string {
  return path.join(resolverDirDatos(), 'corpus.db');
}
