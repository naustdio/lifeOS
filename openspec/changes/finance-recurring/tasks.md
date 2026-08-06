# Tasks: Finance Recurring — Reminded Fixed Expenses

> **Size note**: the `sdd-tasks` skill sets a 530-word budget. As with `design.md`'s own size note,
> this change's orchestrator-level task contract explicitly requires DDL-level acceptance criteria,
> the idempotency-ordering trap, the `security_invoker` regression, and byte-identical TS/SQL
> cross-checks encoded as verifiable task criteria, not prose to remember. The explicit contract wins.
>
> Task IDs use the `R-` prefix (`R-001`..`R-022`) to avoid colliding with `T-` (`lifeos-foundation`),
> `B-` (`finance-budgets`), `P-` (`finance-ui-polish`). Each task cites the exact spec requirement(s)
> it satisfies via `finance-recurring/Requirement Name` or the relevant delta capability. File paths
> mirror `design.md §12` (File Changes) exactly — every row in that table is covered by exactly one
> task here. Grouping follows `design.md §12`'s own suggested split, reforecast against this session's
> **800-line** review budget (not the design doc's assumed 400 — see Review Workload Forecast).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2350–2960 across 4 groups |
| 400-line budget risk | High (cached session budget is 800, not 400) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (a) → PR 2 (b) → PR 3 (c1) → PR 4 (c2) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migrations 12–14 + pgTAP suite (table, seam functions, RLS, view, origin widening) | PR 1 | `supabase test db` (pgTAP `090_finance_recurring.sql`) | Local Supabase stack, `supabase db reset` then pgTAP run | `drop` statements per `design.md` down path; no app code touches this PR |
| 2 | Domain + data + api split + Vitest domain unit tests | PR 2 | `pnpm vitest run tests/unit/finance-recurring-domain.test.ts` | N/A — pure functions + RLS-direct repository, no server path exercised | Delete 5 new/modified TS files; `finance/api` barrel diff isolated to additive members |
| 3 | `recurrentes/` screen + form + list + confirm sheet + banner + nav overflow | PR 3 | `pnpm vitest run tests/unit/*-form-render.test.tsx` (regression) | Manual: `/recurrentes` and `/` at 375px, light+dark, zero-data and populated fixtures | Delete `(app)/recurrentes/`, revert `layout.tsx`/`page.tsx`, delete `patterns/{RecurringRow,DueRecurringBanner,OverflowMenu}.tsx` |
| 4 | New RTL render tests for recurring form/list/banner/overflow-menu/home | PR 4 | `pnpm vitest run tests/unit/{recurring-form,recurring-list,due-banner,overflow-menu,home-page}-render.test*` | N/A — RTL test-only, exercises PR 3's rendered output | Delete 5 new test files; no production code depends on them |

Est. lines: (a) ~650–750, (b) ~490–540, (c1) ~870–1020, (c2) ~350–450. `design.md §12`'s own note
flags a 3-slice split against a 400-line assumption; reforecast at the **actual 800-line session
budget** shows (a) and (b) each comfortably fit a single PR, but (c) as one combined slice
(~1220–1470 lines for impl + render tests together) would exceed 800 either way it is cut — even
UI implementation alone (~870–1020) sits at or past the ceiling. **4 PR slices are required**, not
3: splitting `(c)` into UI implementation (c1) and its render tests (c2) is the only way to keep
every individual PR under 800. **Decision needed**: confirm the 4-PR stacked-to-main chain before
`sdd-apply` begins PR 1 — PR 3 in particular carries real risk of drifting past 800 depending on
`ConfirmRecurringSheet`/`RecurringForm` verbosity, in which case it should split further into
"screen + list" and "form + confirm sheet + banner + nav" as two PRs.

---

## Group (a): Migrations 12–14 + pgTAP

- [x] R-001 Migration `supabase/migrations/*_finance_recurring.sql` — `finance.recurring_transactions` table (`design.md §1`), partial index `(household_id, next_due_date) where active`, `updated_at` trigger; the two `finance.transactions` ALTERs (`design.md §2`) — `recurring_id` FK `on delete set null`, `origin_module` CHECK widened to include `recurring`; `finance.advance_due_date()` (`design.md §3`) and `finance.recurring_due` view.
  - **Acceptance**: before writing the `drop constraint` line, run `select conname from pg_constraint where conrelid = 'finance.transactions'::regclass and contype = 'c'` against the local stack and use the confirmed name — do not assume `transactions_origin_module_check`.
  - **Acceptance**: `finance.recurring_due` MUST be created `with (security_invoker = true)` — a regular view, never materialized. This is the third occurrence of this footgun in the repo; its absence is a blocking defect, not a style note.
  - Satisfies: `finance-recurring/Recurring Definitions Are Expense-Only, One of Four Frequencies, Never Auto-Posting`, `finance-recurring/Single Next-Due Cursor, Not a Queue`, `finance-recurring/Tenant Isolation on Recurring Definitions and Due Items`, `finance-module-api/Origin Module Domain Includes Recurring`.
  - Depends on: none (first migration in this change).
  - Parallel: sequential (must land before R-002/R-003).

- [x] R-002 Migration `supabase/migrations/*_finance_recurring_security.sql` — `alter table finance.recurring_transactions enable row level security`, four policies (`select`/`insert`/`update`/`delete`, all `to authenticated`, `core.is_member(household_id)`), `grant select, insert, update, delete on finance.recurring_transactions to authenticated`, `grant select on finance.recurring_due to authenticated` (`design.md §5`).
  - Satisfies: `finance-recurring/Tenant Isolation on Recurring Definitions and Due Items` (both scenarios), `finance-recurring/Pause Freezes, Resume Recomputes to the Next Future Occurrence` (UPDATE policy covers pause/resume).
  - Depends on: R-001.
  - Parallel: sequential.

- [x] R-003 Migration `supabase/migrations/*_finance_recurring_api.sql` — `finance.confirm_recurring_transaction` and `finance.discard_recurring_occurrence` (`design.md §4`), both `security definer set search_path = ''`, both opening with `perform core.assert_member(...)`; EXECUTE grants to `authenticated` on both plus `advance_due_date`.
  - **Acceptance — CRITICAL ORDERING**: `v_due := v_def.next_due_date` MUST be read (after the `for update` lock) **before** the cursor is advanced. Deriving the idempotency key from `current_date` or after the `update` statement double-posts on replay — this ordering is a named blocking defect if inverted, not a style preference.
  - **Acceptance**: `select ... for update` on the definition row is required before reading the cursor, so two concurrent confirms serialize instead of each advancing the cursor once per occurrence.
  - Satisfies: `finance-recurring/Confirm Atomically Posts and Advances the Cursor` (both scenarios), `finance-recurring/Discard Advances the Cursor Without Posting`, `finance-recurring/Idempotent Confirmation Per Due Date`, `finance-recurring/Confirm Pre-Fills the Original Due Date, Editable Before Posting`.
  - Depends on: R-001.
  - Parallel: sequential after R-001; may land alongside R-002 review since they touch disjoint files.

- [x] R-004 pgTAP suite `supabase/tests/090_finance_recurring.sql` per `design.md §11` (all DB rows): tenancy (member/non-member/`anon` on the table, and on `recurring_due`); the **named `security_invoker` regression** (`with (security_invoker = true)` dropped MUST fail the test — non-member session on `recurring_due` for a space with due items returns zero rows); idempotency (two `confirm_recurring_transaction` calls for the same due date yield exactly one transaction row and the cursor advances exactly once, not twice); confirm/discard atomicity (posted row shape, negative `amount_cents`, `occurred_on` defaults to the original due date, cursor advances by one period; a raising confirm — non-member `42501`, missing id `P0002`, paused `22023`, non-positive amount `22023` — leaves zero transactions and an unchanged cursor); a **row-lock/ordering test**: simulate two sequential confirms for the same occurrence and assert the cursor moved exactly once, not a bare happy-path-only assertion; pause/resume/delete (`recurring_due` excludes paused rows, resume surfaces no backlog, delete leaves posted transactions with `recurring_id = NULL` and is never blocked); origin domain regression (`recurring` accepted, unknown value still rejected, existing `manual`/`shopping_list`/`car_control` rows and `record_transaction` unaffected).
  - Satisfies: all `finance-recurring` requirements' DB-level scenarios, `finance-module-api/Origin Module Domain Includes Recurring` (both scenarios).
  - Depends on: R-001, R-002, R-003.
  - Parallel: yes, parallel with group (b) once R-001–R-003 land (test-only file, no app-code dependency).

---

## Group (b): Domain + Data + API Split + Unit Tests

- [x] R-005 `src/modules/finance/domain/recurring.ts` (pure, no Supabase import) — `nextDueDate`, `daysOverdue`, `nextFutureDueDate` (`design.md §6`), UTC date construction throughout.
  - **Acceptance**: `nextDueDate` MUST be behaviorally byte-identical to `finance.advance_due_date()`'s SQL clamping — monthly clamp (`2026-01-31 → 2026-02-28`), post-clamp drift (`2026-02-28 → 2026-03-28`), biweekly exactly 15 days (never 14), yearly leap-day clamp. This is a cross-language contract, not an independent implementation choice — verified jointly by R-011 (TS) and R-004's `advance_due_date` coverage (SQL) using the same fixture matrix.
  - Satisfies: `finance-recurring/Single Next-Due Cursor, Not a Queue`, `finance-recurring/Pause Freezes, Resume Recomputes to the Next Future Occurrence`.
  - Depends on: none (pure, spec-driven).
  - Parallel: yes, parallel with group (a).

- [x] R-006 `src/modules/finance/domain/index.ts` (modify) — re-export `./recurring`.
  - Satisfies: same as R-005 (wiring).
  - Depends on: R-005.
  - Parallel: yes.

- [x] R-007 `src/modules/finance/data/recurring-repository.ts` — list/due/count/create/update/setActive/delete, `budget-repository.ts` shape: client-direct RLS, `Number()` every `bigint`, degrade to `[]`/`null` on error (`design.md §7`).
  - Satisfies: `finance-recurring/Pause Freezes, Resume Recomputes to the Next Future Occurrence`, `finance-recurring/Delete Hard-Deletes the Definition Without Touching History`, `finance-recurring/Due-Item Reminder Is Visible on Mobile` (data source for the count).
  - Depends on: R-002 (needs RLS policies live).
  - Parallel: yes, parallel with R-005/R-006 (disjoint files) once R-002 lands.

- [x] R-008 `src/modules/finance/data/index.ts` (modify) — re-export `./recurring-repository`.
  - Depends on: R-007.
  - Parallel: yes.

- [x] R-009 `src/modules/finance/api/index.ts` (modify) — `confirmRecurring`/`discardRecurring` rpc wrappers over R-003's seam via `mapPgError`; re-export the R-007 repository functions; widen `OriginModule` + `OriginRefSchema` to 4 members (additive only — no existing signature changes).
  - Satisfies: `finance-module-api/Origin Module Domain Includes Recurring`, `finance-recurring/Confirm Atomically Posts and Advances the Cursor`, `finance-recurring/Discard Advances the Cursor Without Posting`.
  - Depends on: R-003, R-007.
  - Parallel: sequential after both.

- [x] R-010 `src/modules/finance/api/recurring-schedule.ts` — client-safe re-exports of `nextDueDate`/`daysOverdue`/`nextFutureDueDate`/`Frequency`/list-item types; deliberately **no** `server-only` import (`design.md §7`).
  - **Acceptance**: `pnpm verify`'s static gate must assert this file does not contain `server-only` (per `design.md §11` Static gates row).
  - Depends on: R-005.
  - Parallel: yes, with R-009.

- [x] R-011 Vitest `tests/unit/finance-recurring-domain.test.ts` per `design.md §11`: all four frequencies (monthly normal, month-end clamp, post-clamp drift, year rollover), weekly `+7`, biweekly exactly 15 days, yearly same-day + leap-day clamp, timezone independence (`TZ=UTC` vs `TZ=America/Mexico_City`); `daysOverdue` boundary cases; `nextFutureDueDate` resume-past-pause and loop-cap termination.
  - **Acceptance**: the month-end/leap-day/biweekly fixture set MUST be the same input/output pairs used by R-004's `advance_due_date` pgTAP coverage, so both layers assert identical outputs for identical inputs.
  - Satisfies: `finance-recurring/Single Next-Due Cursor, Not a Queue`, `finance-recurring/Pause Freezes, Resume Recomputes to the Next Future Occurrence`.
  - Depends on: R-005.
  - Parallel: yes, parallel with R-007–R-010.

---

## Group (c1): `recurrentes/` Screen + Banner + Nav Overflow

- [x] R-012 `src/design-system/patterns/RecurringRow.tsx` — due/overdue copy from `daysOverdue`, `text-expense` when overdue, paused state (`En pausa`, no confirm action), frequency label, inline `Confirmar`/`Omitir` actions; `React.forwardRef`, `cn`, semantic tokens only.
  - Satisfies: `finance-recurring/Single Next-Due Cursor, Not a Queue` (overdue-by-days copy), `finance-recurring/Pause Freezes, Resume Recomputes to the Next Future Occurrence` (paused visual state).
  - Depends on: R-010 (consumes `daysOverdue`).
  - Parallel: yes, with R-013/R-014.

- [x] R-013 `src/design-system/patterns/DueRecurringBanner.tsx` — count + pluralized copy + link to `/recurrentes`, `Card`-based, renders only when `count > 0`.
  - Satisfies: `finance-recurring/Due-Item Reminder Is Visible on Mobile` (banner scenario).
  - Depends on: none.
  - Parallel: yes.

- [x] R-014 `src/design-system/patterns/OverflowMenu.tsx` — client disclosure sheet, trigger `<button aria-label="Más" aria-expanded>` with `MoreHorizontal`, same class string as sibling nav links; closes on backdrop click, `Escape`, route change; no new package (no Radix `DropdownMenu`).
  - **Acceptance — bounded scope**: exactly one nav slot is swapped (the 4th, `Presupuestos`, → `OverflowMenu`); the pill's existing 3 direct slots and their styling are untouched; no other route moves into or out of the overflow menu beyond `Presupuestos` and `Recurrentes`.
  - Satisfies: `design-system/Overflow ("Más") Navigation Entry Point` (all three scenarios).
  - Depends on: none.
  - Parallel: yes.

- [x] R-015 `src/app/(app)/recurrentes/page.tsx` — server container: `listRecurringDefinitions`, `listDueRecurring`, active expense accounts/categories, `listBudgetsWithProgress`.
  - Depends on: R-007, R-009.
  - Parallel: yes, with R-020/R-021 (disjoint files).

- [x] R-016 `src/app/(app)/recurrentes/RecurringForm.tsx` — create/edit, `design-system/ui/select` for account/category/frequency (never a raw `<select>`), `Input type="number"`/`type="date"`, `useActionState`.
  - Satisfies: `finance-recurring/Recurring Definitions Are Expense-Only, One of Four Frequencies, Never Auto-Posting` (frequency domain UI).
  - Depends on: R-012 pattern conventions n/a; R-015 (page prop shape).
  - Parallel: yes, with R-017/R-018.

- [x] R-017 `src/app/(app)/recurrentes/RecurringList.tsx` — client list using `RecurringRow`, due-first grouping, pause/delete/omit actions, `EmptyState` (icon `Repeat`, CTA "Nueva recurrente") for zero definitions.
  - Satisfies: `finance-recurring/Single Next-Due Cursor, Not a Queue`, `finance-recurring/Delete Hard-Deletes the Definition Without Touching History` (delete confirmation copy re: posted transactions kept).
  - Depends on: R-012, R-015.
  - Parallel: yes.

- [x] R-018 `src/app/(app)/recurrentes/ConfirmRecurringSheet.tsx` — prefilled editable amount/date/description, date defaults to the original `next_due_date`; `evaluateBudgetImpact` + `OverBudgetDialog` wired byte-identically to `TransactionForm` (`onSubmit` → `preventDefault` only when `crossesLimit` → stash `FormData` → confirm dispatches `startTransition(() => dispatch(stashed))`).
  - Satisfies: `finance-recurring/Confirm Pre-Fills the Original Due Date, Editable Before Posting` (both scenarios), `finance-recurring/Over-Budget Confirmation Reuses the Existing Mechanism` (both scenarios).
  - Depends on: R-015.
  - Parallel: yes, with R-016/R-017.

- [x] R-019 `src/app/(app)/recurrentes/actions.ts` — server actions: create/update/setActive/delete/confirm/discard, wired to R-009's `confirmRecurring`/`discardRecurring` and R-007's repository.
  - Depends on: R-009, R-016, R-017, R-018.
  - Parallel: sequential (last file in the screen group).

- [x] R-020 `src/app/(app)/layout.tsx` (modify) — 4th slot: direct `Presupuestos` `<Link>` → `<OverflowMenu items={[Presupuestos, Recurrentes]} />`, exact class string preserved.
  - Satisfies: `design-system/Overflow ("Más") Navigation Entry Point` (all three scenarios).
  - Depends on: R-014.
  - Parallel: yes, with R-021.

- [x] R-021 `src/app/(app)/page.tsx` (modify) — `countDueRecurring(sb, hh)` + `<DueRecurringBanner>` rendered between `<QuickActionRow />` and the debt `Card`, only when `count > 0`.
  - Satisfies: `finance-recurring/Due-Item Reminder Is Visible on Mobile` (banner scenario).
  - Depends on: R-007, R-013.
  - Parallel: yes, with R-020.

---

## Group (c2): Screen RTL Render Tests

- [x] R-022 Five render-test files per `design.md §11`: `tests/unit/recurring-form-render.test.tsx` (frequency picker is the design-system `Select`, no raw `<select>`), `tests/unit/recurring-list-render.test.tsx` (due-first ordering, `Vencida hace 12 días` copy, paused rows offer no confirm, `EmptyState` on zero), `tests/unit/due-banner-render.test.tsx` (renders only when `count > 0`, pluralizes, links to `/recurrentes`), `tests/unit/overflow-menu-render.test.tsx` (both `Presupuestos` and `Recurrentes` reachable at 375px, light+dark), `tests/unit/home-page-render.test.tsx` (modify — add banner assertion).
  - **Acceptance**: the confirm-sheet crossing-limit case renders `OverBudgetDialog` and does **not** dispatch; confirming dispatches once with identical `FormData`; cancelling dispatches never.
  - Satisfies: `finance-recurring/Due-Item Reminder Is Visible on Mobile` (both scenarios), `design-system/Overflow ("Más") Navigation Entry Point` (reachability scenario), `finance-recurring/Over-Budget Confirmation Reuses the Existing Mechanism`.
  - Depends on: R-016, R-017, R-018, R-020, R-021.
  - Parallel: sequential (last task — exercises all of group c1).

---

## Dependency Summary (critical path)

```
R-001 (table + FK + widen + advance_due_date + view) → R-002 (RLS + grants) → R-003 (seam functions)
R-001, R-002, R-003 → R-004 (pgTAP)                                          [parallel with group b]
R-005 (domain, pure) → R-006 (domain re-export), R-011 (Vitest)              [parallel with group a]
R-002 → R-007 (repository) → R-008 (data re-export)
R-003, R-007 → R-009 (api wrappers + widened enum)
R-005 → R-010 (client-safe re-exports)
R-009, R-010 → group c1 (R-012–R-021)
R-010 → R-012 (RecurringRow)
R-007, R-009 → R-015 (recurrentes page) → R-016, R-017, R-018 → R-019 (actions)
R-014 → R-020 (layout swap); R-007, R-013 → R-021 (home banner)
R-016, R-017, R-018, R-020, R-021 → R-022 (RTL render tests, last)
```

Testing tasks (R-004, R-011, R-022) accompany the logic they test rather than gating every prior
task, per `design.md §11`'s testing strategy table.
