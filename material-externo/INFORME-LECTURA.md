# Informe de lectura del material externo

Paso 1 de `INSTRUCCIONES-CLAUDE-CODE.md`. Leído el 21 de octubre de 2026 a partir
de `texto/` (y del CSV). Nada de `/datos` se tocó. Las cifras de «pares útiles»
son estimaciones tras leer el texto completo de cada archivo.

Limitación de esta máquina: no hay renderizador de PDF (`pdftoppm`), así que los
PDF que son imagen (Palabras y objetos, Duganzhe, Misnigama, Swadesh manuscrito)
no se pudieron transcribir desde el PDF en esta pasada. Se anota qué falta.

## Resumen: qué vale la pena

| Fuente | Veredicto | Para qué |
|---|---|---|
| Living Dictionary (CSV) | **Sí, la mejor para vocabulario** | 209 entradas limpias en ortografía actual; cruce automático con el corpus |
| Trillos Amaya 2004-05 | **Sí, la mejor para gramática** | Pregunta, imperativos, prohibición, negación en imperfectivo, auxiliares, pronombres: todo con ejemplos glosados |
| Hoppe 1974 «La culebra» | Sí, con trabajo | 118 oraciones numeradas con traducción literal palabra por palabra + glosario de 90 palabras; ortografía ILV 1974 |
| Cartilla SIL 2012 | Sí, como monolingüe | 19 lecciones: 19 palabras clave + ~19 textos cortos + 38 preguntas sin traducción → lote de elicitación; patrón interrogativo «… ki nanu?» |
| Swadesh SIL 1990 | Sí, pero hay que transcribir | 375 entradas en transcripción fonética; el OCR del manuscrito es malo |
| Hoppe 1973 cultura material | Poco | ~12 términos de objetos (hamaca, olla, mochila, poporo…) |
| El camino del muchacho | Poco como paralelo | 3 relatos monolingües en damana + 4 títulos/líneas bilingües; sirve para frecuencias y como texto a traducir por hablantes |
| Por qué hablar Damana | Casi nada | Ensayo en español; solo el título y 2 frases de ejemplo en damana |
| Palabras y objetos / Duganzhe / Misnigama | Pendiente | Imagen; OCR inútil (una línea: «wima cama busa dusa») |
| Fe y cultura Wiwa–Arhuaco | No | Español, sin damana |

## Por documento

### 1. Living Dictionary (209 entradas)
- CSV limpio: `damana,categoria,ingles,espanol,dominio_semantico,url`. El español ya
  viene en su propia columna (no hace falta partir por «·»). 2 filas vacías
  (Dulukuega duplicado, Sherra duplicado) y varias entradas repetidas con URL
  distinta (Zen ×2, Zhaginuka ×2, Kawa primo/prima, Giuya tío/hermano mayor).
- Ortografía actual (ʉ, zh, sh, k, rr, tsh). Lemas con mayúscula inicial; algunos
  en minúscula (ambʉnshi, kashkuama, mʉksthi, nai, itshima, ʉguaiʉn…).
- Dobletes que son variantes, no errores: Asheshisa / Asheshisha «leer»;
  Zhamaiʉn / Zhamal «cantar»; Kupina / Kupinʉn «despertar»; Dungʉla «pluma»
  frente al Swadesh «dungu la».
- Errores evidentes de la fuente que hay que marcar, no copiar: «Angawi» glosado
  «to read / escribir» (inglés y español no coinciden); «Amʉsi» tiene español e
  inglés cruzados («sentir / to feel»); «ʉnkanguashakuaga» igual («almuada /
  pillow»); «Goluma» «mosquito / mosca»; «Kazhia» «fumo» (portugués/italiano por
  «humo»); «Zhama» «vegetale»; «Widanka» «death / muerto».
