import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { segmentFragment } from '../../shared/fragment';
import { normalize } from '../../shared/normalizer';
import { UPlusDirective } from '../../shared/u-plus.directive';
import { ApiService } from '../../core/api.service';
import {
  TranslationDirection,
  CorpusDomain,
  TranslatorStatus,
  ExampleFragment,
  ValidationOrigin,
  TranslationResponse,
} from '../../core/models';

interface TranslationSegment {
  texto: string;
  sinEquivalente: boolean;
}

interface ExampleGroup {
  dominio: CorpusDomain;
  titulo: string;
  ejemplos: ExampleFragment[];
}

const DOMAIN_TITLES: Record<CorpusDomain, string> = {
  cotidiano: 'Ejemplos cotidianos',
  gramatica: 'Ejemplos de gramática (conjugaciones)',
  biblico: 'Ejemplos del corpus bíblico',
};
const DOMAIN_ORDER: CorpusDomain[] = ['cotidiano', 'gramatica', 'biblico'];

type ValidationStatus = 'ninguna' | 'guardando' | ValidationOrigin;

@Component({
  selector: 'app-translator',
  imports: [UPlusDirective, RouterLink],
  templateUrl: './translator.html',
  styleUrl: './translator.css',
})
export class TranslatorView {
  private readonly api = inject(ApiService);

  protected readonly status = signal<TranslatorStatus | null>(null);
  protected readonly text = signal('');
  protected readonly direction = signal<TranslationDirection>('espanol_a_damana');
  protected readonly result = signal<TranslationResponse | null>(null);
  protected readonly error = signal('');
  protected readonly loading = signal(false);

  /** Text that was translated (the box may change afterwards). */
  protected readonly translatedText = signal('');
  protected readonly validation = signal<ValidationStatus>('ninguna');
  protected readonly totalValidated = signal(0);
  protected readonly correcting = signal(false);
  protected readonly correction = signal('');
  protected readonly validationError = signal('');

  /** Translation without brackets, with the words without an equivalent marked. */
  protected readonly segments = computed<TranslationSegment[]>(() => {
    const r = this.result();
    if (!r) return [];
    const withoutEquivalent = new Set(r.palabrasSinEquivalente.map((p) => normalize(p)));
    const clean = r.traduccion.replace(/\[([^\]]+)\]/g, '$1');
    return segmentFragment(clean).map((s) => ({
      texto: s.texto,
      sinEquivalente: s.esPalabra && withoutEquivalent.has(normalize(s.texto)),
    }));
  });

  protected readonly examplesByDomain = computed<ExampleGroup[]>(() => {
    const r = this.result();
    if (!r) return [];
    return DOMAIN_ORDER.map((domain) => ({
      dominio: domain,
      titulo: DOMAIN_TITLES[domain],
      ejemplos: r.ejemplos.filter((e) => e.dominio === domain),
    })).filter((g) => g.ejemplos.length > 0);
  });

  protected readonly confidencePercent = computed(() =>
    Math.round((this.result()?.confianza ?? 0) * 100),
  );

  /**
   * What to say while waiting. Claude takes quite a bit longer than Groq (5-15 s
   * versus 2-3 s) and without a notice it looks like the page froze.
   */
  protected readonly waitMessage = computed(() => {
    const e = this.status();
    if (e?.proveedor === 'anthropic') {
      return 'Traduciendo con Claude… suele tardar entre 5 y 15 s.';
    }
    return `Traduciendo con ${e?.modelo ?? 'el modelo'}… suele tardar unos segundos (un modelo local puede tardar más).`;
  });

  constructor() {
    void this.loadStatus();
  }

  private async loadStatus(): Promise<void> {
    try {
      this.status.set(await this.api.translatorStatus());
    } catch {
      this.status.set(null);
      this.error.set('No se pudo consultar el estado del traductor. ¿Está corriendo el backend?');
    }
  }

  protected async translate(event: Event): Promise<void> {
    event.preventDefault();
    const text = this.text().trim();
    if (!text || this.loading()) return;

    this.loading.set(true);
    this.error.set('');
    this.resetValidation();
    try {
      this.result.set(await this.api.translate(text, this.direction()));
      this.translatedText.set(text);
    } catch (e) {
      this.result.set(null);
      this.error.set(this.errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  private resetValidation(): void {
    this.validation.set('ninguna');
    this.correcting.set(false);
    this.correction.set('');
    this.validationError.set('');
  }

  /** «esta traducción es correcta» button. */
  protected confirm(): Promise<void> {
    const r = this.result();
    if (!r) return Promise.resolve();
    return this.saveValidation(r.traduccion, 'confirmada');
  }

  protected openCorrection(): void {
    this.correction.set(this.result()?.traduccion.replace(/\[([^\]]+)\]/g, '$1') ?? '');
    this.correcting.set(true);
    this.validationError.set('');
  }

  protected cancelCorrection(): void {
    this.correcting.set(false);
  }

  /** «guardar corrección» button: the corrected pair is worth the same as a confirmed one. */
  protected saveCorrection(): Promise<void> {
    const text = this.correction().trim();
    if (!text) return Promise.resolve();
    return this.saveValidation(text, 'corregida');
  }

  private async saveValidation(translation: string, origin: ValidationOrigin): Promise<void> {
    const r = this.result();
    if (!r || this.validation() === 'guardando') return;
    this.validation.set('guardando');
    this.validationError.set('');
    try {
      const response = await this.api.validateTranslation({
        texto: this.translatedText(),
        direccion: this.direction(),
        traduccion: translation,
        origen: origin,
        traduccionModelo: r.traduccion,
      });
      this.totalValidated.set(response.total);
      this.validation.set(origin);
      this.correcting.set(false);
    } catch (e) {
      this.validation.set('ninguna');
      this.validationError.set(this.errorMessage(e));
    }
  }

  private errorMessage(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) {
        return 'No se pudo contactar el backend. ¿Está corriendo en el puerto 3000?';
      }
      const message = (e.error as { message?: string | string[] })?.message;
      if (Array.isArray(message)) return message.join('; ');
      if (typeof message === 'string') return message;
    }
    return 'Error inesperado al traducir. Reintenta.';
  }

  protected swapDirection(): void {
    this.direction.set(
      this.direction() === 'damana_a_espanol' ? 'espanol_a_damana' : 'damana_a_espanol',
    );
  }

  /** Language of the Damana side in the gloss, to mark lang="mbp" where needed. */
  protected targetIsDamana(): boolean {
    return this.direction() === 'espanol_a_damana';
  }
}
