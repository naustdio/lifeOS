# Archive Report — finance-calendar-projection

**Change**: finance-calendar-projection
**Archived**: 2026-08-07
**Closure method**: manual (orchestrator-driven), consistent with this project's established precedent

## What was verified (real evidence)

Implemented across 2 stacked PRs (`feat/finance-calendar-projection-1-domain`, `feat/finance-calendar-projection-2-ui`), 16/16 tasks:

| Check | Result |
|---|---|
| PR A (pure `domain/calendar.ts`) | 27/27 new unit tests, both GREEN on first implementation; `pnpm verify` clean; zero migrations (pure TypeScript) |
| PR B (`/calendario` UI, greenfield) | 8/8 new RTL tests; `pnpm verify` clean; 165/165 vitest; zero new dependency |
| Post-merge integration (all 5 changes combined on `main`) | Build includes `/calendario` (4.68 kB); `pnpm verify` clean |

**CRITICAL findings, found and fixed during merge integration**: merging `finance-credit-card-payments` (which introduces `transfer`-type recurring definitions with a nullable `categoryId`) broke this change's assumption that every recurring definition has a category. Fixed by explicitly filtering the calendar's input to `type === "expense"` definitions in `calendario/page.tsx`, matching this change's already-confirmed v1 scope ("recurring expense outflows only") rather than loosening the pure domain's `ProjectableDefinition.categoryId: string` type. The merged `finance-calendar` and `finance-recurring` specs were both updated to state this exclusion explicitly.

## Spec merge

A full new capability spec `finance-calendar` (8 requirements) was created at `openspec/specs/finance-calendar/spec.md`, with one requirement's scenario list extended (post-merge fix, see above) to explicitly cover transfer-type exclusion. The `finance-recurring` delta (1 ADDED requirement, `projectOccurrences`) was merged in, with a one-line clarification that projection covers expense-type definitions only.

## Outcome

The projected-balance calendar is **complete and closed**: a 90-day, expense-outflows-only projection, 100% client/server-computed with zero new migrations, explicitly labeled to avoid implying a full cashflow forecast (this data model has no recurring-income concept). Merged to `main`.
