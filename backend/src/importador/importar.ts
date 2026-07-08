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
  console.log(`Importando CSVs desde: ${dirDatos}`);
  const stats = app.get(ImportadorService).importarTodo(dirDatos);

  console.log('\n=== Importación completada ===');
  console.log(`Capítulos:    ${stats.capitulos}`);
  console.log(`Frases:       ${stats.frases}`);
  console.log(`Vocabulario:  ${stats.vocabulario}`);
  console.log(`Tokens:       ${stats.totalTokens}`);
  console.log('\nTop 20 palabras damana más frecuentes:');
  console.table(stats.topPalabras);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
