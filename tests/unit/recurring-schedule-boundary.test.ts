// Static gate (design.md §11 "Static gates" row, change: finance-recurring R-010): asserts
// `api/recurring-schedule.ts` deliberately does NOT import `server-only` — unlike `api/index.ts`,
// it must be importable from a `"use client"` component (RecurringRow, RecurringList,
// ConfirmRecurringSheet, RecurringForm) for due/overdue display and the frequency picker.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("finance/api/recurring-schedule.ts client-safety", () => {
  it("does not import server-only", () => {
    const filePath = path.resolve(__dirname, "..", "..", "src", "modules", "finance", "api", "recurring-schedule.ts");
    const contents = readFileSync(filePath, "utf8");
    expect(contents).not.toMatch(/^\s*import\s+["']server-only["'];?\s*$/m);
  });
});
