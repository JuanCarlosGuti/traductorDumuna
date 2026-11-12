import { Directive, HostListener } from '@angular/core';

const U_MINUSCULA = String.fromCharCode(0x0289); // ʉ
const U_MAYUSCULA = String.fromCharCode(0x0244); // Ʉ

/**
 * Replaces each "u+" with ʉ (and "U+" with Ʉ) adjusting the cursor
 * position: each pair replaced before the cursor shifts it one position
 * to the left.
 */
export function reemplazarUMas(
  valor: string,
  caret: number,
): { valor: string; caret: number } {
  let resultado = '';
  let nuevoCaret = caret;
  let i = 0;
  while (i < valor.length) {
    const c = valor[i];
    if ((c === 'u' || c === 'U') && valor[i + 1] === '+') {
      resultado += c === 'u' ? U_MINUSCULA : U_MAYUSCULA;
      if (caret > i + 1) nuevoCaret -= 1;
      i += 2;
    } else {
      resultado += c;
      i += 1;
    }
  }
  return { valor: resultado, caret: nuevoCaret };
}

/**
 * Reusable directive for text boxes: while typing, it auto-replaces
 * "u+" with ʉ ("U+" with Ʉ) keeping the cursor. After replacing it
 * re-emits the input event so that ngModel or other listeners see the
 * final value (the second pass finds nothing and breaks the cycle).
 */
@Directive({ selector: 'input[appUMas], textarea[appUMas]' })
export class UMasDirective {
  @HostListener('input', ['$event'])
  alEscribir(evento: Event): void {
    const campo = evento.target as HTMLInputElement | HTMLTextAreaElement;
    const { valor, caret } = reemplazarUMas(
      campo.value,
      campo.selectionStart ?? campo.value.length,
    );
    if (valor !== campo.value) {
      campo.value = valor;
      campo.setSelectionRange(caret, caret);
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
