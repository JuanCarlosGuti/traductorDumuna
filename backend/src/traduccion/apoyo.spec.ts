import { FuenteCorpus } from '../consulta/consulta.enums';
import { evaluarApoyo, UMBRAL_BUENO, UMBRAL_REVISAR } from './apoyo';

const senales = (puntajeMedio: number, fuenteTop: FuenteCorpus | null = FuenteCorpus.oraciones) => ({
  puntajeMedio,
  fuenteTop,
  ejemplosRecuperados: 8,
});

describe('evaluarApoyo', () => {
  it('high mean over real sentences → bueno', () => {
    // 0.551 is the mean measured on "¿Ñi guashi nʉnka?", well covered
    expect(evaluarApoyo(senales(0.551))).toEqual({ nivel: 'bueno', motivos: [] });
  });

  it('intermediate mean → parcial (no cause for alarm)', () => {
    // 0.252 is the mean measured on "zhakujtshega dzʉwa guma sheka"
    expect(evaluarApoyo(senales(0.252))).toEqual({ nivel: 'parcial', motivos: [] });
  });

  it('mean below the threshold → revisar due to low similarity', () => {
    expect(evaluarApoyo(senales(0.15))).toEqual({
      nivel: 'revisar',
      motivos: ['similitud_baja'],
    });
  });

  it('no examples retrieved → revisar accumulating both reasons', () => {
    const apoyo = evaluarApoyo({ puntajeMedio: 0, fuenteTop: null, ejemplosRecuperados: 0 });
    expect(apoyo.nivel).toBe('revisar');
    expect(apoyo.motivos).toEqual(['sin_ejemplos', 'similitud_baja']);
  });

  it('all the support is conjugations → revisar even if the mean is high', () => {
    // The case that motivated the rule: "nujkunananka" scored 0.899 against its
    // own dictionary entry, with no real usage backing it.
    expect(
      evaluarApoyo({
        ...senales(0.5, FuenteCorpus.conjugaciones),
        ejemplosEnContexto: 0,
      }),
    ).toEqual({ nivel: 'revisar', motivos: ['apoyo_solo_de_diccionario'] });
  });

  it('conjugations on top but with sentences underneath → it is NOT dictionary-only', () => {
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

  it('records older than v5 (without the signal) keep the top-1 rule', () => {
    // ejemplosEnContexto arrives as null: there is no way to know what was underneath.
    const apoyo = evaluarApoyo({
      ...senales(0.5, FuenteCorpus.conjugaciones),
      ejemplosEnContexto: null,
    });
    expect(apoyo.motivos).toEqual(['apoyo_solo_de_diccionario']);
  });

  it('without examples it is not also accused of «solo diccionario»', () => {
    const apoyo = evaluarApoyo({
      puntajeMedio: 0,
      fuenteTop: null,
      ejemplosRecuperados: 0,
      ejemplosEnContexto: 0,
    });
    expect(apoyo.motivos).toEqual(['sin_ejemplos', 'similitud_baja']);
  });

  it('a top from phrases does count as real support', () => {
    expect(evaluarApoyo(senales(0.551, FuenteCorpus.frases)).nivel).toBe('bueno');
  });

  it('thresholds are inclusive upwards', () => {
    expect(evaluarApoyo(senales(UMBRAL_REVISAR)).nivel).toBe('parcial');
    expect(evaluarApoyo(senales(UMBRAL_REVISAR - 0.001)).nivel).toBe('revisar');
    expect(evaluarApoyo(senales(UMBRAL_BUENO)).nivel).toBe('bueno');
    expect(evaluarApoyo(senales(UMBRAL_BUENO - 0.001)).nivel).toBe('parcial');
  });
});
