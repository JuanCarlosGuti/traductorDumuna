import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Type } from '@angular/core';

/**
 * Angular zoneless: fixture.whenStable() no espera a las promesas que lanza
 * el componente (las cargas del constructor, por ejemplo), así que hay que
 * ceder el turno al bucle de eventos antes de mirar el DOM. Sin esto los
 * tests leen la plantilla a medio pintar.
 */
export async function asentar(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((listo) => setTimeout(listo));
  await fixture.whenStable();
}

/** Montaje común: router de verdad (vacío) y HttpClient simulado. */
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
