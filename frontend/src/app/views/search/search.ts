import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ClickableFragment } from '../../shared/clickable-fragment';
import { UPlusDirective } from '../../shared/u-plus.directive';
import { ApiService } from '../../core/api.service';
import { Language, SearchResponse } from '../../core/models';

@Component({
  selector: 'app-search',
  imports: [ClickableFragment, UPlusDirective],
  templateUrl: './search.html',
  styleUrl: './search.css',
})
export class SearchView {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly term = signal('');
  protected readonly language = signal<Language>('damana');
  protected readonly source = signal('');
  protected readonly response = signal<SearchResponse | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  constructor() {
    // State lives in the URL: navigating = searching, and the «back» button
    // undoes the jumps from word to word.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const q = params.get('q') ?? '';
        this.term.set(q);
        this.language.set((params.get('language') as Language) ?? 'damana');
        this.source.set(params.get('source') ?? '');
        if (q.trim()) {
          void this.run(q.trim());
        } else {
          this.response.set(null);
        }
      });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.navigate(this.term(), this.language());
  }

  protected changeLanguage(language: string): void {
    this.language.set(language as Language);
    if (this.term().trim()) this.navigate(this.term(), this.language());
  }

  protected changeSource(source: string): void {
    this.source.set(source);
    if (this.term().trim()) this.navigate(this.term(), this.language());
  }

  protected searchWord(word: string): void {
    // Click on a Damana word in a result: new search in Damana.
    this.navigate(word, 'damana');
  }

  private navigate(q: string, language: Language): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: q.trim() || null,
        language: language,
        source: this.source() || null,
      },
    });
  }

  private async run(q: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.response.set(
        await this.api.search(q, this.language(), this.source() || undefined),
      );
    } catch {
      this.error.set('No se pudo completar la búsqueda. ¿Está corriendo el backend?');
      this.response.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
