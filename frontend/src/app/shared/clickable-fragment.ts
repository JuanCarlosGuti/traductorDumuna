import { Component, computed, input, output } from '@angular/core';
import { segmentFragment } from './fragment';

/**
 * Renders a concordance fragment (or plain Damana text) with each
 * word clickable — dictionary-style navigation — and the matched
 * word highlighted.
 */
@Component({
  selector: 'app-clickable-fragment',
  template: `
    @for (s of segments(); track $index) {
      @if (s.esPalabra && clickable()) {
        <button
          type="button"
          class="palabra"
          [class.resaltada]="s.resaltado"
          (click)="word.emit(s.texto)"
        >{{ s.texto }}</button>
      } @else {
        <span [class.resaltada]="s.resaltado">{{ s.texto }}</span>
      }
    }
  `,
})
export class ClickableFragment {
  readonly html = input.required<string>();
  readonly clickable = input(true);
  readonly word = output<string>();

  protected readonly segments = computed(() => segmentFragment(this.html()));
}
