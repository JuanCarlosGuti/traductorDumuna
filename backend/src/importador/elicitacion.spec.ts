import {
  esFilaDePrueba,
  FilaElicitacion,
  fundirPorId,
  hashEstable,
  interpretarFila,
  planificarElicitacion,
  PROPORCION_PRUEBA,
} from './elicitacion';

const fila = (parcial: Partial<FilaElicitacion>): FilaElicitacion => ({
  id: '1',
  ambito: 'otro',
  palabraEs: '',
  palabraDm: '',
  ejemploEs: '',
  ejemploDm: '',
  variante: '',
  notas: '',
  archivo: 'lote1.xlsx',
  ...parcial,
});

describe('test reservation (1 in 10, stable by id)', () => {
  it('the hash is deterministic and different for different ids', () => {
    expect(hashEstable('42')).toBe(hashEstable('42'));
    expect(hashEstable('42')).not.toBe(hashEstable('43'));
  });

  it('reserves roughly 10 % of the ids', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => String(i + 1));
    const reservadas = ids.filter(esFilaDePrueba).length;
    expect(reservadas / ids.length).toBeGreaterThan(0.07);
    expect(reservadas / ids.length).toBeLessThan(0.13);
    expect(PROPORCION_PRUEBA).toBe(10);
  });

  it('ignores spaces around the id', () => {
    expect(esFilaDePrueba(' 7 ')).toBe(esFilaDePrueba('7'));
  });
});

describe('interpretarFila', () => {
  it('normalizes ü and u+ only in the Damana columns and lowercases the scope', () => {
    const f = interpretarFila(
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
    expect(interpretarFila({ id: '', palabra_es: '' }, 'x')).toBeNull();
    expect(interpretarFila({ id: '3', palabra_es: 'ñame' }, 'x')!.ambito).toBe('otro');
  });
});

describe('fundirPorId', () => {
  it('with the same id the last occurrence wins and the repetition is counted', () => {
    const r = fundirPorId([
      fila({ id: '5', palabraEs: 'vecina', archivo: 'lote1.xlsx' }),
      fila({ id: '5', palabraEs: 'vecina', palabraDm: 'anzhirru', archivo: 'lote2.xlsx' }),
      fila({ id: '6', palabraEs: 'agua' }),
    ]);
    expect(r.repetidos).toBe(1);
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0].palabraDm).toBe('anzhirru');
  });
});

describe('planificarElicitacion', () => {
  const idNormal = Array.from({ length: 100 }, (_, i) => String(i + 1)).find((id) => !esFilaDePrueba(id))!;
  const idPrueba = Array.from({ length: 100 }, (_, i) => String(i + 1)).find(esFilaDePrueba)!;

  it('a complete row produces vocabulary + sentence and closes the word', () => {
    const plan = planificarElicitacion([
      fila({ id: idNormal, ambito: 'comida', palabraEs: 'yuca', palabraDm: 'Irrugwa', ejemploEs: 'Como yuca.', ejemploDm: 'irrugwa zhant', variante: 'pasado', notas: 'ok' }),
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
    const plan = planificarElicitacion([
      fila({ id: idPrueba, ambito: 'casa', palabraEs: 'casa', palabraDm: 'Urraga', ejemploEs: 'Mi casa.', ejemploDm: 'ranzhe urraga' }),
    ]);
    expect(plan.pruebas).toEqual([{ espanol: 'Mi casa.', damanaEsperado: 'ranzhe urraga', ambito: 'casa' }]);
    expect(plan.oraciones).toEqual([]);
    expect(plan.vocabulario).toHaveLength(1);
  });

  it('without palabra_dm or ejemplo_dm it stays pending, with the Spanish example as context', () => {
    const plan = planificarElicitacion([
      fila({ id: '1', palabraEs: 'vecina', ejemploEs: 'Mi vecina cocina.' }),
      fila({ id: '2', palabraEs: 'hola', palabraDm: 'Zungui', ejemploEs: 'Hola, ¿cómo estás?' }),
    ]);
    expect(plan.pendientes).toEqual([
      { palabra: 'vecina', contexto: 'Mi vecina cocina.' },
      { palabra: 'hola', contexto: 'Hola, ¿cómo estás?' },
    ]);
    expect(plan.vocabulario.map((v) => v.espanol)).toEqual(['hola']);
    expect(plan.resueltas).toEqual([]);
  });

  it('keeps ʉ and ñ in what it produces', () => {
    const plan = planificarElicitacion([
      fila({ id: idNormal, palabraEs: 'año', palabraDm: 'kʉgui', ejemploEs: 'Este año.', ejemploDm: 'ima kʉgui ñingui' }),
    ]);
    expect(plan.vocabulario[0]).toMatchObject({ espanol: 'año', damana: 'kʉgui' });
    expect(plan.oraciones[0].damana).toBe('ima kʉgui ñingui');
  });
});
