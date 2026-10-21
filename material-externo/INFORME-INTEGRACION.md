# Informe de integración del material externo

Paso 5 de `INSTRUCCIONES-CLAUDE-CODE.md`. Hecho el 21 de octubre de 2026.

## Lo primero: qué entró al corpus

**Nada.** Por diseño: las instrucciones piden aprobación del dueño antes de
tocar `/datos`, y el cruce mostró que buena parte del material choca con lo
que ya hay (grafía, sentido o glosa). Todo quedó preparado en `salida/` para
cargar lo que se apruebe. Las cuatro capas de pruebas y `npm run importar`
siguen en verde porque el corpus no cambió.

## Conteos

| Fuente | Entradas leídas | Ya estaban | Divergen | Nuevas (alta / media / baja) |
|---|---|---|---|---|
| Living Dictionary (209) | 207 | 43 | 83 | 84 (84 / 0 / 0) |
| Swadesh SIL 1990 (legibles) | 165 | 56 | 55 | 42 |
| Hoppe 1974, glosario «La culebra» | 183 | 27 | 97 | 65 |
| Hoppe 1973, cultura material | 13 | 2 | 2 | 9 |
| **Total** | **568** | **128** | **237** | **200 (94 / 102 / 4)** |

De las 128 coincidencias, 29 tenían la glosa escrita distinto («Lea» /
«leer», «Territorio (tierra)» / «Tierra», «pelo» / «cabello») y 5 solo se
diferenciaban en ʉ frente a u: el cruce las da por iguales y no se preguntan
(quedan listadas para el revisor en la hoja «ya resueltas»).

Divergencias por tipo (una fila por entrada externa): mismo significado con
otra grafía 28; misma forma damana con otro significado 38; grafía parecida
con significado distinto 14; mismo significado con otra palabra 157.

Archivos: `salida/vocabulario_nuevo.csv` (formato exacto del corpus, con
`fuente`), `salida/divergencias_vocabulario.csv`,
`salida/coincidencias_vocabulario.csv`, `salida/frases_nuevas.csv` (6 pares
cotidianos/narrativos + 43 oraciones glosadas de Trillos),
`salida/reglas_propuestas.{md,csv}` (26 reglas) y
`salida/preguntas_hablantes.xlsx` (116 filas de damana por traducir + 268
divergencias con casilla de respuesta). Se regeneran con
`node material-externo/herramientas/cruzar_vocabulario.js` y
`node material-externo/herramientas/generar_preguntas_hablantes.js`.

## Hallazgos que importan más que los conteos

1. **Convención de escritura del corpus: gw/kw frente a gu/ku.** El corpus
   escribe Ijkagwa, Kugwa, Makegwa, Ugwa, Irrugwa, Munkwa, Dukshwi; el Living
   Dictionary y el Swadesh escriben Ijkagua, Kugua, Makegua, Ugua, Irrugua,
   Mʉkua, Dukushui. También dz/dzh (Dzira/Dzhirra, dziwa/Dzhiwa), j/h
   (Jomʉn/Homʉn), ch/tsh (Chwi/Tshui), u/ʉ (Nungu/Nʉngu). Son 34 casos
   claros y el revisor debe fijar la norma; mientras tanto el traductor trata
   cada grafía como palabra distinta.
2. **Divergencias reales de significado** que hay que preguntar: Gula «mano»
   (corpus) / «brazo» (LD); Ambʉnshi «blanco» / «arroz»; Busi «sobrina» /
   «hermana menor»; Duga «sobrino, niño» / «hermano menor»; Akuzhiwa «laguna
   sagrada» / «lago»; Mawi «ustedes» / «llorar»; Nushi «está ahí» /
   «escuchar»; Kawa «familia, amigo» / «primo»; Zukuega «bonito» / «bueno»;
   Zhinzhoma «libro» / «hoja»; Kʉn «leña» / «árbol, madera, palo»; amarillo
   kashkuama (LD) / maruru (Swadesh).
3. **Muchas «divergencias de significado» no lo son**: el corpus glosa con
   imperativos o formas conjugadas («Lea» Asheshisha, «Siéntese» Asha,
   «Pregúntele» Ashizha, «mató» gwága) donde la fuente da el infinitivo. Es
   una tarea de normalización de glosas para el revisor, y explica parte del
   47 % de cobertura del diccionario que medimos: el traductor busca «leer» y
   el corpus tiene «Lea».
4. **Negación**: tres fuentes independientes apuntan a lo mismo que ya
   mostraban las formas del corpus: la negación es un sufijo verbal con vocal
   final nasal acentuada (-un/-ún; Trillos -ung; Swadesh n.º 260). Está en
   `reglas_propuestas` como regla por confirmar. Es justo lo que le falta al
   traductor para dejar de poner «[no]».
