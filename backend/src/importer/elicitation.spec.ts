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
  ambito: 'otro',
  palabraEs: '',
  palabraDm: '',
  ejemploEs: '',
  ejemploDm: '',
  variante: '',
  notas: '',
  archivo: 'lote1.xlsx',
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
    expect(f.ambito).toBe('familia');
    expect(f.palabraEs).toBe('pingüino');
    expect(f.palabraDm).toBe('kʉnsi');
    expect(f.ejemploDm).toBe('ranzhe kʉ nsi zha');
    expect(f.variante).toBe('plural');
  });

  it('without id or word returns null; without scope uses «otro»', () => {
    expect(parseRow({ id: '', palabra_es: '' }, 'x')).toBeNull();
    expect(parseRow({ id: '3', palabra_es: 'ñame' }, 'x')!.ambito).toBe('otro');
  });
});

describe('mergeById', () => {
  it('with the same id the last occurrence wins and the repetition is counted', () => {
    const r = mergeById([
      row({ id: '5', palabraEs: 'vecina', archivo: 'lote1.xlsx' }),
      row({ id: '5', palabraEs: 'vecina', palabraDm: 'anzhirru', archivo: 'lote2.xlsx' }),
      row({ id: '6', palabraEs: 'agua' }),
    ]);
    expect(r.repetidos).toBe(1);
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0].palabraDm).toBe('anzhirru');
  });
});

describe('planElicitation', () => {
  const idNormal = Array.from({ length: 100 }, (_, i) => String(i + 1)).find((id) => !isTestRow(id))!;
  const testId = Array.from({ length: 100 }, (_, i) => String(i + 1)).find(isTestRow)!;

  it('a complete row produces vocabulary + sentence and closes the word', () => {
    const plan = planElicitation([
      row({ id: idNormal, ambito: 'comida', palabraEs: 'yuca', palabraDm: 'Irrugwa', ejemploEs: 'Como yuca.', ejemploDm: 'irrugwa zhant', variante: 'pasado', notas: 'ok' }),
    ]);
    expect(plan.vocabulario).toEqual([
      { espanol: 'yuca', damana: 'Irrugwa', categoria: 'comida', notas: 'variante: pasado · ok', fuente: 'elicitacion' },
    ]);
    expect(plan.oraciones).toEqual([
      { idExterno: `elic_${idNormal}`, damana: 'irrugwa zhant', espanol: 'Como yuca.', fuente: 'elicitacion' },
    ]);
    expect(plan.pruebas).toEqual([]);
    expect(plan.pendientes).toEqual([]);
    expect(plan.resueltas).toEqual(['yuca']);
  });

  it('the reserved row goes to tests (not to sentences) but its word does go to the vocabulary', () => {
    const plan = planElicitation([
      row({ id: testId, ambito: 'casa', palabraEs: 'casa', palabraDm: 'Urraga', ejemploEs: 'Mi casa.', ejemploDm: 'ranzhe urraga' }),
    ]);
    expect(plan.pruebas).toEqual([{ espanol: 'Mi casa.', damanaEsperado: 'ranzhe urraga', ambito: 'casa' }]);
    expect(plan.oraciones).toEqual([]);
    expect(plan.vocabulario).toHaveLength(1);
  });

  it('without palabra_dm or ejemplo_dm it stays pending, with the Spanish example as context', () => {
    const plan = planElicitation([
      row({ id: '1', palabraEs: 'vecina', ejemploEs: 'Mi vecina cocina.' }),
      row({ id: '2', palabraEs: 'hola', palabraDm: 'Zungui', ejemploEs: 'Hola, ¿cómo estás?' }),
    ]);
    expect(plan.pendientes).toEqual([
      { palabra: 'vecina', contexto: 'Mi vecina cocina.' },
      { palabra: 'hola', contexto: 'Hola, ¿cómo estás?' },
    ]);
    expect(plan.vocabulario.map((v) => v.espanol)).toEqual(['hola']);
    expect(plan.resueltas).toEqual([]);
  });

  it('keeps ʉ and ñ in what it produces', () => {
    const plan = planElicitation([
      row({ id: idNormal, palabraEs: 'año', palabraDm: 'kʉgui', ejemploEs: 'Este año.', ejemploDm: 'ima kʉgui ñingui' }),
    ]);
    expect(plan.vocabulario[0]).toMatchObject({ espanol: 'año', damana: 'kʉgui' });
    expect(plan.oraciones[0].damana).toBe('ima kʉgui ñingui');
  });
});
