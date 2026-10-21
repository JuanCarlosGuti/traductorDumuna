import * as ExcelJS from 'exceljs';
import { AMARILLO, COLUMNAS_ELICITACION } from '../pendientes/pendientes.service';

export type VarianteParadigma = '' | 'pasado' | 'futuro' | 'negativo' | 'plural' | 'pregunta';

export interface FilaParadigma {
  id: string;
  ejemploEs: string;
  variante: VarianteParadigma;
  /** Qué casilla del paradigma es: «comer · yo · presente». */
  etiqueta: string;
}

type Fila = [oracion: string, variante: VarianteParadigma, etiqueta: string];

/**
 * Oraciones casi iguales a propósito: cambian UNA cosa cada vez (la
 * persona, el tiempo, la negación), para que al compararlas se vea qué
 * pone el damana en cada caso. El vocabulario del español ya enseña las
 * palabras; lo que falta es la gramática, que es muy distinta.
 *
 * LISTA DE SOLO AÑADIR: el id sale de la posición. Insertar o reordenar
 * cambiaría los ids de un lote que las hablantes ya pueden tener lleno.
 * Lo nuevo va SIEMPRE al final.
 */
function verbo(nombre: string, formas: [string, string, string, string, string, string, string, string, string, string, string, string, string, string]): Fila[] {
  const [yo, tu, el, nos, uds, ellos, yoPas, yoFut, yoNeg, tuPreg, elPas, elFut, elNeg, elPreg] = formas;
  return [
    [yo, '', `${nombre} · yo · presente`],
    [tu, '', `${nombre} · tú · presente`],
    [el, '', `${nombre} · él · presente`],
    [nos, 'plural', `${nombre} · nosotros · presente`],
    [uds, 'plural', `${nombre} · ustedes · presente`],
    [ellos, 'plural', `${nombre} · ellos · presente`],
    [yoPas, 'pasado', `${nombre} · yo · pasado`],
    [yoFut, 'futuro', `${nombre} · yo · futuro`],
    [yoNeg, 'negativo', `${nombre} · yo · negación`],
    [tuPreg, 'pregunta', `${nombre} · tú · pregunta`],
    [elPas, 'pasado', `${nombre} · él · pasado`],
    [elFut, 'futuro', `${nombre} · él · futuro`],
    [elNeg, 'negativo', `${nombre} · él · negación`],
    [elPreg, 'pregunta', `${nombre} · él · pregunta`],
  ];
}

