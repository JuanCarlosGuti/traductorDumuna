import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Grade,
  TranslationDirection,
  VocabularyEntry,
  SrsStatus,
  TranslatorStatus,
  WordCard,
  Phrase,
  Frequency,
  Language,
  Lemma,
  PendingItem,
  UpdatedProgress,
  SearchResponse,
  TranslationResponse,
  ConjugationTable,
  SavedValidation,
  ValidateTranslation,
} from './models';

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

/** Attachment name from a Content-Disposition header (or the fallback one). */
export function attachmentName(contentDisposition: string | null, fallback: string): string {
  const m = /filename="?([^";]+)"?/i.exec(contentDisposition ?? '');
  return m ? m[1] : fallback;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  search(
    q: string,
    language: Language,
    source?: string,
    limit = 100,
  ): Promise<SearchResponse> {
    let params = new HttpParams()
      .set('q', q)
      .set('language', language)
      .set('limit', limit);
    if (source) params = params.set('source', source);
    return firstValueFrom(
      this.http.get<SearchResponse>('/api/search', { params }),
    );
  }

  word(token: string): Promise<WordCard> {
    return firstValueFrom(
      this.http.get<WordCard>(`/api/word/${encodeURIComponent(token)}`),
    );
  }

  frequencies(limit = 10000): Promise<Frequency[]> {
    const params = new HttpParams().set('limit', limit);
    return firstValueFrom(this.http.get<Frequency[]>('/api/frequencies', { params }));
  }

  vocabulary(): Promise<VocabularyEntry[]> {
    return firstValueFrom(this.http.get<VocabularyEntry[]>('/api/vocabulary'));
  }

  phrases(): Promise<Phrase[]> {
    return firstValueFrom(this.http.get<Phrase[]>('/api/phrases'));
  }

  srsNext(): Promise<SrsStatus> {
    return firstValueFrom(this.http.get<SrsStatus>('/api/srs/next'));
  }

  srsAnswer(word: string, grade: Grade): Promise<UpdatedProgress> {
    return firstValueFrom(
      this.http.post<UpdatedProgress>('/api/srs/answer', { word, grade }),
    );
  }

  grammarLemmas(): Promise<Lemma[]> {
    return firstValueFrom(this.http.get<Lemma[]>('/api/grammar/lemmas'));
  }

  grammarTable(lemma: string): Promise<ConjugationTable> {
    return firstValueFrom(
      this.http.get<ConjugationTable>(`/api/grammar/lemmas/${encodeURIComponent(lemma)}`),
    );
  }

  translatorStatus(): Promise<TranslatorStatus> {
    return firstValueFrom(this.http.get<TranslatorStatus>('/api/translate/status'));
  }

  translate(text: string, direction: TranslationDirection): Promise<TranslationResponse> {
    return firstValueFrom(
      this.http.post<TranslationResponse>('/api/translate', { text, direction }),
    );
  }

  validateTranslation(bodyData: ValidateTranslation): Promise<SavedValidation> {
    return firstValueFrom(
      this.http.post<SavedValidation>('/api/translate/validate', bodyData),
    );
  }

  pendingItems(): Promise<PendingItem[]> {
    return firstValueFrom(this.http.get<PendingItem[]>('/api/pending'));
  }

  /** Generates and downloads the Excel batch for the speakers; the server marks the rows as exported. */
  async exportPending(): Promise<DownloadedFile> {
    const response = await firstValueFrom(
      this.http.post('/api/pending/export', null, {
        responseType: 'blob',
        observe: 'response',
      }),
    );
    return {
      blob: response.body ?? new Blob(),
      fileName: attachmentName(
        response.headers.get('content-disposition'),
        'formato_elicitacion_pendientes.xlsx',
      ),
    };
  }
}
