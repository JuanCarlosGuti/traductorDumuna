import { DominioCorpus } from '../consulta/consulta.enums';
import { ContextoRecuperado, FragmentoRecuperado } from '../consulta/retrieval.service';
import { DireccionTraduccion } from './dto/traduccion.dto';

/** Nombres de las claves de cada par de la glosa según la dirección. */
export function clavesGlosa(direccion: DireccionTraduccion): { origen: string; destino: string } {
  return direccion === DireccionTraduccion.espanol_a_damana
    ? { origen: 'palabra_es', destino: 'segmento_dm' }
    : { origen: 'palabra_dm', destino: 'segmento_es' };
}

/** JSON Schema de la respuesta: lo usa la salida estructurada de Anthropic. */
export function esquemaRespuesta(direccion: DireccionTraduccion): Record<string, unknown> {
  const { origen, destino } = clavesGlosa(direccion);
  return {
    type: 'object',
    properties: {
      traduccion: { type: 'string' },
      glosa: {
        type: 'array',
        items: {
          type: 'object',
          properties: { [origen]: { type: 'string' }, [destino]: { type: 'string' } },
          required: [origen, destino],
          additionalProperties: false,
        },
      },
      palabras_sin_equivalente: { type: 'array', items: { type: 'string' } },
      reglas_aplicadas: { type: 'array', items: { type: 'string' } },
      confianza: { type: 'number' },
      explicacion_breve: { type: 'string' },
    },
    required: [
      'traduccion',
      'glosa',
      'palabras_sin_equivalente',
      'reglas_aplicadas',
      'confianza',
      'explicacion_breve',
    ],
    additionalProperties: false,
  };
}

export function armarPromptSistema(direccion: DireccionTraduccion): string {
  const { origen, destino } = clavesGlosa(direccion);
  return (
    'Eres un traductor experto entre el damana (dʉmʉna), lengua del pueblo Wiwa ' +
    'de la Sierra Nevada de Santa Marta (Colombia), y el español. En damana la ' +
    'vocal ʉ (U+0289) es una letra plena distinta de u, y la ñ también es letra ' +
    'plena: cópialas tal cual, nunca las sustituyas.\n\n' +
    'Recibirás un mensaje con secciones fijas: REGLAS GRAMATICALES, DICCIONARIO DE ' +
    'ESTA FRASE, EJEMPLOS COTIDIANOS, EJEMPLOS DE GRAMÁTICA, EJEMPLOS DEL CORPUS ' +
    'BÍBLICO y FRASE A TRADUCIR. Cómo trabajar:\n' +
    '1. Traduce usando PRIMERO el diccionario y las reglas gramaticales. Los ' +
    'ejemplos sirven para el orden de las palabras y la morfología (sufijos, ' +
    'concordancia), no para copiar vocabulario que la frase no pide.\n' +
    '2. Prefiere el registro cotidiano, el de la conversación diaria. Evita el ' +
    'vocabulario religioso o bíblico salvo que la frase lo pida expresamente.\n' +
    '3. Si una palabra no tiene equivalente ni en el diccionario ni en los ' +
    'ejemplos, NO la inventes: déjala entre corchetes en la traducción (por ' +
    'ejemplo [vecina]) y lístala en palabras_sin_equivalente. Esto vale para ' +
    'palabras con significado propio (sustantivos, verbos, adjetivos, ' +
    'adverbios). Los artículos, preposiciones y demás palabras gramaticales ' +
    'del español (el, la, los, las, un, una, de, a, que…) NO se traducen una ' +
    'por una ni se dejan entre corchetes: el damana los expresa con sufijos o ' +
    'no los expresa; resuélvelos con las reglas y los ejemplos.\n' +
    '4. Las acepciones marcadas «posible» son aproximaciones por prefijo: úsalas ' +
    'solo si encajan por significado. Las marcadas «frase» traducen un grupo de ' +
    'palabras completo y las marcadas «sinonimo» vienen de una variante ' +
    'coloquial del español (mamá = madre): valen igual que una exacta.\n' +
    '5. Los nombres propios se escriben con la grafía que se indica.\n\n' +
    'Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional ni ' +
    'bloques de código, con exactamente estas claves:\n' +
    '{"traduccion": "<la traducción>", ' +
    `"glosa": [{"${origen}": "<palabra o grupo del original>", "${destino}": "<segmento de la traducción que le corresponde>"}, ...], ` +
    '"palabras_sin_equivalente": ["<palabra sin equivalente>", ...], ' +
    '"reglas_aplicadas": ["<regla usada, p. ej. -ndzina (plural)>", ...], ' +
    '"confianza": <número entre 0 y 1>, ' +
    '"explicacion_breve": "<1-3 frases sobre cómo llegaste a la traducción>"}'
  );
}

function seccion(titulo: string, cuerpo: string): string {
  return `=== ${titulo} ===\n${cuerpo}\n`;
}

function listarEjemplos(ejemplos: FragmentoRecuperado[], vacio: string): string {
  if (ejemplos.length === 0) return `(${vacio})`;
  return ejemplos
    .map((e, i) => {
      // Se avisa cuando el ejemplo llegó por parentesco verbal: sirve como
      // muestra del verbo en uso, pero va en otra persona gramatical.
      const nota = e.porLema ? ` — usa otra conjugación del verbo «${e.porLema}»` : '';
      return `${i + 1}. [${e.referencia}${nota}]\n   español: ${e.espanol}\n   damana: ${e.damana}`;
    })
    .join('\n');
}

