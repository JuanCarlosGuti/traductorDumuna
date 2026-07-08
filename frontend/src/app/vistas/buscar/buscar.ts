import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FragmentoClicable } from '../../comun/fragmento-clicable';
import { UMasDirective } from '../../comun/u-mas.directive';
import { ApiService } from '../../core/api.service';
import { Idioma, RespuestaBusqueda } from '../../core/modelos';

@Component({
  selector: 'app-buscar',
  imports: [FragmentoClicable, UMasDirective],
  templateUrl: './buscar.html',
  styleUrl: './buscar.css',
})
export class Buscar {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly termino = signal('');
  protected readonly idioma = signal<Idioma>('damana');
  protected readonly fuente = signal('');
  protected readonly respuesta = signal<RespuestaBusqueda | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');

  constructor() {
    // El estado vive en la URL: navegar = buscar, y el botón «atrás»
    // deshace los saltos de palabra en palabra.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const q = params.get('q') ?? '';
        this.termino.set(q);
        this.idioma.set((params.get('idioma') as Idioma) ?? 'damana');
        this.fuente.set(params.get('fuente') ?? '');
        if (q.trim()) {
          void this.ejecutar(q.trim());
        } else {
          this.respuesta.set(null);
        }
      });
  }

  protected alEnviar(evento: Event): void {
    evento.preventDefault();
    this.navegar(this.termino(), this.idioma());
  }

  protected cambiarIdioma(idioma: string): void {
    this.idioma.set(idioma as Idioma);
    if (this.termino().trim()) this.navegar(this.termino(), this.idioma());
  }

  protected cambiarFuente(fuente: string): void {
    this.fuente.set(fuente);
    if (this.termino().trim()) this.navegar(this.termino(), this.idioma());
  }

  protected buscarPalabra(palabra: string): void {
    // Clic en una palabra damana de un resultado: nueva búsqueda en damana.
    this.navegar(palabra, 'damana');
  }

  private navegar(q: string, idioma: Idioma): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: q.trim() || null,
        idioma,
        fuente: this.fuente() || null,
      },
    });
  }

  private async ejecutar(q: string): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.respuesta.set(
        await this.api.buscar(q, this.idioma(), this.fuente() || undefined),
      );
    } catch {
      this.error.set('No se pudo completar la búsqueda. ¿Está corriendo el backend?');
      this.respuesta.set(null);
    } finally {
      this.cargando.set(false);
    }
  }
}
