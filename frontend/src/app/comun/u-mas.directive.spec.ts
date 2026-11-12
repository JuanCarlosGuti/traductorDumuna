import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { reemplazarUMas, UMasDirective } from './u-mas.directive';

describe('reemplazarUMas', () => {
  it('replaces u+ with ʉ and adjusts the cursor', () => {
    expect(reemplazarUMas('nu+', 3)).toEqual({ valor: 'nʉ', caret: 2 });
  });

  it('replaces U+ with capital Ʉ', () => {
    expect(reemplazarUMas('U+nka', 2)).toEqual({ valor: 'Ʉnka', caret: 1 });
  });

  it('replaces several occurrences in the same value', () => {
    expect(reemplazarUMas('ku+nu+nka', 9)).toEqual({ valor: 'kʉnʉnka', caret: 7 });
  });

  it('only shifts the cursor for replacements before it', () => {
    // cursor at the start, the pair is after it
    expect(reemplazarUMas('abu+', 0)).toEqual({ valor: 'abʉ', caret: 0 });
  });

  it('does not touch text without u+ (including ñ and ʉ already typed)', () => {
    expect(reemplazarUMas('ñingui nʉnka', 5)).toEqual({ valor: 'ñingui nʉnka', caret: 5 });
  });
});

@Component({
  template: `<input type="search" appUMas />`,
  imports: [UMasDirective],
})
class Anfitrion {}

describe('UMasDirective', () => {
  async function crearCampo(): Promise<HTMLInputElement> {
    await TestBed.configureTestingModule({ imports: [Anfitrion] }).compileComponents();
    const fixture = TestBed.createComponent(Anfitrion);
    await fixture.whenStable();
    return fixture.nativeElement.querySelector('input') as HTMLInputElement;
  }

  function teclear(campo: HTMLInputElement, valor: string, caret = valor.length): void {
    campo.value = valor;
    campo.setSelectionRange(caret, caret);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('converts u+ into ʉ while typing and leaves the cursor after the ʉ', async () => {
    const campo = await crearCampo();
    teclear(campo, 'nu+');
    expect(campo.value).toBe('nʉ');
    expect(campo.selectionStart).toBe(2);
  });

  it('converts in the middle of the text respecting the cursor', async () => {
    const campo = await crearCampo();
    teclear(campo, 'u+ kʉnka', 2); // cursor right after the "+"
    expect(campo.value).toBe('ʉ kʉnka');
    expect(campo.selectionStart).toBe(1);
  });

  it('does not modify normal text with ñ', async () => {
    const campo = await crearCampo();
    teclear(campo, 'ñingui');
    expect(campo.value).toBe('ñingui');
  });
});
