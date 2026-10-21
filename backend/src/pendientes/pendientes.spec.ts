import Database from 'better-sqlite3';
import * as ExcelJS from 'exceljs';
import { ejecutarMigraciones } from '../database/migraciones';
import { clavePendiente, PendientesRepository } from './pendientes.repository';
import { acortar, AMARILLO, filaDeElicitacion, PendientesService } from './pendientes.service';

describe('clavePendiente', () => {
  it('quita tildes y mayúsculas pero conserva ʉ y ñ', () => {
    expect(clavePendiente(' Mamá ')).toBe('mama');
    expect(clavePendiente('Ñandú')).toBe('ñandu');
    expect(clavePendiente('kʉnʉnka')).toBe('kʉnʉnka');
    expect(clavePendiente('kʉnʉnka')).not.toBe(clavePendiente('kununka'));
  });
});

describe('PendientesRepository', () => {
  let db: Database.Database;
  let repo: PendientesRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    repo = new PendientesRepository(db);
  });

  afterEach(() => db.close());

  it('registrarPedida crea la pendiente y suma veces en las siguientes, conservando el primer contexto', () => {
    repo.registrarPedida('vecina', 'espanol', 'mi vecina cocina', '2026-10-01T00:00:00.000Z');
    repo.registrarPedida('Vecina', 'espanol', 'otra frase', '2026-10-02T00:00:00.000Z');
    const [p] = repo.listar();
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

  it('una pendiente resuelta que se vuelve a pedir se reabre', () => {
    repo.registrarPedida('ñame', 'espanol', null);
    expect(repo.marcarResuelta('ñame')).toBe(true);
    expect(repo.listar()[0].estado).toBe('resuelta');
    repo.registrarPedida('ñame', 'espanol', null);
    expect(repo.listar()[0]).toMatchObject({ estado: 'pendiente', vecesPedida: 2 });
  });

  it('registrarDeElicitacion solo inserta si no existía y no suma veces', () => {
    expect(repo.registrarDeElicitacion('hola', 'Hola, ¿cómo estás?')).toBe(true);
    expect(repo.registrarDeElicitacion('hola', 'otro contexto')).toBe(false);
    repo.registrarPedida('agua', 'espanol', 'quiero agua');
    expect(repo.registrarDeElicitacion('agua', 'El agua está fría.')).toBe(false);
    expect(repo.listar().find((p) => p.palabra === 'agua')).toMatchObject({ vecesPedida: 1, origen: 'traductor' });
    expect(repo.listar().find((p) => p.palabra === 'hola')).toMatchObject({ vecesPedida: 1, origen: 'elicitacion' });
  });

  it('ordena por veces pedida descendente y lista abiertas sin las resueltas', () => {
    repo.registrarPedida('uno', 'espanol', null, '2026-10-02T00:00:00.000Z');
    repo.registrarPedida('dos', 'espanol', null, '2026-10-01T00:00:00.000Z');
    repo.registrarPedida('dos', 'espanol', null, '2026-10-01T00:00:00.000Z');
    repo.registrarPedida('tres', 'damana', null, '2026-10-01T00:00:00.000Z');
    repo.marcarResuelta('tres', '2026-10-01T12:00:00.000Z');
    expect(repo.listar().map((p) => p.palabra)).toEqual(['dos', 'uno', 'tres']);
    expect(repo.listarAbiertas().map((p) => p.palabra)).toEqual(['dos', 'uno']);
  });

  it('marcarExportadas solo cambia las que están pendientes', () => {
    repo.registrarPedida('a', 'espanol', null, '2026-10-02T00:00:00.000Z');
    repo.registrarPedida('b', 'espanol', null, '2026-10-01T00:00:00.000Z');
    repo.marcarResuelta('b', '2026-10-01T12:00:00.000Z');
    const ids = repo.listar().map((p) => p.id);
    repo.marcarExportadas(ids, '2026-10-03T00:00:00.000Z');
    expect(repo.listar().map((p) => [p.palabra, p.estado])).toEqual([
      ['a', 'exportada'],
      ['b', 'resuelta'],
    ]);
  });

  it('palabras vacías se ignoran', () => {
    repo.registrarPedida('   ', 'espanol', null);
    expect(repo.listar()).toEqual([]);
  });
});

describe('PendientesService', () => {
  let db: Database.Database;
  let repo: PendientesRepository;
  let servicio: PendientesService;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    repo = new PendientesRepository(db);
    servicio = new PendientesService(repo);
  });

  afterEach(() => db.close());

  it('acortar corta en límite de palabra y marca con «…»', () => {
    expect(acortar('hola mundo', 120)).toBe('hola mundo');
    expect(acortar('una frase bastante larga para el ejemplo', 20)).toBe('una frase bastante…');
  });

  it('filaDeElicitacion: pendiente española llena palabra_es/ejemplo_es; damana llena palabra_dm/ejemplo_dm', () => {
    repo.registrarPedida('vecina', 'espanol', 'mi vecina cocina');
    repo.registrarPedida('kʉnʉnka', 'damana', 'kʉnʉnka nʉnka');
    const es = repo.listar().find((p) => p.palabra === 'vecina')!;
    const dm = repo.listar().find((p) => p.palabra === 'kʉnʉnka')!;
    expect(filaDeElicitacion(es)).toMatchObject({
      id: `pend_${es.id}`,
      palabra_es: 'vecina',
      palabra_dm: '',
      ejemplo_es: 'mi vecina cocina',
      ejemplo_dm: '',
      notas: 'pedida 1 vez en el traductor',
    });
    expect(filaDeElicitacion(dm)).toMatchObject({ palabra_es: '', palabra_dm: 'kʉnʉnka', ejemplo_dm: 'kʉnʉnka nʉnka' });
  });

  it('exportarLote genera el Excel del formato de elicitación, en amarillo lo que falta, y marca exportadas', async () => {
    repo.registrarPedida('vecina', 'espanol', 'mi vecina cocina en la casa');
    repo.registrarPedida('vecina', 'espanol', null);
    repo.registrarPedida('ñame', 'espanol', 'quiero ñame');

    const lote = await servicio.exportarLote(new Date('2026-10-03T12:00:00.000Z'));
    expect(lote.nombreArchivo).toBe('formato_elicitacion_pendientes_2026-10-03.xlsx');
    expect(lote.filas).toBe(2);

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(lote.contenido as unknown as ExcelJS.Buffer);
    const hoja = libro.getWorksheet('elicitacion')!;
    const encabezados = (hoja.getRow(1).values as string[]).slice(1);
    expect(encabezados).toEqual(['id', 'ambito', 'palabra_es', 'palabra_dm', 'ejemplo_es', 'ejemplo_dm', 'variante', 'notas']);
    const fila2 = hoja.getRow(2);
    expect(fila2.getCell(3).value).toBe('vecina'); // la más pedida primero
    expect(fila2.getCell(5).value).toBe('mi vecina cocina en la casa');
    expect(fila2.getCell(4).value ?? '').toBe('');
    expect((fila2.getCell(4).fill as ExcelJS.FillPattern).fgColor?.argb).toBe(AMARILLO);
    expect((fila2.getCell(6).fill as ExcelJS.FillPattern).fgColor?.argb).toBe(AMARILLO);
    expect(hoja.getRow(3).getCell(3).value).toBe('ñame'); // la ñ intacta
    expect(libro.getWorksheet('instrucciones')).toBeDefined();

    expect(repo.listar().map((p) => p.estado)).toEqual(['exportada', 'exportada']);
  });
});
