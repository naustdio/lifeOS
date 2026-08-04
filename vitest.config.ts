import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vitest setup. Sub-slice 1A: the ESLint boundary-lint smoke test (T-002) and the
// theme-selection unit tests (T-006). Sub-slice 2A adds the `modules/*/domain/` pure-logic
// suites (design.md §9 "Unit (pure, no DB)") — the `@/*` alias below mirrors tsconfig.json's
// path mapping so those suites can import via the same alias production code uses.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
    ],
    // tests/integration/finance-facade.test.ts (T-032) overrides this to "node" per-file via
    // the `// @vitest-environment node` directive — it hits the real local Supabase stack and
    // has no use for a DOM.
  },
});
