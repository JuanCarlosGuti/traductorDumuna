import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { ConsultaModule } from '../consulta/consulta.module';
import { CorpusRepository } from '../consulta/corpus.repository';
import { DatabaseModule } from '../database/database.module';
import { resolverDirDatos, rutaDbPorDefecto } from '../importador/rutas-datos';
import { DudasService } from './dudas.service';
import { construirLibroDudas } from './libro-dudas';
import { ARCHIVO_PARADIGMAS, construirLibroParadigmas, PARADIGMAS } from './paradigmas';

// Módulo CLI propio: solo lectura del corpus ya importado.
@Module({
  imports: [DatabaseModule.forRoot({ rutaDb: rutaDbPorDefecto() }), ConsultaModule],
})
class DudasCliModule {}

export function archivoDudas(fecha: Date): string {
  return `dudas_para_hablantes_${fecha.toISOString().slice(0, 10)}.xlsx`;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(DudasCliModule, {
    logger: ['error', 'warn'],
  });
  const dirDatos = resolverDirDatos();
  const hoy = new Date();

  const informe = new DudasService(app.get(CorpusRepository)).generar();
  const rutaDudas = path.join(dirDatos, archivoDudas(hoy));
  await construirLibroDudas(informe, hoy).xlsx.writeFile(rutaDudas);

  console.log('\n=== Dudas para aclarar con hablantes ===');
  console.log(`1 escritura (misma palabra, varias grafías):   ${informe.escritura.length} grupos`);
  console.log(`2 mismo significado (español → varias damana): ${informe.sinonimos.length} grupos`);
  console.log(`3 varios significados (damana → varios):       ${informe.polisemia.length} grupos`);
  console.log(`     de ellos, solo cambia la tilde:           ${informe.polisemia.filter((g) => g.soloTilde).length}`);
  console.log(`4 entradas por aclarar:                        ${informe.dudosas.length}`);
  console.log(`5 terminaciones frecuentes:                    ${informe.terminaciones.length}`);
  console.log(`\nDocumento: ${rutaDudas}`);

  // El lote de gramática no se regenera si ya existe: puede estar lleno.
  const rutaParadigmas = path.join(dirDatos, ARCHIVO_PARADIGMAS);
  if (fs.existsSync(rutaParadigmas)) {
    console.log(`Lote de gramática: ya existe y no se toca (${rutaParadigmas})`);
  } else {
    await construirLibroParadigmas().xlsx.writeFile(rutaParadigmas);
    console.log(`Lote de gramática: ${PARADIGMAS.length} oraciones en ${rutaParadigmas}`);
  }

  await app.close();
}

// Solo corre como CLI; al importarlo desde un test no ejecuta nada.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
