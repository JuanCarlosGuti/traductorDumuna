import Anthropic from '@anthropic-ai/sdk';
import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { esStopwordEspanol } from '../comun/texto/stopwords-es';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { Idioma } from '../consulta/consulta.enums';
import { CorpusRepository } from '../consulta/corpus.repository';
import {
  FragmentoRecuperado,
  RetrievalService,
} from '../consulta/retrieval.service';
import { CLIENTE_ANTHROPIC } from './anthropic.provider';
import {
  CONFIG_TRADUCTOR,
  ConfigTraductor,
  timeoutModeloMs,
} from './config-traductor.provider';
import {
  DireccionTraduccion,
  EntradaVocabularioUsadaDto,
  RespuestaTraduccionDto,
  TraducirDto,
} from './dto/traduccion.dto';

const MAX_TOKENS_RESPUESTA = 2048;
const MAX_ENTRADAS_VOCABULARIO = 20;

export const MENSAJE_SIN_PROVEEDOR =
  'El traductor no tiene ningún motor configurado. Opciones: ' +
  '(A) gratis: define TRADUCTOR_BASE_URL, TRADUCTOR_MODELO y opcionalmente ' +
  'TRADUCTOR_API_KEY para un proveedor compatible con OpenAI (Ollama local, ' +
  'Google Gemini, Groq, Hugging Face); ' +
  '(B) Claude: define ANTHROPIC_API_KEY (console.anthropic.com). ' +
  'Después reinicia el backend. Detalles en el README.';

/**
 * Extrae un objeto JSON de la respuesta del modelo con tolerancia a
 * bloques ```json ... ``` y a texto alrededor: si hay un bloque cercado se
 * usa su contenido; después se recorta del primer '{' al último '}'.
 */
export function extraerJson(texto: string): Record<string, unknown> {
  const cercado = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidato = cercado ? cercado[1] : texto;
  const inicio = candidato.indexOf('{');
  const fin = candidato.lastIndexOf('}');
  if (inicio === -1 || fin <= inicio) {
    throw new Error('La respuesta del modelo no contiene un objeto JSON');
  }
  return JSON.parse(candidato.slice(inicio, fin + 1)) as Record<string, unknown>;
}

@Injectable()
export class TraduccionService {
  constructor(
    @Inject(CLIENTE_ANTHROPIC) private readonly cliente: Anthropic | null,
    @Inject(CONFIG_TRADUCTOR) private readonly config: ConfigTraductor,
    private readonly retrieval: RetrievalService,
    private readonly repo: CorpusRepository,
  ) {}

  disponible(): boolean {
    return this.config.proveedor !== null;
  }

  configuracion(): ConfigTraductor {
    return this.config;
  }

  async traducir(dto: TraducirDto): Promise<RespuestaTraduccionDto> {
    if (!this.config.proveedor) {
      throw new ServiceUnavailableException({
        codigo: 'SIN_PROVEEDOR',
        message: MENSAJE_SIN_PROVEEDOR,
      });
    }

    const idiomaOrigen =
      dto.direccion === DireccionTraduccion.damana_a_espanol
        ? Idioma.damana
        : Idioma.espanol;
    const ejemplos = this.retrieval.similares(dto.texto, idiomaOrigen);
    const vocabulario = this.vocabularioRelevante(dto.texto, idiomaOrigen);

    const sistema = this.armarPromptSistema();
    const usuario = this.armarPromptUsuario(dto, ejemplos, vocabulario);
    const texto =
      this.config.proveedor === 'anthropic'
        ? await this.llamarAnthropic(sistema, usuario)
        : await this.llamarCompatible(sistema, usuario);
    const json = this.parsearRespuesta(texto);

    return {
      traduccion: typeof json.traduccion === 'string' ? json.traduccion : '',
      palabrasDudosas: Array.isArray(json.palabras_dudosas)
        ? json.palabras_dudosas.filter((p): p is string => typeof p === 'string')
        : [],
      explicacionBreve:
        typeof json.explicacion_breve === 'string' ? json.explicacion_breve : '',
      ejemplos,
      vocabularioUsado: vocabulario,
    };
  }

