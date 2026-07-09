import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { segmentarFragmento } from '../../comun/fragmento';
import { normalizar } from '../../comun/normalizador';
import { UMasDirective } from '../../comun/u-mas.directive';
import { ApiService } from '../../core/api.service';
import {
  DireccionTraduccion,
  EstadoTraductor,
  RespuestaTraduccion,
} from '../../core/modelos';

interface SegmentoTraduccion {
  texto: string;
  dudosa: boolean;
}

@Component({
  selector: 'app-traductor',
  imports: [UMasDirective],
  templateUrl: './traductor.html',
  styleUrl: './traductor.css',
})
export class Traductor {
  private readonly api = inject(ApiService);

  protected readonly estado = signal<EstadoTraductor | null>(null);
  protected readonly texto = signal('');
  protected readonly direccion = signal<DireccionTraduccion>('damana_a_espanol');
  protected readonly resultado = signal<RespuestaTraduccion | null>(null);
  protected readonly error = signal('');
  protected readonly cargando = signal(false);

  /** La traducción segmentada, marcando las palabras dudosas del modelo. */
  protected readonly segmentos = computed<SegmentoTraduccion[]>(() => {
    const r = this.resultado();
    if (!r) return [];
    const dudosas = new Set(r.palabrasDudosas.map((p) => normalizar(p)));
    return segmentarFragmento(r.traduccion).map((s) => ({
      texto: s.texto,
      dudosa: s.esPalabra && dudosas.has(normalizar(s.texto)),
    }));
  });

  constructor() {
    void this.cargarEstado();
  }

  private async cargarEstado(): Promise<void> {
    try {
      this.estado.set(await this.api.traductorEstado());
    } catch {
      this.estado.set(null);
      this.error.set('No se pudo consultar el estado del traductor. ¿Está corriendo el backend?');
    }
  }

  protected async traducir(evento: Event): Promise<void> {
    evento.preventDefault();
    const texto = this.texto().trim();
    if (!texto || this.cargando()) return;

    this.cargando.set(true);
    this.error.set('');
    try {
      this.resultado.set(await this.api.traducir(texto, this.direccion()));
    } catch (e) {
      this.resultado.set(null);
      this.error.set(this.mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  private mensajeDeError(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) {
        return 'No se pudo contactar el backend. ¿Está corriendo en el puerto 3000?';
      }
      const mensaje = (e.error as { message?: string | string[] })?.message;
      if (Array.isArray(mensaje)) return mensaje.join('; ');
      if (typeof mensaje === 'string') return mensaje;
    }
    return 'Error inesperado al traducir. Reintenta.';
  }

  protected intercambiarDireccion(): void {
    this.direccion.set(
      this.direccion() === 'damana_a_espanol' ? 'espanol_a_damana' : 'damana_a_espanol',
    );
  }
}