const FILAS: Fila[] = [
  ...verbo('comer', [
    'Yo como yuca.', 'Tú comes yuca.', 'Él come yuca.', 'Nosotros comemos yuca.',
    'Ustedes comen yuca.', 'Ellos comen yuca.', 'Ayer yo comí yuca.',
    'Mañana yo voy a comer yuca.', 'Yo no como yuca.', '¿Tú comes yuca?',
    'Ayer él comió yuca.', 'Mañana él va a comer yuca.', 'Él no come yuca.', '¿Él come yuca?',
  ]),
  ['Ayer yo no comí yuca.', 'negativo', 'comer · yo · pasado con negación'],
  ['¿Ayer comiste yuca?', 'pregunta', 'comer · tú · pasado con pregunta'],
  ...verbo('ir', [
    'Yo voy al río.', 'Tú vas al río.', 'Él va al río.', 'Nosotros vamos al río.',
    'Ustedes van al río.', 'Ellos van al río.', 'Ayer yo fui al río.',
    'Mañana yo voy a ir al río.', 'Yo no voy al río.', '¿Tú vas al río?',
    'Ayer él fue al río.', 'Mañana él va a ir al río.', 'Él no va al río.', '¿Él va al río?',
  ]),
  ...verbo('ver', [
    'Yo veo el perro.', 'Tú ves el perro.', 'Él ve el perro.', 'Nosotros vemos el perro.',
    'Ustedes ven el perro.', 'Ellos ven el perro.', 'Ayer yo vi el perro.',
    'Mañana yo voy a ver el perro.', 'Yo no veo el perro.', '¿Tú ves el perro?',
    'Ayer él vio el perro.', 'Mañana él va a ver el perro.', 'Él no ve el perro.', '¿Él ve el perro?',
  ]),

  // A quién le pasa la acción
  ['Él me ve.', '', 'a quién · a mí'],
  ['Él te ve.', '', 'a quién · a ti'],
  ['Él nos ve.', 'plural', 'a quién · a nosotros'],
  ['Yo te veo.', '', 'a quién · yo a ti'],
  ['Tú me ves.', '', 'a quién · tú a mí'],
  ['Yo los veo a ellos.', 'plural', 'a quién · a ellos'],
  ['Mi mamá me da yuca.', '', 'a quién · dar a mí'],
  ['Yo le doy yuca a mi mamá.', '', 'a quién · dar a ella'],

  // Órdenes
  ['Come la yuca.', '', 'orden · comer'],
  ['No comas la yuca.', 'negativo', 'orden · no comer'],
  ['Vamos al río.', 'plural', 'orden · vamos'],
  ['Ven a la casa.', '', 'orden · venir'],
  ['No vayas al río.', 'negativo', 'orden · no ir'],
  ['Siéntate aquí.', '', 'orden · sentarse'],

  // El nombre: cuántos, de quién, dónde
  ['La casa.', '', 'nombre · una casa'],
  ['Las casas.', 'plural', 'nombre · varias casas'],
  ['Mi casa.', '', 'de quién · mía'],
  ['Tu casa.', '', 'de quién · tuya'],
  ['La casa de él.', '', 'de quién · de él'],
  ['Nuestra casa.', 'plural', 'de quién · nuestra'],
  ['La casa de mi mamá.', '', 'de quién · de mi mamá'],
  ['Estoy en la casa.', '', 'dónde · en'],
  ['Vengo de la casa.', '', 'dónde · desde'],
  ['Voy hacia la casa.', '', 'dónde · hacia'],
  ['Voy con mi mamá.', '', 'con quién'],
  ['Esto es para mi mamá.', '', 'para quién'],
  ['Un perro.', '', 'cuántos · uno'],
  ['Dos perros.', 'plural', 'cuántos · dos'],
  ['Muchos perros.', 'plural', 'cuántos · muchos'],
  ['Este perro.', '', 'cuál · este'],
  ['Ese perro.', '', 'cuál · ese'],
  ['El perro grande.', '', 'cómo es · grande'],
  ['Los perros grandes.', 'plural', 'cómo es · grandes'],
  ['El perro de mi hermano.', '', 'de quién · de mi hermano'],

  // Decir cómo es algo
  ['La casa es grande.', '', 'es · afirmación'],
  ['La casa no es grande.', 'negativo', 'es · negación'],
  ['¿La casa es grande?', 'pregunta', 'es · pregunta'],
  ['Las casas son grandes.', 'plural', 'es · plural'],
  ['La casa era grande.', 'pasado', 'es · pasado'],
  ['El agua está fría.', '', 'está · afirmación'],
  ['El agua no está fría.', 'negativo', 'está · negación'],

  // Haber y tener
  ['Hay agua.', '', 'hay · afirmación'],
  ['No hay agua.', 'negativo', 'hay · negación'],
  ['¿Hay agua?', 'pregunta', 'hay · pregunta'],
  ['Tengo un perro.', '', 'tener · afirmación'],
  ['No tengo perro.', 'negativo', 'tener · negación'],
  ['¿Tienes un perro?', 'pregunta', 'tener · pregunta'],
  ['Mi mamá tiene dos mochilas.', 'plural', 'tener · ella, plural'],

  // Preguntas con palabra de pregunta
  ['¿Qué es esto?', 'pregunta', 'pregunta · qué'],
  ['¿Quién vino?', 'pregunta', 'pregunta · quién'],
  ['¿Dónde está tu mamá?', 'pregunta', 'pregunta · dónde'],
  ['¿Cuándo vienes?', 'pregunta', 'pregunta · cuándo'],
  ['¿Por qué lloras?', 'pregunta', 'pregunta · por qué'],
  ['¿Cuántos perros tienes?', 'pregunta', 'pregunta · cuántos'],
  ['¿Cómo te llamas?', 'pregunta', 'pregunta · cómo'],
  ['¿Para dónde vas?', 'pregunta', 'pregunta · para dónde'],

  // Unir dos ideas
  ['Mi mamá cocina y mi papá trabaja.', '', 'unir · y'],
  ['Quiero ir al río pero llueve.', '', 'unir · pero'],
  ['Si llueve, no voy al río.', 'negativo', 'unir · si'],
  ['Cuando llegue mi mamá, comemos.', 'futuro', 'unir · cuando'],
  ['Voy al río porque quiero agua.', '', 'unir · porque'],
  ['Quiero comer.', '', 'dos verbos · querer'],
  ['No quiero comer.', 'negativo', 'dos verbos · no querer'],
  ['Puedo ir al río.', '', 'dos verbos · poder'],
  ['Tengo que trabajar.', '', 'dos verbos · tener que'],
  ['Él dice que viene mañana.', 'futuro', 'dos verbos · decir que'],
];

