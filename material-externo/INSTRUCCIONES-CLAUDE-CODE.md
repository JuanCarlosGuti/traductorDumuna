# Instrucciones para Claude Code — integrar el material externo al Corpus Damana

Lee primero `CLAUDE.md` del repo y luego `material-externo/FUENTES.md` (inventario
de qué es cada archivo, su origen, licencia, calidad del texto y para qué sirve).

## Contexto en una frase
El traductor funciona con retrieval sobre `/datos` (vocabulario, frases, oraciones
bíblicas, reglas). Hoy el corpus cotidiano es pequeño. En `material-externo/` hay
12 documentos descargados (PDF + texto extraído) y un CSV con 209 entradas de
diccionario, más un inventario de lo que existe pero no se pudo descargar. El
objetivo es validar ese material, resolver divergencias con lo que ya hay, y
cargar al corpus solo lo que pase la validación, sin dañar nada de lo existente.

## Reglas generales
- El repo puede tener cambios sin commit de otra sesión: no los reviertas ni los
  mezcles. Trabaja en commits pequeños, uno por fuente o por paso, mensajes en
  español. No hagas push (cada push a main redespliega Render).
- Nunca borres ni sobrescribas filas existentes de `/datos`. Solo añadir, y con
  columna/nota de fuente para poder rastrear y revertir.
- Todo lo que entre se normaliza a la ortografía del proyecto (ʉ, zh, sh, k, ng);
  la forma original se conserva en la nota de fuente. Ver sección D de FUENTES.md.
- Lo que no sea verificable (OCR dudoso, traducción ambigua, palabra con dos
  grafías) NO entra al corpus: va a un lote de preguntas para las hablantes
  (usar el mismo formato de `formato_elicitacion_*.xlsx` o el flujo de
  `/pendientes`), igual que hace hoy la app con lo que no sabe.
- `material-externo/` no debe entrar en la imagen Docker ni en el build: añade
  la carpeta a `.dockerignore` (los PDF pesan ~8 MB) y comprueba que el importador
  no la lee por accidente.
- Antes de cerrar cada paso: `npm test`, `npm run test:e2e`, `npm run test:front`
  en verde, y `npm run importar` sin errores con el corpus resultante.

## Paso 1 — Inventario y lectura (sin tocar /datos)
1. Lee `material-externo/FUENTES.md` y abre cada archivo de `texto/`. Donde el
   texto diga "(OCR)" o esté casi vacío (Palabras y objetos, Duganzhe, Misnigama,
   Swadesh), abre el PDF correspondiente en `pdf/` y transcribe tú lo legible;
   marca lo dudoso con `[?]`.
2. Escribe `material-externo/INFORME-LECTURA.md` con, por documento: qué contiene
   realmente, cuántos pares damana–español útiles estimas, en qué ortografía
   está y qué problemas ves. Aquí decides qué fuentes valen la pena y cuáles no.

## Paso 2 — Vocabulario (Living Dictionary + Swadesh + Hoppe 1973 + láminas)
1. Carga `Damana - Living Dictionary (209 entradas).csv` en memoria. Separa
   español e inglés (vienen en una celda con "·"), pasa los lemas a minúscula
   salvo nombres propios, y mapea `categoria` (n, v, adj, number…) a las
   categorías que usa `corpus_vocabulario_v3.csv`.
2. Cruza cada entrada contra el vocabulario actual del corpus (busca por damana
   normalizado y por español normalizado). Clasifica en:
   - COINCIDE: misma palabra y mismo significado → no se añade; anota la fuente.
   - NUEVA: no existe → candidata a añadir.
   - DIVERGE: misma palabra con significado distinto, o mismo significado con
     grafía distinta (p. ej. corpus "nʉnka" vs fuente "nunka"; Asheshisa vs
     Asheshisha). No se añade: va al informe de divergencias y al lote de
     preguntas para las hablantes, con las dos formas y las dos fuentes.
