import { defineConfig, devices } from "@playwright/test";

// Runs against the production build. Set PW_CHANNEL=chrome to use an installed
// Google Chrome instead of Playwright's bundled Chromium.
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173/",
    channel,
  },
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel }, grep: /@mobile/ },
  ],
});
