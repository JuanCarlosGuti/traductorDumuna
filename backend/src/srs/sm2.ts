export enum Calificacion {
  otra_vez = 'otra_vez',
  dificil = 'dificil',
  bien = 'bien',
  facil = 'facil',
}

export interface EstadoSm2 {
  repeticiones: number;
  factorFacilidad: number;
  intervaloDias: number;
}

export const ESTADO_SM2_INICIAL: EstadoSm2 = {
  repeticiones: 0,
  factorFacilidad: 2.5,
  intervaloDias: 0,
};

const CALIDAD: Record<Calificacion, number> = {
  [Calificacion.otra_vez]: 0,
  [Calificacion.dificil]: 3,
  [Calificacion.bien]: 4,
  [Calificacion.facil]: 5,
};

/**
 * SM-2 simplificado: las 4 calificaciones de la UI se mapean a la calidad
 * clásica (0/3/4/5). El factor de facilidad se ajusta siempre con la
 * fórmula original (piso 1.3); "otra vez" reinicia repeticiones e
 * intervalo (la tarjeta vence de inmediato). Intervalos: 1 día, 6 días,
 * y después intervalo × factor.
 */
export function aplicarSm2(estado: EstadoSm2, calificacion: Calificacion): EstadoSm2 {
  const q = CALIDAD[calificacion];
  const factorFacilidad = Math.max(
    1.3,
    estado.factorFacilidad + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02),
  );

  if (q < 3) {
    return { repeticiones: 0, factorFacilidad, intervaloDias: 0 };
  }

  const repeticiones = estado.repeticiones + 1;
  const intervaloDias =
    repeticiones === 1
      ? 1
      : repeticiones === 2
        ? 6
        : Math.round(estado.intervaloDias * factorFacilidad);
  return { repeticiones, factorFacilidad, intervaloDias };
}