3. Haz lo mismo con la lista Swadesh (transcribe desde el PDF; la ortografía es
   fonética de 1990, convierte con cuidado y conserva la original en nota) y con
   los términos de cultura material de Hoppe 1973.
4. Genera `material-externo/salida/vocabulario_nuevo.csv` con el formato exacto
   de `corpus_vocabulario_v3.csv` más una columna `fuente` (p. ej.
   "LivingDictionary 2026 <url>", "Swadesh SIL 1990", "Hoppe 1973"). Y
   `material-externo/salida/divergencias_vocabulario.csv` con: damana_corpus,
   damana_fuente, espanol_corpus, espanol_fuente, fuente, tipo_divergencia,
   propuesta.
5. Solo cuando yo apruebe el informe, añade las filas NUEVAS al CSV del corpus
   (o a un CSV nuevo `corpus_vocabulario_externo.csv` si el importador admite
   varios archivos; si no lo admite, extiende el importador de forma mínima y
   con tests). Corre `npm run importar` y verifica en la app que las palabras
   aparecen en Diccionario y en el retrieval del traductor.

## Paso 3 — Frases y oraciones paralelas (Wiwa Gago, Hoppe 1974, cartilla 2012)
1. De *Por qué hablar Damana* y *El camino del muchacho* extrae pares
   damana–español oración por oración (el texto viene alineado por párrafos;
   alinea con cuidado y marca `[?]` donde la correspondencia no sea 1 a 1).
2. De *La culebra* (Hoppe 1974) extrae el relato bilingüe. Está en ortografía
   ILV de 1974: construye una tabla de equivalencias (c/qu→k, ü→ʉ, etc.) a partir
   de palabras que ya existan en el corpus, aplícala y conserva la forma
   original en la nota. Si la conversión deja dudas en más del 20 % de las
   palabras de una oración, esa oración va a preguntas, no al corpus.
3. De la cartilla 2012 (monolingüe) extrae las palabras clave y las oraciones
   cortas; como no traen traducción, no van a `corpus_frases`: van al lote de
   elicitación para que las hablantes las traduzcan.
4. Genera `material-externo/salida/frases_nuevas.csv` con el formato exacto de
   `corpus_frases_v2.csv` (dominio = cotidiano o narrativo según corresponda,
   nunca "bíblico") más columna `fuente`, y `material-externo/salida/
   preguntas_hablantes.xlsx` con el formato de elicitación del proyecto.
5. Con mi aprobación, carga las frases al corpus, `npm run importar`, y prueba
   el traductor con 5 frases que usen vocabulario nuevo para confirmar que el
   retrieval las recupera.

## Paso 4 — Reglas gramaticales (Trillos Amaya)
1. Lee el artículo de cortesía lingüística y extrae reglas con ejemplo:
   pronombres y formas de tratamiento, imperativo cortés, negación, pregunta.
   Compara con `reglas_damana.xlsx`: qué reglas ya están, cuáles faltan, cuáles
   contradicen (p. ej. el sufijo de negación, que hoy el traductor no resuelve).
2. Escribe `material-externo/salida/reglas_propuestas.md` con cada regla,
   ejemplo glosado, fuente y página. NO modifiques `reglas_damana.xlsx` sin mi
   aprobación: las reglas las confirman las hablantes.

## Paso 5 — Informe final y limpieza
- `material-externo/INFORME-INTEGRACION.md`: qué se cargó (conteos por fuente),
  qué quedó en divergencias, qué se mandó a preguntas, qué fuentes se
  descartaron y por qué, y qué pediría a SIL Colombia (sección B de FUENTES.md).
- Deja `material-externo/` ordenado: `pdf/`, `texto/`, `salida/`, y los
  informes. Nada de archivos temporales.
- Actualiza `CLAUDE.md` y `AGENTS.md` (espejo) con dos líneas: existe
  `material-externo/` con fuentes externas validadas, y el flujo para añadir
  más fuentes.
