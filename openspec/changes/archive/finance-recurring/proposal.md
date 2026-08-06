# Proposal: Finance Recurring — Reminded Fixed Expenses

## Intent

Fixed monthly outflows (rent, subscriptions, insurance) are re-typed by hand every period and are silently forgotten when the owner is busy — the ledger only becomes wrong-by-omission, which is invisible. This is the recurring half of slice 4 of `lifeos-foundation` (budgets shipped as `finance-budgets`). It **reminds, it does not auto-post**: an overdue item stays visible until the owner acts, so the ledger never contains money that did not move.

**Schema correction:** `lifeos-foundation/design.md §3.6` states `transactions.recurring_id` was omitted. That is stale — the column already ships as an unconstrained nullable `uuid` (`supabase/migrations/20260804090005_finance_schema.sql:177`, "reserved column, unused this cycle"). This change gives it its purpose; it is constrained and used, not created.

## Scope

### In Scope
- `finance.recurring_transactions` table — `household_id, account_id, category_id, amount_cents, description, frequency, next_due_date, active, timestamps`; frequency domain `monthly | weekly | biweekly | yearly` only. Plain RLS CRUD with explicit SELECT/INSERT/UPDATE/DELETE grants, mirroring `finance.budgets` exactly (config carries no multi-row money invariant → no seam for CRUD).
- FK `transactions.recurring_id → recurring_transactions(id) on delete set null`, matching how `category_id`/`account_id` already behave (transactions are voided, never deleted).
- Two `SECURITY DEFINER` seam functions, pinned `search_path`:
  - **confirm** — atomically inserts the transaction (with `recurring_id`) *and* advances `next_due_date` one period. One transactional unit; not a parameter on `record_transaction`.
  - **discard** — advances `next_due_date` without inserting anything.
- Idempotency via the existing `tx_idempotency` unique index: `origin_module='recurring'`, `origin_entity_id=<definition id>`, `idempotency_key` derived from the due date being confirmed. Requires widening the `origin_module` CHECK to a third value.
- Due-items read (view with **`security_invoker = true`**, or repository query) + Home banner when ≥1 item is due/overdue.
- `(app)/recurrentes/` screen: list, create/edit, pause, delete, confirm/discard with editable amount/date/description.
- **Confirm default date**: the transaction pre-fills with the original `next_due_date` (not "today"), editable before posting — reflects when the expense should have occurred, for correct monthly reporting.
- **Pause/resume**: pausing (`active=false`) freezes the definition; resuming recomputes `next_due_date` to the next future occurrence from today, so reactivating never surfaces a backlog of overdue dates accrued while paused.
- **Delete**: hard-deletes the definition row. Already-posted transactions are unaffected and keep their history — `recurring_id` becomes `NULL` on them (the `on delete set null` FK below), never blocked and never cascaded.
- **App shell: a 5th "Más" nav slot** opening an overflow menu; `Presupuestos` moves into it alongside `Recurrentes`.

### Out of Scope
- Auto-posting, recurring income, recurring transfers, custom intervals.
- Discrete occurrence rows / catch-up backfill of missed periods — a single `next_due_date` cursor is the model.
- Push notifications, scheduled jobs, server cron (the banner is computed on read).
- A separate over-budget mechanism — confirmation reuses `evaluateBudgetImpact` + `OverBudgetDialog`.
- Any change to the `finance/api` barrel signatures.

## Capabilities

### New Capabilities
- `finance-recurring`: recurring expense definitions, due-date cursor, reminder banner, explicit confirm/discard, idempotent posting.

### Modified Capabilities
- `design-system`: app-shell navigation gains an overflow ("Más") entry point; secondary screens are reached through it rather than a fixed 4-slot pill.
- `finance-module-api`: the `origin_module` domain widens to include `recurring` (`manual | shopping_list | car_control | recurring`).

## Approach

**Cursor, not queue.** One `next_due_date` per definition. If unconfirmed, the same date keeps reading as overdue ("Renta — vencida hace 12 días"). One action — confirm or discard — advances the cursor to the next period regardless of how overdue it was. No arrears queue means no backlog to reconcile and no ambiguity about "which occurrence" the user acted on.

**Reminder + confirmation, never auto-post.** Confirming may edit amount/date/description before posting. Discarding creates nothing. The ledger only ever contains money the owner asserted moved — the same "the ledger never lies" principle `finance-budgets` established.

**Config is plain RLS; posting is a seam.** CRUD on a definition is a single row with no invariant, so it follows `finance.budgets`. Confirmation is two writes that must not diverge, so it follows the `record_transaction` seam pattern.

**Budgets compose, they don't fork.** Confirming an expense that crosses a category limit runs the *existing* client-side gate (`src/modules/finance/api/budget-evaluation.ts`, `src/app/(app)/movimientos/OverBudgetDialog.tsx`) — non-blocking, advisory, identical to manual entry.

