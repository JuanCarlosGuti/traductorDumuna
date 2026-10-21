import Database from 'better-sqlite3';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ejecutarMigraciones } from '../database/migraciones';
import { PendientesRepository } from '../pendientes/pendientes.repository';
import { esFilaDePrueba } from './elicitacion';
import { ImportadorService } from './importador.service';
import { leerPruebas } from './pruebas-csv';

const BOM = String.fromCharCode(0xfeff);
const U_DIERESIS = String.fromCharCode(0x00fc); // ü — apaño de Word para ʉ

const CSV_ORACIONES =
  BOM +
  'id,damana,espanol,estado,fuente\n' +
  'o1,"nʉnka kʉñingui gontka\nñingui tua ukurra",Dios hizo el agua,aprobado,lfb oraciones\n' +
  'o2,¿Zhinzhoma nanu? 42,¿Conoces? cuarenta y dos,revisar,lfb oraciones\n';

const CSV_FRASES =
  BOM +
  'fuente,damana,espanol,notas\n' +
  "Prueba,shke'ta ukurra,anda ligero,\n" +
  `Prueba,bug${U_DIERESIS}i we ugunga,en la casa de arriba,\n`;

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

const ENCABEZADOS_ELICITACION = [
  'id', 'ambito', 'palabra_es', 'palabra_dm', 'ejemplo_es', 'ejemplo_dm', 'variante', 'notas',
];

// Los ids se eligen con la misma función que usa el importador: así el test
// no depende de qué ids concretos caen en el 10 % reservado para pruebas.
const IDS = Array.from({ length: 300 }, (_, i) => String(i + 1));
const ID_PRUEBA = IDS.find(esFilaDePrueba)!;
const [ID_AGUA, ID_VECINA, ID_PINGUINO, ID_HOLA] = IDS.filter((id) => !esFilaDePrueba(id));

const LOTE_1 = [
  [ID_AGUA, 'naturaleza', 'agua', `n${U_DIERESIS}nka`, 'El agua está fría.', `nu+nka se n${U_DIERESIS}ka`, '', ''],
  [ID_VECINA, 'familia', 'vecina', '', 'Mi vecina cocina.', '', '', 'registrado antes: ? (confirmar)'],
  [ID_PINGUINO, 'otro', 'pingüino', 'pingüino', 'El pingüino nada.', 'pingüino senu', '', ''],
  [ID_PRUEBA, 'casa', 'casa', 'Urraga', 'Mi casa es grande.', 'Ranzhe urraga aikuia', '', ''],
  [ID_HOLA, 'saludos', 'hola', 'Zungui', 'Hola, ¿cómo estás?', '', 'pregunta', ''],
];

const LOTE_2 = [
  [ID_VECINA, 'familia', 'vecina', 'anzhirru', 'Mi vecina cocina.', 'ranzhe anzhirru duzhi', '', ''],
];

async function escribirExcel(
  ruta: string,
  hojas: { nombre: string; filas: (string | number)[][] }[],
): Promise<void> {
  const libro = new ExcelJS.Workbook();
  for (const hoja of hojas) {
    const ws = libro.addWorksheet(hoja.nombre);
    hoja.filas.forEach((fila) => ws.addRow(fila));
  }
  await libro.xlsx.writeFile(ruta);
}

function escribirCsvs(dir: string): void {
  fs.writeFileSync(path.join(dir, 'corpus_oraciones.csv'), CSV_ORACIONES, 'utf8');
  fs.writeFileSync(path.join(dir, 'corpus_frases_v2.csv'), CSV_FRASES, 'utf8');
  fs.writeFileSync(path.join(dir, 'corpus_vocabulario_v3.csv'), CSV_VOCABULARIO, 'utf8');
  fs.writeFileSync(path.join(dir, 'corpus_conjugaciones.csv'), CSV_CONJUGACIONES, 'utf8');
}

