import * as ExcelJS from 'exceljs';
import { YELLOW, ELICITATION_COLUMNS } from '../pendientes/pendientes.service';

export type ParadigmVariant = '' | 'pasado' | 'futuro' | 'negativo' | 'plural' | 'pregunta';

export interface ParadigmRow {
  id: string;
  ejemploEs: string;
  variante: ParadigmVariant;
  /** Which cell of the paradigm it is: «comer · yo · presente». */
  etiqueta: string;
}

type Row = [oracion: string, variante: ParadigmVariant, etiqueta: string];

/**
 * Sentences that are almost equal on purpose: they change ONE thing at a time (the
 * person, the tense, the negation), so that comparing them shows what
 * Damana uses in each case. The Spanish vocabulary already teaches the
 * words; what is missing is the grammar, which is very different.
 *
 * APPEND-ONLY LIST: the id comes from the position. Inserting or reordering
 * would change the ids of a batch the speakers may already have filled in.
 * New items ALWAYS go at the end.
 */
function verb(name: string, forms: [string, string, string, string, string, string, string, string, string, string, string, string, string, string]): Row[] {
  const [yo, tu, el, nos, uds, ellos, yoPas, yoFut, yoNeg, tuPreg, elPas, elFut, elNeg, elPreg] = forms;
  return [
    [yo, '', `${name} · yo · presente`],
    [tu, '', `${name} · tú · presente`],
    [el, '', `${name} · él · presente`],
    [nos, 'plural', `${name} · nosotros · presente`],
    [uds, 'plural', `${name} · ustedes · presente`],
    [ellos, 'plural', `${name} · ellos · presente`],
    [yoPas, 'pasado', `${name} · yo · pasado`],
    [yoFut, 'futuro', `${name} · yo · futuro`],
    [yoNeg, 'negativo', `${name} · yo · negación`],
    [tuPreg, 'pregunta', `${name} · tú · pregunta`],
    [elPas, 'pasado', `${name} · él · pasado`],
    [elFut, 'futuro', `${name} · él · futuro`],
    [elNeg, 'negativo', `${name} · él · negación`],
    [elPreg, 'pregunta', `${name} · él · pregunta`],
  ];
}

