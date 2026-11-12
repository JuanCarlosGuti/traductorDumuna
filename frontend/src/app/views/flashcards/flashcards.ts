import { Component, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { Grade, SrsStatus } from '../../core/models';

interface GradeOption {
  clave: Grade;
  etiqueta: string;
  tecla: string;
}

@Component({
  selector: 'app-flashcards',
  templateUrl: './flashcards.html',
  styleUrl: './flashcards.css',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class Flashcards {
  private readonly api = inject(ApiService);

  protected readonly status = signal<SrsStatus | null>(null);
  protected readonly revealed = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly options: GradeOption[] = [
    { clave: 'otra_vez', etiqueta: 'Otra vez', tecla: '1' },
    { clave: 'dificil', etiqueta: 'Difícil', tecla: '2' },
    { clave: 'bien', etiqueta: 'Bien', tecla: '3' },
    { clave: 'facil', etiqueta: 'Fácil', tecla: '4' },
  ];

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.status.set(await this.api.srsNext());
      this.revealed.set(false);
    } catch {
      this.error.set('No se pudo cargar el mazo. ¿Está corriendo el backend?');
    } finally {
      this.busy.set(false);
    }
  }

  protected reveal(): void {
    if (this.status()?.tarjeta) this.revealed.set(true);
  }

  protected async answer(grade: Grade): Promise<void> {
    const card = this.status()?.tarjeta;
    if (!card || !this.revealed() || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.srsAnswer(card.palabra, grade);
      await this.load();
    } catch {
      this.error.set('No se pudo guardar la respuesta.');
      this.busy.set(false);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

    if (!this.revealed() && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      this.reveal();
      return;
    }
    const option = this.options.find((o) => o.tecla === event.key);
    if (option && this.revealed()) {
      event.preventDefault();
      void this.answer(option.clave);
    }
  }
}