export function armarPromptUsuario(
  texto: string,
  direccion: DireccionTraduccion,
  contexto: ContextoRecuperado,
): string {
  const lineasReglas = contexto.reglas.map((r) => {
    const ejemplo =
      r.ejemploBase && r.ejemploRegla
        ? ` Ej.: ${r.ejemploBase} → ${r.ejemploRegla}${r.traduccionEjemplo ? ` = ${r.traduccionEjemplo}` : ''}.`
        : '';
    const marca = r.disparador ? ` [${r.disparador}]` : '';
    return `- ${r.forma} — ${r.significado ?? ''}${ejemplo}${marca}`;
  });
  const rasgos =
    contexto.disparadores.length > 0
      ? `Rasgos detectados en la frase: ${contexto.disparadores.join(', ')}.`
      : 'Rasgos detectados en la frase: ninguno.';
  const reglas = [rasgos, ...(lineasReglas.length ? lineasReglas : ['(ninguna regla aplicable)'])].join('\n');

  const lineasDiccionario = contexto.diccionario.map((a) => {
    const categoria = a.categoria ? `; ${a.categoria}` : '';
    return direccion === DireccionTraduccion.espanol_a_damana
      ? `- ${a.palabra} → ${a.damana} (${a.espanol}) [${a.coincidencia}${categoria}]`
      : `- ${a.palabra} → ${a.espanol} (${a.damana}) [${a.coincidencia}${categoria}]`;
  });
  const nombres = contexto.nombresPropios.map((n) =>
    direccion === DireccionTraduccion.espanol_a_damana
      ? `- ${n.enTexto} → ${n.damana} (nombre propio)`
      : `- ${n.enTexto} → ${n.espanol} (nombre propio)`,
  );
  const diccionario = [
    ...(lineasDiccionario.length ? lineasDiccionario : ['(ninguna palabra de la frase está en el diccionario)']),
    ...(nombres.length ? ['Nombres propios:', ...nombres] : []),
  ].join('\n');

  const porDominio = (d: DominioCorpus) => contexto.ejemplos.filter((e) => e.dominio === d);
  const sentido =
    direccion === DireccionTraduccion.espanol_a_damana ? 'del español al damana' : 'del damana al español';

  return (
    seccion('REGLAS GRAMATICALES', reglas) +
    '\n' +
    seccion('DICCIONARIO DE ESTA FRASE', diccionario) +
    '\n' +
    seccion('EJEMPLOS COTIDIANOS', listarEjemplos(porDominio(DominioCorpus.cotidiano), 'sin ejemplos cotidianos parecidos')) +
    '\n' +
    seccion('EJEMPLOS DE GRAMÁTICA', listarEjemplos(porDominio(DominioCorpus.gramatica), 'sin formas conjugadas parecidas')) +
    '\n' +
    seccion('EJEMPLOS DEL CORPUS BÍBLICO', listarEjemplos(porDominio(DominioCorpus.biblico), 'sin ejemplos bíblicos parecidos')) +
    '\n' +
    seccion('FRASE A TRADUCIR', `Dirección: ${sentido}.\n${texto}`)
  );
}

export interface RespuestaModelo {
  traduccion: string;
  glosa: { origen: string; destino: string }[];
  palabrasSinEquivalente: string[];
  reglasAplicadas: string[];
  confianza: number;
  explicacionBreve: string;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const lista = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];

/** Palabras que el modelo dejó entre corchetes en la traducción. */
export function palabrasEntreCorchetes(traduccion: string): string[] {
  return [...traduccion.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim()).filter(Boolean);
}

/**
 * Lleva el JSON del modelo a la forma interna, con tolerancia: claves de la
 * glosa en cualquiera de sus variantes, confianza como número o texto
 * (acotada a 0-1) y las palabras entre corchetes añadidas a la lista de
 * sin equivalente aunque el modelo olvidara listarlas.
 */
export function normalizarRespuestaModelo(json: Record<string, unknown>): RespuestaModelo {
  const traduccion = texto(json.traduccion);
  const glosa = Array.isArray(json.glosa)
    ? json.glosa
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
        .map((p) => ({
          origen: texto(p.palabra_es ?? p.palabra_dm ?? p.origen ?? p.palabra),
          destino: texto(p.segmento_dm ?? p.segmento_es ?? p.destino ?? p.segmento),
        }))
        .filter((p) => p.origen || p.destino)
    : [];
  const sinEquivalente = new Set(lista(json.palabras_sin_equivalente).map((p) => p.replace(/^\[|\]$/g, '')));
  for (const p of palabrasEntreCorchetes(traduccion)) sinEquivalente.add(p);

  const confianzaCruda = Number(json.confianza);
  const confianza = Number.isFinite(confianzaCruda) ? Math.min(1, Math.max(0, confianzaCruda)) : 0;

  return {
    traduccion,
    glosa,
    palabrasSinEquivalente: [...sinEquivalente],
    reglasAplicadas: lista(json.reglas_aplicadas),
    confianza,
    explicacionBreve: texto(json.explicacion_breve),
  };
}
