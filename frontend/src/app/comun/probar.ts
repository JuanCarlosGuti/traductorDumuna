import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Type } from '@angular/core';

/**
 * Zoneless Angular: fixture.whenStable() does not wait for the promises the
 * component fires (the constructor's loads, for example), so we must
 * yield to the event loop before looking at the DOM. Without this the
 * tests read the template half rendered.
 */
export async function asentar(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((listo) => setTimeout(listo));
  await fixture.whenStable();
}

/** Common setup: real router (empty) and mocked HttpClient. */
export async function montar<T>(
  componente: Type<T>,
  proveedoresExtra: unknown[] = [],
): Promise<ComponentFixture<T>> {
  await TestBed.configureTestingModule({
    imports: [componente],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...(proveedoresExtra as never[]),
    ],
  }).compileComponents();
  return TestBed.createComponent(componente);
}

export const texto = (fixture: ComponentFixture<unknown>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

export const buscarTodos = (
  fixture: ComponentFixture<unknown>,
  selector: string,
): HTMLElement[] =>
  Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector));
