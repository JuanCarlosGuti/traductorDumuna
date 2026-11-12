import { applySm2, Grade, INITIAL_SM2_STATE, Sm2State } from './sm2';

describe('applySm2', () => {
  it('with "bien" it progresses 1 → 6 → ~15 days', () => {
    let e = applySm2(INITIAL_SM2_STATE, Grade.bien);
    expect(e.intervaloDias).toBe(1);
    e = applySm2(e, Grade.bien);
    expect(e.intervaloDias).toBe(6);
    e = applySm2(e, Grade.bien);
    expect(e.intervaloDias).toBe(15); // 6 × 2.5
    expect(e.repeticiones).toBe(3);
  });

  it('"otra vez" resets repetitions and interval and lowers the factor', () => {
    let e: Sm2State = { repeticiones: 3, factorFacilidad: 2.5, intervaloDias: 15 };
    e = applySm2(e, Grade.otra_vez);
    expect(e.repeticiones).toBe(0);
    expect(e.intervaloDias).toBe(0);
    expect(e.factorFacilidad).toBeLessThan(2.5);
  });

  it('"fácil" grows faster than "difícil"', () => {
    const base: Sm2State = { repeticiones: 2, factorFacilidad: 2.5, intervaloDias: 6 };
    const easy = applySm2(base, Grade.facil);
    const hard = applySm2(base, Grade.dificil);
    expect(easy.intervaloDias).toBeGreaterThan(hard.intervaloDias);
    expect(easy.factorFacilidad).toBeGreaterThan(hard.factorFacilidad);
  });

  it('the ease factor never drops below 1.3', () => {
    let e = INITIAL_SM2_STATE;
    for (let i = 0; i < 20; i++) e = applySm2(e, Grade.otra_vez);
    expect(e.factorFacilidad).toBe(1.3);
  });
});