async function escribirReglas(dir: string): Promise<void> {
  await escribirExcel(path.join(dir, 'reglas_damana.xlsx'), [
    {
      nombre: 'reglas',
      filas: [
        ['tipo de regla', 'forma (sufijo/partícula)', 'qué hace / significado', 'ejemplo: palabra base', 'ejemplo: palabra con la regla', 'traducción del ejemplo', 'notas'],
        ['sufijo', '-ndzina', 'pluraliza sustantivos', 'terrua (hombre)', 'terruandzina', 'hombres', ''],
        ['sufijo', '-nzhe', 'posesivo / "de"', 'Kunkujshina (Dios)', 'Kunkujshinanzhe', 'de Dios', 'confirmar'],
        ['', '', '', '', '', '', ''],
      ],
    },
    {
      nombre: 'nombres propios',
      filas: [
        ['como aparece en damana', 'nombre en español', '¿se escribe igual? (sí/no)', 'otras grafías vistas', 'notas'],
        ['Jehová', 'Jehová', 'sí', 'Jehova', ''],
        ['faraón', 'faraón', 'sí', 'Faraón', ''],
      ],
    },
  ]);
}

async function escribirLote(dir: string, nombre: string, filas: string[][]): Promise<void> {
  await escribirExcel(path.join(dir, nombre), [
    { nombre: 'instrucciones', filas: [['LOTE DE PRUEBA'], ['Solo se llenan las columnas amarillas.']] },
    { nombre: 'elicitacion', filas: [ENCABEZADOS_ELICITACION, ...filas] },
  ]);
}

