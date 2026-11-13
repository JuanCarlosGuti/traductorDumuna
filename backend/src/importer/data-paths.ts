import * as path from 'path';
import { readEnv } from '../common/env';

/**
 * Resolves the monorepo's /data folder. npm workspace scripts
 * always run with cwd in backend/, so '../data' is
 * deterministic. CORPUS_DATA_DIR lets it be overridden (tests, etc.).
 * The path never goes through a shell, so the space in the project
 * name is not a problem.
 */
export function resolveDataDir(): string {
  return (
    readEnv('CORPUS_DATA_DIR') ?? path.resolve(process.cwd(), '..', 'data')
  );
}

export function defaultDbPath(): string {
  return path.join(resolveDataDir(), 'corpus.db');
}
