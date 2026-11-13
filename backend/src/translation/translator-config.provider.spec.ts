import {
  readEffort,
  readTemperature,
  DEFAULT_TEMPERATURE,
} from './translator-config.provider';

describe('readTemperature (TRANSLATOR_TEMPERATURE)', () => {
  it('0.2 by default; accepts numbers and clamps them to [0, 2]; ignores what is not a number', () => {
    expect(readTemperature(undefined)).toBe(DEFAULT_TEMPERATURE);
    expect(readTemperature('')).toBe(DEFAULT_TEMPERATURE);
    expect(readTemperature('0')).toBe(0);
    expect(readTemperature('0.7')).toBe(0.7);
    expect(readTemperature('5')).toBe(2);
    expect(readTemperature('-1')).toBe(0);
    expect(readTemperature('alta')).toBe(DEFAULT_TEMPERATURE);
  });
});

describe('readEffort (ANTHROPIC_EFFORT)', () => {
  it('only accepts the API levels, case-insensitively; if missing or invalid, undefined', () => {
    expect(readEffort(undefined)).toBeUndefined();
    expect(readEffort('')).toBeUndefined();
    expect(readEffort('low')).toBe('low');
    expect(readEffort(' High ')).toBe('high');
    expect(readEffort('xhigh')).toBe('xhigh');
    expect(readEffort('máximo')).toBeUndefined();
  });
});
