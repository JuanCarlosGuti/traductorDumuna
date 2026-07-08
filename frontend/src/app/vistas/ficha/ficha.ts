import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FragmentoClicable } from '../../comun/fragmento-clicable';
import { ApiService } from '../../core/api.service';
import { FichaPalabra } from '../../core/modelos';

@Component({
  selector: 'app-ficha',
  imports: [RouterLink, FragmentoClicable],
  templateUrl: './ficha.html',
  styleUrl: './ficha.css',
})
export class Ficha {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly ficha = signal<FichaPalabra | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noEncontrada = signal('');

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const palabra = params.get('palabra');
      if (palabra) void this.cargar(palabra);
    });
  }

  private async cargar(palabra: string): Promise<void> {
    this.cargando.set(true);
    this.noEncontrada.set('');
    try {
      this.ficha.set(await this.api.palabra(palabra));
    } catch {
      this.ficha.set(null);
      this.noEncontrada.set(palabra);
    } finally {
      this.cargando.set(false);
    }
  }

  protected verPalabra(palabra: string): void {
    void this.router.navigate(['/diccionario', palabra]);
  }

  protected buscarEnEspanol(palabra: string): void {
    void this.router.navigate(['/buscar'], {
      queryParams: { q: palabra, idioma: 'espanol' },
    });
  }
}
