import { defineConfig } from "vitest/config";
import { resolveJsToTs } from "./scripts/vite-plugin-resolve-js-to-ts.mjs";

export default defineConfig({
  plugins: [resolveJsToTs()],
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost",
      },
    },
    setupFiles: "./test/setup.js",
    exclude: ["**/node_modules/**", "**/dist/**", "test/e2e/"],
    clearMocks: true,
    restoreMocks: true,
    css: true,
    deps: {
      interopDefault: true,
      fallbackCJS: true,
    },
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      include: ["services/**", "public/**/*.js"],
      exclude: ["test/**", "**/*.test.js"],
      reporter: ["text", "lcov"],
    },
  },
});