5. **Pregunta**: acento final (Trillos) y cierre «… ki nanu?» (30 de 38
   preguntas de la cartilla). Tampoco hay regla hoy.
6. **ᵾ (U+1D7E)**: los PDF extraídos traen ese carácter donde va ʉ. Las
   herramientas de esta carpeta lo normalizan; el importador no (ver cambios
   de código abajo).

## Lo que fue a las hablantes y al revisor

El dueño paga a las hablantes por palabra, así que se separó en dos
cuadernos (ambos salen de `herramientas/generar_preguntas_hablantes.js`,
casillas por llenar en amarillo, listas desplegables donde aplica):

**`salida/preguntas_hablantes.xlsx` — solo dudas reales (24 filas).**
- «significados» (17): la misma palabra damana con dos sentidos que no son
  el mismo escrito distinto, de fuentes hechas con hablantes (Living
  Dictionary, Swadesh): Gula «mano» / «brazo», Ambʉnshi «blanco» / «arroz»,
  Busi «sobrina» / «hermana menor», Duga, Dunga, Ina, Kawa, Kʉn, Mawi, Nushi,
  te, Zhama, zhinzhoma, Gana, Soma, Ingui, Kewa. Una fila por palabra.
- «reglas» (7): las que de verdad necesitan a una hablante, como pregunta
  con ejemplo y espacio para un ejemplo propio: negación (-un/-ún),
  pregunta por acento, «ki nanu», prohibición (-wi nʉnka; nazhi), hortativo
  uzhi y posesivos por prefijo.

**`salida/revision_material_externo.xlsx` — para el revisor (una persona).**
- «palabras nuevas» (200): ¿se aceptan tal cual? (84 del Living Dictionary
  con seguridad alta; el resto, ortografías viejas convertidas).
- «escritura» (28 pares + 5 preguntas generales: gu/gw, dz/dzh, j/h, ch/tsh,
  rr): define la norma de escritura del corpus en adelante.
- «palabras distintas» (157): dos palabras damana para lo mismo.
- «grafía parecida» (14) y «significados (Hoppe 1974)» (18): partículas y
  glosas literales del relato de 1974; son de gramática.
- «reglas» (19): las demás reglas de Trillos.
- «ya resueltas» (34): lo que el cruce dio por igual sin preguntar, por si
  alguna no lo es.
- «texto por traducir (opcional)» (116): la cartilla de 2012 y las líneas de
  «El camino del muchacho», en el formato de elicitación del proyecto. No es
  una duda: solo si se decide pagar ese trabajo.

Ninguno de los dos se llama `formato_elicitacion_*.xlsx` a propósito: el
importador actual exige `palabra_es` para crear vocabulario y, con filas que
solo traen damana, generaría pendientes vacías (ver cambios de código).
Cuando vuelvan llenos hará falta un paso que lea estas hojas y aplique las
respuestas, igual que falta para el documento de dudas.

## Reglas del dueño aplicadas el 21 de octubre
1. **Solo dudas reales a las hablantes.** Lo que ya sabemos (mayúscula o
   minúscula inicial, glosa en imperativo frente a infinitivo, sinónimos del
   español, lo que va entre paréntesis) no se pregunta: el cruce lo da por
   igual y lo deja en «ya resueltas» para el revisor.
2. **Si dos formas solo se diferencian en ʉ frente a u, prevalece la que
   lleva ʉ**, sea la fuente vieja o nueva: quitarla es un error porque cambia
   el sonido. El cruce la aplica solo y escribe `correcciones_u_partida.csv`
   cuando el que perdió la ʉ es el corpus. Hubo una, y se aplicó al corpus:
   **Sal: Nungu → Nʉngu** (lo traen con ʉ el Living Dictionary y el Swadesh),
   y por indicación del dueño también en las dos oraciones del folleto que
   escribían «nungu» (lfb_MLY_p033_s001 y s005, «estatua de sal»).
   Matiz del dueño: la ʉ suena «medio gutural» (aproximación) y la u como en
   español; los textos antiguos a veces escriben u por ʉ, así que al leerlos
   se admite que una u pueda ser ʉ, pero se conserva la forma con ʉ.
   La misma regla vale para la hoja 1 del documento de dudas (u/ʉ).
3. **Dónde más pasa dentro del corpus.**
   `herramientas/variantes_u_en_corpus.js` busca en oraciones, frases y
   conjugaciones palabras escritas con u cuya forma con ʉ está en el
   vocabulario y cuya forma con u no es otra palabra: 21 palabras, 55
   apariciones (duma→dʉma 8, naiun→naiʉn 6, nanunkurra→nanʉnkurra 5,
   nekunkurra→nekʉnkurra 5, guagun→guagʉn 4, bugui→bʉgui 4,
   nujkunanun→nʉjkʉnanun 4…). NO se corrigieron en bloque: «duma» aparece
   también en la cartilla de 2012, que sí escribe ʉ en otras palabras, así
   que puede ser una palabra distinta. Van al revisor en la hoja «u por ʉ en
   el corpus» de `revision_material_externo.xlsx`; lo que marque «sí, la
   misma» se corrige después en los CSV.

