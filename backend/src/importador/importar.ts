import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module';
import { ImportadorModule } from './importador.module';
import { ImportadorService } from './importador.service';
import { resolverDirDatos, rutaDbPorDefecto } from './rutas-datos';

// Módulo CLI propio: el importador no arrastra controladores HTTP.
@Module({
  imports: [
    DatabaseModule.forRoot({ rutaDb: rutaDbPorDefecto() }),
    ImportadorModule,
  ],
})
class ImportarCliModule {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(ImportarCliModule, {
    logger: ['error', 'warn'],
  });

  const dirDatos = resolverDirDatos();
  console.log(`Importando corpus desde: ${dirDatos}`);
  const stats = await app.get(ImportadorService).importarTodo(dirDatos);
  const e = stats.elicitacion;

  console.log('\n=== Importación completada ===');
  console.log(`Oraciones:        ${stats.oraciones}`);
  console.log(`Frases:           ${stats.frases}`);
  console.log(`Vocabulario:      ${stats.vocabulario}`);
  console.log(`Conjugaciones:    ${stats.conjugaciones}`);
  console.log(`Reglas:           ${stats.reglas}`);
  console.log(`Nombres propios:  ${stats.nombresPropios}`);
  console.log(
    `Elicitación:      ${e.archivos} archivo(s), ${e.filas} filas → ` +
      `${e.vocabulario} palabras, ${e.oraciones} oraciones, ${e.pruebas} pruebas reservadas, ` +
      `${e.pendientes} pendientes, ${e.resueltas} resueltas` +
      (e.idsRepetidos ? `, ${e.idsRepetidos} ids repetidos (ganó el último lote)` : ''),
  );
  console.log(`Pruebas (CSV):    ${stats.pruebasEnArchivo}`);
  console.log(`Tokens:           ${stats.totalTokens}`);
  console.log('\nTop 20 palabras damana más frecuentes:');
  console.table(stats.topPalabras);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
