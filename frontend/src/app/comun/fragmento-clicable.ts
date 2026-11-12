import { Component, computed, input, output } from '@angular/core';
import { segmentarFragmento } from './fragmento';

/**
 * Renders a concordance fragment (or plain Damana text) with each
 * word clickable — dictionary-style navigation — and the matched
 * word highlighted.
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
