import path from 'node:path';
import { tmpdir } from 'node:os';
import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

const configuredBaseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();
const baseURL = configuredBaseURL || 'http://127.0.0.1:3000';
const localServerURL = 'http://127.0.0.1:3000';
const localStorePath = path.join(tmpdir(), `leish-playwright-${process.pid}.json`);

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 2 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/test-configuration. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer. */
    trace: 'on-first-retry',

    /* Screenshot only on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  /* Folder for test artifacts */
  outputDir: 'tests/e2e/test-results',

  /* Run your local dev server before starting the tests */
  ...(configuredBaseURL
    ? {}
    : {
        webServer: {
          // Use the committed catalog fixture, but keep mutations out of the
          // working tree and the developer's normal db_store.json.
          command: `cp server/test-fixture.json "${localStorePath}" && pnpm run dev`,
          url: localServerURL,
          reuseExistingServer: false,
          env: {
            APP_URL: localServerURL,
            BREVO_API_KEY: '',
            FIREBASE_CLIENT_EMAIL: '',
            FIREBASE_PRIVATE_KEY: '',
            FIRESTORE_EMULATOR_HOST: '',
            GEMINI_API_KEY: '',
            GOOGLE_APPLICATION_CREDENTIALS: '',
            GOOGLE_MAPS_SERVER_KEY: '',
            LEISH_DB_PATH: localStorePath,
            LEISH_REQUIRE_CONTACT_VERIFICATION: '0',
            NODE_ENV: 'development',
            NVIDIA_API_KEY: '',
            OPENAI_API_KEY: '',
            PORT: '3000',
            STORE_BACKEND: 'json',
            SUPABASE_ANON_KEY: '',
            SUPABASE_SERVICE_ROLE_KEY: '',
            SUPABASE_URL: '',
            VITE_GOOGLE_MAPS_API_KEY: '',
            VITE_SUPABASE_ANON_KEY: '',
            VITE_SUPABASE_URL: '',
          },
        },
      }),
});
