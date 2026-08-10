import { expect, test } from '@playwright/test';
import { CREDENCIALES } from '../playwright.config';

const entrar = async (page: import('@playwright/test').Page) => {
  await page.goto('/entrar');
  await page.getByLabel('Usuario').fill(CREDENCIALES.usuario);
  await page.getByLabel('Contraseña').fill(CREDENCIALES.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/buscar/);
};

test.describe('Sesión', () => {
  test('sin sesión, cualquier vista lleva al login', async ({ page }) => {
    await page.goto('/buscar');
    await expect(page).toHaveURL(/\/entrar/);
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('credenciales incorrectas: avisa y no deja entrar', async ({ page }) => {
    await page.goto('/entrar');
    await page.getByLabel('Usuario').fill(CREDENCIALES.usuario);
    // u en vez de ʉ, n en vez de ñ: son letras distintas, no debe entrar
    await page.getByLabel('Contraseña').fill('nandu-unkua-2026');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByRole('alert')).toContainText('incorrectos');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('credenciales correctas: entra y muestra el usuario', async ({ page }) => {
    await entrar(page);
    await expect(page.locator('.sesion')).toContainText(CREDENCIALES.usuario);
    await expect(page.getByRole('link', { name: 'Traductor' })).toBeVisible();
  });

  test('la sesión sobrevive a recargar la página', async ({ page }) => {
    await entrar(page);
    await page.reload();
    await expect(page).toHaveURL(/\/buscar/);
    await expect(page.locator('.sesion')).toContainText(CREDENCIALES.usuario);
  });

  test('«Salir» cierra la sesión y devuelve al login', async ({ page }) => {
    await entrar(page);
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/entrar/);

    await page.goto('/diccionario');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('un token caducado echa al login en la siguiente llamada', async ({ page }) => {
    await entrar(page);
    // Se simula la caducidad estropeando el token guardado.
    await page.evaluate(() => localStorage.setItem('damana.token', 'token.ya.no.vale'));
    await page.goto('/gramatica');
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test.describe('La app funciona con sesión', () => {
  test.beforeEach(async ({ page }) => entrar(page));

  test('buscar una palabra con ʉ devuelve concordancias', async ({ page }) => {
    await page.getByRole('searchbox').first().fill('nʉnka');
    await page.keyboard.press('Enter');

    await expect(page.getByText('el agua es una')).toBeVisible();
    await expect(page).toHaveURL(/q=n/);
  });

  test('buscar «nunka» con u normal no encuentra «nʉnka»', async ({ page }) => {
    await page.getByRole('searchbox').first().fill('nunka');
    await page.keyboard.press('Enter');
    await expect(page.getByText('el agua es una')).toHaveCount(0);
  });

  test('la gramática carga los lemas y su conjugación', async ({ page }) => {
    await page.getByRole('link', { name: 'Gramática' }).click();
    await page.getByRole('button', { name: /leer/ }).click();
    await expect(page.getByText('naijkasheshisha')).toBeVisible();
    await expect(page.getByText('nos lee')).toBeVisible();
  });

  test('el diccionario lista el vocabulario', async ({ page }) => {
    await page.getByRole('link', { name: 'Diccionario' }).click();
    await expect(page.getByText('nʉnka').first()).toBeVisible();
  });
});
