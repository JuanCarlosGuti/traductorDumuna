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
  test('without a session, any view leads to login', async ({ page }) => {
    await page.goto('/buscar');
    await expect(page).toHaveURL(/\/entrar/);
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('wrong credentials: warns and does not let in', async ({ page }) => {
    await page.goto('/entrar');
    await page.getByLabel('Usuario').fill(CREDENCIALES.usuario);
    // u instead of ʉ, n instead of ñ: they are different letters, it must not get in
    await page.getByLabel('Contraseña').fill('nandu-unkua-2026');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByRole('alert')).toContainText('incorrectos');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('correct credentials: logs in and shows the user', async ({ page }) => {
    await entrar(page);
    await expect(page.locator('.sesion')).toContainText(CREDENCIALES.usuario);
    await expect(page.getByRole('link', { name: 'Traductor' })).toBeVisible();
  });

  test('the session survives reloading the page', async ({ page }) => {
    await entrar(page);
    await page.reload();
    await expect(page).toHaveURL(/\/buscar/);
    await expect(page.locator('.sesion')).toContainText(CREDENCIALES.usuario);
  });

  test('«Salir» logs out and returns to login', async ({ page }) => {
    await entrar(page);
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/entrar/);

    await page.goto('/diccionario');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('an expired token kicks to login on the next call', async ({ page }) => {
    await entrar(page);
    // Expiry is simulated by corrupting the stored token.
    await page.evaluate(() => localStorage.setItem('damana.token', 'token.ya.no.vale'));
    await page.goto('/gramatica');
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test.describe('La app funciona con sesión', () => {
  test.beforeEach(async ({ page }) => entrar(page));

  test('searching a word with ʉ returns concordances', async ({ page }) => {
    await page.getByRole('searchbox').first().fill('nʉnka');
    await page.keyboard.press('Enter');

    await expect(page.getByText('el agua es una')).toBeVisible();
    await expect(page).toHaveURL(/q=n/);
  });

  test('searching «nunka» with a plain u does not find «nʉnka»', async ({ page }) => {
    await page.getByRole('searchbox').first().fill('nunka');
    await page.keyboard.press('Enter');
    await expect(page.getByText('el agua es una')).toHaveCount(0);
  });

  test('the grammar view loads the lemmas and their conjugation', async ({ page }) => {
    await page.getByRole('link', { name: 'Gramática' }).click();
    await page.getByRole('button', { name: /leer/ }).click();
    await expect(page.getByText('naijkasheshisha')).toBeVisible();
    await expect(page.getByText('nos lee')).toBeVisible();
  });

  test('the dictionary lists the vocabulary', async ({ page }) => {
    await page.getByRole('link', { name: 'Diccionario' }).click();
    await expect(page.getByText('nʉnka').first()).toBeVisible();
  });
});
