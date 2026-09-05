import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Only the domain layer is unit-tested. It is pure by construction — no database,
    // no network, no framework — so these tests run in milliseconds and prove the
    // business rules directly rather than through the UI.
    include: ["src/domain/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
