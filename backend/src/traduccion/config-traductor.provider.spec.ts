import {
  leerEsfuerzo,
  leerTemperatura,
  TEMPERATURA_POR_DEFECTO,
} from './config-traductor.provider';

describe('leerTemperatura (TRADUCTOR_TEMPERATURA)', () => {
  it('por defecto 0.2; acepta números y los acota a [0, 2]; ignora lo que no es número', () => {
    expect(leerTemperatura(undefined)).toBe(TEMPERATURA_POR_DEFECTO);
    expect(leerTemperatura('')).toBe(TEMPERATURA_POR_DEFECTO);
    expect(leerTemperatura('0')).toBe(0);
    expect(leerTemperatura('0.7')).toBe(0.7);
    expect(leerTemperatura('5')).toBe(2);
    expect(leerTemperatura('-1')).toBe(0);
    expect(leerTemperatura('alta')).toBe(TEMPERATURA_POR_DEFECTO);
  });
});

describe('leerEsfuerzo (ANTHROPIC_ESFUERZO)', () => {
  it('solo acepta los niveles de la API, sin distinguir mayúsculas; si falta o no vale, undefined', () => {
    expect(leerEsfuerzo(undefined)).toBeUndefined();
    expect(leerEsfuerzo('')).toBeUndefined();
    expect(leerEsfuerzo('low')).toBe('low');
    expect(leerEsfuerzo(' High ')).toBe('high');
    expect(leerEsfuerzo('xhigh')).toBe('xhigh');
    expect(leerEsfuerzo('máximo')).toBeUndefined();
  });
});
