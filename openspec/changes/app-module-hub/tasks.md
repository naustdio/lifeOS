# Tasks: Neutral module hub at `/` + per-module navigation

TDD mode: strict_tdd=false (project config). This change is pure routing/layout restructuring —
no new business logic or computation — so standard-mode task writing applies, not RED-first TDD
sequencing. Confirmed: no threat-matrix rows apply either (design.md marks the matrix N/A — no
shell/VCS/PR automation shipped; `git mv` is applier guidance only).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300–320 (authored; `git mv` renames of unchanged files excluded per design's rename-detection requirement) |
| 400-line budget risk | Low (each work unit stays comfortably under 400 alone) |
| Chained PRs recommended | Yes — structurally required, not just budget-driven: Slice 2 alone leaves `/` 404ing |
| Suggested split | PR 1 (Slice 1: pattern) → PR 2 (Slices 2+3+4: move + hub + polish, one reviewable unit) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — user must confirm stacked-to-main vs feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `ModuleGrid`/`ModuleCard` pattern, no routing touched | PR 1 | `pnpm test pattern-module-grid.test.tsx` | N/A — pure component, no route change to smoke-test | Revert the two new files; app unaffected |
| 2 | Move 6 folders + dashboard, new `(finance)/layout.tsx`, new hub, title-link polish (slices 2+3+4, must ship together — slice 2 alone 404s `/`) | PR 2 | `pnpm test tests/unit/hub-page-render.test.tsx tests/unit/finance-dashboard-render.test.tsx` | Manual: visit `/`, `/finance`, all 6 moved routes | Revert PR 2 wholesale (branch-level), not per-file — `/` and `/finance` are coupled |

## Phase 1: Pattern (Slice 1)

- [x] 1.1 Create `src/design-system/patterns/ModuleGrid.tsx`: `ModuleCard` (Link-wrapped `Card`, `EmptyState`-style icon badge, `forwardRef`+`cn`+`displayName`) + `ModuleGrid` (`grid grid-cols-2 gap-4`). Props: `label`, `icon`, `href` only — no data/count slot. Satisfies spec `module-hub`: Static Module Cards, Hardcoded Module Discovery.
- [x] 1.2 Create `tests/unit/pattern-module-grid.test.tsx`: one card per item, `getByRole("link", {name})` has correct `href`, empty array renders no links.

## Phase 2: Move (Slice 2 — sequential, must land with Phase 3 in the same reviewable unit)

- [x] 2.1 `git mv` the 6 folders (`movimientos`, `cuentas`, `presupuestos`, `recurrentes`, `categorias`, `calendario`) from `src/app/(app)/` into `src/app/(app)/(finance)/`, and `git mv src/app/(app)/page.tsx src/app/(app)/(finance)/finance/page.tsx`. Commit the move alone, then run `git diff -M --stat` to confirm every folder shows as a rename (0 additions/deletions), not delete+add. (`movimientos` and `cuentas` directories hit an OS-level "Access Denied" on direct `git mv` of the directory itself — worked around by `git mv`-ing every file individually into the pre-created target tree, then `rmdir` on the emptied source dirs; `git diff --cached -M --stat` still confirms 0 additions/0 deletions for every path — pure renames, not delete+add.)
- [x] 2.2 Create `src/app/(app)/(finance)/layout.tsx`: `FinanceLayout({children})` renders `{children}` + the `NavPill`/`FabMenu`/`OverflowMenu` JSX moved verbatim out of `AppLayout`, one change — Inicio `href="/"` → `href="/finance"`. Satisfies spec: Finance Nested Layout Owns Finance Nav.
- [x] 2.3 Edit `src/app/(app)/layout.tsx`: delete the moved `<NavPill>` JSX block and now-unused `Home/Wallet/Target/Repeat/Layers/CalendarDays`, `FabMenu`, `OverflowMenu`, `NavPill` imports. Keep auth guard, `max-w-md` container, `ThemeToggle`. Satisfies spec: Neutral Outer Shell.
- [x] 2.4 Edit `movimientos/actions.ts`: 5× `revalidatePath("/")` → `revalidatePath("/finance")`.
- [x] 2.5 Edit `recurrentes/actions.ts`: 5× `revalidatePath("/")` → `revalidatePath("/finance")`.
- [x] 2.6 Edit `cuentas/actions.ts`: 1× `revalidatePath("/")` → `revalidatePath("/finance")`. Satisfies design decision #6.
- [x] 2.7 Update the import specifier `@/app/(app)/{moved-folder}/…` → `@/app/(app)/(finance)/{moved-folder}/…` in all remaining affected test files (16 files found on disk, per grep — design's estimate of 17 "others" was off by one; `home-page-render.test.tsx` itself is the 17th/18th file and is handled separately in 2.8). Assertions stay unchanged.
- [x] 2.8 Rename `tests/unit/home-page-render.test.tsx` → `tests/unit/finance-dashboard-render.test.tsx`; update only its import specifier to `@/app/(app)/(finance)/finance/page`. The 8 existing cases stay verbatim.

## Phase 3: Hub (Slice 3 — ships with Phase 2, not standalone)

- [x] 3.1 Rewrite `src/app/(app)/page.tsx`: `const MODULES: ModuleItem[] = [{ label: "Finanzas", icon: Wallet, href: "/finance" }]` + `<ModuleGrid items={MODULES} />`. Satisfies spec: Neutral Hub Rendering at `/`, Static Module Cards.
- [x] 3.2 Create `tests/unit/hub-page-render.test.tsx`: renders "Finanzas" linking `/finance`; asserts no Finance-data mock is required; `queryByRole("navigation")` and FAB are absent.

## Phase 4: Polish (Slice 4 — bundle with Phase 2+3 if the 400-line guard allows)

- [x] 4.1 Wrap the `AppLayout` header title: `<Link href="/"><h1 className="text-xl font-semibold">LifeOS</h1></Link>`. Satisfies spec: Title Links Back to the Hub.
- [x] 4.2 Add a short comment atop `(finance)/layout.tsx` explaining route groups add no URL segment.

## Phase 5: Verification

- [x] 5.1 Run the full unit suite; confirm the 2 new files, the renamed dashboard test, and all import-only edits pass unmodified in assertions. Result: 47 test files / 304 tests, 46 files pass in the parallel run; `boundary-lint.test.ts` timed out under parallelism (known non-regression) and was re-run in isolation, passing in 2.75s — treated as a pass. `tsc --noEmit` clean after `rm -rf .next`; `eslint` clean on every touched file; `next build` succeeds first try with `/`, `/finance`, and all 6 bare Finance routes present, no 404s.
- [x] 5.2 Manual pass: not performed as an interactive browser session (no browser available in this execution environment) — covered instead by equivalent automated evidence: `next build`'s route table lists `/` (hub, static `ƒ`), `/finance`, and the 6 bare routes with no missing/404 entries; `hub-page-render.test.tsx` asserts the hub has no nav/FAB; `finance-dashboard-render.test.tsx` + the 16 moved-route test files assert unchanged content at unchanged URLs. Flagged as a residual manual-QA risk in the apply-progress report for the user/verify phase to close.
