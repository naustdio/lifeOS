#!/usr/bin/env node
/**
 * design.md §2 Gate C / §7: fails on any `#rrggbb` literal or a Tailwind
 * arbitrary color (`bg-[#...]`, `text-[#...]`, `-[#...]` in general) found
 * outside `src/design-system/tokens/` — the enforcement mechanism for the
 * design-system spec's "No Raw Hex in Components" requirement.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tokensDir = path.join(repoRoot, "src", "design-system", "tokens");

const SCAN_ROOTS = ["src"];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const IGNORE_DIRS = new Set(["node_modules", ".next", "out", "dist"]);

// Matches a raw hex literal (#rrggbb / #rgb / #rrggbbaa) OR a Tailwind
// arbitrary-value color like `bg-[#111111]` / `text-[#c6f432]`.
const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/;

/** @type {string[]} */
const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!SCAN_EXTENSIONS.has(path.extname(fullPath))) continue;
    if (fullPath.startsWith(tokensDir)) continue; // tokens/ is the one allowed place

    const content = readFileSync(fullPath, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, index) => {
      const match = line.match(HEX_PATTERN);
      if (match) {
        violations.push(
          `${path.relative(repoRoot, fullPath)}:${index + 1}: raw color literal "${match[0]}"`,
        );
      }
    });
  }
}

for (const root of SCAN_ROOTS) {
  const fullRoot = path.join(repoRoot, root);
  try {
    walk(fullRoot);
  } catch {
    // root does not exist yet — nothing to scan
  }
}

if (violations.length > 0) {
  console.error(
    "check-tokens: raw hex color literals found outside src/design-system/tokens/:\n",
  );
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    "\nComponents must consume design tokens only (design-system spec: 'No Raw Hex in Components').",
  );
  process.exit(1);
}

console.log("check-tokens: OK — no raw hex literals outside src/design-system/tokens/");
