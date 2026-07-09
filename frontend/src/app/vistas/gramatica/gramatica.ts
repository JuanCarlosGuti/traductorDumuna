import { Component, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { Lema, TablaConjugacion } from '../../core/modelos';

@Component({
  selector: 'app-gramatica',
  templateUrl: './gramatica.html',
  styleUrl: './gramatica.css',
})
export class Gramatica {
  private readonly api = inject(ApiService);

  protected readonly lemas = signal<Lema[]>([]);
  protected readonly tabla = signal<TablaConjugacion | null>(null);
  protected readonly cargando = signal(true);
  protected readonly cargandoTabla = signal(false);
  protected readonly error = signal('');

  constructor() {
    void this.cargarLemas();
  }

  private async cargarLemas(): Promise<void> {
    try {
      this.lemas.set(await this.api.gramaticaLemas());
    } catch {
      this.error.set('No se pudieron cargar los lemas. ¿Está corriendo el backend?');
    } finally {
      this.cargando.set(false);
    }
  }

  protected async elegir(lema: string): Promise<void> {
    if (this.cargandoTabla()) return;
    this.cargandoTabla.set(true);
    this.error.set('');
    try {
      this.tabla.set(await this.api.gramaticaTabla(lema));
    } catch {
      this.tabla.set(null);
      this.error.set(`No se pudo cargar la conjugación de «${lema}».`);
    } finally {
      this.cargandoTabla.set(false);
    }
  }
}
