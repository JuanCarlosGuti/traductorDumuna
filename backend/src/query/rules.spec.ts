import { Language } from './query.enums';
import {
  detectSpanishTriggers,
  inferTrigger,
  GrammarRule,
  selectRules,
} from './rules';

const rule = (
  id: number,
  form: string,
  trigger: GrammarRule['disparador'],
): GrammarRule => ({
  id,
  tipo: 'sufijo',
  forma: form,
  significado: null,
  ejemploBase: null,
  ejemploRegla: null,
  traduccionEjemplo: null,
  notas: null,
  disparador: trigger,
});

describe('inferTrigger (based on «tipo de regla» and «qué hace»)', () => {
  it('pluraliza → plural', () => {
    expect(inferTrigger('sufijo', 'pluraliza sustantivos')).toBe('plural');
  });

  it('posesivo / "de" → posesivo', () => {
    expect(inferTrigger('sufijo', 'posesivo / "de"')).toBe('posesivo');
  });

  it('negation, question, past and future, with and without accents', () => {
    expect(inferTrigger('partícula', 'Negación del verbo')).toBe('negacion');
    expect(inferTrigger('sufijo', 'marca de pregunta')).toBe('pregunta');
    expect(inferTrigger('sufijo', 'tiempo pasado')).toBe('pasado');
    expect(inferTrigger('sufijo', 'Futuro')).toBe('futuro');
  });

  it('no recognizable hint → null (general rule)', () => {
    expect(inferTrigger('sufijo', 'énfasis')).toBeNull();
    expect(inferTrigger(null, undefined)).toBeNull();
  });
});

describe('detectSpanishTriggers', () => {
  it('plural by determiner and by noun ending in -s', () => {
    expect(detectSpanishTriggers('los hombres caminan')).toContain('plural');
    expect(detectSpanishTriggers('llegaron muchas personas')).toContain('plural');
  });

  it('possessive by «mi/su» and by «de X»', () => {
    expect(detectSpanishTriggers('mi mamá cocina en la casa')).toContain('posesivo');
    expect(detectSpanishTriggers('la casa de Dios')).toContain('posesivo');
  });

  it('negation and question', () => {
    expect(detectSpanishTriggers('no quiero comer')).toContain('negacion');
    expect(detectSpanishTriggers('¿dónde está el agua?')).toContain('pregunta');
    expect(detectSpanishTriggers('Quién vino')).toContain('pregunta');
  });

  it('past by accented ending, regular and irregular', () => {
    expect(detectSpanishTriggers('ayer comí yuca')).toContain('pasado');
    expect(detectSpanishTriggers('ellos llegaron tarde')).toContain('pasado');
    expect(detectSpanishTriggers('él fue al río')).toContain('pasado');
  });

  it('future by adverb, ending and the «va a» periphrasis', () => {
    expect(detectSpanishTriggers('mañana iré al pueblo')).toContain('futuro');
    expect(detectSpanishTriggers('comeremos pescado')).toContain('futuro');
    expect(detectSpanishTriggers('vamos a aprender')).toContain('futuro');
  });

  it('a neutral sentence triggers nothing', () => {
    expect(detectSpanishTriggers('el agua es una')).toEqual([]);
  });
});

describe('selectRules', () => {
  const rules = [
    rule(1, '-ndzina', 'plural'),
    rule(2, '-nzhe', 'posesivo'),
    rule(3, 'nun', 'negacion'),
    rule(4, '-ki', null), // general
  ];

  it('in Spanish it selects by triggers and always adds the general ones', () => {
    const r = selectRules('mi mamá cocina', Language.espanol, rules);
    expect(r.disparadores).toEqual(['posesivo']);
    expect(r.reglas.map((x) => x.id)).toEqual([2, 4]);
  });

  it('in Damana it is triggered by suffix: terruandzina → plural (-ndzina)', () => {
    const r = selectRules('terruandzina dzinaia', Language.damana, rules);
    expect(r.reglas.map((x) => x.id)).toEqual([1, 4]);
    expect(r.disparadores).toEqual(['plural']);
  });

  it('in Damana the suffix requires something before it and respects ʉ ≠ u', () => {
    const withU = [rule(5, '-ʉnka', 'futuro')];
    expect(selectRules('awʉnka', Language.damana, withU).reglas).toHaveLength(1);
    expect(selectRules('awunka', Language.damana, withU).reglas).toHaveLength(0);
    expect(selectRules('ʉnka', Language.damana, withU).reglas).toHaveLength(0);
  });

  it('with no features only the general ones remain', () => {
    const r = selectRules('el agua es una', Language.espanol, rules);
    expect(r.reglas.map((x) => x.id)).toEqual([4]);
  });
});