- Trae formas conjugadas como entradas (Sakuga «yo busco», Zhamaiuga «yo canto»,
  Tugierru «lo que vi», Kuaní «vivió», Nekuzhi «vamos», Zhamekuzhi «cantemos»):
  valen más como oraciones de gramática que como lemas.
- Categorías: n, v, adj, prep, noun, no, «» → hay que mapearlas a las del corpus.
- Pares útiles: ~200 entradas de vocabulario. Cruce en el paso 2.

### 2. Trillos Amaya, «La cortesía lingüística en damana» (Amerindia 29/30, 2004-05)
- Texto limpio (no OCR). Transcripción lingüística: escribe **u** tanto para /u/
  como para /ʉ/ (anexo 1: «/ɨ/ u»), **h** donde la ortografía comunitaria usa
  **j** (ihkuna = ijkuna, nuhkuna, tuhkaia), **ch** por **tsh** (machu = matshu),
  y marca el acento con tilde. Al convertir hay que decidir u/ʉ palabra por
  palabra con el corpus (awun = Awʉn del Living Dictionary; nunka = nʉnka).
- Lo que aporta, todo con ejemplos glosados y traducidos (páginas 267-277):
  - **Pregunta**: desplazamiento del acento a la última sílaba (naka awunka
    «viene» → naká awunká «¿viene?»); sufijos interrogativos -í, -é, -ó, -á, -ú.
  - **Imperativos** graduados: -i (demanda: irrugua peshi «recoge la yuca»), -o
    (solicitación: Elía, unako ubeju «Elías, trae al ovejo»), -a (instanciación:
    guga mema webo «coge esos huevos»), -u (impositivo: shu gugu «coge el
    calabazo»; nakau mau «ven, apúrate»).
  - **Interdicción** -wi + nunka: ma zhamaiawi nunka «tú no puedes cantar»;
    angawi nunka yira tuhkaia «no bebas agua cruda».
  - **Auxiliares de imperación**: uzhi hortativo (zhameko uzhi «cantemos», neko
    uzhi «vamos»), urgá petición (naiá awa urgá «¿puedo irme ya?»), ushi orden
    (tujkuna ushi sherra «entrégame el machete»), nazhi prohibición (naiu nazhi
    «no te vayas»; gugu nazhi mema webo «¡no cojas esos huevos!»).
  - **Negación del imperfectivo**: sufijo -ung (ma ibanekung nana zhinga «tú no
    puedes trabajar»; ma naiung munana zhinga «tú no puedes irte»).
  - **Modalizadores**: guashi (permiso), zhinga (autorización), kuaga
    (obligación: zhama atesha kuaga «hay que cocinar»), kumana (obligación 2),
    kuaga kumana (persuasión), -negi nando (proposición).
  - **Pronombres y afijos**: ra yo, ma tú, na él/ella, ihkuna ellos; ranzh- «mi»
    (ranzhabo «mi mamá»), mu- 2.ª persona, nuh-/tuj- «a mí»; -ka locativo, -nun
    «con», -zhe genitivo, -ga/-rga benefactivo, -nguma diminutivo.
  - Anexo 2: paradigma de auxiliares (awun hacer, nanun estar de pie, nukuun
    estar, nunun haber, kuai vivir, amusi sentir, naiun ir, nakun venir).
- Pares útiles: ~45 oraciones glosadas (dominio gramática) y ~15 reglas.
- Cita bibliográfica para la sección B de FUENTES.md: Trillos 1989 «Tiempo,
  aspecto y modo en damana» (CCELA, Uniandes) y Trillos 2000 «Damana» (Lincom).

### 3. Hoppe & Hoppe 1974, «Guma / La culebra» (Folclor indígena de Colombia 1)
- OCR regular: el español sale bien; el damana trae letras cambiadas (figumamba,
  nucfigaru, nucligaru = la misma palabra tres veces distinta), números pegados
  y tildes perdidas.
