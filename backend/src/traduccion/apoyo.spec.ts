import { FuenteCorpus } from '../consulta/consulta.enums';
import { evaluarApoyo, UMBRAL_BUENO, UMBRAL_REVISAR } from './apoyo';

const senales = (puntajeMedio: number, fuenteTop: FuenteCorpus | null = FuenteCorpus.oraciones) => ({
  puntajeMedio,
  fuenteTop,
  ejemplosRecuperados: 8,
});

describe('evaluarApoyo', () => {
  it('media alta sobre oraciones reales → bueno', () => {
    // 0.551 is the mean measured on "¿Ñi guashi nʉnka?", well covered
    expect(evaluarApoyo(senales(0.551))).toEqual({ nivel: 'bueno', motivos: [] });
  });

  it('media intermedia → parcial (sin motivos de alarma)', () => {
    // 0.252 is the mean measured on "zhakujtshega dzʉwa guma sheka"
    expect(evaluarApoyo(senales(0.252))).toEqual({ nivel: 'parcial', motivos: [] });
  });

  it('media por debajo del umbral → revisar por similitud baja', () => {
    expect(evaluarApoyo(senales(0.15))).toEqual({
      nivel: 'revisar',
      motivos: ['similitud_baja'],
    });
  });

  it('sin ejemplos recuperados → revisar acumulando ambos motivos', () => {
    const apoyo = evaluarApoyo({ puntajeMedio: 0, fuenteTop: null, ejemplosRecuperados: 0 });
    expect(apoyo.nivel).toBe('revisar');
    expect(apoyo.motivos).toEqual(['sin_ejemplos', 'similitud_baja']);
  });

  it('todo el apoyo son conjugaciones → revisar aunque la media sea alta', () => {
    // The case that motivated the rule: "nujkunananka" scored 0.899 against its
    // own dictionary entry, with no real usage backing it.
    expect(
      evaluarApoyo({
        ...senales(0.5, FuenteCorpus.conjugaciones),
        ejemplosEnContexto: 0,
      }),
    ).toEqual({ nivel: 'revisar', motivos: ['apoyo_solo_de_diccionario'] });
  });

  it('top de conjugaciones pero con oraciones debajo → NO es solo diccionario', () => {
    // "naijkasheshisha" leads with its own conjugation (exact
    // match) and brings 6 examples of the verb in use thanks to root
    // matching: the support is real and the old warning was wrong.
    const apoyo = evaluarApoyo({
      puntajeMedio: 0.4,
      fuenteTop: FuenteCorpus.conjugaciones,
      ejemplosRecuperados: 7,
      ejemplosEnContexto: 6,
    });
    expect(apoyo.motivos).not.toContain('apoyo_solo_de_diccionario');
    expect(apoyo.nivel).toBe('bueno');
  });

  it('registros anteriores a la v5 (sin la señal) conservan la regla del top-1', () => {
    // ejemplosEnContexto arrives as null: there is no way to know what was underneath.
    const apoyo = evaluarApoyo({
      ...senales(0.5, FuenteCorpus.conjugaciones),
      ejemplosEnContexto: null,
    });
    expect(apoyo.motivos).toEqual(['apoyo_solo_de_diccionario']);
  });

  it('sin ejemplos no se acusa además de «solo diccionario»', () => {
    const apoyo = evaluarApoyo({
      puntajeMedio: 0,
      fuenteTop: null,
      ejemplosRecuperados: 0,
      ejemplosEnContexto: 0,
    });
    expect(apoyo.motivos).toEqual(['sin_ejemplos', 'similitud_baja']);
  });

  it('el top desde frases sí cuenta como apoyo real', () => {
    expect(evaluarApoyo(senales(0.551, FuenteCorpus.frases)).nivel).toBe('bueno');
  });

  it('los umbrales son inclusivos hacia arriba', () => {
    expect(evaluarApoyo(senales(UMBRAL_REVISAR)).nivel).toBe('parcial');
    expect(evaluarApoyo(senales(UMBRAL_REVISAR - 0.001)).nivel).toBe('revisar');
    expect(evaluarApoyo(senales(UMBRAL_BUENO)).nivel).toBe('bueno');
    expect(evaluarApoyo(senales(UMBRAL_BUENO - 0.001)).nivel).toBe('parcial');
  });
});
