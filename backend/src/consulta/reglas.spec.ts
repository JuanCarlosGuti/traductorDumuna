import { Idioma } from './consulta.enums';
import {
  detectarDisparadoresEspanol,
  inferirDisparador,
  ReglaGramatical,
  seleccionarReglas,
} from './reglas';

const regla = (
  id: number,
  forma: string,
  disparador: ReglaGramatical['disparador'],
): ReglaGramatical => ({
  id,
  tipo: 'sufijo',
  forma,
  significado: null,
  ejemploBase: null,
  ejemploRegla: null,
  traduccionEjemplo: null,
  notas: null,
  disparador,
});

describe('inferirDisparador (según «tipo de regla» y «qué hace»)', () => {
  it('pluraliza → plural', () => {
    expect(inferirDisparador('sufijo', 'pluraliza sustantivos')).toBe('plural');
  });

  it('posesivo / "de" → posesivo', () => {
    expect(inferirDisparador('sufijo', 'posesivo / "de"')).toBe('posesivo');
  });

  it('negación, pregunta, pasado y futuro, con y sin tildes', () => {
    expect(inferirDisparador('partícula', 'Negación del verbo')).toBe('negacion');
    expect(inferirDisparador('sufijo', 'marca de pregunta')).toBe('pregunta');
    expect(inferirDisparador('sufijo', 'tiempo pasado')).toBe('pasado');
    expect(inferirDisparador('sufijo', 'Futuro')).toBe('futuro');
  });

  it('sin pista reconocible → null (regla general)', () => {
    expect(inferirDisparador('sufijo', 'énfasis')).toBeNull();
    expect(inferirDisparador(null, undefined)).toBeNull();
  });
});

describe('detectarDisparadoresEspanol', () => {
  it('plural por determinante y por sustantivo en -s', () => {
    expect(detectarDisparadoresEspanol('los hombres caminan')).toContain('plural');
    expect(detectarDisparadoresEspanol('llegaron muchas personas')).toContain('plural');
  });

  it('posesivo por «mi/su» y por «de X»', () => {
    expect(detectarDisparadoresEspanol('mi mamá cocina en la casa')).toContain('posesivo');
    expect(detectarDisparadoresEspanol('la casa de Dios')).toContain('posesivo');
  });

  it('negación y pregunta', () => {
    expect(detectarDisparadoresEspanol('no quiero comer')).toContain('negacion');
    expect(detectarDisparadoresEspanol('¿dónde está el agua?')).toContain('pregunta');
    expect(detectarDisparadoresEspanol('Quién vino')).toContain('pregunta');
  });

  it('pasado por terminación acentuada, regular e irregular', () => {
    expect(detectarDisparadoresEspanol('ayer comí yuca')).toContain('pasado');
    expect(detectarDisparadoresEspanol('ellos llegaron tarde')).toContain('pasado');
    expect(detectarDisparadoresEspanol('él fue al río')).toContain('pasado');
  });

  it('futuro por adverbio, terminación y perífrasis «va a»', () => {
    expect(detectarDisparadoresEspanol('mañana iré al pueblo')).toContain('futuro');
    expect(detectarDisparadoresEspanol('comeremos pescado')).toContain('futuro');
    expect(detectarDisparadoresEspanol('vamos a aprender')).toContain('futuro');
  });

  it('una frase neutra no dispara nada', () => {
    expect(detectarDisparadoresEspanol('el agua es una')).toEqual([]);
  });
});

describe('seleccionarReglas', () => {
  const reglas = [
    regla(1, '-ndzina', 'plural'),
    regla(2, '-nzhe', 'posesivo'),
    regla(3, 'nun', 'negacion'),
    regla(4, '-ki', null), // general
  ];

  it('en español elige por disparadores y añade siempre las generales', () => {
    const r = seleccionarReglas('mi mamá cocina', Idioma.espanol, reglas);
    expect(r.disparadores).toEqual(['posesivo']);
    expect(r.reglas.map((x) => x.id)).toEqual([2, 4]);
  });

  it('en damana se activa por sufijo: terruandzina → plural (-ndzina)', () => {
    const r = seleccionarReglas('terruandzina dzinaia', Idioma.damana, reglas);
    expect(r.reglas.map((x) => x.id)).toEqual([1, 4]);
    expect(r.disparadores).toEqual(['plural']);
  });

  it('en damana el sufijo exige algo delante y respeta ʉ ≠ u', () => {
    const conU = [regla(5, '-ʉnka', 'futuro')];
    expect(seleccionarReglas('awʉnka', Idioma.damana, conU).reglas).toHaveLength(1);
    expect(seleccionarReglas('awunka', Idioma.damana, conU).reglas).toHaveLength(0);
    expect(seleccionarReglas('ʉnka', Idioma.damana, conU).reglas).toHaveLength(0);
  });

  it('sin rasgos solo quedan las generales', () => {
    const r = seleccionarReglas('el agua es una', Idioma.espanol, reglas);
    expect(r.reglas.map((x) => x.id)).toEqual([4]);
  });
});