  /** Entradas de vocabulario cuyas palabras (del idioma origen) aparecen en el texto. */
  private vocabularioRelevante(
    texto: string,
    idiomaOrigen: Idioma,
  ): EntradaVocabularioUsadaDto[] {
    const tokensTexto = new Set(tokenizarDamana(texto).map((t) => t.normalizada));
    return this.repo
      .listarVocabulario()
      .filter((entrada) => {
        const lado = idiomaOrigen === Idioma.damana ? entrada.damana : entrada.espanol;
        return tokenizarDamana(lado).some(
          (t) =>
            tokensTexto.has(t.normalizada) &&
            (idiomaOrigen === Idioma.damana || !esStopwordEspanol(t.normalizada)),
        );
      })
      .slice(0, MAX_ENTRADAS_VOCABULARIO)
      .map((e) => ({ espanol: e.espanol, damana: e.damana }));
  }

  private armarPromptSistema(): string {
    return (
      'Eres un traductor experto entre el damana (dʉmʉna), lengua del pueblo ' +
      'Wiwa de la Sierra Nevada de Santa Marta (Colombia), y el español. ' +
      'El damana tiene la vocal ʉ (U+0289), que es una letra plena distinta de u, ' +
      'y la ñ también es letra plena. Trabajas a partir de un corpus paralelo ' +
      'limitado: apóyate SOLO en los ejemplos y el vocabulario que se te dan; ' +
      'no inventes palabras damana que no puedas justificar con ellos. ' +
      'Si una palabra no aparece en los ejemplos ni en el vocabulario y no estás ' +
      'seguro de su traducción, tradúcela lo mejor posible e inclúyela en ' +
      'palabras_dudosas.\n\n' +
      'Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional ' +
      'ni bloques de código, con exactamente esta forma:\n' +
      '{"traduccion": "<la traducción>", "palabras_dudosas": ["<palabra>", ...], ' +
      '"explicacion_breve": "<1-3 frases sobre cómo llegaste a la traducción>"}'
    );
  }

  private armarPromptUsuario(
    dto: TraducirDto,
    ejemplos: FragmentoRecuperado[],
    vocabulario: EntradaVocabularioUsadaDto[],
  ): string {
    const direccion =
      dto.direccion === DireccionTraduccion.damana_a_espanol
        ? 'del damana al español'
        : 'del español al damana';

    const lineasEjemplos = ejemplos
      .map(
        (e, i) =>
          `${i + 1}. [${e.referencia}]\n   damana: ${e.damana}\n   español: ${e.espanol}`,
      )
      .join('\n');
    const lineasVocabulario = vocabulario
      .map((v) => `- ${v.damana} = ${v.espanol}`)
      .join('\n');

    return (
      `Traduce ${direccion}.\n\n` +
      '<ejemplos_del_corpus>\n' +
      (lineasEjemplos || '(no se encontraron fragmentos similares)') +
      '\n</ejemplos_del_corpus>\n\n' +
      '<vocabulario_relevante>\n' +
      (lineasVocabulario || '(ninguna entrada de vocabulario coincide)') +
      '\n</vocabulario_relevante>\n\n' +
      '<texto_a_traducir>\n' +
      dto.texto +
      '\n</texto_a_traducir>'
    );
  }

  private async llamarAnthropic(sistema: string, usuario: string): Promise<string> {
    try {
      const respuesta = await this.cliente!.messages.create({
        model: this.config.modelo,
        max_tokens: MAX_TOKENS_RESPUESTA,
        system: sistema,
        messages: [{ role: 'user', content: usuario }],
      });
      const bloqueTexto = respuesta.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      if (!bloqueTexto) {
        throw new BadGatewayException(
          'El modelo no devolvió texto (¿respuesta rechazada?). Intenta de nuevo.',
        );
      }
      return bloqueTexto.text;
    } catch (error) {
      throw this.traducirErrorAnthropic(error);
    }
  }

