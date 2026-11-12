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
export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((done) => setTimeout(done));
  await fixture.whenStable();
}

/** Common setup: real router (empty) and mocked HttpClient. */
export async function mount<T>(
  component: Type<T>,
  extraProviders: unknown[] = [],
): Promise<ComponentFixture<T>> {
  await TestBed.configureTestingModule({
    imports: [component],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...(extraProviders as never[]),
    ],
  }).compileComponents();
  return TestBed.createComponent(component);
}

export const text = (fixture: ComponentFixture<unknown>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

export const queryAll = (
  fixture: ComponentFixture<unknown>,
  selector: string,
): HTMLElement[] =>
  Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector));
