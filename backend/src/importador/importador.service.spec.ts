import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ejecutarMigraciones } from '../database/migraciones';
import { ImportadorService } from './importador.service';

const BOM = String.fromCharCode(0xfeff);

const CSV_ORACIONES =
  BOM +
  'id,damana,espanol,estado,fuente\n' +
  'o1,"nʉnka kʉñingui gontka\nñingui tua ukurra",Dios hizo el agua,aprobado,lfb\n' +
  'o2,¿Zhinzhoma nanu? 42,¿Conoces? cuarenta y dos,revisar,lfb\n';

const CSV_FRASES =
  BOM +
  'fuente,damana,espanol,notas\n' +
  "Prueba,shke'ta ukurra,anda ligero,\n";

const CSV_VOCABULARIO =
  BOM +
  'espanol,damana,categoria,notas,fuente\n' +
  'agua,nʉnka,Otros,,diccionario wiwa\n' +
  'año,ñandua,Tiempo / días / clima,con ñ,diccionario wiwa\n';

const CSV_CONJUGACIONES =
  BOM +
  'damana,espanol,lema,fuente,notas\n' +
  'nujkunʉnanka,yo tuve,tener,VERBO TENER.docx,\n' +
  'mujkunʉnanka,tú tuviste,tener,VERBO TENER.docx,\n';

describe('ImportadorService (corpus v3)', () => {
  let dirTmp: string;
  let db: Database.Database;
  let servicio: ImportadorService;

  beforeAll(() => {
    dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-test-'));
    fs.writeFileSync(path.join(dirTmp, 'corpus_oraciones.csv'), CSV_ORACIONES, 'utf8');
    fs.writeFileSync(path.join(dirTmp, 'corpus_frases_v2.csv'), CSV_FRASES, 'utf8');
    fs.writeFileSync(path.join(dirTmp, 'corpus_vocabulario_v2.csv'), CSV_VOCABULARIO, 'utf8');
    fs.writeFileSync(path.join(dirTmp, 'corpus_conjugaciones.csv'), CSV_CONJUGACIONES, 'utf8');
  });

  afterAll(() => {
    fs.rmSync(dirTmp, { recursive: true, force: true });
  });

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    servicio = new ImportadorService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('importa los conteos correctos de cada CSV', () => {
    const stats = servicio.importarTodo(dirTmp);
    expect(stats.oraciones).toBe(2);
    expect(stats.frases).toBe(1);
    expect(stats.vocabulario).toBe(2);
    expect(stats.conjugaciones).toBe(2);
    expect(stats.totalTokens).toBeGreaterThan(0);
  });

  it('guarda id_externo y estado de las oraciones (celdas multilínea intactas)', () => {
    servicio.importarTodo(dirTmp);
    const filas = db
      .prepare('SELECT id_externo, damana, estado FROM oraciones ORDER BY rowid')
      .all() as any[];
    expect(filas[0].id_externo).toBe('o1');
    expect(filas[0].estado).toBe('aprobado');
    expect(filas[0].damana).toContain('\n');
    expect(filas[1].estado).toBe('revisar');
  });

  it('guarda categoria y fuente del vocabulario', () => {
    servicio.importarTodo(dirTmp);
    const fila = db
      .prepare('SELECT categoria, fuente FROM vocabulario WHERE damana = ?')
      .get('nʉnka') as any;
    expect(fila.categoria).toBe('Otros');
    expect(fila.fuente).toBe('diccionario wiwa');
  });

  it('guarda las conjugaciones con su lema', () => {
    servicio.importarTodo(dirTmp);
    const filas = db
      .prepare("SELECT damana FROM conjugaciones WHERE lema = 'tener' ORDER BY rowid")
      .all() as any[];
    expect(filas.map((f) => f.damana)).toEqual(['nujkunʉnanka', 'mujkunʉnanka']);
  });

  it('tokeniza las cuatro fuentes conservando ʉ y ñ', () => {
    servicio.importarTodo(dirTmp);
    const origenes = db
      .prepare('SELECT DISTINCT tabla_origen AS t FROM tokens_damana ORDER BY t')
      .all()
      .map((f: any) => f.t);
    expect(origenes).toEqual(['conjugaciones', 'frases', 'oraciones', 'vocabulario']);

    const palabras = db
      .prepare('SELECT DISTINCT palabra_normalizada AS p FROM tokens_damana')
      .all()
      .map((f: any) => f.p);
    expect(palabras).toContain('nʉnka');
    expect(palabras).toContain('ñingui');
    expect(palabras).toContain('nujkunʉnanka');
    expect(palabras).not.toContain('nunka');
    expect(palabras).not.toContain('ningui');
  });

  it('excluye números y signos ¿? de los tokens', () => {
    servicio.importarTodo(dirTmp);
    const raros = db
      .prepare(
        `SELECT COUNT(*) AS n FROM tokens_damana
         WHERE palabra_normalizada LIKE '%4%'
            OR palabra_normalizada LIKE '%¿%'
            OR palabra_normalizada LIKE '%?%'`,
      )
      .get() as { n: number };
    expect(raros.n).toBe(0);
  });

  it('conserva apóstrofes internos en los tokens', () => {
    servicio.importarTodo(dirTmp);
    const fila = db
      .prepare('SELECT COUNT(*) AS n FROM tokens_damana WHERE palabra_original = ?')
      .get("shke'ta") as { n: number };
    expect(fila.n).toBe(1);
  });

  it('es idempotente: importar dos veces no duplica nada', () => {
    const primera = servicio.importarTodo(dirTmp);
    const segunda = servicio.importarTodo(dirTmp);
    expect(segunda).toEqual(primera);
  });

  it('no toca el progreso SRS al reimportar', () => {
    db.prepare(
      `INSERT INTO progreso_srs (palabra, repeticiones, factor_facilidad, intervalo_dias, proxima_revision, actualizado_en)
       VALUES ('nʉnka', 2, 2.5, 6, '2026-07-01T00:00:00.000Z', '2026-06-25T00:00:00.000Z')`,
    ).run();
    servicio.importarTodo(dirTmp);
    const fila = db
      .prepare('SELECT repeticiones FROM progreso_srs WHERE palabra = ?')
      .get('nʉnka') as { repeticiones: number };
    expect(fila.repeticiones).toBe(2);
  });

  it('id_origen referencia rowids válidos de la tabla origen', () => {
    servicio.importarTodo(dirTmp);
    const huerfanos = db
      .prepare(
        `SELECT COUNT(*) AS n FROM tokens_damana t
         WHERE t.tabla_origen = 'conjugaciones'
           AND NOT EXISTS (SELECT 1 FROM conjugaciones c WHERE c.rowid = t.id_origen)`,
      )
      .get() as { n: number };
    expect(huerfanos.n).toBe(0);
  });
});
