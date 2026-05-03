import { defineConfig, devices } from '@playwright/test'

// Defaults batem com docker-compose: API em :3000, frontend em :8080.
// Override via env quando rodar contra Vite dev server (frontend em :5173).
const FRONTEND_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080'
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  // Default serial: a API tem rate-limit por IP (10 register/min, 5 login/min)
  // que estoura com fullyParallel. Pra rodar paralelo, use FAST_PARALLEL=1 e
  // aceite que vão pintar 429s falsos. CI deve manter serial até termos
  // bypass de rate-limit em ambiente de teste.
  fullyParallel: !!process.env.FAST_PARALLEL,
  workers: process.env.FAST_PARALLEL ? undefined : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  // Cada teste cria seu próprio user com sufixo aleatório → seguro rodar em paralelo
  // contra um stack compartilhado, mas estouramos rate-limits se passar disso.
  // Ajuste FULLY_PARALLEL=false e workers=1 se quiser determinismo total.
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: FRONTEND_URL,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: {
      // Disponível pros fixtures dispararem requests autenticados.
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  metadata: {
    apiUrl: API_URL,
    frontendUrl: FRONTEND_URL,
  },
})
