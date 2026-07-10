import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { normalizar } from '../../comun/normalizador';
import { UMasDirective } from '../../comun/u-mas.directive';
import { ApiService } from '../../core/api.service';
import { EntradaVocabulario, Frecuencia } from '../../core/modelos';

const POR_PAGINA = 50;

type ModoDiccionario = 'damana' | 'espanol';

@Component({
  selector: 'app-diccionario',
  imports: [RouterLink, UMasDirective],
  templateUrl: './diccionario.html',
  styleUrl: './diccionario.css',
})
export class Diccionario {
  private readonly api = inject(ApiService);

  protected readonly modo = signal<ModoDiccionario>('damana');
  protected readonly filtro = signal('');
  protected readonly palabras = signal<Frecuencia[]>([]);
  protected readonly vocabulario = signal<EntradaVocabulario[]>([]);
  protected readonly pagina = signal(0);
  protected readonly cargando = signal(true);
  protected readonly porPagina = POR_PAGINA;

  /** damana → español: frecuencias filtradas por la palabra damana. */
  protected readonly palabrasFiltradas = computed(() => {
    const filtro = normalizar(this.filtro().trim());
    if (!filtro) return this.palabras();
    return this.palabras().filter((f) => f.palabra.includes(filtro));
  });

  /** español → damana: vocabulario filtrado por el lado español, ordenado. */
  protected readonly entradasFiltradas = computed(() => {
    const filtro = normalizar(this.filtro().trim());
    const entradas = filtro
      ? this.vocabulario().filter((e) => normalizar(e.espanol).includes(filtro))
      : this.vocabulario();
    return [...entradas].sort((a, b) => a.espanol.localeCompare(b.espanol, 'es'));
  });

  protected readonly totalFilas = computed(() =>
    this.modo() === 'damana'
      ? this.palabrasFiltradas().length
      : this.entradasFiltradas().length,
  );
  protected readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.totalFilas() / POR_PAGINA)),
  );
  protected readonly visibles = computed(() =>
    this.palabrasFiltradas().slice(
      this.pagina() * POR_PAGINA,
      (this.pagina() + 1) * POR_PAGINA,
    ),
  );
  protected readonly entradasVisibles = computed(() =>
    this.entradasFiltradas().slice(
      this.pagina() * POR_PAGINA,
      (this.pagina() + 1) * POR_PAGINA,
    ),
  );

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      const [palabras, vocabulario] = await Promise.all([
        this.api.frecuencias(),
        this.api.vocabulario(),
      ]);
      this.palabras.set(palabras);
      this.vocabulario.set(vocabulario);
    } finally {
      this.cargando.set(false);
    }
  }

  protected cambiarModo(modo: ModoDiccionario): void {
    this.modo.set(modo);
    this.pagina.set(0);
  }

  protected filtrar(valor: string): void {
    this.filtro.set(valor);
    this.pagina.set(0);
  }

  protected anterior(): void {
    this.pagina.update((p) => Math.max(0, p - 1));
  }

  protected siguiente(): void {
    this.pagina.update((p) => Math.min(this.totalPaginas() - 1, p + 1));
  }
}
