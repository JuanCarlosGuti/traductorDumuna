import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

/**
 * Real E2E: a real browser against the backend serving the Angular
 * build, with authentication ACTIVE. It is the only layer that checks that
 * frontend and backend understand each other — the rest of the tests exercise each side
 * separately and would stay green even if login stopped working.
 */
const PORT = 3100;

// Small corpus of its own: the tests neither depend on the real data in
// /datos nor touch it.
const DATA_DIR = path.join(__dirname, 'e2e', 'datos');

export const CREDENTIALS = {
  usuario: 'juan',
  password: 'ñandú-ʉnkua-2026',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // a single backend with a login attempt limit
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Builds Angular, regenerates the test corpus database and starts up.
    command: 'npm run build && npm run importar && npm run start:prod',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      PORT: String(PORT),
      CORPUS_DATOS_DIR: DATA_DIR,
      AUTH_USUARIO: CREDENTIALS.usuario,
      AUTH_PASSWORD: CREDENTIALS.password,
      AUTH_JWT_SECRET: 'secreto-solo-para-los-tests-e2e',
      // No translation engine: tests must not spend real calls
      // even if the machine has TRADUCTOR_* or ANTHROPIC_API_KEY set.
      TRADUCTOR_BASE_URL: '',
      TRADUCTOR_MODELO: '',
      ANTHROPIC_API_KEY: '',
    },
  },
});
