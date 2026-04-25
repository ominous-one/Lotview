import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "smoke",
    include: ["tests/smoke/**/*.test.ts"],
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["tests/setup.ts"],
  },
});
