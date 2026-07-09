import { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseModule } from '../src/database/database.module';
import { ImportadorModule } from '../src/importador/importador.module';
import { ImportadorService } from '../src/importador/importador.service';

const BOM = String.fromCharCode(0xfeff);

describe('Importador (e2e, módulo Nest completo con SQLite en memoria)', () => {
  let dirTmp: string;
  let app: INestApplicationContext;
  let servicio: ImportadorService;

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
      path.join(dirTmp, 'corpus_vocabulario_v2.csv'),
      BOM + 'espanol,damana,categoria,notas,fuente\n' + 'tiene,kʉnʉnka,Verbos,,dic\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_conjugaciones.csv'),
      BOM + 'damana,espanol,lema,fuente,notas\n' + 'nujkunʉnanka,yo tuve,tener,doc,\n',
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRoot({ rutaDb: ':memory:' }), ImportadorModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    servicio = app.get(ImportadorService);
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(dirTmp, { recursive: true, force: true });
  });

  it('importa y reporta estadísticas coherentes de las 4 fuentes', () => {
    const stats = servicio.importarTodo(dirTmp);
    expect(stats.oraciones).toBe(2);
    expect(stats.frases).toBe(1);
    expect(stats.vocabulario).toBe(1);
    expect(stats.conjugaciones).toBe(1);
    expect(stats.totalTokens).toBeGreaterThan(8);
    expect(stats.topPalabras.length).toBeGreaterThan(0);
  });

  it('los tokens conservan ʉ y ñ (nunca degradadas a u/n)', () => {
    const stats = servicio.importarTodo(dirTmp);
    const palabras = stats.topPalabras.map((p) => p.palabra);
    expect(palabras).toContain('nʉnka');
    expect(palabras).toContain('ñingui');
    expect(palabras).not.toContain('nunka');
    expect(palabras).not.toContain('ningui');
  });

  it('es idempotente al importar dos veces', () => {
    const primera = servicio.importarTodo(dirTmp);
    const segunda = servicio.importarTodo(dirTmp);
    expect(segunda).toEqual(primera);
  });
});
