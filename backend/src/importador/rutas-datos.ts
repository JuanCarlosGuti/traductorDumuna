import * as path from 'path';

/**
 * Resolves the monorepo's /datos folder. npm workspace scripts
 * always run with cwd in backend/, so '../datos' is
 * deterministic. CORPUS_DATOS_DIR lets it be overridden (tests, etc.).
 * The path never goes through a shell, so the space in the project
 * name is not a problem.
 */
export function resolverDirDatos(): string {
  return (
    process.env.CORPUS_DATOS_DIR ?? path.resolve(process.cwd(), '..', 'datos')
  );
}

export function rutaDbPorDefecto(): string {
  return path.join(resolverDirDatos(), 'corpus.db');
}
