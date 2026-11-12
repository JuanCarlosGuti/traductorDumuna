import {
  leerEsfuerzo,
  leerTemperatura,
  TEMPERATURA_POR_DEFECTO,
} from './config-traductor.provider';

describe('leerTemperatura (TRADUCTOR_TEMPERATURA)', () => {
  it('0.2 by default; accepts numbers and clamps them to [0, 2]; ignores what is not a number', () => {
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
  it('only accepts the API levels, case-insensitively; if missing or invalid, undefined', () => {
    expect(leerEsfuerzo(undefined)).toBeUndefined();
    expect(leerEsfuerzo('')).toBeUndefined();
    expect(leerEsfuerzo('low')).toBe('low');
    expect(leerEsfuerzo(' High ')).toBe('high');
    expect(leerEsfuerzo('xhigh')).toBe('xhigh');
    expect(leerEsfuerzo('máximo')).toBeUndefined();
  });
});
