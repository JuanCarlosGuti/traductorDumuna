import { Component, computed, input, output } from '@angular/core';
import { segmentarFragmento } from './fragmento';

/**
 * Renderiza un fragmento de concordancia (o texto damana plano) con cada
 * palabra clicable — navegación tipo diccionario — y la palabra
 * encontrada resaltada.
 */
@Component({
  selector: 'app-fragmento-clicable',
  template: `
    @for (s of segmentos(); track $index) {
      @if (s.esPalabra && clicable()) {
        <button
          type="button"
          class="palabra"
          [class.resaltada]="s.resaltado"
          (click)="palabra.emit(s.texto)"
        >{{ s.texto }}</button>
      } @else {
        <span [class.resaltada]="s.resaltado">{{ s.texto }}</span>
      }
    }
  `,
})
export class FragmentoClicable {
  readonly html = input.required<string>();
  readonly clicable = input(true);
  readonly palabra = output<string>();

  protected readonly segmentos = computed(() => segmentarFragmento(this.html()));
}
