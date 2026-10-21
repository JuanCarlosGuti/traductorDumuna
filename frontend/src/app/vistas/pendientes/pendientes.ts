import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Pendiente } from '../../core/modelos';

/** Lanza la descarga de un blob en el navegador; en tests (sin URL.createObjectURL) no hace nada. */
export function descargarBlob(blob: Blob, nombreArchivo: string): boolean {
  if (typeof URL.createObjectURL !== 'function') return false;
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
  return true;
}

@Component({
  selector: 'app-pendientes',
  imports: [RouterLink],
  templateUrl: './pendientes.html',
  styleUrl: './pendientes.css',
})
export class Pendientes {
  private readonly api = inject(ApiService);

  protected readonly pendientes = signal<Pendiente[]>([]);
  protected readonly cargando = signal(true);
  protected readonly exportando = signal(false);
  protected readonly verResueltas = signal(false);
  protected readonly mensaje = signal('');
  protected readonly error = signal('');

  protected readonly abiertas = computed(() => this.pendientes().filter((p) => p.estado !== 'resuelta'));
  protected readonly visibles = computed(() =>
    this.verResueltas() ? this.pendientes() : this.abiertas(),
  );

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.pendientes.set(await this.api.pendientes());
      this.error.set('');
    } catch (e) {
      this.error.set(this.mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Botón «exportar lote»: descarga el Excel y recarga la lista (quedan como exportadas). */
  protected async exportar(): Promise<void> {
    if (this.exportando() || this.abiertas().length === 0) return;
    this.exportando.set(true);
    this.mensaje.set('');
    this.error.set('');
    try {
      const archivo = await this.api.exportarPendientes();
      descargarBlob(archivo.blob, archivo.nombreArchivo);
      this.mensaje.set(
        `Lote generado: ${archivo.nombreArchivo}. Cuando vuelva lleno, guárdalo en la carpeta datos/ y ejecuta npm run importar.`,
      );
      await this.cargar();
    } catch (e) {
      this.error.set(this.mensajeDeError(e));
    } finally {
      this.exportando.set(false);
    }
  }

  private mensajeDeError(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) return 'No se pudo contactar el backend.';
      const mensaje = (e.error as { message?: string })?.message;
      if (typeof mensaje === 'string') return mensaje;
    }
    return 'Error inesperado. Reintenta.';
  }
}
