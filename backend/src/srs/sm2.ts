export enum Grade {
  otra_vez = 'otra_vez',
  dificil = 'dificil',
  bien = 'bien',
  facil = 'facil',
}

export interface Sm2State {
  repeticiones: number;
  factorFacilidad: number;
  intervaloDias: number;
}

export const INITIAL_SM2_STATE: Sm2State = {
  repeticiones: 0,
  factorFacilidad: 2.5,
  intervaloDias: 0,
};

const QUALITY: Record<Grade, number> = {
  [Grade.otra_vez]: 0,
  [Grade.dificil]: 3,
  [Grade.bien]: 4,
  [Grade.facil]: 5,
};

/**
 * Simplified SM-2: the UI's 4 grades are mapped to the classic
 * quality (0/3/4/5). The ease factor is always adjusted with the
 * original formula (floor 1.3); "otra vez" resets repetitions and
 * interval (the card is due immediately). Intervals: 1 day, 6 days,
 * and then interval × factor.
 */
export function applySm2(status: Sm2State, grade: Grade): Sm2State {
  const q = QUALITY[grade];
  const easeFactor = Math.max(
    1.3,
    status.factorFacilidad + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02),
  );

  if (q < 3) {
    return { repeticiones: 0, factorFacilidad: easeFactor, intervaloDias: 0 };
  }

  const repetitions = status.repeticiones + 1;
  const intervalDays =
    repetitions === 1
      ? 1
      : repetitions === 2
        ? 6
        : Math.round(status.intervaloDias * easeFactor);
  return { repeticiones: repetitions, factorFacilidad: easeFactor, intervaloDias: intervalDays };
}
