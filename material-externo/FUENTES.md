# Material externo sobre el damana (dʉmʉna) — inventario de fuentes

Recopilado el 21 de octubre de 2026 con búsqueda en la web y descarga desde el
navegador. Carpeta `material-externo/` del repo traductorDumuna. Nada de esto
entra al corpus automáticamente: hay que validarlo y convertirlo al formato de
`/datos` (ver INSTRUCCIONES-CLAUDE-CODE.md).

Carpetas:
- `pdf/`   — los documentos originales tal como se descargaron.
- `texto/` — texto extraído de cada PDF. Los que dicen "(OCR)" vienen de escaneos
             y tienen errores (acentos, ʉ leído como u/ü, columnas mezcladas);
             ante la duda, mirar el PDF.
- `Damana - Living Dictionary (209 entradas).csv` — extraído del sitio, no de un PDF.

## A. Descargado y disponible en esta carpeta

| # | Archivo (pdf/ y texto/) | Qué es | Fuente / autor / año | Licencia o uso | Calidad del texto | Para qué sirve en el corpus |
|---|---|---|---|---|---|---|
| 1 | Damana - Living Dictionary (209 entradas).csv | Diccionario damana–español–inglés con categoría gramatical y dominio semántico. 209 entradas, 1 oración de ejemplo. | Damana Living Dictionary, Carlee Schulz (UCSD) con Brigilio Maestre y Rodrigo Maestre (hablante, educador bilingüe). livingdictionaries.app/damana | Público en línea; citar la fuente. Cada fila trae la URL de la entrada. | Texto limpio (no es OCR). Mezcla mayúscula inicial en los lemas ("Abu"), hay dobletes (Asheshisa/Asheshisha = leer) y glosas bilingües separadas por "·". | `corpus_vocabulario`: comparar con el diccionario actual, añadir lo que falte, detectar grafías divergentes. |
| 2 | Damana - Lista Swadesh SIL (dumuna).pdf | Lista Swadesh-Rowe de ~200 palabras básicas (cuerpo, naturaleza, números, verbos básicos), formulario manuscrito. | Larry y Cindy Williams con el informante José Ramón; SIL, datos de 1990, publicado 2020. sil.org/resources/archives/84053 | CC BY-NC-SA 4.0 (indicado en la página 1). | OCR de manuscrito: muchas palabras damana mal leídas. Usar el PDF para transcribir. | `corpus_vocabulario`: vocabulario básico con transcripción fonética de 1990; útil para contrastar grafías. |
| 3 | Damana - Hoppe 1974 - Texto malayo La culebra (SIL).pdf | Relato tradicional "Guma / La culebra" en damana con traducción al español, con introducción y notas. Págs. 357-382 de *Folclor indígena de Colombia 1*. | Robert H. y Dorothy Hoppe, ILV / Ministerio de Gobierno, 1974. colombia.sil.org/resources/archives/19081 | Archivo SIL; obra de 1974 con reserva de derechos. Uso de estudio; citar. | OCR regular: el español sale bien, el damana con errores de acentos. Ortografía ILV de 1974 (distinta a la actual: p. ej. "c/qu" por "k", "ü" por "ʉ"). | `corpus_frases` / oraciones: texto paralelo real. Hay que normalizar la ortografía a la del corpus. |
| 4 | Damana - Hoppe 1973 - Malayo, cultura material (SIL).pdf | Capítulo etnográfico sobre los malayo (wiwa) con nombres de objetos, cultivos, vivienda, etc. en damana. | Dorothy Hoppe, en *Aspectos de la cultura material de grupos étnicos de Colombia 1*, ILV 1973. colombia.sil.org/resources/archives/18972 | Archivo SIL; citar. | OCR regular. | `corpus_vocabulario`: términos de cultura material. |
| 5 | Damana - Por que hablar Damana (Inzhue Damana ashayakuaga).pdf | Texto bilingüe (damana/español) sobre la importancia de hablar la lengua. 4 págs. | Wiwa Gago (sitio del pueblo Wiwa), wiwagago.com/es/recursos/descargas | Publicado por la comunidad para difusión. | Texto nativo, buena calidad. Ortografía actual (ʉ, zh, sh). | `corpus_frases`: oraciones paralelas de registro cotidiano/formal. |
| 6 | Damana - El camino del muchacho (Gumtshinazhe inguna).pdf | Relato ilustrado bilingüe. 12 págs. | Wiwa Gago. | Comunidad. | Texto nativo, buena calidad. | `corpus_frases`: narrativa cotidiana. |
| 7 | Damana - Cartilla de pre-lecto escritura (SIL 2012).pdf | Cartilla escolar en dʉmʉna: lecciones con palabra clave (Togua, Abu, Shoma, Saga, Mena…), textos cortos y preguntas. 24 págs. | Curso de Lingüística Aplicada para Comunidades Vernáculas, SIL, Villavicencio 2012. lengamer.org | Material educativo comunitario. | Texto nativo, calidad buena pero el orden de las columnas se mezcla. Casi todo en damana, sin traducción. | Vocabulario y oraciones monolingües: sirven para frecuencias y para pedir traducción a las hablantes. |
| 8 | Damana - Trillos Amaya - La cortesia linguistica en damana.pdf | Artículo lingüístico: formas de tratamiento, pronombres, imperativos, cortesía. 18 págs. | María Trillos Amaya, revista Amerindia (CNRS). | Académico; citar. | Texto nativo, buena calidad. Usa transcripción lingüística (ɨ/ʉ, ʃ…). | `reglas_damana.xlsx`: reglas de pronombres, imperativo, negación, pregunta, con ejemplos glosados. |
| 9 | Damana - Palabras y objetos en damana.pdf | Lámina de vocabulario ilustrado. 1 pág. | Wiwa Gago. | Comunidad. | Es imagen; el OCR no sirve. Transcribir a mano desde el PDF. | Vocabulario de objetos. |
| 10 | Damana - Duganzhe tuakuaga.pdf | 2 págs., título en damana. | Wiwa Gago. | Comunidad. | Imagen; OCR casi vacío. Mirar el PDF. | Por determinar (probable texto/canción). |
| 11 | Damana - Misnigama.pdf | 3 págs., título en damana. | Wiwa Gago. | Comunidad. | Imagen; OCR casi vacío. Mirar el PDF. | Por determinar. |
| 12 | Wiwa - Fe y cultura entre Wiwa y Arhuaco.pdf | Documento cultural en español, 39 págs. | Wiwa Gago. | Comunidad. | Texto limpio. | Contexto; pocas palabras en damana. No va al corpus. |

