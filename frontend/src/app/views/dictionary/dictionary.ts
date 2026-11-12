import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { normalize } from '../../shared/normalizer';
import { UPlusDirective } from '../../shared/u-plus.directive';
import { ApiService } from '../../core/api.service';
import { VocabularyEntry, Frequency } from '../../core/models';

const PER_PAGE = 50;

type DictionaryMode = 'damana' | 'espanol';

@Component({
  selector: 'app-dictionary',
  imports: [RouterLink, UPlusDirective],
  templateUrl: './dictionary.html',
  styleUrl: './dictionary.css',
})
export class DictionaryView {
  private readonly api = inject(ApiService);

  protected readonly mode = signal<DictionaryMode>('damana');
  protected readonly filterText = signal('');
  protected readonly words = signal<Frequency[]>([]);
  protected readonly vocabulary = signal<VocabularyEntry[]>([]);
  protected readonly pageIndex = signal(0);
  protected readonly loading = signal(true);
  protected readonly perPage = PER_PAGE;

  /** Damana → Spanish: frequencies filtered by the Damana word. */
  protected readonly filteredWords = computed(() => {
    const filterText = normalize(this.filterText().trim());
    if (!filterText) return this.words();
    return this.words().filter((f) => f.word.includes(filterText));
  });

  /** Spanish → Damana: vocabulary filtered by the Spanish side, sorted. */
  protected readonly filteredEntries = computed(() => {
    const filterText = normalize(this.filterText().trim());
    const entries = filterText
      ? this.vocabulary().filter((e) => normalize(e.spanish).includes(filterText))
      : this.vocabulary();
    return [...entries].sort((a, b) => a.spanish.localeCompare(b.spanish, 'es'));
  });

  protected readonly totalRows = computed(() =>
    this.mode() === 'damana'
      ? this.filteredWords().length
      : this.filteredEntries().length,
  );
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalRows() / PER_PAGE)),
  );
  protected readonly visible = computed(() =>
    this.filteredWords().slice(
      this.pageIndex() * PER_PAGE,
      (this.pageIndex() + 1) * PER_PAGE,
    ),
  );
  protected readonly visibleEntries = computed(() =>
    this.filteredEntries().slice(
      this.pageIndex() * PER_PAGE,
      (this.pageIndex() + 1) * PER_PAGE,
    ),
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [words, vocabulary] = await Promise.all([
        this.api.frequencies(),
        this.api.vocabulary(),
      ]);
      this.words.set(words);
      this.vocabulary.set(vocabulary);
    } finally {
      this.loading.set(false);
    }
  }

  protected changeMode(mode: DictionaryMode): void {
    this.mode.set(mode);
    this.pageIndex.set(0);
  }

  protected applyFilter(value: string): void {
    this.filterText.set(value);
    this.pageIndex.set(0);
  }

  protected previousPage(): void {
    this.pageIndex.update((p) => Math.max(0, p - 1));
  }

  protected next(): void {
    this.pageIndex.update((p) => Math.min(this.totalPages() - 1, p + 1));
  }
}
