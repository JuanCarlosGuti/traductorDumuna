import { expect, test } from '@playwright/test';
import { CREDENTIALS } from '../playwright.config';

/**
 * Real browser against the backend serving the Angular build, with
 * authentication active, the e2e/datos corpus and NO translation engine
 * (see playwright.config.ts). Checks that the new views talk to
 * the backend properly once logged in; login itself is covered by
 * session.spec.ts.
 */
const signIn = async (page: import('@playwright/test').Page) => {
  await page.goto('/entrar');
  await page.getByLabel('Usuario').fill(CREDENTIALS.usuario);
  await page.getByLabel('Contraseña').fill(CREDENTIALS.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/buscar/);
};

test.describe('Without a session', () => {
  test('the new views also lead to login', async ({ page }) => {
    await page.goto('/pendientes');
    await expect(page).toHaveURL(/\/entrar/);
    await page.goto('/traductor');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('the new API rejects requests without a token', async ({ request }) => {
    expect((await request.get('/api/pending')).status()).toBe(401);
    expect((await request.post('/api/pending/export')).status()).toBe(401);
    expect(
      (await request.post('/api/translate/validate', { data: { text: 'x', direction: 'espanol_a_damana', translation: 'y', origin: 'confirmada' } })).status(),
    ).toBe(401);
  });
});

test.describe('Logged in', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('the navigation includes Pendientes', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Pendientes' })).toBeVisible();
  });

  test('searching «nʉnka» shows concordances with the ʉ intact', async ({ page }) => {
    await page.goto('/buscar?q=n%CA%89nka');
    await expect(page.locator('mark, .resaltada').first()).toContainText('nʉnka');
  });

  test('the translator explains how to configure an engine when there is none', async ({ page }) => {
    await page.goto('/traductor');
    await expect(page.getByText('Falta configurar un motor de traducción')).toBeVisible();
    await expect(page.getByText('ANTHROPIC_API_KEY')).toBeVisible();
  });

  test('pendientes loads empty and leaves the export disabled', async ({ page }) => {
    await page.goto('/pendientes');
    await expect(page.getByText('No hay pendientes')).toBeVisible();
    await expect(page.getByRole('button', { name: /Exportar lote/ })).toBeDisabled();
  });

  test('the Spanish → Damana dictionary lists the test corpus entries', async ({ page }) => {
    await page.goto('/diccionario');
    await page.getByRole('button', { name: 'español → damana' }).click();
    await expect(page.getByRole('cell', { name: 'nʉnka' })).toBeVisible();
  });
});
