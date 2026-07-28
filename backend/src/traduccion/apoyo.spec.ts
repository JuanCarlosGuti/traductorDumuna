import { FuenteCorpus } from '../consulta/consulta.enums';
import { evaluarApoyo, UMBRAL_BUENO, UMBRAL_REVISAR } from './apoyo';

const senales = (puntajeMedio: number, fuenteTop: FuenteCorpus | null = FuenteCorpus.oraciones) => ({
  puntajeMedio,
  fuenteTop,
  ejemplosRecuperados: 8,
});

describe('evaluarApoyo', () => {
  it('media alta sobre oraciones reales → bueno', () => {
    // 0,551 es la media medida en "¿Ñi guashi nʉnka?", bien cubierta
    expect(evaluarApoyo(senales(0.551))).toEqual({ nivel: 'bueno', motivos: [] });
  });

  it('media intermedia → parcial (sin motivos de alarma)', () => {
    // 0,252 es la media medida en "zhakujtshega dzʉwa guma sheka"
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

  it('el top viene de conjugaciones → revisar aunque la media sea alta', () => {
    // El caso que motivó la regla: "nujkunananka" puntuó 0,899 contra su
    // propia entrada de diccionario, sin ningún uso real que lo respalde.
    expect(evaluarApoyo(senales(0.5, FuenteCorpus.conjugaciones))).toEqual({
      nivel: 'revisar',
      motivos: ['apoyo_solo_de_diccionario'],
    });
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
