# Archive Report — finance-recurring

**Change**: finance-recurring
**Archived**: 2026-08-06
**Closure method**: manual (orchestrator-driven), not via `gentle-ai review`/`sdd-archive` native gate

## Why manual closure

Same root cause as the three prior archived cycles this project (`lifeos-foundation`,
`finance-budgets`, `finance-ui-polish`): the `review-*` subagents in this environment have no
`Bash` tool, so `gentle-ai review inspect-candidate` (required to inspect the frozen Git trees)
can never run. See `openspec/changes/archive/lifeos-foundation/archive-report.md` for the
original detailed writeup.

## What shipped

Reminder-and-confirmation recurring expenses: a single `next_due_date` cursor per definition
(never auto-posting), two `SECURITY DEFINER` seam functions (`confirm_recurring_transaction`,
`discard_recurring_occurrence`) reusing the existing `tx_idempotency` mechanism, a
`security_invoker` due-items view, and a `(app)/recurrentes/` screen with a Home due-banner.
Also gives the previously-unused `finance.transactions.recurring_id` column (shipped inert in
`lifeos-foundation`) its actual purpose via a new FK.

Delivered as 4 stacked-to-main PRs (#18–#21), all merged to `main` in order:

- **#18 Database** — `finance.recurring_transactions`, `finance.recurring_due` view, FK,
  `origin_module` CHECK widening, RLS, the two seam functions, 43 pgTAP assertions.
- **#19 Domain/Data/API** — pure date-arithmetic (`nextDueDate`, `daysOverdue`,
  `nextFutureDueDate`), repository, TS API layer split (`server-only` seam wrappers vs.
  client-safe pure re-exports, mirroring `finance-budgets`' precedent).
- **#20 UI** — `recurrentes/` screen (list, create/edit form, confirm-with-edit sheet), Home
  due-banner, and the new "Más" overflow nav entry point.
- **#21 Tests** — RTL render coverage for the above.

**Scope expansion, deliberate and approved**: the bottom `NavPill` in `(app)/layout.tsx`
hardcoded exactly 4 fixed slots with no room for a 5th screen, while LifeOS has more modules
planned (Health, Nutrition, Recipes, Shopping List, Car Control, Goals) that will each need an
entry point. This change adds a "Más" overflow menu and moves `Presupuestos` into it alongside
the new `Recurrentes` — establishing shared navigation infrastructure future modules register
into, the same way `finance-ui-polish` established the shared visual-pattern precedent.

## Critical correctness points — verified for real, not assumed

- **`origin_module` CHECK constraint name** confirmed via `pg_constraint` against the live DB
  before writing the widening migration (`transactions_origin_module_check`).
- **Idempotency-key-before-cursor-advance ordering**: `next_due_date` is read into a variable
  BEFORE the `UPDATE` that advances it, inside `confirm_recurring_transaction` — getting this
  backwards would make every double-confirm double-post. Proven by a pgTAP replay test.
- **`select ... for update` row lock** on the definition row, so two concurrent confirms can't
  each read the same cursor and each advance it once (skipping a period).
- **`security_invoker = true`** on `finance.recurring_due` — the fourth occurrence of this exact
  footgun in this codebase (after `account_balances`/`household_summary`, `budget_progress`),
  now a hard project convention with its own named pgTAP regression.
- **TS/SQL date-arithmetic parity**: `nextDueDate()` (TS) and `finance.advance_due_date()` (SQL)
  hand-verified against the same 9-case fixture matrix (month-end clamp, leap year, post-clamp
  drift, year rollover, biweekly = exactly 15 days, not "every 2 weeks").

## Post-verify fixes found during the user's live browser review

Two real gaps, found and fixed after the initial 4-PR apply — same precedent as the two prior
cycles' post-verify fixes:

1. **RSC serialization crash** (`2527f30`): `OverflowMenuItem.icon` was typed as `LucideIcon` (a
   component/function reference). `(app)/layout.tsx` is a Server Component; `OverflowMenu` is a
   Client Component. Passing a bare component reference across that boundary crashes at runtime
   ("Only plain objects can be passed to Client Components from Server Components..."), because
   React Server Components can serialize plain data and already-rendered elements, but not
   function references. Fixed by changing the contract to `React.ReactNode` and passing
   pre-rendered JSX (`<Target className="h-5 w-5" aria-hidden />`) at the call site instead.
2. **Missing test coverage** (`bcfcc9d`): `sdd-verify` found that task R-022 claimed RTL coverage
   for `ConfirmRecurringSheet`'s over-budget gate, but no test actually exercised that branch.
   Added the same three-case coverage (crosses limit, stays under, cancel dismisses without
   submitting) already established for `TransactionForm`'s identical gate.

Both fixes were independently re-verified by a second `sdd-verify` pass, and — having learned
from the `finance-ui-polish` cycle's push-before-merge miss — both were confirmed pushed
(`git branch -vv` showing no "ahead N") before any PR was merged.

## Operational notes for future sessions

- Running `pnpm verify` (which invokes `next build`) while `pnpm dev` is running on the same
  `.next` directory corrupts the dev server's webpack cache ("Cannot find module './471.js'" /
  similar `MODULE_NOT_FOUND` errors, and an unstyled/broken-CSS page on refresh). Fix: stop the
  dev server, `rm -rf .next`, restart. Don't run `verify` and `dev` concurrently against the
  same working tree.
- Playwright CLI (`.playwright-cli/`) writes a growing console/snapshot log directly into the
  repo root by default. Next's dev-server file watcher picks this up as a source change and
  enters a constant Fast-Refresh rebuild loop. Added `.playwright-cli/` to `.gitignore`;
  consider also excluding it from any file-watcher scope if this recurs.
- This app's Google-OAuth-only auth means Playwright (or any headless automation) cannot log in
  as a real user without real credentials — browser automation of authenticated screens isn't
  currently possible without building a seeded-session cookie injection helper (a
  `tests/integration/helpers/local-supabase.ts`-style test user exists for API-level tests, but
  wiring it into a live Playwright browser session was judged not worth the effort this session
  given the user could test manually in seconds).

## Verification

Per `verify-report.md` (sdd-verify agent, first pass 2026-08-06): **PASS WITH WARNINGS**, 0
CRITICAL, before the two post-verify fixes above closed both WARNINGs. Fresh evidence, both
before and after the fixes: `pnpm verify` clean, 130/130 `pnpm test` (one pre-existing
ESLint-subprocess flake, confirmed passing in isolation both times), 43/43 pgTAP.

## Spec merge

- New capability `finance-recurring` (11 requirements) copied to `openspec/specs/finance-recurring/spec.md`.
- Delta merged into `openspec/specs/finance-module-api/spec.md`: `origin_module` domain widening.
- Delta merged into `openspec/specs/design-system/spec.md`: the "Más" overflow nav entry point.

## Outcome

Change `finance-recurring` is **complete and closed**. All 4 PRs merged to `main`. This closes
the last item of the originally-scoped Finance roadmap slated for this session's work
(core → budgets → UI polish → recurring); the dashboard feed remains as a distinct future change,
and a consolidated pass over accumulated polish/adjustment ideas is planned next, per the user's
explicit request to finish the structural work first.

This folder moves to `openspec/changes/archive/finance-recurring/` as the closure record.
