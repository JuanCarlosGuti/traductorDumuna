export enum Grade {
  otra_vez = 'otra_vez',
  dificil = 'dificil',
  bien = 'bien',
  facil = 'facil',
}

export interface Sm2State {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
}

export const INITIAL_SM2_STATE: Sm2State = {
  repetitions: 0,
  easeFactor: 2.5,
  intervalDays: 0,
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
    status.easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02),
  );

  if (q < 3) {
    return { repetitions: 0, easeFactor: easeFactor, intervalDays: 0 };
  }

  const repetitions = status.repetitions + 1;
  const intervalDays =
    repetitions === 1
      ? 1
      : repetitions === 2
        ? 6
        : Math.round(status.intervalDays * easeFactor);
  return { repetitions: repetitions, easeFactor: easeFactor, intervalDays: intervalDays };
}
