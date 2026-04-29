import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
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
