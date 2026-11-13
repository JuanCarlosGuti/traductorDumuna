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
  trigger: GrammarRule['trigger'],
): GrammarRule => ({
  id,
  type: 'sufijo',
  form: form,
  meaning: null,
  baseExample: null,
  ruleExample: null,
  exampleTranslation: null,
  notes: null,
  trigger: trigger,
});

describe('inferTrigger (based on «tipo de regla» and «qué hace»)', () => {
  it('pluraliza → plural', () => {
    expect(inferTrigger('sufijo', 'pluraliza sustantivos')).toBe('plural');
  });

  it('posesivo / "de" → posesivo', () => {
    expect(inferTrigger('sufijo', 'posesivo / "de"')).toBe('possessive');
  });

  it('negation, question, past and future, with and without accents', () => {
    expect(inferTrigger('partícula', 'Negación del verbo')).toBe('negation');
    expect(inferTrigger('sufijo', 'marca de pregunta')).toBe('question');
    expect(inferTrigger('sufijo', 'tiempo pasado')).toBe('past');
    expect(inferTrigger('sufijo', 'Futuro')).toBe('future');
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
    expect(detectSpanishTriggers('mi mamá cocina en la casa')).toContain('possessive');
    expect(detectSpanishTriggers('la casa de Dios')).toContain('possessive');
  });

  it('negation and question', () => {
    expect(detectSpanishTriggers('no quiero comer')).toContain('negation');
    expect(detectSpanishTriggers('¿dónde está el agua?')).toContain('question');
    expect(detectSpanishTriggers('Quién vino')).toContain('question');
  });

  it('past by accented ending, regular and irregular', () => {
    expect(detectSpanishTriggers('ayer comí yuca')).toContain('past');
    expect(detectSpanishTriggers('ellos llegaron tarde')).toContain('past');
    expect(detectSpanishTriggers('él fue al río')).toContain('past');
  });

  it('future by adverb, ending and the «va a» periphrasis', () => {
    expect(detectSpanishTriggers('mañana iré al pueblo')).toContain('future');
    expect(detectSpanishTriggers('comeremos pescado')).toContain('future');
    expect(detectSpanishTriggers('vamos a aprender')).toContain('future');
  });

  it('a neutral sentence triggers nothing', () => {
    expect(detectSpanishTriggers('el agua es una')).toEqual([]);
  });
});

describe('selectRules', () => {
  const rules = [
    rule(1, '-ndzina', 'plural'),
    rule(2, '-nzhe', 'possessive'),
    rule(3, 'nun', 'negation'),
    rule(4, '-ki', null), // general
  ];

  it('in Spanish it selects by triggers and always adds the general ones', () => {
    const r = selectRules('mi mamá cocina', Language.spanish, rules);
    expect(r.triggers).toEqual(['possessive']);
    expect(r.rules.map((x) => x.id)).toEqual([2, 4]);
  });

  it('in Damana it is triggered by suffix: terruandzina → plural (-ndzina)', () => {
    const r = selectRules('terruandzina dzinaia', Language.damana, rules);
    expect(r.rules.map((x) => x.id)).toEqual([1, 4]);
    expect(r.triggers).toEqual(['plural']);
  });

  it('in Damana the suffix requires something before it and respects ʉ ≠ u', () => {
    const withU = [rule(5, '-ʉnka', 'future')];
    expect(selectRules('awʉnka', Language.damana, withU).rules).toHaveLength(1);
    expect(selectRules('awunka', Language.damana, withU).rules).toHaveLength(0);
    expect(selectRules('ʉnka', Language.damana, withU).rules).toHaveLength(0);
  });

  it('with no features only the general ones remain', () => {
    const r = selectRules('el agua es una', Language.spanish, rules);
    expect(r.rules.map((x) => x.id)).toEqual([4]);
  });
});
