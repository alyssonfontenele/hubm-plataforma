// Portal Mowig (J661) — Playwright contra a API em dublê (e2e/servidor-fake.mjs): nenhum backend real, nenhum segredo.
// Dois tamanhos de tela (375 e 1440). Capturas em docs/capturas/j661/.
import { defineConfig } from "@playwright/test";

const PORTA_APP = 4398;
const PORTA_FAKE = 4399;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORTA_APP}`,
    trace: "off",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    { name: "375", use: { viewport: { width: 375, height: 800 }, isMobile: false } },
    { name: "1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: "node e2e/servidor-fake.mjs",
      url: `http://127.0.0.1:${PORTA_FAKE}/__test/saude`,
      env: { FAKE_PORT: String(PORTA_FAKE) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx vite dev --host 127.0.0.1 --port ${PORTA_APP} --strictPort`,
      url: `http://127.0.0.1:${PORTA_APP}/portal/entrar`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: `http://127.0.0.1:${PORTA_FAKE}`,
        VITE_SUPABASE_ANON_KEY: "chave-publica-sintetica-de-teste",
        VITE_COMPANY_SLUG: "mowig",
        VITE_PORTAL_API_URL: `http://127.0.0.1:${PORTA_FAKE}`,
      },
    },
  ],
});
