import Database from 'better-sqlite3';
import * as ExcelJS from 'exceljs';
import { runMigrations } from '../database/migrations';
import { pendingKey, PendingRepository } from './pending.repository';
import { shorten, YELLOW, elicitationRow, PendingService } from './pending.service';

describe('pendingKey', () => {
  it('removes accents and capitals but keeps ʉ and ñ', () => {
    expect(pendingKey(' Mamá ')).toBe('mama');
    expect(pendingKey('Ñandú')).toBe('ñandu');
    expect(pendingKey('kʉnʉnka')).toBe('kʉnʉnka');
    expect(pendingKey('kʉnʉnka')).not.toBe(pendingKey('kununka'));
  });
});

describe('PendingRepository', () => {
  let db: Database.Database;
  let repo: PendingRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    repo = new PendingRepository(db);
  });

  afterEach(() => db.close());

  it('recordRequested creates the pending item and adds to veces on later requests, keeping the first context', () => {
    repo.recordRequested('vecina', 'espanol', 'mi vecina cocina', '2026-10-01T00:00:00.000Z');
    repo.recordRequested('Vecina', 'espanol', 'otra frase', '2026-10-02T00:00:00.000Z');
    const [p] = repo.listAll();
    expect(p).toMatchObject({
      palabra: 'vecina',
      idioma: 'espanol',
      contexto: 'mi vecina cocina',
      vecesPedida: 2,
      estado: 'pendiente',
      origen: 'traductor',
      actualizadoEn: '2026-10-02T00:00:00.000Z',
    });
  });

  it('a resolved pending item that is requested again is reopened', () => {
    repo.recordRequested('ñame', 'espanol', null);
    expect(repo.markResolved('ñame')).toBe(true);
    expect(repo.listAll()[0].estado).toBe('resuelta');
    repo.recordRequested('ñame', 'espanol', null);
    expect(repo.listAll()[0]).toMatchObject({ estado: 'pendiente', vecesPedida: 2 });
  });

  it('recordFromElicitation only inserts if it did not exist and does not add to veces', () => {
    expect(repo.recordFromElicitation('hola', 'Hola, ¿cómo estás?')).toBe(true);
    expect(repo.recordFromElicitation('hola', 'otro contexto')).toBe(false);
    repo.recordRequested('agua', 'espanol', 'quiero agua');
    expect(repo.recordFromElicitation('agua', 'El agua está fría.')).toBe(false);
    expect(repo.listAll().find((p) => p.palabra === 'agua')).toMatchObject({ vecesPedida: 1, origen: 'traductor' });
    expect(repo.listAll().find((p) => p.palabra === 'hola')).toMatchObject({ vecesPedida: 1, origen: 'elicitacion' });
  });

  it('sorts by times requested descending and lists open ones without the resolved', () => {
    repo.recordRequested('uno', 'espanol', null, '2026-10-02T00:00:00.000Z');
    repo.recordRequested('dos', 'espanol', null, '2026-10-01T00:00:00.000Z');
    repo.recordRequested('dos', 'espanol', null, '2026-10-01T00:00:00.000Z');
    repo.recordRequested('tres', 'damana', null, '2026-10-01T00:00:00.000Z');
    repo.markResolved('tres', '2026-10-01T12:00:00.000Z');
    expect(repo.listAll().map((p) => p.palabra)).toEqual(['dos', 'uno', 'tres']);
    expect(repo.listOpen().map((p) => p.palabra)).toEqual(['dos', 'uno']);
  });

  it('markExported only changes the ones that are pending', () => {
    repo.recordRequested('a', 'espanol', null, '2026-10-02T00:00:00.000Z');
    repo.recordRequested('b', 'espanol', null, '2026-10-01T00:00:00.000Z');
    repo.markResolved('b', '2026-10-01T12:00:00.000Z');
    const ids = repo.listAll().map((p) => p.id);
    repo.markExported(ids, '2026-10-03T00:00:00.000Z');
    expect(repo.listAll().map((p) => [p.palabra, p.estado])).toEqual([
      ['a', 'exportada'],
      ['b', 'resuelta'],
    ]);
  });

  it('empty words are ignored', () => {
    repo.recordRequested('   ', 'espanol', null);
    expect(repo.listAll()).toEqual([]);
  });
});

describe('PendingService', () => {
  let db: Database.Database;
  let repo: PendingRepository;
  let service: PendingService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    repo = new PendingRepository(db);
    service = new PendingService(repo);
  });

  afterEach(() => db.close());

  it('acortar cuts at a word boundary and marks with «…»', () => {
    expect(shorten('hola mundo', 120)).toBe('hola mundo');
    expect(shorten('una frase bastante larga para el ejemplo', 20)).toBe('una frase bastante…');
  });

  it('elicitationRow: a Spanish pending item fills palabra_es/ejemplo_es; a Damana one fills palabra_dm/ejemplo_dm', () => {
    repo.recordRequested('vecina', 'espanol', 'mi vecina cocina');
    repo.recordRequested('kʉnʉnka', 'damana', 'kʉnʉnka nʉnka');
    const es = repo.listAll().find((p) => p.palabra === 'vecina')!;
    const dm = repo.listAll().find((p) => p.palabra === 'kʉnʉnka')!;
    expect(elicitationRow(es)).toMatchObject({
      id: `pend_${es.id}`,
      palabra_es: 'vecina',
      palabra_dm: '',
      ejemplo_es: 'mi vecina cocina',
      ejemplo_dm: '',
      notas: 'pedida 1 vez en el traductor',
    });
    expect(elicitationRow(dm)).toMatchObject({ palabra_es: '', palabra_dm: 'kʉnʉnka', ejemplo_dm: 'kʉnʉnka nʉnka' });
  });

  it('exportBatch generates the elicitation-format Excel, with the missing cells in yellow, and marks them exported', async () => {
    repo.recordRequested('vecina', 'espanol', 'mi vecina cocina en la casa');
    repo.recordRequested('vecina', 'espanol', null);
    repo.recordRequested('ñame', 'espanol', 'quiero ñame');

    const batch = await service.exportBatch(new Date('2026-10-03T12:00:00.000Z'));
    expect(batch.nombreArchivo).toBe('formato_elicitacion_pendientes_2026-10-03.xlsx');
    expect(batch.filas).toBe(2);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(batch.contenido as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('elicitacion')!;
    const headings = (sheet.getRow(1).values as string[]).slice(1);
    expect(headings).toEqual(['id', 'ambito', 'palabra_es', 'palabra_dm', 'ejemplo_es', 'ejemplo_dm', 'variante', 'notas']);
    const row2 = sheet.getRow(2);
    expect(row2.getCell(3).value).toBe('vecina'); // most requested first
    expect(row2.getCell(5).value).toBe('mi vecina cocina en la casa');
    expect(row2.getCell(4).value ?? '').toBe('');
    expect((row2.getCell(4).fill as ExcelJS.FillPattern).fgColor?.argb).toBe(YELLOW);
    expect((row2.getCell(6).fill as ExcelJS.FillPattern).fgColor?.argb).toBe(YELLOW);
    expect(sheet.getRow(3).getCell(3).value).toBe('ñame'); // the ñ intact
    expect(workbook.getWorksheet('instrucciones')).toBeDefined();

    expect(repo.listAll().map((p) => p.estado)).toEqual(['exportada', 'exportada']);
  });
});
