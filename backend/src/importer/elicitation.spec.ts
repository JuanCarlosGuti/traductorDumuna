import {
  isTestRow,
  ElicitationRow,
  mergeById,
  stableHash,
  parseRow,
  planElicitation,
  TEST_PROPORTION,
} from './elicitation';

const row = (partial: Partial<ElicitationRow>): ElicitationRow => ({
  id: '1',
  scope: 'otro',
  wordEs: '',
  wordDm: '',
  exampleEs: '',
  exampleDm: '',
  variant: '',
  notes: '',
  file: 'lote1.xlsx',
  ...partial,
});

describe('test reservation (1 in 10, stable by id)', () => {
  it('the hash is deterministic and different for different ids', () => {
    expect(stableHash('42')).toBe(stableHash('42'));
    expect(stableHash('42')).not.toBe(stableHash('43'));
  });

  it('reserves roughly 10 % of the ids', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => String(i + 1));
    const reserved = ids.filter(isTestRow).length;
    expect(reserved / ids.length).toBeGreaterThan(0.07);
    expect(reserved / ids.length).toBeLessThan(0.13);
    expect(TEST_PROPORTION).toBe(10);
  });

  it('ignores spaces around the id', () => {
    expect(isTestRow(' 7 ')).toBe(isTestRow('7'));
  });
});

describe('parseRow', () => {
  it('normalizes ü and u+ only in the Damana columns and lowercases the scope', () => {
    const f = parseRow(
      {
        id: ' 12 ',
        ambito: 'Familia',
        palabra_es: 'pingüino',
        palabra_dm: 'ku+nsi',
        ejemplo_es: 'Mi pingüino come.',
        ejemplo_dm: 'ranzhe kü nsi zha',
        variante: 'Plural',
        notas: '',
      },
      'lote1.xlsx',
    )!;
    expect(f.id).toBe('12');
    expect(f.scope).toBe('familia');
    expect(f.wordEs).toBe('pingüino');
    expect(f.wordDm).toBe('kʉnsi');
    expect(f.exampleDm).toBe('ranzhe kʉ nsi zha');
    expect(f.variant).toBe('plural');
  });

  it('without id or word returns null; without scope uses «otro»', () => {
    expect(parseRow({ id: '', palabra_es: '' }, 'x')).toBeNull();
    expect(parseRow({ id: '3', palabra_es: 'ñame' }, 'x')!.scope).toBe('otro');
  });
});

describe('mergeById', () => {
  it('with the same id the last occurrence wins and the repetition is counted', () => {
    const r = mergeById([
      row({ id: '5', wordEs: 'vecina', file: 'lote1.xlsx' }),
      row({ id: '5', wordEs: 'vecina', wordDm: 'anzhirru', file: 'lote2.xlsx' }),
      row({ id: '6', wordEs: 'agua' }),
    ]);
    expect(r.repetidos).toBe(1);
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0].wordDm).toBe('anzhirru');
  });
});

describe('planElicitation', () => {
  const idNormal = Array.from({ length: 100 }, (_, i) => String(i + 1)).find((id) => !isTestRow(id))!;
  const testId = Array.from({ length: 100 }, (_, i) => String(i + 1)).find(isTestRow)!;

  it('a complete row produces vocabulary + sentence and closes the word', () => {
    const plan = planElicitation([
      row({ id: idNormal, scope: 'comida', wordEs: 'yuca', wordDm: 'Irrugwa', exampleEs: 'Como yuca.', exampleDm: 'irrugwa zhant', variant: 'pasado', notes: 'ok' }),
    ]);
    expect(plan.vocabulary).toEqual([
      { spanish: 'yuca', damana: 'Irrugwa', category: 'comida', notes: 'variante: pasado · ok', source: 'elicitacion' },
    ]);
    expect(plan.sentences).toEqual([
      { externalId: `elic_${idNormal}`, damana: 'irrugwa zhant', spanish: 'Como yuca.', source: 'elicitacion' },
    ]);
    expect(plan.tests).toEqual([]);
    expect(plan.pending).toEqual([]);
    expect(plan.resolved).toEqual(['yuca']);
  });

  it('the reserved row goes to tests (not to sentences) but its word does go to the vocabulary', () => {
    const plan = planElicitation([
      row({ id: testId, scope: 'casa', wordEs: 'casa', wordDm: 'Urraga', exampleEs: 'Mi casa.', exampleDm: 'ranzhe urraga' }),
    ]);
    expect(plan.tests).toEqual([{ spanish: 'Mi casa.', expectedDamana: 'ranzhe urraga', scope: 'casa' }]);
    expect(plan.sentences).toEqual([]);
    expect(plan.vocabulary).toHaveLength(1);
  });

  it('without palabra_dm or ejemplo_dm it stays pending, with the Spanish example as context', () => {
    const plan = planElicitation([
      row({ id: '1', wordEs: 'vecina', exampleEs: 'Mi vecina cocina.' }),
      row({ id: '2', wordEs: 'hola', wordDm: 'Zungui', exampleEs: 'Hola, ¿cómo estás?' }),
    ]);
    expect(plan.pending).toEqual([
      { word: 'vecina', context: 'Mi vecina cocina.' },
      { word: 'hola', context: 'Hola, ¿cómo estás?' },
    ]);
    expect(plan.vocabulary.map((v) => v.spanish)).toEqual(['hola']);
    expect(plan.resolved).toEqual([]);
  });

  it('keeps ʉ and ñ in what it produces', () => {
    const plan = planElicitation([
      row({ id: idNormal, wordEs: 'año', wordDm: 'kʉgui', exampleEs: 'Este año.', exampleDm: 'ima kʉgui ñingui' }),
    ]);
    expect(plan.vocabulary[0]).toMatchObject({ spanish: 'año', damana: 'kʉgui' });
    expect(plan.sentences[0].damana).toBe('ima kʉgui ñingui');
  });
});
