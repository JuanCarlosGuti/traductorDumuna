import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { reemplazarUMas, UMasDirective } from './u-mas.directive';

describe('reemplazarUMas', () => {
  it('reemplaza u+ por ʉ y ajusta el cursor', () => {
    expect(reemplazarUMas('nu+', 3)).toEqual({ valor: 'nʉ', caret: 2 });
  });

  it('reemplaza U+ por Ʉ mayúscula', () => {
    expect(reemplazarUMas('U+nka', 2)).toEqual({ valor: 'Ʉnka', caret: 1 });
  });

  it('reemplaza varias ocurrencias en el mismo valor', () => {
    expect(reemplazarUMas('ku+nu+nka', 9)).toEqual({ valor: 'kʉnʉnka', caret: 7 });
  });

  it('solo corre el cursor por los reemplazos anteriores a él', () => {
    // cursor al inicio, el par está después
    expect(reemplazarUMas('abu+', 0)).toEqual({ valor: 'abʉ', caret: 0 });
  });

  it('no toca texto sin u+ (incluidas ñ y ʉ ya escritas)', () => {
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

  it('convierte u+ en ʉ al escribir y deja el cursor tras la ʉ', async () => {
    const campo = await crearCampo();
    teclear(campo, 'nu+');
    expect(campo.value).toBe('nʉ');
    expect(campo.selectionStart).toBe(2);
  });

  it('convierte en medio del texto respetando el cursor', async () => {
    const campo = await crearCampo();
    teclear(campo, 'u+ kʉnka', 2); // cursor justo tras el "+"
    expect(campo.value).toBe('ʉ kʉnka');
    expect(campo.selectionStart).toBe(1);
  });

  it('no modifica texto normal con ñ', async () => {
    const campo = await crearCampo();
    teclear(campo, 'ñingui');
    expect(campo.value).toBe('ñingui');
  });
});