const ROWS: Row[] = [
  ...verb('comer', [
    'Yo como yuca.', 'Tú comes yuca.', 'Él come yuca.', 'Nosotros comemos yuca.',
    'Ustedes comen yuca.', 'Ellos comen yuca.', 'Ayer yo comí yuca.',
    'Mañana yo voy a comer yuca.', 'Yo no como yuca.', '¿Tú comes yuca?',
    'Ayer él comió yuca.', 'Mañana él va a comer yuca.', 'Él no come yuca.', '¿Él come yuca?',
  ]),
  ['Ayer yo no comí yuca.', 'negativo', 'comer · yo · pasado con negación'],
  ['¿Ayer comiste yuca?', 'pregunta', 'comer · tú · pasado con pregunta'],
  ...verb('ir', [
    'Yo voy al río.', 'Tú vas al río.', 'Él va al río.', 'Nosotros vamos al río.',
    'Ustedes van al río.', 'Ellos van al río.', 'Ayer yo fui al río.',
    'Mañana yo voy a ir al río.', 'Yo no voy al río.', '¿Tú vas al río?',
    'Ayer él fue al río.', 'Mañana él va a ir al río.', 'Él no va al río.', '¿Él va al río?',
  ]),
  ...verb('ver', [
    'Yo veo el perro.', 'Tú ves el perro.', 'Él ve el perro.', 'Nosotros vemos el perro.',
    'Ustedes ven el perro.', 'Ellos ven el perro.', 'Ayer yo vi el perro.',
    'Mañana yo voy a ver el perro.', 'Yo no veo el perro.', '¿Tú ves el perro?',
    'Ayer él vio el perro.', 'Mañana él va a ver el perro.', 'Él no ve el perro.', '¿Él ve el perro?',
  ]),

  // Who the action happens to
  ['Él me ve.', '', 'a quién · a mí'],
  ['Él te ve.', '', 'a quién · a ti'],
  ['Él nos ve.', 'plural', 'a quién · a nosotros'],
  ['Yo te veo.', '', 'a quién · yo a ti'],
  ['Tú me ves.', '', 'a quién · tú a mí'],
  ['Yo los veo a ellos.', 'plural', 'a quién · a ellos'],
  ['Mi mamá me da yuca.', '', 'a quién · dar a mí'],
  ['Yo le doy yuca a mi mamá.', '', 'a quién · dar a ella'],

  // Commands
  ['Come la yuca.', '', 'orden · comer'],
  ['No comas la yuca.', 'negativo', 'orden · no comer'],
  ['Vamos al río.', 'plural', 'orden · vamos'],
  ['Ven a la casa.', '', 'orden · venir'],
  ['No vayas al río.', 'negativo', 'orden · no ir'],
  ['Siéntate aquí.', '', 'orden · sentarse'],

  // The noun: how many, whose, where
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

  // Saying what something is like
  ['La casa es grande.', '', 'es · afirmación'],
  ['La casa no es grande.', 'negativo', 'es · negación'],
  ['¿La casa es grande?', 'pregunta', 'es · pregunta'],
  ['Las casas son grandes.', 'plural', 'es · plural'],
  ['La casa era grande.', 'pasado', 'es · pasado'],
  ['El agua está fría.', '', 'está · afirmación'],
  ['El agua no está fría.', 'negativo', 'está · negación'],

  // There is / to have
  ['Hay agua.', '', 'hay · afirmación'],
  ['No hay agua.', 'negativo', 'hay · negación'],
  ['¿Hay agua?', 'pregunta', 'hay · pregunta'],
  ['Tengo un perro.', '', 'tener · afirmación'],
  ['No tengo perro.', 'negativo', 'tener · negación'],
  ['¿Tienes un perro?', 'pregunta', 'tener · pregunta'],
  ['Mi mamá tiene dos mochilas.', 'plural', 'tener · ella, plural'],

  // Questions with a question word
  ['¿Qué es esto?', 'pregunta', 'pregunta · qué'],
  ['¿Quién vino?', 'pregunta', 'pregunta · quién'],
  ['¿Dónde está tu mamá?', 'pregunta', 'pregunta · dónde'],
  ['¿Cuándo vienes?', 'pregunta', 'pregunta · cuándo'],
  ['¿Por qué lloras?', 'pregunta', 'pregunta · por qué'],
  ['¿Cuántos perros tienes?', 'pregunta', 'pregunta · cuántos'],
  ['¿Cómo te llamas?', 'pregunta', 'pregunta · cómo'],
  ['¿Para dónde vas?', 'pregunta', 'pregunta · para dónde'],

  // Joining two ideas
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

export const PARADIGMS: ParadigmRow[] = ROWS.map(([ejemploEs, variante, etiqueta], i) => ({
  id: `g${String(i + 1).padStart(3, '0')}`,
  ejemploEs,
  variante,
  etiqueta,
}));

export const PARADIGMS_FILE = 'formato_elicitacion_lote2_gramatica.xlsx';

/**
 * The grammar batch in the SAME elicitation format, so that the
 * importer absorbs it unchanged when it comes back filled in: each translated
 * sentence goes in as an everyday example (and 1 in 10 is kept as a test).
 * It does not ask for a single word: only ejemplo_dm is filled in.
 */
export function buildParadigmsWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  const instructions = workbook.addWorksheet('instrucciones');
  instructions.getColumn(1).width = 110;
  [
    'LOTE 2 DE ELICITACIÓN — GRAMÁTICA (para quien tenga experiencia traduciendo)',
    '',
    'Son oraciones muy cortas y muy parecidas a propósito: de una a otra cambia UNA sola cosa (quién lo hace, cuándo, si es que no, si es pregunta).',
    'Traduzcan cada oración completa al damana en la columna amarilla (ejemplo_dm). No se salten las que parecen repetidas: justo esas son las que nos enseñan.',
    'Si dos oraciones se dicen igual en damana, escríbanlas igual y díganlo en notas. Si una no se puede decir así, escriban cómo se diría y explíquenlo.',
    'La ʉ (u partida) pueden escribirla como ü o como u+ ; nosotros la convertimos.',
    'MUY IMPORTANTE: no borren, no muevan ni inserten filas. Si algo no lo saben, déjenlo vacío.',
  ].forEach((line) => instructions.addRow([line]));
  instructions.getRow(1).font = { bold: true };
  instructions.eachRow((row) => {
    row.alignment = { wrapText: true, vertical: 'top' };
  });

  const sheet = workbook.addWorksheet('elicitacion');
  const widths: Record<(typeof ELICITATION_COLUMNS)[number], number> = {
    id: 8,
    ambito: 12,
    palabra_es: 12,
    palabra_dm: 12,
    ejemplo_es: 40,
    ejemplo_dm: 48,
    variante: 11,
    notas: 40,
  };
  sheet.columns = ELICITATION_COLUMNS.map((c) => ({ header: c, key: c, width: widths[c] }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const p of PARADIGMS) {
    const row = sheet.addRow({
      id: p.id,
      ambito: 'gramatica',
      palabra_es: '',
      palabra_dm: '',
      ejemplo_es: p.ejemploEs,
      ejemplo_dm: '',
      variante: p.variante,
      notas: p.etiqueta,
    });
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell('ejemplo_dm').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: YELLOW },
    };
  }
  return workbook;
}
