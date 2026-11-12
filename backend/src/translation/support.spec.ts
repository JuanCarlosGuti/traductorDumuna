import { CorpusSource } from '../query/query.enums';
import { evaluateSupport, GOOD_THRESHOLD, REVIEW_THRESHOLD } from './support';

const signals = (meanScore: number, topSource: CorpusSource | null = CorpusSource.oraciones) => ({
  puntajeMedio: meanScore,
  fuenteTop: topSource,
  ejemplosRecuperados: 8,
});

describe('evaluateSupport', () => {
  it('high mean over real sentences → bueno', () => {
    // 0.551 is the mean measured on "¿Ñi guashi nʉnka?", well covered
    expect(evaluateSupport(signals(0.551))).toEqual({ nivel: 'bueno', motivos: [] });
  });

  it('intermediate mean → parcial (no cause for alarm)', () => {
    // 0.252 is the mean measured on "zhakujtshega dzʉwa guma sheka"
    expect(evaluateSupport(signals(0.252))).toEqual({ nivel: 'parcial', motivos: [] });
  });

  it('mean below the threshold → revisar due to low similarity', () => {
    expect(evaluateSupport(signals(0.15))).toEqual({
      nivel: 'revisar',
      motivos: ['similitud_baja'],
    });
  });

  it('no examples retrieved → revisar accumulating both reasons', () => {
    const support = evaluateSupport({ puntajeMedio: 0, fuenteTop: null, ejemplosRecuperados: 0 });
    expect(support.nivel).toBe('revisar');
    expect(support.motivos).toEqual(['sin_ejemplos', 'similitud_baja']);
  });

  it('all the support is conjugations → revisar even if the mean is high', () => {
    // The case that motivated the rule: "nujkunananka" scored 0.899 against its
    // own dictionary entry, with no real usage backing it.
    expect(
      evaluateSupport({
        ...signals(0.5, CorpusSource.conjugaciones),
        ejemplosEnContexto: 0,
      }),
    ).toEqual({ nivel: 'revisar', motivos: ['apoyo_solo_de_diccionario'] });
  });

  it('conjugations on top but with sentences underneath → it is NOT dictionary-only', () => {
    // "naijkasheshisha" leads with its own conjugation (exact
    // match) and brings 6 examples of the verb in use thanks to root
    // matching: the support is real and the old warning was wrong.
    const support = evaluateSupport({
      puntajeMedio: 0.4,
      fuenteTop: CorpusSource.conjugaciones,
      ejemplosRecuperados: 7,
      ejemplosEnContexto: 6,
    });
    expect(support.motivos).not.toContain('apoyo_solo_de_diccionario');
    expect(support.nivel).toBe('bueno');
  });

  it('records older than v5 (without the signal) keep the top-1 rule', () => {
    // ejemplosEnContexto arrives as null: there is no way to know what was underneath.
    const support = evaluateSupport({
      ...signals(0.5, CorpusSource.conjugaciones),
      ejemplosEnContexto: null,
    });
    expect(support.motivos).toEqual(['apoyo_solo_de_diccionario']);
  });

  it('without examples it is not also accused of «solo diccionario»', () => {
    const support = evaluateSupport({
      puntajeMedio: 0,
      fuenteTop: null,
      ejemplosRecuperados: 0,
      ejemplosEnContexto: 0,
    });
    expect(support.motivos).toEqual(['sin_ejemplos', 'similitud_baja']);
  });

  it('a top from phrases does count as real support', () => {
    expect(evaluateSupport(signals(0.551, CorpusSource.frases)).nivel).toBe('bueno');
  });

  it('thresholds are inclusive upwards', () => {
    expect(evaluateSupport(signals(REVIEW_THRESHOLD)).nivel).toBe('parcial');
    expect(evaluateSupport(signals(REVIEW_THRESHOLD - 0.001)).nivel).toBe('revisar');
    expect(evaluateSupport(signals(GOOD_THRESHOLD)).nivel).toBe('bueno');
    expect(evaluateSupport(signals(GOOD_THRESHOLD - 0.001)).nivel).toBe('parcial');
  });
});
