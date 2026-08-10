import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

/**
 * E2E de verdad: navegador real contra el backend sirviendo el build de
 * Angular, con la autenticación ACTIVA. Es la única capa que comprueba que
 * frontend y backend se entienden — el resto de tests prueban cada lado por
 * separado y seguirían en verde aunque el login dejara de funcionar.
 */
const PUERTO = 3100;

// Corpus propio y pequeño: los tests no dependen de los datos reales de
// /datos ni los tocan.
const DIR_DATOS = path.join(__dirname, 'e2e', 'datos');

export const CREDENCIALES = {
  usuario: 'juan',
  password: 'ñandú-ʉnkua-2026',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // un solo backend con límite de intentos de login
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Construye Angular, regenera la base del corpus de prueba y arranca.
    command: 'npm run build && npm run importar && npm run start:prod',
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      PORT: String(PUERTO),
      CORPUS_DATOS_DIR: DIR_DATOS,
      AUTH_USUARIO: CREDENCIALES.usuario,
      AUTH_PASSWORD: CREDENCIALES.password,
      AUTH_JWT_SECRET: 'secreto-solo-para-los-tests-e2e',
    },
  },
});
