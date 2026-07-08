import { aplicarSm2, Calificacion, ESTADO_SM2_INICIAL, EstadoSm2 } from './sm2';

describe('aplicarSm2', () => {
  it('con "bien" progresa 1 → 6 → ~15 días', () => {
    let e = aplicarSm2(ESTADO_SM2_INICIAL, Calificacion.bien);
    expect(e.intervaloDias).toBe(1);
    e = aplicarSm2(e, Calificacion.bien);
    expect(e.intervaloDias).toBe(6);
    e = aplicarSm2(e, Calificacion.bien);
    expect(e.intervaloDias).toBe(15); // 6 × 2.5
    expect(e.repeticiones).toBe(3);
  });

  it('"otra vez" reinicia repeticiones e intervalo y baja el factor', () => {
    let e: EstadoSm2 = { repeticiones: 3, factorFacilidad: 2.5, intervaloDias: 15 };
    e = aplicarSm2(e, Calificacion.otra_vez);
    expect(e.repeticiones).toBe(0);
    expect(e.intervaloDias).toBe(0);
    expect(e.factorFacilidad).toBeLessThan(2.5);
  });

  it('"fácil" crece más rápido que "difícil"', () => {
    const base: EstadoSm2 = { repeticiones: 2, factorFacilidad: 2.5, intervaloDias: 6 };
    const facil = aplicarSm2(base, Calificacion.facil);
    const dificil = aplicarSm2(base, Calificacion.dificil);
    expect(facil.intervaloDias).toBeGreaterThan(dificil.intervaloDias);
    expect(facil.factorFacilidad).toBeGreaterThan(dificil.factorFacilidad);
  });

  it('el factor de facilidad nunca baja de 1.3', () => {
    let e = ESTADO_SM2_INICIAL;
    for (let i = 0; i < 20; i++) e = aplicarSm2(e, Calificacion.otra_vez);
    expect(e.factorFacilidad).toBe(1.3);
  });
});