export const PARADIGMAS: FilaParadigma[] = FILAS.map(([ejemploEs, variante, etiqueta], i) => ({
  id: `g${String(i + 1).padStart(3, '0')}`,
  ejemploEs,
  variante,
  etiqueta,
}));

export const ARCHIVO_PARADIGMAS = 'formato_elicitacion_lote2_gramatica.xlsx';

/**
 * El lote de gramática en el MISMO formato de elicitación, para que el
 * importador lo absorba sin cambios cuando vuelva lleno: cada oración
 * traducida entra como ejemplo cotidiano (y 1 de cada 10 queda de prueba).
 * No pide palabra suelta: solo se llena ejemplo_dm.
 */
export function construirLibroParadigmas(): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();

  const instrucciones = libro.addWorksheet('instrucciones');
  instrucciones.getColumn(1).width = 110;
  [
    'LOTE 2 DE ELICITACIÓN — GRAMÁTICA (para quien tenga experiencia traduciendo)',
    '',
    'Son oraciones muy cortas y muy parecidas a propósito: de una a otra cambia UNA sola cosa (quién lo hace, cuándo, si es que no, si es pregunta).',
    'Traduzcan cada oración completa al damana en la columna amarilla (ejemplo_dm). No se salten las que parecen repetidas: justo esas son las que nos enseñan.',
    'Si dos oraciones se dicen igual en damana, escríbanlas igual y díganlo en notas. Si una no se puede decir así, escriban cómo se diría y explíquenlo.',
    'La ʉ (u partida) pueden escribirla como ü o como u+ ; nosotros la convertimos.',
    'MUY IMPORTANTE: no borren, no muevan ni inserten filas. Si algo no lo saben, déjenlo vacío.',
  ].forEach((linea) => instrucciones.addRow([linea]));
  instrucciones.getRow(1).font = { bold: true };
  instrucciones.eachRow((fila) => {
    fila.alignment = { wrapText: true, vertical: 'top' };
  });

  const hoja = libro.addWorksheet('elicitacion');
  const anchos: Record<(typeof COLUMNAS_ELICITACION)[number], number> = {
    id: 8,
    ambito: 12,
    palabra_es: 12,
    palabra_dm: 12,
    ejemplo_es: 40,
    ejemplo_dm: 48,
    variante: 11,
    notas: 40,
  };
  hoja.columns = COLUMNAS_ELICITACION.map((c) => ({ header: c, key: c, width: anchos[c] }));
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  for (const p of PARADIGMAS) {
    const fila = hoja.addRow({
      id: p.id,
      ambito: 'gramatica',
      palabra_es: '',
      palabra_dm: '',
      ejemplo_es: p.ejemploEs,
      ejemplo_dm: '',
      variante: p.variante,
      notas: p.etiqueta,
    });
    fila.alignment = { vertical: 'top', wrapText: true };
    fila.getCell('ejemplo_dm').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: AMARILLO },
    };
  }
  return libro;
}
