# Corpus Damana App

Aplicación local de estudio del damana (dʉmʉna), lengua del pueblo Wiwa
(Sierra Nevada de Santa Marta, Colombia). Usuario: desarrollador con
experiencia en TypeScript/Angular y backend.

## Stack (todo TypeScript)
- Monorepo con npm workspaces: /backend y /frontend.
- Backend: NestJS 11, better-sqlite3 (acceso síncrono, sin ORM;
  capa de repositorios propia estilo puertos y adaptadores),
  csv-parse para importación, @nestjs/swagger para documentar.
- Frontend: Angular 18+ standalone components con señales.
- Producción: un solo proceso; NestJS sirve el build de Angular con
  @nestjs/serve-static. Sin autenticación: app local de un usuario.
- Tests: Jest en backend (unitarios + e2e con SQLite en memoria).

## Datos (carpeta /datos, encoding UTF-8 con BOM)
- corpus_capitulos.csv: capitulo, titulo_damana, titulo_espanol,
  damana, espanol (103 capítulos paralelos; celdas largas con saltos
  de línea internos)
- corpus_frases.csv: fuente, damana, espanol, notas (66 frases)
- corpus_vocabulario.csv: espanol, damana, notas (115 entradas)

## Reglas del dominio (verificadas)
- ʉ (U+0289) es letra plena del alfabeto damana. Búsqueda, tokenización
  y orden la tratan como letra; ʉ ≠ u SIEMPRE.
- ñ también es letra plena (en damana: ñingui, kʉñingui; en español
  año ≠ ano); ñ ≠ n SIEMPRE.
- Normalizar con normalizar() de backend/src/comun/texto/normalizador.ts:
  minúsculas + NFD, recomponer n + U+0303 → ñ (preservarla) y después
  quitar las marcas combinantes U+0300–U+036F. Quita tildes (á→a), NO
  toca la ʉ (no se descompone en NFD) y NO degrada ñ→n. Ojo: quitar
  las marcas sin recomponer antes SÍ convertiría ñ→n (NFD descompone
  ñ en n + tilde combinante); la recomposición previa es obligatoria.
- Tokenizar damana con /[^\p{L}ʉ']+/u (separar por todo lo que no sea
  letra Unicode, ʉ o apóstrofe interno).
- Leer CSV con csv-parse: { columns: true, bom: true }.

## Convenciones
- Cada servicio con tests; incluir siempre un caso con ʉ y uno con ñ.
- Commits pequeños por funcionalidad, mensajes en español.
- La base SQLite (datos/corpus.db) va en .gitignore; se regenera con
  el importador.