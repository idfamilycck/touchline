import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { include: ["lib/**/*.test.ts"], environment: "node", passWithNoTests: true },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
