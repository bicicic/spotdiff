import { defineConfig, devices } from "@playwright/test";
const development = process.env.SPOTDIFF_DEV === "1";
const baseURL = `http://127.0.0.1:4173/${development ? "" : "spotdiff/"}`;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90000,
  workers: 1,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: development
      ? "npm run dev -- --port 4173"
      : "node tests/static-server.mjs",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["iPhone 13"] } },
  ],
});
