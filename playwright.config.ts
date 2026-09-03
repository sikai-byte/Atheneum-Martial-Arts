import { defineConfig, devices } from "@playwright/test";

// The suite runs against a production build (`next build` first) with a
// dedicated SQLite database (prisma/test.db) that is reset before every run.
export const TEST_DATABASE_URL = "file:./test.db";
const PORT = 3199;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      SESSION_SECRET: "playwright-test-session-secret-at-least-32-chars",
      UPLOAD_DIR: "./test-uploads",
      APP_URL: `http://localhost:${PORT}`,
    },
  },
});
