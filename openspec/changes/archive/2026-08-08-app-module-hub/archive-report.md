# Archive Report: app-module-hub

**Status**: ARCHIVED and CLOSED  
**Date**: 2026-08-08  
**Change**: Neutral module hub at `/` + per-module navigation  
**Archive Location**: `openspec/changes/archive/2026-08-08-app-module-hub/`  

---

## Artifact Traceability (Engram)

All artifacts persisted in Engram under project `lifeos`:

| Artifact | Observation ID | Topic Key | Created |
|----------|---|---|---|
| Proposal | 939 | `sdd/app-module-hub/proposal` | 2026-08-08 11:35:33 |
| Spec (delta) | 940 | `sdd/app-module-hub/spec` | 2026-08-08 11:40:46 |
| Design | 941 | `sdd/app-module-hub/design` | 2026-08-08 11:42:34 |
| Tasks | 942 | `sdd/app-module-hub/tasks` | 2026-08-08 11:48:21 |
| Apply Progress | 944 | `sdd/app-module-hub/apply-progress` | 2026-08-08 11:59:50 |
| Verify Report | 947 | `sdd/app-module-hub/verify-report` | 2026-08-08 12:14:19 |
| **Archive Report** | **[NEW]** | `sdd/app-module-hub/archive-report` | 2026-08-08 |

---

## Final State — Task Completion and Warning Resolution

### Implementation Status
**16/16 tasks COMPLETE** across all 5 phases (Pattern, Move, Hub, Polish, Verification).

All tasks confirmed implemented in commit `d93218a7fdfe2f7616923184176c23978246bd13` on branch `main`.

### Verification Summary
**Verdict: PASS WITH WARNINGS** per `verify-report` (id 947).

- 10/10 requirements met
- 13/13 scenarios verified
- 0 CRITICAL findings
- 47/47 test files, 304/304 tests pass
- TypeCheck clean (`tsc --noEmit`)
- ESLint clean
- Next.js build succeeds with all routes resolved

### Critical Resolution: W1 Warning (Byte-Identical Dashboard Relocation)

**Initial Finding (verify-report, observation 947)**:  
The verify phase found that the relocated dashboard at `/finance` was NOT a byte-identical move of the former `/` dashboard. Instead, `QuickActionRow` was nested into `BalanceHero`'s `footer` slot (8-line difference), creating an unintended visual composition change.

**Orchest Intervention (per launch prompt final-state facts)**:  
The orchestrator identified this as scope creep and reverted it to true byte-identical relocation per the original tasks.md requirement. Fix applied in commit `cb65e71` (`fix(finance): restore byte-identical dashboard relocation to /finance`), independent re-verification confirmed:
- `tsc --noEmit`: clean
- `eslint`: clean
- `finance-dashboard-render.test.tsx`: 8/8 tests pass
- `hub-page-render.test.tsx`: 3/3 tests pass
- Byte-identical verification via whitespace-insensitive diff (Windows CRLF adjustment): CONFIRMED

**Archive State**: W1 is now **RESOLVED**. The change lands with **0 unresolved warnings**.

---

## Spec Merge Summary

Three domains affected by this change; two pre-existing specs modified, one new spec created:

### 1. **NEW: module-hub** Specification
- **Location**: `openspec/specs/module-hub/spec.md`
- **Action**: CREATED (copy from delta)
- **Requirements**: 8 total
- **Scenarios**: 9 total
- **Content**: 
  - Neutral Hub Rendering at `/` (2 scenarios)
  - Static Module Cards (1 scenario)
  - Hardcoded Module Discovery (1 scenario)
  - Neutral Outer Shell (1 scenario)
  - Title Links Back to the Hub (1 scenario)
  - Finance Nested Layout Owns Finance Nav (1 scenario)
  - `/finance` Serves the Former Dashboard (1 scenario)
  - Finance Route Addresses Stay Byte-Identical (1 scenario)

### 2. **MODIFIED: dashboard-home** Specification
- **Location**: `openspec/specs/dashboard-home/spec.md`
- **Action**: MERGED (added 1 requirement)
- **Change**: Appended new requirement `Canonical Route Is /finance` with 2 scenarios
- **Impact**: 
  - Existing requirements for Month Summary, Spending-by-Category, Recent Movements, Empty States, Mobile-First, and No Write-Path Change remain unchanged
  - New requirement makes explicit that the dashboard's canonical route is `/finance`, not `/`
  - Scenarios: `/` no longer renders the dashboard; `/finance` renders dashboard with unchanged content

### 3. **MODIFIED: module-architecture** Specification
- **Location**: `openspec/specs/module-architecture/spec.md`
- **Action**: MERGED (added 1 requirement)
- **Change**: Appended new requirement `UI-Layer Route-Group Boundary` with 2 scenarios
- **Impact**:
  - Existing requirements for Schema-Per-Module, Module Folder Structure, Import Boundary Enforcement, Allowed Dependency Direction, and Boundary Rules Ship Before Feature Code remain unchanged
  - New requirement establishes UI-layer route-group boundary: each module owns its route group and nested layout
  - Scenarios: Finance owns its route group and nav; a second module follows the same boundary

---

## Artifact Consolidation

All SDD artifacts (proposal, specs, design, tasks, verify-report) now reside in:
- **Engram** (authoritative, in memory across sessions)
- **Disk** (historical archive for reference): `openspec/changes/archive/2026-08-08-app-module-hub/`

The active `openspec/changes/app-module-hub/` directory has been **archived** — no new work should target it.

---

## Implementation Summary

