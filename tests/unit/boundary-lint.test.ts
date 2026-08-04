import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import { afterEach, describe, expect, it } from "vitest";

// Proves the ESLint boundary rule (design.md §2 Gate A/C, T-002) actually
// fires: a committed fixture is copied into a real module folder, ESLint
// runs against it programmatically, and we assert it reports EXACTLY ONE
// `boundaries/element-types` error — so the rule itself is tested, not
// merely configured.

const repoRoot = path.resolve(__dirname, "..", "..");
const fixtureSource = path.join(
  repoRoot,
  "tests",
  "boundary-fixtures",
  "illegal-import.ts.txt",
);
const targetPath = path.join(
  repoRoot,
  "src",
  "modules",
  "core",
  "domain",
  "__illegal-import.fixture.ts",
);

describe("ESLint boundary rule fires on a real violation", () => {
  afterEach(() => {
    if (existsSync(targetPath)) {
      rmSync(targetPath);
    }
  });

  it("reports exactly one boundaries/element-types error for a cross-module internal import", async () => {
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, readFileSync(fixtureSource, "utf8"));

    const eslint = new ESLint({ cwd: repoRoot });
    const results = await eslint.lintFiles([targetPath]);

    const boundaryErrors = results
      .flatMap((result) => result.messages)
      .filter((message) => message.ruleId === "boundaries/element-types");

    expect(boundaryErrors).toHaveLength(1);
  });
});
