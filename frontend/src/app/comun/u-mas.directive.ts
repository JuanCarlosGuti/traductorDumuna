import { Directive, HostListener } from '@angular/core';

const U_MINUSCULA = String.fromCharCode(0x0289); // ʉ
const U_MAYUSCULA = String.fromCharCode(0x0244); // Ʉ

/**
 * Reemplaza cada "u+" por ʉ (y "U+" por Ʉ) ajustando la posición del
 * cursor: cada par reemplazado antes del cursor lo corre una posición
 * a la izquierda.
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
 * Directiva reutilizable para cajas de texto: al escribir, autoreemplaza
 * "u+" por ʉ ("U+" por Ʉ) conservando el cursor. Tras reemplazar
 * re-emite el evento input para que ngModel u otros listeners vean el
 * valor final (la segunda pasada no encuentra nada y corta el ciclo).
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
