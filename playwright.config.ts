import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the production build. Run `npm run build` first.
const executablePath = process.env.PW_CHROMIUM || (process.env.PLAYWRIGHT_BROWSERS_PATH ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3210",
    launchOptions: executablePath ? { executablePath } : {},
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone-landscape", use: { ...devices["iPhone 13 landscape"], browserName: "chromium" } },
    { name: "desktop", use: { viewport: { width: 1366, height: 820 } } },
  ],
  webServer: {
    command: "PORT=3210 BOT_DELAY_SCALE=0.05 node dist/server.js",
    url: "http://localhost:3210/api/health",
    reuseExistingServer: false,
  },
});
