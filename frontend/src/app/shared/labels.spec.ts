import { label } from './labels';

describe('label', () => {
  it('translates API enum values into Spanish for display', () => {
    expect(label('sentences')).toBe('oraciones');
    expect(label('possessive')).toBe('posesivo');
    expect(label('resolved')).toBe('resuelta');
  });

  it('returns unknown values unchanged and empty for null', () => {
    expect(label('nʉnka')).toBe('nʉnka');
    expect(label(null)).toBe('');
  });
});
