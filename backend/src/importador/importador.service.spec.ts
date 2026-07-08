import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ejecutarMigraciones } from '../database/migraciones';
import { ImportadorService } from './importador.service';

const BOM = String.fromCharCode(0xfeff);

const CSV_CAPITULOS =
  BOM +
  'capitulo,titulo_damana,titulo_espanol,damana,espanol\n' +
  '1,Kunkujshinaga go,Dios hace,"nʉnka kʉñingui gontka\nñingui tua ukurra",Texto en español\n' +
  '2,Ñingui shkua,Otro título,"¿Buie tshijkoshkandzina? shke\'ta 123",Otro texto\n';

const CSV_FRASES =
  BOM +
  'fuente,damana,espanol,notas\n' +
  'Prueba,¿Masheshishka nanu?,¿Sabes leer?,\n' +
  'Prueba,Jehovága nʉnka,Frase con tilde,revisar\n';

const CSV_VOCABULARIO =
  BOM +
  'espanol,damana,notas\n' +
  'tiene,kʉnʉnka,\n' +
  'año,ñandua,con ñ\n';

describe('ImportadorService', () => {
  let dirTmp: string;
  let db: Database.Database;
  let servicio: ImportadorService;

  beforeAll(() => {
    dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-test-'));
    fs.writeFileSync(path.join(dirTmp, 'corpus_capitulos.csv'), CSV_CAPITULOS, 'utf8');
    fs.writeFileSync(path.join(dirTmp, 'corpus_frases.csv'), CSV_FRASES, 'utf8');
    fs.writeFileSync(path.join(dirTmp, 'corpus_vocabulario.csv'), CSV_VOCABULARIO, 'utf8');
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
    expect(stats.capitulos).toBe(2);
    expect(stats.frases).toBe(2);
    expect(stats.vocabulario).toBe(2);
    expect(stats.totalTokens).toBeGreaterThan(0);
  });

  it('maneja celdas multilínea entre comillas (capítulo 1 completo)', () => {
    servicio.importarTodo(dirTmp);
    const fila = db
      .prepare('SELECT damana FROM capitulos WHERE capitulo = 1')
      .get() as { damana: string };
    expect(fila.damana).toContain('\n');
    expect(fila.damana).toContain('ñingui tua ukurra');
  });

  it('tokeniza conservando ʉ (nʉnka, no nunka)', () => {
    servicio.importarTodo(dirTmp);
    const conU = db
      .prepare("SELECT COUNT(*) AS n FROM tokens_damana WHERE palabra_normalizada = 'nʉnka'")
      .get() as { n: number };
    const degradada = db
      .prepare("SELECT COUNT(*) AS n FROM tokens_damana WHERE palabra_normalizada = 'nunka'")
      .get() as { n: number };
    expect(conU.n).toBeGreaterThan(0);
    expect(degradada.n).toBe(0);
  });

  it('tokeniza conservando ñ (ñingui, no ningui)', () => {
    servicio.importarTodo(dirTmp);
    const palabras = db
      .prepare('SELECT DISTINCT palabra_normalizada AS p FROM tokens_damana')
      .all()
      .map((f: any) => f.p);
    expect(palabras).toContain('ñingui');
    expect(palabras).not.toContain('ningui');
  });

  it('excluye números y signos ¿? de los tokens', () => {
    servicio.importarTodo(dirTmp);
    const raros = db
      .prepare(
        `SELECT COUNT(*) AS n FROM tokens_damana
         WHERE palabra_normalizada LIKE '%1%'
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

  it('normaliza tildes en tokens (Jehovága → jehovaga)', () => {
    servicio.importarTodo(dirTmp);
    const fila = db
      .prepare(
        "SELECT palabra_original FROM tokens_damana WHERE palabra_normalizada = 'jehovaga'",
      )
      .get() as { palabra_original: string };
    expect(fila.palabra_original).toBe('Jehovága');
  });

  it('tokeniza también el título damana de los capítulos', () => {
    servicio.importarTodo(dirTmp);
    const fila = db
      .prepare(
        `SELECT COUNT(*) AS n FROM tokens_damana
         WHERE palabra_normalizada = 'kunkujshinaga' AND tabla_origen = 'capitulos'`,
      )
      .get() as { n: number };
    expect(fila.n).toBe(1);
  });

  it('es idempotente: importar dos veces no duplica nada', () => {
    const primera = servicio.importarTodo(dirTmp);
    const segunda = servicio.importarTodo(dirTmp);
    expect(segunda).toEqual(primera);
  });

  it('id_origen referencia rowids válidos de la tabla origen', () => {
    servicio.importarTodo(dirTmp);
    const huerfanos = db
      .prepare(
        `SELECT COUNT(*) AS n FROM tokens_damana t
         WHERE t.tabla_origen = 'vocabulario'
           AND NOT EXISTS (SELECT 1 FROM vocabulario v WHERE v.rowid = t.id_origen)`,
      )
      .get() as { n: number };
    expect(huerfanos.n).toBe(0);
  });
});