## Lo que se descartó y por qué
- *Fe y cultura entre Wiwa y Arhuaco*: solo español.
- *Por qué hablar Damana*: ensayo en español; se aprovecharon sus 3 frases.
- Las 118 oraciones de Hoppe 1974: el OCR del damana es malo, la traducción
  es literal palabra por palabra (no español natural) y la obra tiene reserva
  de derechos; solo se tomó el glosario (palabras sueltas).
- *Palabras y objetos*, *Duganzhe tuakuaga*, *Misnigama*: son imagen y en
  esta máquina no hay renderizador de PDF (el visor de Chrome tampoco se
  dejó capturar). Pendiente de transcribir a mano: son 6 páginas.
- La lista Swadesh entró solo en su parte legible (165 de 375); el resto
  requiere leer el manuscrito.

## Derechos: por qué `pdf/` y `texto/` no van a git
El repositorio es público. Hoppe 1973 y 1974 dicen «ninguna parte … puede
ser reproducida sin autorización escrita». El Swadesh es CC BY-NC-SA, la
cartilla CC BY-SA, Trillos es un artículo académico y el material de Wiwa
Gago es de difusión comunitaria. Para no mezclar, se excluyeron las dos
carpetas completas en `.gitignore`; los originales viven en local. Lo que sí
se versiona son datos derivados (listas de palabras, pares cortos, informes)
con su fuente citada en cada fila. Si el dueño prefiere versionar los de
licencia abierta, basta quitar la excepción para esos archivos.

## Cambios de código necesarios para cargar lo que se apruebe
Ninguno está hecho; se harían con tests y en commits aparte.
1. **Importador, `dominio` en frases.** Hoy toda fila de `corpus_frases_v2.csv`
   entra como cotidiano. Para que las 43 oraciones de Trillos entren como
   gramática hace falta una columna opcional `dominio` en ese CSV (o un CSV
   nuevo `corpus_frases_gramatica.csv`).
2. **Importador, elicitación damana → español.** Aceptar filas con
   `palabra_dm`/`ejemplo_dm` y el lado español vacío: mientras estén vacías no
   crear pendientes; cuando vuelvan llenas, entran como vocabulario y frase.
3. **Ortografía:** `corregirOrtografiaDamana()` debería mapear ᵾ (U+1D7E) y
   Ᵽ (U+1D7D) a ʉ/Ʉ, como ya hace con ü.
4. **Vocabulario con varias fuentes:** el corpus ya tiene columna `fuente`;
   las NUEVAS aprobadas se añaden a `corpus_vocabulario_v3.csv` tal cual
   (`vocabulario_nuevo.csv` ya tiene el formato). Si se prefiere no mezclar,
   un `corpus_vocabulario_externo.csv` requiere que el importador lea más de
   un archivo de vocabulario.

## Cómo cargar cuando el dueño apruebe
1. Revisar `vocabulario_nuevo.csv`: lo marcado «confianza alta» (97) son
   entradas limpias del Living Dictionary y las del Swadesh que coinciden con
   otra fuente; lo «media» (104) viene de ortografías viejas convertidas y
   conviene que lo vea el revisor antes.
2. Pegar las filas aprobadas al final de `datos/corpus_vocabulario_v3.csv`
   (UTF-8 con BOM; la columna `fuente` ya viene puesta), `npm run importar`,
   comprobar en Diccionario y en el Traductor con cinco frases que usen
   palabras nuevas (por ejemplo «hola», «gracias», «adiós», «bienvenido»,
   «zapatos»).
3. Las divergencias de grafía se resuelven con la hoja «divergencias» y la
   hoja 1 del documento de dudas; las de significado, con la hablante.
4. Las reglas de `reglas_propuestas.csv` se pegan en `reglas_damana.xlsx`
   solo las que confirme la hablante; el importador infiere el disparador
   del tipo y del «qué hace» (negación → `negacion`, pregunta → `pregunta`).

## Qué pediría a SIL Colombia (sección B de FUENTES.md)
- Williams, Cindy (1993), *A grammar sketch of Dəməna*: la única gramática
  completa; cubriría pasado y futuro, que siguen sin regla.
- Williams, Larry (1995), verbos de orientación: «estar», «poner», «debajo».
- Hoppe & Hoppe (1987), *Cartilla primera en Malayo*: frases cortas, útiles
  tal cual para elicitación.
