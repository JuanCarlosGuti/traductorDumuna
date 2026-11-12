import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { PendingItem } from '../../core/models';

/** Triggers a blob download in the browser; in tests (no URL.createObjectURL) it does nothing. */
export function downloadBlob(blob: Blob, fileName: string): boolean {
  if (typeof URL.createObjectURL !== 'function') return false;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

@Component({
  selector: 'app-pending',
  imports: [RouterLink],
  templateUrl: './pending.html',
  styleUrl: './pending.css',
})
export class PendingView {
  private readonly api = inject(ApiService);

  protected readonly pendingItems = signal<PendingItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly exporting = signal(false);
  protected readonly showResolved = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');

  protected readonly openItems = computed(() => this.pendingItems().filter((p) => p.status !== 'resuelta'));
  protected readonly visible = computed(() =>
    this.showResolved() ? this.pendingItems() : this.openItems(),
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.pendingItems.set(await this.api.pendingItems());
      this.error.set('');
    } catch (e) {
      this.error.set(this.errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** «exportar lote» button: downloads the Excel and reloads the list (they stay as exported). */
  protected async exportBatch(): Promise<void> {
    if (this.exporting() || this.openItems().length === 0) return;
    this.exporting.set(true);
    this.message.set('');
    this.error.set('');
    try {
      const file = await this.api.exportPending();
      downloadBlob(file.blob, file.fileName);
      this.message.set(
        `Lote generado: ${file.fileName}. Cuando vuelva lleno, guárdalo en la carpeta datos/ y ejecuta npm run importar.`,
      );
      await this.load();
    } catch (e) {
      this.error.set(this.errorMessage(e));
    } finally {
      this.exporting.set(false);
    }
  }

  private errorMessage(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) return 'No se pudo contactar el backend.';
      const message = (e.error as { message?: string })?.message;
      if (typeof message === 'string') return message;
    }
    return 'Error inesperado. Reintenta.';
  }
}
