import { normalizar } from '../comun/texto/normalizador';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { PruebaTraduccion } from '../importador/elicitacion';
import { chrF } from './chrf';

export interface RespuestaParaEvaluar {
  traduccion: string;
  palabrasSinEquivalente: string[];
  confianza: number;
}

export interface PruebaEvaluada {
  espanol: string;
  esperado: string;
  obtenido: string;
  ambito: string;
  exacta: boolean;
  chrf: number;
  sinEquivalente: string[];
  /** Palabras sin equivalente / palabras de la frase de entrada. */
  proporcionSinEquivalente: number;
  confianza: number;
  error: string | null;
}

export interface ResumenAmbito {
  ambito: string;
  pruebas: number;
  exactas: number;
  porcentajeExactas: number;
  chrfMedio: number;
  porcentajeSinEquivalente: number;
  errores: number;
}

export interface Informe {
  fecha: string;
  proveedor: string | null;
  modelo: string | null;
  total: ResumenAmbito;
  porAmbito: ResumenAmbito[];
  pruebas: PruebaEvaluada[];
}

/**
 * Texto comparable para la coincidencia exacta: minúsculas, sin tildes
 * (ʉ y ñ intactas), sin puntuación y con los espacios colapsados. Así
 * «Nʉnka shkua.» y «nʉnka shkua» cuentan como iguales, pero «nunka» no.
 */
export function textoComparable(texto: string): string {
  return normalizar(texto)
    .replace(/[^\p{L}ʉ'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function esCoincidenciaExacta(obtenido: string, esperado: string): boolean {
  return textoComparable(obtenido) === textoComparable(esperado);
}

export function evaluarPrueba(prueba: PruebaTraduccion, respuesta: RespuestaParaEvaluar): PruebaEvaluada {
  const palabrasEntrada = tokenizarDamana(prueba.espanol).length || 1;
  return {
    espanol: prueba.espanol,
    esperado: prueba.damanaEsperado,
    obtenido: respuesta.traduccion,
    ambito: prueba.ambito,
    exacta: esCoincidenciaExacta(respuesta.traduccion, prueba.damanaEsperado),
    chrf: chrF(respuesta.traduccion, prueba.damanaEsperado),
    sinEquivalente: respuesta.palabrasSinEquivalente,
    proporcionSinEquivalente: Math.min(1, respuesta.palabrasSinEquivalente.length / palabrasEntrada),
    confianza: respuesta.confianza,
    error: null,
  };
}

/** Una prueba que no se pudo traducir cuenta como fallida, no se omite. */
export function pruebaFallida(prueba: PruebaTraduccion, error: string): PruebaEvaluada {
  return {
    espanol: prueba.espanol,
    esperado: prueba.damanaEsperado,
    obtenido: '',
    ambito: prueba.ambito,
    exacta: false,
    chrf: 0,
    sinEquivalente: [],
    proporcionSinEquivalente: 1,
    confianza: 0,
    error,
  };
}

const media = (valores: number[]): number =>
  valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0;

export function resumir(pruebas: PruebaEvaluada[], ambito: string): ResumenAmbito {
  const exactas = pruebas.filter((p) => p.exacta).length;
  return {
    ambito,
    pruebas: pruebas.length,
    exactas,
    porcentajeExactas: pruebas.length ? (100 * exactas) / pruebas.length : 0,
    chrfMedio: media(pruebas.map((p) => p.chrf)),
    porcentajeSinEquivalente: 100 * media(pruebas.map((p) => p.proporcionSinEquivalente)),
    errores: pruebas.filter((p) => p.error !== null).length,
  };
}

export function construirInforme(
  pruebas: PruebaEvaluada[],
  meta: { fecha: Date; proveedor: string | null; modelo: string | null },
): Informe {
  const ambitos = [...new Set(pruebas.map((p) => p.ambito))].sort((a, b) => a.localeCompare(b, 'es'));
  return {
    fecha: meta.fecha.toISOString(),
    proveedor: meta.proveedor,
    modelo: meta.modelo,
    total: resumir(pruebas, 'TOTAL'),
    porAmbito: ambitos.map((a) => resumir(pruebas.filter((p) => p.ambito === a), a)),
    pruebas,
  };
}

const pct = (v: number): string => `${v.toFixed(1)} %`;

export function renderizarMarkdown(informe: Informe): string {
  const filas = [...informe.porAmbito, informe.total]
    .map(
      (r) =>
        `| ${r.ambito} | ${r.pruebas} | ${r.exactas} (${pct(r.porcentajeExactas)}) | ${r.chrfMedio.toFixed(3)} | ${pct(r.porcentajeSinEquivalente)} | ${r.errores} |`,
    )
    .join('\n');
  const detalle = informe.pruebas
    .map((p) => {
      const estado = p.error ? `ERROR: ${p.error}` : p.exacta ? 'exacta' : `chrF ${p.chrf.toFixed(3)}`;
      const faltan = p.sinEquivalente.length ? ` · sin equivalente: ${p.sinEquivalente.join(', ')}` : '';
      return `- **${p.espanol}** (${p.ambito})\n  - esperado: ${p.esperado}\n  - obtenido: ${p.obtenido || '—'}\n  - ${estado}${faltan}`;
    })
    .join('\n');
  return (
    `# Evaluación del traductor — ${informe.fecha.slice(0, 16).replace('T', ' ')}\n\n` +
    `Motor: ${informe.proveedor ?? '—'} · modelo: ${informe.modelo ?? '—'} · pruebas: ${informe.total.pruebas}\n\n` +
    '| ámbito | pruebas | exactas | chrF medio | sin equivalente | errores |\n' +
    '|---|---:|---:|---:|---:|---:|\n' +
    `${filas}\n\n## Detalle\n\n${detalle}\n`
  );
}

/** 2026-10-03_1430_openai-gpt-oss-120b */
export function nombreBaseInforme(fecha: Date, modelo: string | null): string {
  const iso = fecha.toISOString();
  const marca = `${iso.slice(0, 10)}_${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  const limpio = (modelo ?? 'sin-modelo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${marca}_${limpio}`;
}