**Nav overflow is a deliberate, approved scope expansion.** `src/app/(app)/layout.tsx` hardcodes exactly four slots with no room for a fifth screen, while Health, Nutrition, Recipes, Shopping List, Car Control and Goals each need an entry point. Adding a "Más" menu now — and moving `Presupuestos` into it for consistency — is forward-compatible and avoids a full nav redesign later. This is an accepted decision, not unmanaged creep.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/migrations/` | New | `finance.recurring_transactions`, RLS + grants, confirm/discard definer functions, `recurring_id` FK, widened `origin_module` CHECK, due view |
| `src/modules/finance/domain/` | New | Frequency + next-due arithmetic (pure, unit-tested), overdue derivation |
| `src/modules/finance/data/` | New | Recurring repository (list, due items) |
| `src/modules/finance/api/` | Modified | Confirm/discard server wrappers over the seam; barrel signatures unchanged |
| `src/app/(app)/recurrentes/` | New | List, editor, confirm/discard flows |
| `src/app/(app)/layout.tsx` | Modified | 5th nav slot + "Más" overflow menu |
| `src/design-system/patterns/` | New | Overflow menu/sheet; due banner |
| `src/app/(app)/page.tsx` | Modified | Due banner |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Due view created without `security_invoker = true` → RLS bypass | Med | Third occurrence of this exact footgun in this repo; now a named project convention. Explicit task acceptance criterion + pgTAP cross-space isolation test |
| Widening `origin_module` CHECK breaks existing rows or the seam | Low | Additive value only; existing rows unaffected. Assert `record_transaction` behavior unchanged |
| Double-confirm creates two transactions | Med | Idempotency key derived from the due date makes the second call a no-op returning the existing transaction (same guarantee as `record_transaction`) |
| Confirm/discard partially applies (transaction posted, cursor not advanced) | Med | Single `SECURITY DEFINER` transaction; never two client calls |
| Month-end date arithmetic (Jan 31 → Feb) and biweekly = exactly 15 days | Med | Pure domain function with unit tests covering short months, leap years, year rollover |
| Nav change regresses reachability of `Presupuestos` | Med | Route unchanged; only the entry point moves. Render tests assert both screens reachable at 375px |
| Missing index on `(household_id, next_due_date)` for the due query | Low | Deferred to design phase as an explicit decision, not resolved here |
| Nav scope expands into a full IA redesign | Med | Bounded: one overflow slot + one menu; no restyle of the pill, no other route moves |

## Rollback Plan

Additive and reversible in two independent halves.

- **Schema:** `drop function finance.confirm_recurring_transaction, finance.discard_recurring_occurrence; drop view ...; alter table finance.transactions drop constraint <recurring_id fk>; drop table finance.recurring_transactions cascade;` then narrow the `origin_module` CHECK back to three values (safe only after deleting any `origin_module='recurring'` rows — otherwise leave the widened CHECK, which is inert). `recurring_id` returns to an unconstrained nullable column; **no existing transaction row is mutated or deleted**, so the ledger is unaffected either way.
- **UI:** delete `(app)/recurrentes/`, remove the banner, and revert `layout.tsx` to the 4-slot pill with `Presupuestos` restored to its direct slot. `finance/api` barrel signatures are untouched, so no other consumer can break.

Rolling back the UI without the schema (or vice versa) is safe; neither half depends on the other at runtime.

## Dependencies

- Archived `lifeos-foundation` (`finance.transactions`, `record_transaction`, `tx_idempotency`, `core.is_member`) and `finance-budgets` (`evaluateBudgetImpact`, `OverBudgetDialog`) — all shipped.
- No new packages.

## Cross-Module Note

Finance is the base module. Two cross-cutting consequences, both deliberate:

1. **`origin_module` gains `recurring`** — the first *Finance-internal* origin. Future modules posting through the seam are unaffected; the domain simply has one more value.
2. **The "Más" overflow menu becomes shared infrastructure.** Health, Nutrition, Recipes, Shopping List, Car Control and Goals will register their entry points here rather than each renegotiating the nav pill. This proposal establishes that mechanism, in the same way `finance-ui-polish` established the app-wide visual pattern precedent. Consumers of it are future changes, not this one.

## Success Criteria

- [ ] Creating a recurring expense never posts a transaction by itself.
- [ ] On/after `next_due_date`, the item appears due; the Home banner reports the count.
- [ ] An item unconfirmed for 12 days reads as overdue by 12 days, not as 12 pending occurrences.
- [ ] Confirming posts exactly one transaction with `recurring_id` set and advances `next_due_date` by exactly one period.
- [ ] Confirming twice for the same due date yields exactly one transaction.
- [ ] Discarding advances the cursor and creates no transaction.
- [ ] Confirming an over-limit expense shows the existing `OverBudgetDialog`; confirming posts, cancelling posts nothing.
- [ ] All four frequencies advance correctly across month-end, leap day, and year boundaries.
- [ ] Confirming a due item pre-fills the transaction date with the original `next_due_date`, editable before posting.
- [ ] Resuming a paused definition sets `next_due_date` to the next future occurrence, never an accrued-overdue date.
- [ ] Deleting a definition leaves its already-posted transactions in history with `recurring_id` set to `NULL`.
- [ ] Another space's session sees zero recurring rows and zero due items through the view.
- [ ] `Recurrentes` and `Presupuestos` are both reachable from the "Más" menu at 375px, light and dark.
- [ ] `pnpm verify` passes; `finance/api` barrel signatures show zero diff.