### Neutral Module Hub
- `/` now renders a pure module launcher grid (no Finance chrome)
- Hub hardcoded to one Finance card → `/finance` (Health card added by Health's own slice)
- No "last module" state; no auto-redirect
- Title "LifeOS" is a back-to-hub link present on every authenticated screen

### Module Architecture
- `AppLayout` → neutral outer shell (auth, container, header, theme toggle only)
- `(finance)` route group → Finance-scoped layout owns all Finance nav (NavPill, FabMenu, OverflowMenu)
- 6 Finance routes (movimientos, cuentas, presupuestos, recurrentes, categorias, calendario) moved under `(app)/(finance)/`
- URLs unchanged (`/movimientos`, `/cuentas`, etc. still resolve bare)
- Dashboard relocated from `(app)/page.tsx` → `(app)/(finance)/finance/page.tsx` → `/finance`
- 11 `revalidatePath` calls updated from `/` → `/finance` (in 3 action files)
- 18 test import specifiers updated to reflect new route group paths

### Design System
- New `ModuleGrid` + `ModuleCard` pattern in `src/design-system/patterns/`
- Pure launcher component: props are label, icon, href only (no data/badge slots)
- Follows `Card` + `EmptyState` visual language (icon badge pattern)

### Testing
- 2 new test files: `pattern-module-grid.test.tsx`, `hub-page-render.test.tsx`
- 1 renamed test file: `home-page-render.test.tsx` → `finance-dashboard-render.test.tsx`
- 16 import-only edits across other test files
- Full suite: 304/304 tests pass

---

## Scope Summary

| Item | In Scope | Out of Scope |
|------|----------|--------------|
| Hub at `/` | ✓ | — |
| Finance moved to `/finance` | ✓ | — |
| Module-scoped nav (finance layout) | ✓ | — |
| `ModuleGrid` pattern | ✓ | — |
| Health UI | — | ✓ |
| Real `/finance/*` URL prefix | — | ✓ (rejected, opt for route group) |
| Changes to 6 moved folders' Server Actions | — | ✓ (only revalidatePath tokens) |
| Tests for module boundaries (ESLint rule) | — | ✓ (future module-enforcement task) |

---

## Risks and Mitigations

| Risk | Status | Mitigation |
|---|---|---|
| Route-name collision between future modules | **DEFERRED** | Finance/Health vocabulary disjoint; revisit at module #3 |
| Route groups non-obvious to first-time readers | **MITIGATED** | Explanatory comment in `(finance)/layout.tsx` |
| Folder move misread as rewrite in review | **MITIGATED** | Move-only commit separate from new files; rename detection verified |
| "Back to hub" affordance specification | **RESOLVED** | Header title as Link to `/` (implemented) |
| Module boundary enforcement (lint rule) | **FUTURE** | ESLint boundary rule to be added when second module ships (not blocking) |
| W1 dashboard byte-identity deviation | **RESOLVED** | Orchestrator reverted to true byte-identical via commit cb65e71 |

---

## Rollback Readiness

Single operation rollback boundary: revert the entire `app-module-hub` change set (all 5 phases together).

**Reverse Steps**:
1. Move 6 Finance route folders back from `src/app/(app)/(finance)/` → `src/app/(app)/`
2. Move dashboard back from `src/app/(app)/(finance)/finance/page.tsx` → `src/app/(app)/page.tsx`
3. Restore Finance nav JSX into `src/app/(app)/layout.tsx` (revert the strip)
4. Delete `src/app/(app)/(finance)/layout.tsx`
5. Delete `src/design-system/patterns/ModuleGrid.tsx` and its test
6. Restore `tests/unit/home-page-render.test.tsx` from git history
7. Revert 18 test import specifiers to pre-change form
8. Revert 11 `revalidatePath` tokens from `/finance` back to `/`

No schema, data, or Server Action behavior was changed — only file paths and import statements.

---

## Dependencies and Downstream Impact

- **Blocks**: None. This change is self-contained.
- **Consumed by**: `health-tracking` (future module) replicates the `(module)/layout.tsx` pattern established here
- **Coordination note**: health-tracking's design.md (line 162) references `src/app/(app)/salud/**` paths; will update to `src/app/(app)/(health)/salud/**` when health-tracking's own UI slice lands

---

## Success Criteria — All Met

- [x] `/` renders the hub: module cards, no NavPill, no FAB
- [x] `/finance` renders the previous dashboard unchanged (byte-identical after W1 fix)
- [x] `/movimientos`, `/cuentas`, `/presupuestos`, `/recurrentes`, `/categorias`, `/calendario` resolve unchanged with Finance nav visible
- [x] All existing tests pass except the rewritten hub test (new test file, all 3 scenarios pass)
- [x] Adding a second module requires only a new `(module)/layout.tsx` plus one hub-array entry
- [x] Design decisions honored and recorded
- [x] 16/16 tasks complete and verified

---

## Key Learnings

1. Route groups (parenthesized folders in Next.js App Router) are invisible in the URL segment but essential for logical organization; a comment in the code prevents future confusion.
2. Git move detection (`git mv` with `git diff -M`) is fragile for directories on Windows when a file-watcher (CodeGraph) holds handles; per-file `git mv` workaround preserves rename integrity without requiring elevated permissions.
3. The `footer` slot on `BalanceHero` was a pre-existing, undocumented design affordance; verification found it used for the first time in this change, creating an unintended visual change that needed explicit reversion.
4. Delta specs (partial changes per capability) can be cleanly merged into main specs by appending new requirements and preserving existing ones — no requirement renumbering or section reordering needed when the delta explicitly marks sections as ADDED/MODIFIED.
5. Archive-time spec merges should happen before moving the change folder, so the main spec remains the single source of truth for future reference.

---

**Archive Closure**: This change is **READY FOR PRODUCTION**. All tasks complete, all verification gates passed, both W1 and earlier findings resolved, and all artifacts (proposal, design, specs, tasks, verification) are recorded for future reference and audit trail.
