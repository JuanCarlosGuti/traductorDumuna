import { Component, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { Lemma, ConjugationTable } from '../../core/models';

@Component({
  selector: 'app-grammar',
  templateUrl: './grammar.html',
  styleUrl: './grammar.css',
})
export class GrammarView {
  private readonly api = inject(ApiService);

  protected readonly lemmas = signal<Lemma[]>([]);
  protected readonly table = signal<ConjugationTable | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadingTable = signal(false);
  protected readonly error = signal('');

  constructor() {
    void this.loadLemmas();
  }

  private async loadLemmas(): Promise<void> {
    try {
      this.lemmas.set(await this.api.grammarLemmas());
    } catch {
      this.error.set('No se pudieron cargar los lemas. ¿Está corriendo el backend?');
    } finally {
      this.loading.set(false);
    }
  }

  protected async choose(lemma: string): Promise<void> {
    if (this.loadingTable()) return;
    this.loadingTable.set(true);
    this.error.set('');
    try {
      this.table.set(await this.api.grammarTable(lemma));
    } catch {
      this.table.set(null);
      this.error.set(`No se pudo cargar la conjugación de «${lemma}».`);
    } finally {
      this.loadingTable.set(false);
    }
  }
}
