import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * End-to-end-tests tegen de lokale Supabase-nabootsing (scripts/local) en de
 * Vite-dev-server. Lokaal: `npm run test:e2e`.
 */
const SUPABASE_PORT = 54329;
const APP_PORT = 5179;
const chromium = process.env.PW_CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    ...devices['Pixel 7'],
    launchOptions: chromium ? { executablePath: chromium } : {},
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `npx tsx scripts/local-supabase.ts`,
      env: { PORT: String(SUPABASE_PORT) },
      port: SUPABASE_PORT,
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${APP_PORT} --strictPort`,
      env: {
        VITE_SUPABASE_URL: `http://localhost:${SUPABASE_PORT}`,
        VITE_SUPABASE_ANON_KEY: 'lokaal',
        // Een voorbeeldsleutel (publiek): de e2e bootst de pushdienst na (e2e/push.spec.ts).
        VITE_VAPID_PUBLIC_KEY: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
      },
      port: APP_PORT,
      reuseExistingServer: false,
    },
  ],
});
