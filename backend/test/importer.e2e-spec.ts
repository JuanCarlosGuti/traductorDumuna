import { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseModule } from '../src/database/database.module';
import { ImporterModule } from '../src/importer/importer.module';
import { ImporterService } from '../src/importer/importer.service';

const BOM = String.fromCharCode(0xfeff);

describe('Importer (e2e, full Nest module with in-memory SQLite)', () => {
  let dirTmp: string;
  let app: INestApplicationContext;
  let service: ImporterService;

  beforeAll(async () => {
    dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-e2e-'));
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_oraciones.csv'),
      BOM +
        'id,damana,espanol,estado,fuente\n' +
        'o1,"nʉnka kʉñingui gontka\nshke\'ta ukurra ¿nanu? 42",Dios hizo el agua,aprobado,lfb\n' +
        'o2,ñingui tua,otra vez,revisar,lfb\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_frases_v2.csv'),
      BOM +
        'fuente,damana,espanol,notas\n' +
        'Prueba,¿Zhinzhoma mʉntuka nanu?,¿Conoces los libros?,\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_vocabulario_v3.csv'),
      BOM + 'espanol,damana,categoria,notas,fuente\n' + 'tiene,kʉnʉnka,Verbos,,dic\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_conjugaciones.csv'),
      BOM + 'damana,espanol,lema,fuente,notas\n' + 'nujkunʉnanka,yo tuve,tener,doc,\n',
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRoot({ dbPath: ':memory:' }), ImporterModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(ImporterService);
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(dirTmp, { recursive: true, force: true });
  });

  it('imports and reports consistent statistics for the 4 sources (no rules or elicitation)', async () => {
    const stats = await service.importAll(dirTmp);
    expect(stats.sentences).toBe(2);
    expect(stats.phrases).toBe(1);
    expect(stats.vocabulary).toBe(1);
    expect(stats.conjugations).toBe(1);
    expect(stats.rules).toBe(0);
    expect(stats.elicitation.files).toBe(0);
    expect(stats.totalTokens).toBeGreaterThan(8);
    expect(stats.topWords.length).toBeGreaterThan(0);
  });

  it('tokens keep ʉ and ñ (never degraded to u/n)', async () => {
    const stats = await service.importAll(dirTmp);
    const words = stats.topWords.map((p) => p.word);
    expect(words).toContain('nʉnka');
    expect(words).toContain('ñingui');
    expect(words).not.toContain('nunka');
    expect(words).not.toContain('ningui');
  });

  it('writes pruebas_traduccion.csv even if there are no tests (header only)', async () => {
    await service.importAll(dirTmp);
    const csv = fs.readFileSync(path.join(dirTmp, 'pruebas_traduccion.csv'), 'utf8');
    expect(csv).toContain('espanol,damana_esperado,ambito');
  });

  it('is idempotent when importing twice', async () => {
    const first = await service.importAll(dirTmp);
    const second = await service.importAll(dirTmp);
    expect(second).toEqual(first);
  });
});
