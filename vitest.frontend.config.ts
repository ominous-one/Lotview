import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "frontend-smoke",
    include: ["client/src/**/*.test.ts"],
    globals: true,
    environment: "jsdom",
    testTimeout: 30000,
  },
});
