import { applySm2, Grade, INITIAL_SM2_STATE, Sm2State } from './sm2';

describe('applySm2', () => {
  it('with "bien" it progresses 1 → 6 → ~15 days', () => {
    let e = applySm2(INITIAL_SM2_STATE, Grade.good);
    expect(e.intervalDays).toBe(1);
    e = applySm2(e, Grade.good);
    expect(e.intervalDays).toBe(6);
    e = applySm2(e, Grade.good);
    expect(e.intervalDays).toBe(15); // 6 × 2.5
    expect(e.repetitions).toBe(3);
  });

  it('"otra vez" resets repetitions and interval and lowers the factor', () => {
    let e: Sm2State = { repetitions: 3, easeFactor: 2.5, intervalDays: 15 };
    e = applySm2(e, Grade.again);
    expect(e.repetitions).toBe(0);
    expect(e.intervalDays).toBe(0);
    expect(e.easeFactor).toBeLessThan(2.5);
  });

  it('"fácil" grows faster than "difícil"', () => {
    const base: Sm2State = { repetitions: 2, easeFactor: 2.5, intervalDays: 6 };
    const easy = applySm2(base, Grade.easy);
    const hard = applySm2(base, Grade.hard);
    expect(easy.intervalDays).toBeGreaterThan(hard.intervalDays);
    expect(easy.easeFactor).toBeGreaterThan(hard.easeFactor);
  });

  it('the ease factor never drops below 1.3', () => {
    let e = INITIAL_SM2_STATE;
    for (let i = 0; i < 20; i++) e = applySm2(e, Grade.again);
    expect(e.easeFactor).toBe(1.3);
  });
});