describe('ImportadorService (corpus v3 + reglas + elicitación)', () => {
  let dirTmp: string;
  let db: Database.Database;
  let servicio: ImportadorService;

  beforeAll(async () => {
    dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-test-'));
    escribirCsvs(dirTmp);
    await escribirReglas(dirTmp);
    await escribirLote(dirTmp, 'formato_elicitacion_lote1.xlsx', LOTE_1);
  });

  afterAll(() => {
    fs.rmSync(dirTmp, { recursive: true, force: true });
  });

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    servicio = new ImportadorService(db, new PendientesRepository(db));
    // El CSV de pruebas se regenera por test: lo escribe el importador.
    fs.rmSync(path.join(dirTmp, 'pruebas_traduccion.csv'), { force: true });
  });

  afterEach(() => {
    db.close();
  });

  const filas = <T = any>(sql: string, ...params: unknown[]): T[] =>
    db.prepare(sql).all(...params) as T[];

  it('importa los conteos de los CSV, las reglas, los nombres y la elicitación', async () => {
    const stats = await servicio.importarTodo(dirTmp);
    expect(stats.oraciones).toBe(2 + 2); // CSV + elicitación (agua, pingüino); la prueba no entra
    expect(stats.frases).toBe(2);
    expect(stats.vocabulario).toBe(2 + 4); // CSV + agua, pingüino, casa, hola
    expect(stats.conjugaciones).toBe(2);
    expect(stats.reglas).toBe(2);
    expect(stats.nombresPropios).toBe(2);
    expect(stats.elicitacion).toEqual({
      archivos: 1,
      filas: 5,
      vocabulario: 4,
      oraciones: 2,
      pruebas: 1,
      pendientes: 2, // vecina (sin nada) y hola (sin ejemplo)
      resueltas: 3, // agua, pingüino, casa
      idsRepetidos: 0,
    });
    expect(stats.pruebasEnArchivo).toBe(1);
    expect(stats.totalTokens).toBeGreaterThan(0);
  });

  it('corrige la ü de Word a ʉ en el damana de los CSV y en los tokens', async () => {
    await servicio.importarTodo(dirTmp);
    const fila = db.prepare('SELECT damana FROM frases WHERE rowid = 2').get() as { damana: string };
    expect(fila.damana).toBe('bugʉi we ugunga');
    const palabras = filas('SELECT DISTINCT palabra_normalizada AS p FROM tokens_damana').map((f) => f.p);
    expect(palabras).toContain('bugʉi');
    expect(palabras).not.toContain('bugui');
  });

  it('en la elicitación convierte ü y u+ a ʉ, pero respeta pingüino', async () => {
    await servicio.importarTodo(dirTmp);
    const agua = db.prepare("SELECT damana, categoria, fuente FROM vocabulario WHERE espanol = 'agua' AND fuente = 'elicitacion'").get() as any;
    expect(agua).toMatchObject({ damana: 'nʉnka', categoria: 'naturaleza' });
    const oracion = db.prepare(`SELECT damana, espanol, fuente, dominio, estado FROM oraciones WHERE id_externo = ?`).get(`elic_${ID_AGUA}`) as any;
    expect(oracion).toMatchObject({
      damana: 'nʉnka se nʉka',
      espanol: 'El agua está fría.',
      fuente: 'elicitacion',
      dominio: 'cotidiano',
      estado: 'aprobado',
    });
    const pinguino = db.prepare("SELECT damana FROM vocabulario WHERE espanol = 'pingüino'").get() as any;
    expect(pinguino.damana).toBe('pingüino');
  });

  it('marca el dominio: lfb → biblico, frases y elicitación → cotidiano', async () => {
    await servicio.importarTodo(dirTmp);
    expect(filas("SELECT dominio FROM oraciones WHERE fuente LIKE 'lfb%'").map((f) => f.dominio)).toEqual(['biblico', 'biblico']);
    expect(filas("SELECT dominio FROM oraciones WHERE fuente = 'elicitacion'").map((f) => f.dominio)).toEqual(['cotidiano', 'cotidiano']);
    expect(filas('SELECT dominio FROM frases').map((f) => f.dominio)).toEqual(['cotidiano', 'cotidiano']);
  });

  it('importa las reglas con su disparador y los nombres propios con sus grafías', async () => {
    await servicio.importarTodo(dirTmp);
    expect(filas('SELECT forma, significado, disparador, ejemplo_regla FROM reglas ORDER BY rowid')).toEqual([
      { forma: '-ndzina', significado: 'pluraliza sustantivos', disparador: 'plural', ejemplo_regla: 'terruandzina' },
      { forma: '-nzhe', significado: 'posesivo / "de"', disparador: 'posesivo', ejemplo_regla: 'Kunkujshinanzhe' },
    ]);
    expect(filas('SELECT damana, espanol, se_escribe_igual, otras_grafias FROM nombres_propios ORDER BY rowid')).toEqual([
      { damana: 'Jehová', espanol: 'Jehová', se_escribe_igual: 1, otras_grafias: 'Jehova' },
      { damana: 'faraón', espanol: 'faraón', se_escribe_igual: 1, otras_grafias: 'Faraón' },
    ]);
  });

  it('reserva la fila de prueba en pruebas_traduccion.csv y la deja fuera de las oraciones', async () => {
    await servicio.importarTodo(dirTmp);
    expect(leerPruebas(dirTmp)).toEqual([
      { espanol: 'Mi casa es grande.', damanaEsperado: 'Ranzhe urraga aikuia', ambito: 'casa' },
    ]);
    expect(filas("SELECT 1 FROM oraciones WHERE damana = 'Ranzhe urraga aikuia'")).toHaveLength(0);
    // la palabra sí entra al diccionario: la prueba mide la composición, no el léxico
    expect(filas("SELECT damana FROM vocabulario WHERE espanol = 'casa'")).toEqual([{ damana: 'Urraga' }]);
    // y el archivo lleva BOM y CRLF como el resto de CSV del proyecto
    const crudo = fs.readFileSync(path.join(dirTmp, 'pruebas_traduccion.csv'), 'utf8');
    expect(crudo.charCodeAt(0)).toBe(0xfeff);
    expect(crudo).toContain('\r\n');
  });

  it('las filas sin llenar quedan como pendientes de elicitación, sin duplicarse al reimportar', async () => {
    await servicio.importarTodo(dirTmp);
    await servicio.importarTodo(dirTmp);
    expect(filas('SELECT palabra, estado, origen, contexto, veces_pedida FROM pendientes ORDER BY palabra')).toEqual([
      { palabra: 'hola', estado: 'pendiente', origen: 'elicitacion', contexto: 'Hola, ¿cómo estás?', veces_pedida: 1 },
      { palabra: 'vecina', estado: 'pendiente', origen: 'elicitacion', contexto: 'Mi vecina cocina.', veces_pedida: 1 },
    ]);
  });

  it('un lote posterior que llena la fila cierra la pendiente y gana por id (idempotente por id)', async () => {
    await servicio.importarTodo(dirTmp);
    await escribirLote(dirTmp, 'formato_elicitacion_lote2.xlsx', LOTE_2);
    try {
      const stats = await servicio.importarTodo(dirTmp);
      expect(stats.elicitacion.archivos).toBe(2);
      expect(stats.elicitacion.idsRepetidos).toBe(1);
      expect(stats.elicitacion.pendientes).toBe(1); // solo hola
      expect(db.prepare("SELECT estado FROM pendientes WHERE palabra = 'vecina'").get()).toEqual({ estado: 'resuelta' });
      expect(filas("SELECT damana FROM vocabulario WHERE espanol = 'vecina'")).toEqual([{ damana: 'anzhirru' }]);
      expect(filas(`SELECT damana FROM oraciones WHERE id_externo = ?`, `elic_${ID_VECINA}`)).toEqual([{ damana: 'ranzhe anzhirru duzhi' }]);
    } finally {
      fs.rmSync(path.join(dirTmp, 'formato_elicitacion_lote2.xlsx'), { force: true });
    }
  });

  it('sin reglas_damana.xlsx ni lotes de elicitación importa igual (corpus mínimo)', async () => {
    const dirMinimo = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-min-'));
    try {
      escribirCsvs(dirMinimo);
      const stats = await servicio.importarTodo(dirMinimo);
      expect(stats.reglas).toBe(0);
      expect(stats.nombresPropios).toBe(0);
      expect(stats.elicitacion.archivos).toBe(0);
      expect(stats.oraciones).toBe(2);
      expect(leerPruebas(dirMinimo)).toEqual([]);
    } finally {
      fs.rmSync(dirMinimo, { recursive: true, force: true });
    }
  });

  it('guarda id_externo y estado de las oraciones (celdas multilínea intactas)', async () => {
    await servicio.importarTodo(dirTmp);
    const csv = filas('SELECT id_externo, damana, estado FROM oraciones WHERE id_externo LIKE ? ORDER BY rowid', 'o%');
    expect(csv[0].id_externo).toBe('o1');
    expect(csv[0].estado).toBe('aprobado');
    expect(csv[0].damana).toContain('\n');
    expect(csv[1].estado).toBe('revisar');
  });

  it('tokeniza todas las fuentes conservando ʉ y ñ', async () => {
    await servicio.importarTodo(dirTmp);
    const origenes = filas('SELECT DISTINCT tabla_origen AS t FROM tokens_damana ORDER BY t').map((f) => f.t);
    expect(origenes).toEqual(['conjugaciones', 'frases', 'oraciones', 'vocabulario']);
    const palabras = filas('SELECT DISTINCT palabra_normalizada AS p FROM tokens_damana').map((f) => f.p);
    expect(palabras).toContain('nʉnka');
    expect(palabras).toContain('ñingui');
    expect(palabras).not.toContain('nunka');
    expect(palabras).not.toContain('ningui');
  });

  it('es idempotente: importar dos veces deja las mismas estadísticas', async () => {
    const primera = await servicio.importarTodo(dirTmp);
    const segunda = await servicio.importarTodo(dirTmp);
    expect(segunda).toEqual(primera);
  });

  it('no toca traducciones, progreso SRS, validadas ni pendientes del traductor al reimportar', async () => {
    db.prepare(
      `INSERT INTO traducciones
         (creado_en, texto, traduccion, direccion, puntaje_top, puntaje_medio,
          fuente_top, ejemplos_recuperados, palabras_dudosas, vocabulario_usado, modelo)
       VALUES ('2026-07-20T10:00:00.000Z', 'nʉnka', 'es', 'damana_a_espanol',
               0.9, 0.4, 'oraciones', 8, '[]', '[]', 'modelo-prueba')`,
    ).run();
    db.prepare(
      `INSERT INTO progreso_srs (palabra, repeticiones, factor_facilidad, intervalo_dias, proxima_revision, actualizado_en)
       VALUES ('nʉnka', 2, 2.5, 6, '2026-07-01T00:00:00.000Z', '2026-06-25T00:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO validadas (creado_en, espanol, damana, direccion, origen, traduccion_modelo)
       VALUES ('2026-10-01T00:00:00.000Z', 'el agua', 'nʉnka', 'espanol_a_damana', 'confirmada', 'nʉnka')`,
    ).run();
    new PendientesRepository(db).registrarPedida('ñame', 'espanol', 'quiero ñame');

    await servicio.importarTodo(dirTmp);

    expect(db.prepare('SELECT texto FROM traducciones').get()).toEqual({ texto: 'nʉnka' });
    expect(db.prepare("SELECT repeticiones FROM progreso_srs WHERE palabra = 'nʉnka'").get()).toEqual({ repeticiones: 2 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM validadas').get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT veces_pedida, origen FROM pendientes WHERE palabra = 'ñame'").get()).toEqual({ veces_pedida: 1, origen: 'traductor' });
  });
});
