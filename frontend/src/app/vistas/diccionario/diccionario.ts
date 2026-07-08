import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Frecuencia } from '../../core/modelos';

const POR_PAGINA = 50;

@Component({
  selector: 'app-diccionario',
  imports: [RouterLink],
  templateUrl: './diccionario.html',
  styleUrl: './diccionario.css',
})
export class Diccionario {
  private readonly api = inject(ApiService);

  protected readonly palabras = signal<Frecuencia[]>([]);
  protected readonly pagina = signal(0);
  protected readonly cargando = signal(true);
  protected readonly porPagina = POR_PAGINA;

  protected readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.palabras().length / POR_PAGINA)),
  );
  protected readonly visibles = computed(() =>
    this.palabras().slice(this.pagina() * POR_PAGINA, (this.pagina() + 1) * POR_PAGINA),
  );

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      this.palabras.set(await this.api.frecuencias());
    } finally {
      this.cargando.set(false);
    }
  }

  protected anterior(): void {
    this.pagina.update((p) => Math.max(0, p - 1));
  }

  protected siguiente(): void {
    this.pagina.update((p) => Math.min(this.totalPaginas() - 1, p + 1));
  }
}