## B. Existe pero NO se pudo descargar (solo referencia / pedir copia)

| Obra | Dónde | Por qué importa |
|---|---|---|
| Williams, Cindy (1993). *A grammar sketch of Dəməna*. Tesis de maestría, University of North Dakota / SIL, 167 pp. | colombia.sil.org/resources/archives/9889 (sin PDF). Pedir a SIL Colombia o a la biblioteca de UND. | La gramática más completa del damana: orden de palabras, caso, sufijos verbales, causativos. Es la fuente ideal para `reglas_damana.xlsx`. |
| Williams, Larry (1995). *Noun classification or spatial categorization: Damana orientation verbs*, 120 pp. | colombia.sil.org/resources/archives/9771 | Verbos de orientación/posición (clave para "estar", "poner", "debajo", etc.). |
| Hoppe & Hoppe (1987). *Cartilla primera en Malayo*, 57 pp. | colombia.sil.org/resources/archives/19993 | Cartilla con frases cortas. |
| Hoppe, R. (1979). *Dʉmʉna gawa cwaga*, 57 pp. | colombia.sil.org/resources/archives/19448 | Texto en damana. |
| Hoppe, R. (1978). *Sizi*, 17 pp. | colombia.sil.org/resources/archives/20131 | Texto en damana. |
| Gil Mojica, Gil Sauna, Chimonquero y otros (1988). *Zhinzhoma tuakuzhi*, 75 pp. | colombia.sil.org/resources/archives/19630 | Escrito por autores wiwa. |
| Hoppe, R. (1981). *The Malayo: protectors of the universe*, 168 pp. | colombia.sil.org/resources/archives/9433 | Mito y ritual; términos culturales. |
| Trillos Amaya, M. (2000). "Síntesis descriptiva de los sistemas fonológico y morfosintáctico del damana", en *Lenguas indígenas de Colombia: una visión descriptiva*, Instituto Caro y Cuervo, pp. 749-756. | Libro impreso (bibliotecas: Caro y Cuervo, Uniandes, Banco de la República). | Síntesis de fonología y morfosintaxis por la especialista de referencia. |
| Chimusquero Sauna, O. (2024). Alfabeto y diccionario dumuna para tercer grado, Institución Etnoeducativa Kanzisinamke (UNAD). | repository.unad.edu.co/handle/10596/63090 (PDF 223 KB, requiere abrir en el repositorio). | Diccionario escolar hecho por un hablante; pequeño. |
| Pineda Orozco, A. *Diccionario bilingüe virtual damaná–español* (presentación Prezi). | prezi.com/zwcv13qgbgks | Trabajo estudiantil; revisar si aporta palabras. |
| Ethnologue (mbp), Glottolog mala1522, Endangered Languages Project 2545. | ethnologue.com/language/mbp · glottolog.org/resource/languoid/id/mala1522 · endangeredlanguages.com/lang/2545 | Metadatos, bibliografía, clasificación chibcha (rama arhuaco-chimila). |

## C. Audio

| Recurso | Dónde | Nota |
|---|---|---|
| Global Recordings Network, lengua "Dumuna" (mbp): *Buenas Nuevas* (40 lecciones con láminas) y *San Lucas* (Evangelio de Lucas, "traducción formal"). MP3 individuales y zip (267 MB alta / 76 MB baja). | globalrecordings.net/en/language/mbp | Si el corpus bíblico (lfb) corresponde a esta traducción, el audio de Lucas se podría alinear verso a verso. |
| Podcast RTVC "Lenguas vivas: Damana, viaje al corazón de los wiwa". | radionacional.co/podcast/lenguas-vivas-en-palabras-indigenas/damana-viaje-al-corazon-de-los-wiwa | Divulgación; entrevistas con hablantes. |

## D. Notas de ortografía que van a generar divergencias

- Tres sistemas conviven: (1) ortografía ILV de los años 70-80 (Hoppe): "c/qu", "ü", "j" por /h/; (2) transcripción lingüística (Trillos, Swadesh): ɨ, ʉ, ʃ, ʒ, acentos de tono; (3) ortografía comunitaria actual (Wiwa Gago, cartilla 2012, Living Dictionary, y el corpus del proyecto): ʉ, zh, sh, k, ng.
- El corpus del proyecto usa la (3). Todo lo que entre debe normalizarse a esa, y la forma original debe conservarse en una columna de nota/fuente para no perder información.
- El Living Dictionary escribe los lemas con mayúscula inicial y a veces registra variantes (Asheshisa/Asheshisha). No son errores: son variantes que las hablantes deben confirmar.
