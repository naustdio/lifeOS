import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static-text-scan check for spec `identity/Household Terminology Hidden
 * From UI` (tasks.md T-017): "No screen MUST display the words 'household'
 * or 'hogar'... even though the underlying schema is multi-tenant-ready."
 *
 * Scans UI-facing source under the authenticated shell, the public sign-in
 * screen, and shared design-system components — comments are stripped first
 * so this checks user-facing text/labels, not the SQL/schema identifiers or
 * design-rationale comments that legitimately use the word "household"
 * elsewhere in the codebase (e.g. `core.households`, this very file).
 *
 * This is a source-level proxy for the full rendered-DOM assertion the E2E
 * smoke suite (T-040, sub-slice 2C, out of scope for this run) performs
 * against the live app.
 */

const SCAN_ROOTS = [
  "src/app/(app)",
  "src/app/(public)",
  "src/design-system/patterns",
  "src/design-system/ui",
];

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      return collectSourceFiles(full);
    }
    if (full.endsWith(".tsx") || full.endsWith(".ts")) {
      return [full];
    }
    return [];
  });
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("Household Terminology Hidden From UI", () => {
  it("never renders the words household/hogar in authenticated or public UI source", () => {
    const offenders: string[] = [];

    for (const root of SCAN_ROOTS) {
      let files: string[] = [];
      try {
        files = collectSourceFiles(root);
      } catch {
        continue; // directory doesn't exist yet in this sub-slice
      }

      for (const file of files) {
        const code = stripComments(readFileSync(file, "utf8"));
        if (/household|hogar/i.test(code)) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
