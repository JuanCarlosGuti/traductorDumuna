import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { replaceUPlus, UPlusDirective } from './u-plus.directive';

describe('replaceUPlus', () => {
  it('replaces u+ with ʉ and adjusts the cursor', () => {
    expect(replaceUPlus('nu+', 3)).toEqual({ value: 'nʉ', caret: 2 });
  });

  it('replaces U+ with capital Ʉ', () => {
    expect(replaceUPlus('U+nka', 2)).toEqual({ value: 'Ʉnka', caret: 1 });
  });

  it('replaces several occurrences in the same value', () => {
    expect(replaceUPlus('ku+nu+nka', 9)).toEqual({ value: 'kʉnʉnka', caret: 7 });
  });

  it('only shifts the cursor for replacements before it', () => {
    // cursor at the start, the pair is after it
    expect(replaceUPlus('abu+', 0)).toEqual({ value: 'abʉ', caret: 0 });
  });

  it('does not touch text without u+ (including ñ and ʉ already typed)', () => {
    expect(replaceUPlus('ñingui nʉnka', 5)).toEqual({ value: 'ñingui nʉnka', caret: 5 });
  });
});

@Component({
  template: `<input type="search" appUPlus />`,
  imports: [UPlusDirective],
})
class TestHost {}

describe('UPlusDirective', () => {
  async function createField(): Promise<HTMLInputElement> {
    await TestBed.configureTestingModule({ imports: [TestHost] }).compileComponents();
    const fixture = TestBed.createComponent(TestHost);
    await fixture.whenStable();
    return fixture.nativeElement.querySelector('input') as HTMLInputElement;
  }

  function typeInto(field: HTMLInputElement, value: string, caret = value.length): void {
    field.value = value;
    field.setSelectionRange(caret, caret);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('converts u+ into ʉ while typing and leaves the cursor after the ʉ', async () => {
    const field = await createField();
    typeInto(field, 'nu+');
    expect(field.value).toBe('nʉ');
    expect(field.selectionStart).toBe(2);
  });

  it('converts in the middle of the text respecting the cursor', async () => {
    const field = await createField();
    typeInto(field, 'u+ kʉnka', 2); // cursor right after the "+"
    expect(field.value).toBe('ʉ kʉnka');
    expect(field.selectionStart).toBe(1);
  });

  it('does not modify normal text with ñ', async () => {
    const field = await createField();
    typeInto(field, 'ñingui');
    expect(field.value).toBe('ñingui');
  });
});
