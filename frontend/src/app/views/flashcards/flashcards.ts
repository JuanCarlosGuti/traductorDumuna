import { Component, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { Grade, SrsStatus } from '../../core/models';

interface GradeOption {
  key: Grade;
  label: string;
  hotkey: string;
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
    { key: 'again', label: 'Otra vez', hotkey: '1' },
    { key: 'hard', label: 'Difícil', hotkey: '2' },
    { key: 'good', label: 'Bien', hotkey: '3' },
    { key: 'easy', label: 'Fácil', hotkey: '4' },
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
    if (this.status()?.card) this.revealed.set(true);
  }

  protected async answer(grade: Grade): Promise<void> {
    const card = this.status()?.card;
    if (!card || !this.revealed() || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.srsAnswer(card.word, grade);
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
    const option = this.options.find((o) => o.hotkey === event.key);
    if (option && this.revealed()) {
      event.preventDefault();
      void this.answer(option.key);
    }
  }
}
