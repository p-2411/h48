import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E runs against a production build by default (`pnpm build && pnpm start`).
 * Without DATABASE_URL the server uses the file store (WAITLIST_STORE=file) in its own file,
 * .data/e2e-waitlist.json, so tests never touch your local dev sign-ups. With DATABASE_URL set,
 * use a Neon development branch, never the live list.
 * `E2E_SERVER=dev pnpm e2e` runs against `next dev` instead.
 */
const useDevServer = process.env.E2E_SERVER === "dev";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit-mobile",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "chromium-reduced-motion",
      use: { ...devices["Desktop Chrome"], reducedMotion: "reduce" },
    },
  ],
  webServer: {
    command: useDevServer ? `pnpm dev --port ${PORT}` : `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      WAITLIST_STORE: process.env.DATABASE_URL ? "" : "file",
      WAITLIST_FILE: ".data/e2e-waitlist.json",
      NEXT_PUBLIC_SITE_URL: baseURL,
    },
  },
});
