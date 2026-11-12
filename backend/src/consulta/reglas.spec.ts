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

describe('inferirDisparador (based on «tipo de regla» and «qué hace»)', () => {
  it('pluraliza → plural', () => {
    expect(inferirDisparador('sufijo', 'pluraliza sustantivos')).toBe('plural');
  });

  it('posesivo / "de" → posesivo', () => {
    expect(inferirDisparador('sufijo', 'posesivo / "de"')).toBe('posesivo');
  });

  it('negation, question, past and future, with and without accents', () => {
    expect(inferirDisparador('partícula', 'Negación del verbo')).toBe('negacion');
    expect(inferirDisparador('sufijo', 'marca de pregunta')).toBe('pregunta');
    expect(inferirDisparador('sufijo', 'tiempo pasado')).toBe('pasado');
    expect(inferirDisparador('sufijo', 'Futuro')).toBe('futuro');
  });

  it('no recognizable hint → null (general rule)', () => {
    expect(inferirDisparador('sufijo', 'énfasis')).toBeNull();
    expect(inferirDisparador(null, undefined)).toBeNull();
  });
});

describe('detectarDisparadoresEspanol', () => {
  it('plural by determiner and by noun ending in -s', () => {
    expect(detectarDisparadoresEspanol('los hombres caminan')).toContain('plural');
    expect(detectarDisparadoresEspanol('llegaron muchas personas')).toContain('plural');
  });

  it('possessive by «mi/su» and by «de X»', () => {
    expect(detectarDisparadoresEspanol('mi mamá cocina en la casa')).toContain('posesivo');
    expect(detectarDisparadoresEspanol('la casa de Dios')).toContain('posesivo');
  });

  it('negation and question', () => {
    expect(detectarDisparadoresEspanol('no quiero comer')).toContain('negacion');
    expect(detectarDisparadoresEspanol('¿dónde está el agua?')).toContain('pregunta');
    expect(detectarDisparadoresEspanol('Quién vino')).toContain('pregunta');
  });

  it('past by accented ending, regular and irregular', () => {
    expect(detectarDisparadoresEspanol('ayer comí yuca')).toContain('pasado');
    expect(detectarDisparadoresEspanol('ellos llegaron tarde')).toContain('pasado');
    expect(detectarDisparadoresEspanol('él fue al río')).toContain('pasado');
  });

  it('future by adverb, ending and the «va a» periphrasis', () => {
    expect(detectarDisparadoresEspanol('mañana iré al pueblo')).toContain('futuro');
    expect(detectarDisparadoresEspanol('comeremos pescado')).toContain('futuro');
    expect(detectarDisparadoresEspanol('vamos a aprender')).toContain('futuro');
  });

  it('a neutral sentence triggers nothing', () => {
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

  it('in Spanish it selects by triggers and always adds the general ones', () => {
    const r = seleccionarReglas('mi mamá cocina', Idioma.espanol, reglas);
    expect(r.disparadores).toEqual(['posesivo']);
    expect(r.reglas.map((x) => x.id)).toEqual([2, 4]);
  });

  it('in Damana it is triggered by suffix: terruandzina → plural (-ndzina)', () => {
    const r = seleccionarReglas('terruandzina dzinaia', Idioma.damana, reglas);
    expect(r.reglas.map((x) => x.id)).toEqual([1, 4]);
    expect(r.disparadores).toEqual(['plural']);
  });

  it('in Damana the suffix requires something before it and respects ʉ ≠ u', () => {
    const conU = [regla(5, '-ʉnka', 'futuro')];
    expect(seleccionarReglas('awʉnka', Idioma.damana, conU).reglas).toHaveLength(1);
    expect(seleccionarReglas('awunka', Idioma.damana, conU).reglas).toHaveLength(0);
    expect(seleccionarReglas('ʉnka', Idioma.damana, conU).reglas).toHaveLength(0);
  });

  it('with no features only the general ones remain', () => {
    const r = seleccionarReglas('el agua es una', Idioma.espanol, reglas);
    expect(r.reglas.map((x) => x.id)).toEqual([4]);
  });
});
