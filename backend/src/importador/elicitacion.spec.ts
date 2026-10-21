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

describe('reserva de pruebas (1 de cada 10, estable por id)', () => {
  it('el hash es determinista y distinto para ids distintos', () => {
    expect(hashEstable('42')).toBe(hashEstable('42'));
    expect(hashEstable('42')).not.toBe(hashEstable('43'));
  });

  it('reserva aproximadamente el 10 % de los ids', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => String(i + 1));
    const reservadas = ids.filter(esFilaDePrueba).length;
    expect(reservadas / ids.length).toBeGreaterThan(0.07);
    expect(reservadas / ids.length).toBeLessThan(0.13);
    expect(PROPORCION_PRUEBA).toBe(10);
  });

  it('ignora espacios alrededor del id', () => {
    expect(esFilaDePrueba(' 7 ')).toBe(esFilaDePrueba('7'));
  });
});

describe('interpretarFila', () => {
  it('normaliza ü y u+ solo en las columnas damana y pasa el ámbito a minúsculas', () => {
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

  it('sin id ni palabra devuelve null; sin ámbito usa «otro»', () => {
    expect(interpretarFila({ id: '', palabra_es: '' }, 'x')).toBeNull();
    expect(interpretarFila({ id: '3', palabra_es: 'ñame' }, 'x')!.ambito).toBe('otro');
  });
});

describe('fundirPorId', () => {
  it('con el mismo id gana la última aparición y se cuenta la repetición', () => {
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

  it('una fila completa produce vocabulario + oración y cierra la palabra', () => {
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

  it('la fila reservada va a pruebas (no a oraciones) pero su palabra sí al vocabulario', () => {
    const plan = planificarElicitacion([
      fila({ id: idPrueba, ambito: 'casa', palabraEs: 'casa', palabraDm: 'Urraga', ejemploEs: 'Mi casa.', ejemploDm: 'ranzhe urraga' }),
    ]);
    expect(plan.pruebas).toEqual([{ espanol: 'Mi casa.', damanaEsperado: 'ranzhe urraga', ambito: 'casa' }]);
    expect(plan.oraciones).toEqual([]);
    expect(plan.vocabulario).toHaveLength(1);
  });

  it('sin palabra_dm o sin ejemplo_dm queda pendiente, con el ejemplo español de contexto', () => {
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

  it('conserva ʉ y ñ en lo que produce', () => {
    const plan = planificarElicitacion([
      fila({ id: idNormal, palabraEs: 'año', palabraDm: 'kʉgui', ejemploEs: 'Este año.', ejemploDm: 'ima kʉgui ñingui' }),
    ]);
    expect(plan.vocabulario[0]).toMatchObject({ espanol: 'año', damana: 'kʉgui' });
    expect(plan.oraciones[0].damana).toBe('ima kʉgui ñingui');
  });
});
