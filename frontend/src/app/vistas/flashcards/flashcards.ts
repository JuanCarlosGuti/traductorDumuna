import { Component, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { Calificacion, EstadoSrs } from '../../core/modelos';

interface OpcionCalificacion {
  clave: Calificacion;
  etiqueta: string;
  tecla: string;
}

@Component({
  selector: 'app-flashcards',
  templateUrl: './flashcards.html',
  styleUrl: './flashcards.css',
  host: { '(document:keydown)': 'alTeclear($event)' },
})
export class Flashcards {
  private readonly api = inject(ApiService);

  protected readonly estado = signal<EstadoSrs | null>(null);
  protected readonly revelada = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');

  protected readonly opciones: OpcionCalificacion[] = [
    { clave: 'otra_vez', etiqueta: 'Otra vez', tecla: '1' },
    { clave: 'dificil', etiqueta: 'Difícil', tecla: '2' },
    { clave: 'bien', etiqueta: 'Bien', tecla: '3' },
    { clave: 'facil', etiqueta: 'Fácil', tecla: '4' },
  ];

  constructor() {
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set('');
    try {
      this.estado.set(await this.api.srsSiguiente());
      this.revelada.set(false);
    } catch {
      this.error.set('No se pudo cargar el mazo. ¿Está corriendo el backend?');
    } finally {
      this.ocupado.set(false);
    }
  }

  protected revelar(): void {
    if (this.estado()?.tarjeta) this.revelada.set(true);
  }

  protected async responder(calificacion: Calificacion): Promise<void> {
    const tarjeta = this.estado()?.tarjeta;
    if (!tarjeta || !this.revelada() || this.ocupado()) return;
    this.ocupado.set(true);
    try {
      await this.api.srsResponder(tarjeta.palabra, calificacion);
      await this.cargar();
    } catch {
      this.error.set('No se pudo guardar la respuesta.');
      this.ocupado.set(false);
    }
  }

  protected alTeclear(evento: KeyboardEvent): void {
    const destino = evento.target as HTMLElement | null;
    if (destino && ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName)) return;

    if (!this.revelada() && (evento.key === ' ' || evento.key === 'Enter')) {
      evento.preventDefault();
      this.revelar();
      return;
    }
    const opcion = this.opciones.find((o) => o.tecla === evento.key);
    if (opcion && this.revelada()) {
      evento.preventDefault();
      void this.responder(opcion.clave);
    }
  }
}
