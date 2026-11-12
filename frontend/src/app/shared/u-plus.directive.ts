import { Directive, HostListener } from '@angular/core';

const LOWER_U = String.fromCharCode(0x0289); // ʉ
const UPPER_U = String.fromCharCode(0x0244); // Ʉ

/**
 * Replaces each "u+" with ʉ (and "U+" with Ʉ) adjusting the cursor
 * position: each pair replaced before the cursor shifts it one position
 * to the left.
 */
export function replaceUPlus(
  value: string,
  caret: number,
): { valor: string; caret: number } {
  let result = '';
  let newCaret = caret;
  let i = 0;
  while (i < value.length) {
    const c = value[i];
    if ((c === 'u' || c === 'U') && value[i + 1] === '+') {
      result += c === 'u' ? LOWER_U : UPPER_U;
      if (caret > i + 1) newCaret -= 1;
      i += 2;
    } else {
      result += c;
      i += 1;
    }
  }
  return { valor: result, caret: newCaret };
}

/**
 * Reusable directive for text boxes: while typing, it auto-replaces
 * "u+" with ʉ ("U+" with Ʉ) keeping the cursor. After replacing it
 * re-emits the input event so that ngModel or other listeners see the
 * final value (the second pass finds nothing and breaks the cycle).
 */
@Directive({ selector: 'input[appUPlus], textarea[appUPlus]' })
export class UPlusDirective {
  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const field = event.target as HTMLInputElement | HTMLTextAreaElement;
    const { valor: value, caret } = replaceUPlus(
      field.value,
      field.selectionStart ?? field.value.length,
    );
    if (value !== field.value) {
      field.value = value;
      field.setSelectionRange(caret, caret);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
