import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, ".env.test"), quiet: true });

export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost",
      },
    },
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    include: ["test/e2e/**/*.test.js"],
    fileParallelism: false,
    globalSetup: ["./test/e2e/cleanup-global.mjs"],
    deps: {
      inline: [/services\//, /@supabase/],
      interopDefault: true,
      fallbackCJS: true,
    },
  },
});
