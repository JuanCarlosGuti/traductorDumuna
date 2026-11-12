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
      @if (s.isWord && clickable()) {
        <button
          type="button"
          class="palabra"
          [class.resaltada]="s.highlighted"
          (click)="word.emit(s.text)"
        >{{ s.text }}</button>
      } @else {
        <span [class.resaltada]="s.highlighted">{{ s.text }}</span>
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
