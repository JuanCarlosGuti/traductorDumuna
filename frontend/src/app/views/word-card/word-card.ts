import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClickableFragment } from '../../shared/clickable-fragment';
import { ApiService } from '../../core/api.service';
import { WordCard } from '../../core/models';

@Component({
  selector: 'app-word-card',
  imports: [RouterLink, ClickableFragment],
  templateUrl: './word-card.html',
  styleUrl: './word-card.css',
})
export class WordCardView {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly wordCard = signal<WordCard | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal('');

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const word = params.get('palabra');
      if (word) void this.load(word);
    });
  }

  private async load(word: string): Promise<void> {
    this.loading.set(true);
    this.notFound.set('');
    try {
      this.wordCard.set(await this.api.word(word));
    } catch {
      this.wordCard.set(null);
      this.notFound.set(word);
    } finally {
      this.loading.set(false);
    }
  }

  protected viewWord(word: string): void {
    void this.router.navigate(['/diccionario', word]);
  }

  protected searchInSpanish(word: string): void {
    void this.router.navigate(['/buscar'], {
      queryParams: { q: word, idioma: 'espanol' },
    });
  }
}
