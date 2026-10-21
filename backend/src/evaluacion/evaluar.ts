import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { ConsultaModule } from '../consulta/consulta.module';
import { DatabaseModule } from '../database/database.module';
import { leerPruebas } from '../importador/pruebas-csv';
import { resolverDirDatos, rutaDbPorDefecto } from '../importador/rutas-datos';
import { DireccionTraduccion } from '../traduccion/dto/traduccion.dto';
import { TraduccionModule } from '../traduccion/traduccion.module';
import { TraduccionService } from '../traduccion/traduccion.service';
import {
  construirInforme,
  evaluarPrueba,
  nombreBaseInforme,
  pruebaFallida,
  PruebaEvaluada,
  renderizarMarkdown,
} from './evaluador';

// Módulo CLI propio: no arrastra controladores HTTP ni estáticos.
@Module({
  imports: [
    DatabaseModule.forRoot({ rutaDb: rutaDbPorDefecto() }),
    ConsultaModule,
    TraduccionModule,
  ],
})
class EvaluarCliModule {}

/** La carpeta /evaluaciones vive junto a /datos, en la raíz del repo. */
export function dirEvaluaciones(dirDatos: string): string {
  return path.resolve(dirDatos, '..', 'evaluaciones');
}

/** --pausa <ms>: espera entre traducciones (Groq gratuito admite ~4 por minuto). */
function leerPausa(argv: string[]): number {
  const i = argv.indexOf('--pausa');
  if (i === -1) return 0;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function leerLimite(argv: string[]): number | undefined {
  const i = argv.indexOf('--limite');
  if (i === -1) return undefined;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function main(): Promise<void> {
  const dirDatos = resolverDirDatos();
  const todas = leerPruebas(dirDatos);
  const limite = leerLimite(process.argv);
  const pausa = leerPausa(process.argv);
  const pruebas = limite ? todas.slice(0, limite) : todas;

  if (pruebas.length === 0) {
    console.log(
      `No hay pruebas en ${path.join(dirDatos, 'pruebas_traduccion.csv')}.\n` +
        'Se llena solo al importar lotes de elicitación con ejemplos completos ' +
        '(1 de cada 10 filas) o añadiendo filas a mano: espanol,damana_esperado,ambito.',
    );
    return;
  }

  const app = await NestFactory.createApplicationContext(EvaluarCliModule, {
    logger: ['error', 'warn'],
  });
  const traductor = app.get(TraduccionService);
  const config = traductor.configuracion();
  if (!traductor.disponible()) {
    console.error(
      'No hay motor de traducción configurado (TRADUCTOR_BASE_URL + TRADUCTOR_MODELO o ANTHROPIC_API_KEY).',
    );
    await app.close();
    process.exit(1);
  }

  console.log(
    `Evaluando ${pruebas.length} pruebas con ${config.proveedor} · ${config.modelo}` +
      (pausa ? ` (pausa de ${pausa} ms entre llamadas)` : '') +
      '…',
  );
  const resultados: PruebaEvaluada[] = [];
  for (const [i, prueba] of pruebas.entries()) {
    if (i > 0 && pausa > 0) await new Promise((r) => setTimeout(r, pausa));
    try {
      const respuesta = await traductor.traducir(
        { texto: prueba.espanol, direccion: DireccionTraduccion.espanol_a_damana },
        { registrar: false },
      );
      const evaluada = evaluarPrueba(prueba, respuesta);
      resultados.push(evaluada);
      console.log(
        `${String(i + 1).padStart(3)}. ${evaluada.exacta ? '✓' : ' '} chrF ${evaluada.chrf.toFixed(2)}  ${prueba.espanol}`,
      );
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      resultados.push(pruebaFallida(prueba, mensaje));
      console.log(`${String(i + 1).padStart(3)}. ✗ ERROR ${mensaje}  ${prueba.espanol}`);
    }
  }

  const fecha = new Date();
  const informe = construirInforme(resultados, {
    fecha,
    proveedor: config.proveedor,
    modelo: config.modelo,
  });
  const carpeta = dirEvaluaciones(dirDatos);
  fs.mkdirSync(carpeta, { recursive: true });
  const base = path.join(carpeta, nombreBaseInforme(fecha, config.modelo));
  fs.writeFileSync(`${base}.json`, JSON.stringify(informe, null, 2), 'utf8');
  fs.writeFileSync(`${base}.md`, renderizarMarkdown(informe), 'utf8');

  console.log('\n=== Resultado por ámbito ===');
  console.table(
    [...informe.porAmbito, informe.total].map((r) => ({
      ambito: r.ambito,
      pruebas: r.pruebas,
      'exactas %': r.porcentajeExactas.toFixed(1),
      'chrF medio': r.chrfMedio.toFixed(3),
      'sin equiv. %': r.porcentajeSinEquivalente.toFixed(1),
      errores: r.errores,
    })),
  );
  console.log(`\nInforme guardado en:\n  ${base}.md\n  ${base}.json`);
  await app.close();
}

// Solo corre como CLI; al importarlo desde un test no ejecuta nada.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
