import Database from 'better-sqlite3';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CorpusRepository } from '../consulta/corpus.repository';
import { ejecutarMigraciones } from '../database/migraciones';
import { esFilaDePrueba, interpretarFila, planificarElicitacion } from '../importador/elicitacion';
import { leerLibro } from '../importador/leer-excel';
import { AMARILLO, COLUMNAS_ELICITACION } from '../pendientes/pendientes.service';
import { DudasService } from './dudas.service';
import { construirLibroDudas, HOJAS_DUDAS } from './libro-dudas';
import { construirLibroParadigmas, PARADIGMAS } from './paradigmas';

const argb = (celda: ExcelJS.Cell) => (celda.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;

describe('DudasService + doubts workbook', () => {
  let db: Database.Database;
  let servicio: DudasService;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    const vocab = db.prepare(
      'INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente) VALUES (?, ?, ?, ?, ?)',
    );
    vocab.run('Casa', 'Urraga', 'Casa', null, 'diccionario wiwa');
    vocab.run('Día', 'Dzuia', 'Tiempo', null, 'diccionario wiwa');
    vocab.run('Día', 'Dzwia', 'Tiempo', null, 'diccionario wiwa');
    vocab.run('Grande', 'Aikuia', 'Adjetivos', null, 'diccionario wiwa');
    vocab.run('Grande', 'Alkwega', 'Adjetivos', null, 'diccionario wiwa');
    vocab.run('Córtelo', 'Ako', 'Verbos', null, 'diccionario wiwa');
    vocab.run('lo cortó', 'Akó', 'Verbos', null, 'diccionario wiwa');
    vocab.run('tan', 'tan', 'Palabra frecuente', 'no hay forma para traducirlo', 'nativas 2026-10');
    const oracion = db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente, dominio)
       VALUES (?, ?, ?, ?, 'lfb', 'biblico')`,
    );
    oracion.run('o1', 'Urragamba nʉnka ingui', 'Está en la casa otra vez', 'aprobado');
    oracion.run('o2', 'nʉnka aikuia', 'es grande', 'aprobado');
    oracion.run('o3', 'nunka ingui urragamba ñingui', 'no es otra vez en la casa algo', 'revisar');
    db.prepare(
      `INSERT INTO reglas (tipo, forma, significado, disparador) VALUES ('sufijo', '-nzhe', 'posesivo', 'posesivo')`,
    ).run();
    servicio = new DudasService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('gathers in one report the doubts about spelling, synonyms, meanings and entries', () => {
    const informe = servicio.generar();

    const nunka = informe.escritura.find((g) => g.formas.some((f) => f.forma === 'nunka'))!;
    expect(nunka.formas.map((f) => [f.forma, f.frecuencia])).toEqual([
      ['nʉnka', 2],
      ['nunka', 1],
    ]);
    // the example comes from a short approved sentence, never from a «revisar» one
    expect(nunka.formas[0].ejemplo).toEqual({ damana: 'nʉnka aikuia', espanol: 'es grande' });

    const dia = informe.escritura.find((g) => g.formas.some((f) => f.forma === 'dzwia'))!;
    expect(dia.tipo).toBe('w / u');
    expect(dia.formas[0].significados).toEqual(['Día']);

    expect(informe.sinonimos.map((g) => g.espanol)).toEqual(['Grande']);
    expect(informe.sinonimos[0].opciones.map((o) => [o.damana, o.frecuencia])).toEqual([
      ['Aikuia', 1],
      ['Alkwega', 0],
    ]);
    expect(informe.polisemia).toEqual([expect.objectContaining({ clave: 'ako', soloTilde: true })]);
    expect(informe.dudosas.map((d) => d.entrada.espanol)).toEqual(['tan']);
  });

  it('does not modify any corpus data', () => {
    const antes = db.prepare('SELECT COUNT(*) AS n FROM vocabulario').get();
    servicio.generar();
    expect(db.prepare('SELECT COUNT(*) AS n FROM vocabulario').get()).toEqual(antes);
    expect(db.prepare("SELECT damana FROM vocabulario WHERE espanol = 'tan'").get()).toEqual({ damana: 'tan' });
  });

  it('the workbook has one sheet per kind of doubt, with the answer cells in yellow', async () => {
    const libro = construirLibroDudas(servicio.generar(), new Date('2026-10-05T12:00:00.000Z'));
    expect(libro.worksheets.map((h) => h.name)).toEqual(Object.values(HOJAS_DUDAS));

    const escritura = libro.getWorksheet(HOJAS_DUDAS.escritura)!;
    const filaNunka = escritura
      .getRows(2, escritura.rowCount - 1)!
      .find((f) => f.getCell(3).value === 'nʉnka')!;
    expect(filaNunka.getCell(5).value).toBe('nunka'); // ʉ and u, side by side
    expect(filaNunka.getCell(4).value).toBe(2);
    expect(argb(filaNunka.getCell(14))).toBe(AMARILLO); // which is the correct form?
    expect(argb(filaNunka.getCell(3))).toBeUndefined();

    const polisemia = libro.getWorksheet(HOJAS_DUDAS.polisemia)!;
    expect(polisemia.getRow(2).getCell(5).value).toBe('solo cambia la tilde');

    // survives being saved and reopened
    const copia = new ExcelJS.Workbook();
    await copia.xlsx.load((await libro.xlsx.writeBuffer()) as ExcelJS.Buffer);
    expect(copia.worksheets).toHaveLength(6);
    expect(copia.getWorksheet(HOJAS_DUDAS.instrucciones)!.getRow(1).getCell(1).value).toContain('2026-10-05');
  });
});

describe('grammar batch (paradigms)', () => {
  it('has unique and stable ids, with variants of the elicitation format', () => {
    expect(PARADIGMAS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(PARADIGMAS.map((p) => p.id)).size).toBe(PARADIGMAS.length);
    expect(PARADIGMAS[0]).toMatchObject({ id: 'g001', ejemploEs: 'Yo como yuca.' });
    const variantes = new Set(PARADIGMAS.map((p) => p.variante));
    for (const v of variantes) {
      expect(['', 'pasado', 'futuro', 'negativo', 'plural', 'pregunta']).toContain(v);
    }
    // covers the six features that trigger rules
    expect(variantes.size).toBe(6);
  });

  it('the workbook is read with the same reader as the importer and only asks for ejemplo_dm', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paradigmas-'));
    try {
      const ruta = path.join(dir, 'formato_elicitacion_lote2_gramatica.xlsx');
      const libro = construirLibroParadigmas();
      const hoja = libro.getWorksheet('elicitacion')!;
      expect((hoja.getRow(1).values as string[]).slice(1)).toEqual([...COLUMNAS_ELICITACION]);
      expect(argb(hoja.getRow(2).getCell(6))).toBe(AMARILLO); // ejemplo_dm
      expect(argb(hoja.getRow(2).getCell(4))).toBeUndefined(); // palabra_dm is not requested
      await libro.xlsx.writeFile(ruta);

      const leida = (await leerLibro(ruta)).find((h) => h.nombre === 'elicitacion')!;
      expect(leida.filas).toHaveLength(PARADIGMAS.length);
      expect(leida.filas[0]).toMatchObject({ id: 'g001', ambito: 'gramatica', ejemplo_es: 'Yo como yuca.' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a filled row produces an everyday sentence and no word or pending item (with ʉ from u+)', () => {
    const normal = PARADIGMAS.find((p) => !esFilaDePrueba(p.id))!;
    const fila = interpretarFila(
      { id: normal.id, ambito: 'gramatica', palabra_es: '', palabra_dm: '', ejemplo_es: normal.ejemploEs, ejemplo_dm: 'ra irrugwa zhu+nka', variante: normal.variante, notas: normal.etiqueta },
      'formato_elicitacion_lote2_gramatica.xlsx',
    )!;
    const plan = planificarElicitacion([fila]);
    expect(plan.oraciones).toEqual([
      { idExterno: `elic_${normal.id}`, damana: 'ra irrugwa zhʉnka', espanol: normal.ejemploEs, fuente: 'elicitacion' },
    ]);
    expect(plan.vocabulario).toEqual([]);
    expect(plan.pendientes).toEqual([]);
  });

  it('unfilled it leaves nothing: neither sentences nor pending items', () => {
    const filas = PARADIGMAS.map(
      (p) => interpretarFila({ id: p.id, ambito: 'gramatica', palabra_es: '', ejemplo_es: p.ejemploEs }, 'x')!,
    );
    const plan = planificarElicitacion(filas);
    expect(plan.oraciones).toEqual([]);
    expect(plan.pendientes).toEqual([]);
    expect(plan.pruebas).toEqual([]);
  });
});
