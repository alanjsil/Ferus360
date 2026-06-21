import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "html",
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
});