- Estructura: 118 oraciones numeradas en damana (pp. 360-365), **traducción
  literal palabra por palabra** con el mismo número (pp. 366-370), traducción
  libre en prosa (no alineada) y **glosario de ~90 palabras** (pp. 374-381).
- Ortografía ILV 1974 (p. 373): c/qu = k, cw = ku, gw = gu/w, ü = ʉ (perdida en
  el OCR: «ucweru» = ukueru, «quima» = kima, «nungewa» ≈ nʉnguewa, «cwima» =
  kuima «hombre», «dzhira» = dzhirra «agua», «teruá» = terrua). El propio texto
  dice que hay 33 letras con vocales nasales.
- La traducción literal no es español natural («Bailaban xamán plural reunido
  estaba-cuando»): sirve como glosa (dominio gramática), no como par cotidiano.
  Para pares naturales habría que redactar el español, y eso ya es interpretar.
- Pares útiles: 118 oraciones glosadas si se convierte la ortografía; 90
  entradas de glosario para el cruce. Varias coinciden con otras fuentes:
  guma culebra, ade padre, cun = kʉn leña/palo, mena mujer, terua = terrua
  hombre, ra yo, ma usted, gaya mujer joven, zhama comida, uraga casa.

### 4. Cartilla de pre-lecto escritura (SIL 2012, Lorenzo Gil Gil, CC BY-SA)
- Texto bueno pero las columnas se mezclan (sílabas de práctica «WI MA WI NE»
  intercaladas con el texto). Monolingüe: ni una palabra en español.
- 19 lecciones (Shinzhiankurra): kʉntana, Togua, Abu, Shoma, Saga, Zhinzhoma,
  Mena, Kʉsokua, Uma, Kʉntana, Urraga, Kʉn, Urrami, ñame, Shima, Lema, Misi,
  Zeku, suzhi. Cada una: palabra clave, texto de 3-5 oraciones, 2 preguntas.
- Ortografía con **rr** (Urraga, kʉntanaru), **dzh**, vocales nasales (ã, ʉ̃) y
  «kw/gw» (kwaga, ugwana) donde otras fuentes escriben ku/gu. Usa «-ru» como
  marca de tema («Sagaru…», «Urragaru…») en casi todas las oraciones.
- Hallazgo gramatical: 30 de las 38 preguntas terminan en **«ki nanu?»** (o
  «nanú?», «maú?»): es un patrón interrogativo que el corpus no tiene como regla.
- Pares útiles: 0 paralelos. Para hablantes: 19 palabras + ~19 textos + 38
  preguntas por traducir.

### 5. Lista Swadesh-Rowe SIL (Williams & Williams con José Ramón, 1990/2020, CC BY-NC-SA)
- OCR de formulario manuscrito: ~375 entradas; quizá 150 legibles con
  confianza, el resto con letras cambiadas (kKLKKa, ¿bu, 8amúku, d2íra).
- Transcripción fonética de 1990: ɨ por ʉ, ʒ por zh, ʃ por sh, tildes de acento,
  «kk» geminadas. Hay que convertir y conservar el original.
- Coincidencias visibles con el corpus y el Living Dictionary: áde padre, abu
  madre, ména mujer, terúa hombre, gúma culebra, misi gato, shóma flor, saga
  luna, uma ojo, ura(ga) casa, ingui uno, mogua dos, kúggi = kʉgui año.
- Nota del lingüista en la entrada 260 «no (not)»: *much more complicated
  (nasalized accented vowel on end of word)*. Coincide con las formas negativas
  del corpus (Nanún, Nandunun: vocal final acentuada).
- Pares útiles: ~150 palabras básicas tras transcribir desde el PDF (pendiente).

### 6. Hoppe 1973, «Malayo» (cultura material)
- OCR regular; texto etnográfico en español. Términos damana en el texto:
  shinbiru (gancho del fogón), carumba (aparato de hilar), mbu (hamaca), zecu
  (lanzadera, «escorpión»), mbúzheshá (cuerdas de hamaca), bucu (olla de
  barro), dumburu (poporo), bwe súzu (mochila grande), suzu (mochila), duadu
  (mochila de algodón), sugulia (huso), busa (cargador de niño), mama
  (curandero).