  /**
   * Llama a cualquier API compatible con OpenAI (Ollama, Gemini, Groq,
   * Hugging Face router...) usando fetch nativo: POST {base}/chat/completions.
   */
  private async llamarCompatible(sistema: string, usuario: string): Promise<string> {
    const url = `${this.config.baseUrl!.replace(/\/+$/, '')}/chat/completions`;
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), timeoutModeloMs());

    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.apiKey
            ? { authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: this.config.modelo,
          max_tokens: MAX_TOKENS_RESPUESTA,
          messages: [
            { role: 'system', content: sistema },
            { role: 'user', content: usuario },
          ],
        }),
        signal: control.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException(
          `La traducción superó el tiempo de espera (${Math.round(timeoutModeloMs() / 1000)} s). ` +
            'Con modelos locales puedes ampliarlo con TRADUCTOR_TIMEOUT_MS.',
        );
      }
      throw new GatewayTimeoutException(
        `No se pudo conectar con ${this.config.baseUrl}. ` +
          '¿Está corriendo el proveedor (p. ej. Ollama) y la URL es correcta?',
      );
    } finally {
      clearTimeout(temporizador);
    }

    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new BadGatewayException(
        'El proveedor rechazó la clave TRADUCTOR_API_KEY. Revísala y reinicia el backend.',
      );
    }
    if (respuesta.status === 429) {
      throw new HttpException(
        'El proveedor devolvió un límite de uso (429). Espera un momento y reintenta.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (respuesta.status === 404) {
      throw new BadGatewayException(
        `El proveedor no encontró el modelo "${this.config.modelo}" (404). ` +
          'Revisa TRADUCTOR_MODELO (con Ollama: ¿hiciste "ollama pull <modelo>"?).',
      );
    }
    if (!respuesta.ok) {
      throw new BadGatewayException(
        `El proveedor devolvió un error (${respuesta.status}).`,
      );
    }

    const json = (await respuesta.json().catch(() => null)) as {
      choices?: { message?: { content?: unknown } }[];
    } | null;
    const texto = json?.choices?.[0]?.message?.content;
    if (typeof texto !== 'string' || texto.length === 0) {
      throw new BadGatewayException(
        'El proveedor no devolvió texto en el formato esperado (choices[0].message.content).',
      );
    }
    return texto;
  }

  /** Mapea los errores tipados del SDK de Anthropic a errores HTTP claros. */
  private traducirErrorAnthropic(error: unknown): Error {
    if (error instanceof HttpException) return error;
    if (error instanceof Anthropic.AuthenticationError) {
      return new BadGatewayException(
        'La clave ANTHROPIC_API_KEY no es válida o fue revocada. Revísala y reinicia el backend.',
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return new HttpException(
        'La API de Anthropic devolvió un límite de uso (429). Espera un momento y reintenta.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return new GatewayTimeoutException(
        'La traducción tardó demasiado y se agotó el tiempo de espera. Reintenta con un texto más corto.',
      );
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return new GatewayTimeoutException(
        'No se pudo conectar con la API de Anthropic. Revisa tu conexión a internet.',
      );
    }
    if (error instanceof Anthropic.APIError) {
      return new BadGatewayException(
        `La API de Anthropic devolvió un error (${String(error.status)}): ${error.message}`,
      );
    }
    return new BadGatewayException(
      `Error inesperado al traducir: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  private parsearRespuesta(texto: string): Record<string, unknown> {
    try {
      return extraerJson(texto);
    } catch {
      throw new BadGatewayException(
        'El modelo no devolvió el JSON esperado. Reintenta la traducción.',
      );
    }
  }
}
