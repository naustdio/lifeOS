import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Minimal Vitest setup for sub-slice 1A: the ESLint boundary-lint smoke test
// (T-002) and the theme-selection unit tests (T-006). Sub-slice 2A adds the
// `modules/*/domain/` pure-logic suites (design.md §9 "Unit (pure, no DB)")
// on top of this same config — no changes expected here for that slice.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
  },
});