- Pares útiles: ~12 palabras, varias ya en otras fuentes (Buu, Dʉmburru, Duadu,
  Zeku, búku).

### 7. El camino del muchacho (Casa Wiwa, 2018)
- Texto nativo de buena calidad, pero **monolingüe**: los tres relatos («Ra zen
  nʉkʉnakanka», «Ubeju Sakʉn», «Atanqui ranzhadezhana gugʉn yunanarga») no
  traen traducción. Bilingües solo el título, la línea del taller y la
  presentación (y esa no es traducción oración por oración).
- Problema de extracción: el PDF usa **ᵾ (U+1D7E)** en muchas palabras donde
  debería ir ʉ (U+0289): «sakᵾn», «nᵾnkua», «ranzhabu … nᵾguanᵾn». Cualquier
  cosa que se tome de aquí debe normalizar ᵾ → ʉ (el importador no lo hace hoy).
- Vocabulario visible que ya está en el corpus: ranzhabu (mi mamá), ranzhiduga
  (mi hermano menor), ubeju (ovejo), uraga/urragamba (casa), kangaga (cerro),
  matshu (macho), dumeguma, argua, zhaneka.
- Pares útiles: ~4 bilingües. Como monolingüe: ~90 oraciones para elicitación
  (demasiado largas para la primera pasada; mejor pedir frases sueltas).

### 8. Por qué hablar Damana (Ismael Conchacala)
- Ensayo en español. En damana: el título («¿Inzhue Damana ashayakuaga?»),
  «madre suntalu y padre shka-sanja», y dos frases: «tiendaka irugua ingui
  libra shanawa» = «ve y compra una libra de yuca»; «Terga ingui kusha irugua
  awurtshan naya neku» = «ve y arranca una mata de yuca en la huerta».
- Pares útiles: 3. Valiosos porque son cotidianos (tienda, libra, huerta).

### 9-11. Palabras y objetos, Duganzhe tuakuaga, Misnigama (Wiwa Gago)
- Imagen; OCR vacío. Misnigama es «Minsiguma iskumanka / El gatito perdido»
  (SIL 2009/2011, cartilla ilustrada). Palabras y objetos: una lámina.
- Pendiente de transcribir mirando el PDF (en esta máquina solo posible con el
  navegador, página a página).

### 12. Fe y cultura entre Wiwa y Arhuaco
- Transcripción en español de un encuentro. Sin damana. Se descarta.

## Decisiones para los pasos siguientes
1. **Vocabulario (paso 2):** cruzar el Living Dictionary completo; añadir los ~12
   términos de Hoppe 1973 y el glosario de Hoppe 1974 convertido (marcado
   «ortografía ILV 1974»); el Swadesh entra solo con las entradas legibles y
   todas marcadas «confirmar», hasta transcribir el PDF.
2. **Frases (paso 3):** de las fuentes «bilingües» salen muy pocos pares
   naturales (3 + 4). Lo aprovechable son las 118 oraciones glosadas de Hoppe
   1974 y las ~45 de Trillos como **dominio gramática**, no como cotidiano. La
   cartilla y «El camino del muchacho» van al lote de elicitación.
3. **Reglas (paso 4):** Trillos basta para proponer pregunta, imperativos,
   prohibición y negación del imperfectivo; el patrón «ki nanu?» de la cartilla
   y la nota del Swadesh sobre la vocal nasal acentuada se añaden como indicios.
4. **Normalización:** además de ü/u+ → ʉ, hay que tratar ᵾ (U+1D7E) → ʉ, y en
   Trillos decidir u/ʉ con el corpus. Las formas con rr (Urraga) coinciden con
   el corpus; las de Hoppe con c/qu/cw se convierten con tabla.
