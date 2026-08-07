# Tasks: Credit Card Balance Visibility & Auto-Pay

> Task IDs use the `CC-` prefix (`CC-001`..`CC-024`). Each task cites the exact spec requirement(s)
> it satisfies via `finance-credit-card-payments/Requirement Name`. Design section references use
> `design.md §N`. **Strict TDD is `false`** for this project (per `sdd-init/lifeos`) — critical-logic
> focus, not blanket TDD. This change is the **highest-risk change in the current roadmap** (idempotent
> two-leg transfer posting under concurrency), so RED-first ordering is applied to every genuinely
> critical-logic surface named in the design: the expense-branch regression guard (Decision 5, named
> "single most dangerous edit" in design.md), the pair-atomicity / half-pair-guard pgTAP set, and the
> pure TS domain mirrors (`credit-card.ts`, `validateRecurringShape`). Migration DDL itself is not a
> TDD gate — but per this project's TDD policy, the correctness properties a migration establishes
> (atomicity, replay-safety, concurrency-safety) MUST be proven by a passing pgTAP/scripted test before
> the task that lands that migration is marked done.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,200 total (design.md §"PR Slicing") |
| 1000-line budget risk | Low per slice, High if shipped as one PR |
| Chained PRs recommended | Yes |
| Suggested split | PR A (recurring transfer core, ships alone) → PR B (card terms data) → PR C (UI) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes — ask-on-risk requires confirming the 3-slice stacked-to-main split,
and specifically that **Slice A ships and merges alone** before Slice B/C begin, per design.md's
explicit instruction not to review idempotency logic next to UI diff noise.
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
1000-line budget risk: Low (each slice individually) / High (single PR)

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| A | Transfer-type recurring definitions confirm atomically into an idempotent, tenant-safe, concurrency-safe balanced pair; expense-type confirm is byte-identical to today | PR A (alone) | `supabase test db` (targeted pgTAP files) + `bash scripts/test-recurring-transfer-race.sh` | Local Supabase stack, real two-connection `psql` race script | `create or replace` restores prior `confirm_recurring_transaction` body (same signature, no DROP/GRANT/reload); drop `recurring_transfer_shape`/`recurring_expense_shape`, `to_account_id`, `type` after deleting `type='transfer'` rows |
| B | Card terms are storable, tenant-safe, queryable; `credit_card_status` view and TS mirror agree, empty state is `has_terms=false` never `NaN` | PR B (on A) | `supabase test db` (card pgTAP) + `pnpm vitest run tests/unit/credit-card-domain.test.ts` | `pnpm verify` | `drop view finance.credit_card_status; drop table finance.account_credit_card_details;` + date-helper functions, independent of A |
| C | `/cuentas`, dashboard, and `/recurrentes` surface card terms, due dates, and transfer-mode auto-pay end to end | PR C (on B) | `pnpm vitest run tests/unit/recurring-form-render.test.tsx tests/unit/account-form-render.test.tsx` | Manual: `/cuentas`, `/recurrentes`, dashboard at 375px light+dark against local Supabase | Revert the 5 modified UI files; B and A are unaffected |

---

## Slice A — Recurring Transfer Core (~450 lines, ships first and alone)

### (a) Schema

- [x] CC-001 — Migration: `supabase/migrations/20260804090018_finance_recurring_transfer_shape.sql`
  (design.md §1b, split out of the combined file so Slice A never carries card-table DDL)
  - `alter table finance.recurring_transactions add column type text not null default 'expense' check (type in ('expense','transfer')), add column to_account_id uuid references finance.accounts(id) on delete restrict, alter column category_id drop not null`.
  - Add `recurring_expense_shape` / `recurring_transfer_shape` CHECKs mirroring `tx_category_required` / `tx_transfer_has_no_category`.
  - Confirm via `pg_constraint` whether any existing `recurring_transactions` CHECK name collides before naming these (open question #1).
  - Satisfies: `Recurring Definitions Are Expense-Only, One of Four Frequencies, Never Auto-Posting` (transfer-type scenarios).
  - Depends on: none. Parallel: sequential (must land before CC-002).

- [x] CC-002 [pgTAP shape guard] — `supabase/tests/0xx_finance_recurring_transfer_shape.sql` (create)
  - `type='transfer'` with `category_id` set rejected; with `to_account_id is null` rejected; with `to_account_id = account_id` rejected; `type='expense'` with `category_id is null` rejected; all pre-existing rows satisfy both new CHECKs (regression: the `default 'expense'` ALTER must be a no-op).
  - Satisfies: `Recurring Definitions Are Expense-Only...` (mutual-exclusion-by-type scenario).
  - Depends on: CC-001. Parallel: sequential.

### (b) Confirm-function rewrite — the core risk

- [x] CC-003 [RED — regression baseline] — `supabase/tests/0xx_finance_recurring_expense_regression.sql` (create)
  - Write and run against the **pre-change** function: confirming an existing `type='expense'` definition posts one row with `idempotency_key = v_due::text` **unsuffixed**, category set, cursor advanced. Capture as a passing baseline before touching `confirm_recurring_transaction()`.
  - Satisfies (drives): `Idempotent Confirmation Per Due Date Never Produces a Half-Transfer` (Decision 5 guard — named highest-priority regression in design.md).
  - Depends on: none (baseline against unmodified function). Parallel: sequential, must run before CC-004.

- [x] CC-004 — Migration: `supabase/migrations/20260804090019_finance_recurring_transfer_api.sql`
  (design.md §2 — `create or replace confirm_recurring_transaction`, signature UNCHANGED `(uuid, bigint, date, text) returns uuid`)
  - Transfer branch: guard `to_account_id not null`, `<> account_id`, both accounts resolve to `v_def.household_id` and `archived_at is null` (§2.3, tenancy).
  - ONE multi-row `INSERT ... VALUES (out-leg),(in-leg)` with keys `v_due::text || ':out'` / `':in'`, `ON CONFLICT (household_id, origin_module, origin_entity_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id, amount_cents`, wrapped in a CTE yielding `count(*)`.
  - `count=2` → advance cursor, return out-leg id. `count=0` → SELECT and return the committed `:out` row (replay/lost race). `count=1` → `raise exception ... errcode '40001'` (structurally unreachable, fails closed).
  - Expense branch: **byte-identical to today**, bare `v_due::text` key — **do not suffix it**.
  - Satisfies: `Confirm Atomically Posts and Advances the Cursor`, `Idempotent Confirmation Per Due Date Never Produces a Half-Transfer` (all 3 scenarios), `Transfer Auto-Pay Never Auto-Executes`, `Over-Budget Confirmation Reuses the Existing Mechanism` (transfer-never-triggers scenario).
  - Depends on: CC-001, CC-003 (baseline must exist first). Parallel: sequential.

- [x] CC-005 [GREEN — regression proof] — re-run `0xx_finance_recurring_expense_regression.sql` from CC-003 against the migrated function; MUST still pass unchanged. Add explicit assertion that the key contains no `:out`/`:in` suffix.
  - Depends on: CC-004. Parallel: sequential.

- [x] CC-006 [pgTAP — pair atomicity] — `supabase/tests/0xx_finance_recurring_transfer_atomicity.sql` (create)
  - Confirming a `type='transfer'` definition posts exactly 2 rows, opposite signs, sum 0, one shared `transfer_group_id`, `category_id is null`, both `recurring_id` set.
  - Force a 2nd-leg failure (FK violation on `to_account_id`) → assert **zero** rows and an **unadvanced** cursor.
  - Satisfies: `Confirm Atomically Posts and Advances the Cursor` (transfer-pair scenario, mid-confirm-failure scenario).
  - Depends on: CC-004. Parallel: yes, parallel with CC-007/CC-008.

- [x] CC-007 [pgTAP — replay] — `supabase/tests/0xx_finance_recurring_transfer_replay.sql` (create)
  - Calling confirm twice for the same occurrence (cursor reset to the same `next_due_date`) posts nothing new, returns the same out-leg id, cursor doesn't advance again, `count(*) filter (transfer_group_id = g)` stays exactly 2.
  - Satisfies: `Idempotent Confirmation Per Due Date Never Produces a Half-Transfer` (scenario 2).
  - Depends on: CC-004. Parallel: yes, parallel with CC-006/CC-008.

- [x] CC-008 [pgTAP — half-pair guard] — `supabase/tests/0xx_finance_recurring_transfer_half_pair_guard.sql` (create)
  - Pre-insert a row occupying `<due>:in` only, then confirm: statement raises `40001`, pre-existing row is untouched, no `:out` sibling is created. Named test for the `v_count = 1` guard.
  - Depends on: CC-004. Parallel: yes, parallel with CC-006/CC-007.

- [x] CC-009 [pgTAP — tenancy] — `supabase/tests/0xx_finance_recurring_transfer_tenancy.sql` (create)
  - A `to_account_id` belonging to another household raises `42501` inside the definer despite RLS bypass; same for `account_id` cross-household check.
  - Depends on: CC-004. Parallel: yes.

- [x] CC-010 [pgTAP — single overload guard] — `supabase/tests/0xx_finance_recurring_overload_guard.sql` (create)
  - Post-migration assertion: exactly ONE `confirm_recurring_transaction` overload exists (`select count(*) from pg_proc where proname = 'confirm_recurring_transaction' and pronamespace = 'finance'::regnamespace`), and its signature is `(uuid, bigint, date, text) returns uuid`. The `42725` guard from the sibling changes.
  - Resolves design.md Open Question #2.
  - Depends on: CC-004. Parallel: yes.

- [x] CC-011 [scripted two-connection race] — `scripts/test-recurring-transfer-race.sh` (create, modeled on `scripts/test-bootstrap-race.sh`)
  - pgTAP runs one file inside one transaction and cannot fork two genuinely concurrent transactions on the same connection — confirmed by inspecting `supabase/tests/020_core_bootstrap_idempotency.sql`'s own header comment. This resolves design.md Open Question #3: fall back to a real scripted harness.
  - Opens two real concurrent `psql` connections against a running local stack; both call `confirm_recurring_transaction()` on the same `type='transfer'` definition/occurrence at once (second connection sleeps briefly after the definition select to widen the race window, or issues both calls back-to-back with no artificial delay to hit the row-lock path).
  - Assert: exactly one pair exists (`count(*) where transfer_group_id = g` = 2), cursor advanced exactly once, neither connection ever observes/returns a `NULL` or single-leg result.
  - Satisfies: `Idempotent Confirmation Per Due Date Never Produces a Half-Transfer` (scenario 3 — concurrency).
  - Depends on: CC-004. Parallel: yes, parallel with CC-006..CC-010. Must pass before Slice A is considered closed — this is the direct proof of the design's core atomicity claim (§2.2 "Why this guarantees both properties").

- [x] CC-012 — `src/modules/finance/domain/recurring.ts` (modify): add `RecurringType = "expense" | "transfer"`, `validateRecurringShape(input)` mirroring the two CHECKs from CC-001.
  - Satisfies: `Recurring Definitions Are Expense-Only...` (client-side mirror, defensive UX).
  - Depends on: CC-001. Parallel: yes, independent of the pgTAP tasks above; closes out Slice A.

---

## Slice B — Card Terms Data + Reads (~350 lines, stacked on Slice A)

### (c) Schema

- [x] CC-013 — Migration: `supabase/migrations/20260804090020_finance_credit_cards.sql`
  (design.md §1a/§1c/§1d)
  - `finance.account_credit_card_details` (1:1, cascade-deleted, all columns except `account_id` nullable: `credit_limit_cents`, `statement_day`/`due_day` 1..31, `min_payment_cents`), `touch_updated_at` trigger.
  - Type-gate trigger `enforce_card_detail_account_type()` — a CHECK cannot reference `finance.accounts`, so this MUST be a trigger, not a CHECK.
  - `clamp_day_to_month()` + `next_card_due_date()` pure SQL functions.
  - `finance.credit_card_status` view, `security_invoker = true` (4th occurrence of the project's hard view rule), NULL-safe on every derived column, `has_terms` flag.
  - Satisfies: `Optional Credit Card Account Detail` (all 4 scenarios).
  - Depends on: none (independent of Slice A tables). Parallel: yes, can start once Slice A is merged.

- [x] CC-014 — Migration: `supabase/migrations/20260804090021_finance_credit_cards_security.sql`
  - `enable row level security`; select/insert/update/delete policies `using (finance.can_read_account(account_id))`; `grant select, insert, update, delete on finance.account_credit_card_details to authenticated` (delete granted, unlike categories — no history to preserve).
  - Depends on: CC-013. Parallel: sequential.

- [x] CC-015 [pgTAP — card terms] — `supabase/tests/0xx_finance_credit_cards.sql` (create)
  - Detail row on a non-`credit_card` account rejected by the trigger; deleting the account cascades the detail row; card with no detail row appears in `credit_card_status` with `has_terms=false` and all-NULL derived columns.
  - Tenancy: non-member cannot select/insert/update/delete; `anon` zero rows; `credit_card_status` leaks no other household (`security_invoker` proof).
  - Day clamp: `next_card_due_date(31, '2026-02-10')` → `2026-02-28`; leap year → `2028-02-29`; day 15 vs today-20 → next month; day 20 vs today-20 → today.
  - Satisfies: `Optional Credit Card Account Detail`, `Exceeding the Credit Limit Is a Visual Warning, Never a Block`.
  - Depends on: CC-013, CC-014. Parallel: sequential.

### (d) Domain + Repository

- [x] CC-016 [RED] — `tests/unit/credit-card-domain.test.ts` (create): failing test — `clampDueDay`/`nextDueDate` against the same fixture table as CC-015's clamp assertions; `utilizationBp` returns `null` (never `NaN`/`Infinity`) on a null/zero limit; `isOverLimit`/`daysUntilDue` pure and total. Fails: `credit-card.ts` does not exist yet.
  - Satisfies (drives): `Exceeding the Credit Limit Is a Visual Warning, Never a Block` (TS-side proof), `Optional Credit Card Account Detail` (empty-state proof).
  - Depends on: CC-013 (mirrors the SQL functions it asserts against). Parallel: sequential.

- [x] CC-017 [GREEN] — `src/modules/finance/domain/credit-card.ts` (create): `clampDueDay`, `nextDueDate`, `daysUntilDue`, `utilizationBp`, `isOverLimit` — framework-free pure mirrors, implemented to satisfy CC-016.
  - Depends on: CC-016. Parallel: sequential.

- [x] CC-018 — `src/modules/finance/domain/account.ts` (modify): `supportsCardDetail(type) => type === "credit_card"`, beside `requiresLiabilityDetail`.
  - Depends on: none. Parallel: yes.

- [x] CC-019 — `src/modules/finance/data/account-repository.ts` (modify): `listCreditCardStatus(supabase, householdId)` over `finance.credit_card_status`; `upsertCardDetails`/`removeCardDetails` (plain RLS, `budget-repository.ts` shape, `Number()` every bigint, degrade to `[]`/`{ error }`).
  - Satisfies: `Optional Credit Card Account Detail` (create/edit/remove scenarios).
  - Depends on: CC-014, CC-017. Parallel: sequential.

- [x] CC-020 — `src/modules/finance/data/recurring-repository.ts` (modify): `type`/`to_account_id` in select and `RecurringListItem`/`DueRecurringItem`; `categoryId: string | null`; create/update accept the transfer variant.
  - Depends on: CC-012. Parallel: yes, parallel with CC-019.

- [x] CC-021 — `src/modules/finance/data/index.ts`, `src/modules/finance/api/index.ts` (modify): re-export `listCreditCardStatus`/`upsertCardDetails`/`removeCardDetails` and the updated recurring repository functions; `CreateRecurringInputSchema` becomes a Zod discriminated union on `type` (`ConfirmRecurringInputSchema`/`confirmRecurring()` need zero changes — RPC signature is stable).
  - Depends on: CC-019, CC-020. Parallel: sequential (closes out Slice B).

---

## Slice C — UI (~400 lines, stacked on Slice B)

- [x] CC-022 — `src/app/(app)/cuentas/AccountForm.tsx` (modify): third conditional fieldset gated on `supportsCardDetail(type)`, all fields optional, `statement_day`/`due_day` as Radix `Select`s 1..31 (never native `<select>`), limit/min-payment as `Input type="number"`. Two-step create: `createAccount()` then `upsertCardDetails()` — step-2 failure leaves a valid card with no terms (accepted empty-state tradeoff, not a bug).
  - Satisfies: `Optional Credit Card Account Detail` (create-without-detail, add-later scenarios).
  - Depends on: CC-018, CC-021. Parallel: yes, parallel with CC-024.

- [x] CC-023 — `src/app/(app)/cuentas/page.tsx`, `actions.ts` (modify): row gains `Vence en N días`/`Vencido hace N días` + used/limit bar + over-limit warning chip; `has_terms=false` renders `Sin términos configurados · Agregar`, never `NaN`.
  - Satisfies: `Exceeding the Credit Limit Is a Visual Warning, Never a Block` (both scenarios).
  - Depends on: CC-021. Parallel: yes, parallel with CC-022/CC-024.

- [x] CC-024 — `src/app/(app)/page.tsx` (dashboard, modify): "Por pagar pronto" figure summing `owed_cents` for cards with `days_until_due between 0 and 7` beside existing `debt_cents`; `available_cents` and the assets-only hero rule untouched.
  - Depends on: CC-021. Parallel: yes.

- [x] CC-025 [RED] — `tests/unit/recurring-form-render.test.tsx` (create/modify), `tests/unit/account-form-render.test.tsx` (create/modify): failing RTL tests — `RecurringForm`: switching `Tipo` to `Pago de tarjeta` hides Categoría, shows `Tarjeta destino` (options filtered `class='liability'`, excludes source account); `AccountForm`: card fieldset appears only for `credit_card`, days are Radix Selects, all optional. Fails: forms don't have the transfer/card branches yet.
  - Depends on: CC-021. Parallel: sequential, before CC-026/CC-027.

- [x] CC-026 [GREEN] — `src/app/(app)/recurrentes/RecurringForm.tsx` (modify): leading `Tipo` Select (`Gasto`/`Pago de tarjeta`); transfer swaps Categoría for `Tarjeta destino`, relabels Cuenta as `Cuenta origen`, amount copy states fixed-amount-per-occurrence — implemented to satisfy CC-025.
  - Depends on: CC-025, CC-020. Parallel: yes, parallel with CC-022 (both consume CC-025's RTL contract independently).

- [x] CC-027 [GREEN] — `src/app/(app)/recurrentes/RecurringList.tsx`, `ConfirmRecurringSheet.tsx` (modify): transfer rows render `Origen → Destino`, no category chip; confirm sheet states explicitly that confirming posts the payment (auto-pay proposes, never posts silently) — implemented to satisfy CC-025.
  - Satisfies: `Transfer Auto-Pay Never Auto-Executes`.
  - Depends on: CC-025, CC-020. Parallel: yes, parallel with CC-026.

- [x] CC-028 — Run `pnpm verify` (ESLint `app → api/` boundary, `domain` purity, `tsc --noEmit`, `check-tokens.mjs`, `next build`) and the full `supabase test db` suite end to end. Closes out Slice C and the change.
  - Depends on: CC-022, CC-023, CC-024, CC-026, CC-027. Parallel: sequential (last task).

---

## Dependency Summary (critical path)

```
CC-001 (recurring ALTERs+CHECKs) → CC-002 (pgTAP shape)                                    [Slice A]
CC-003 [RED baseline] → CC-004 (confirm() rewrite) → CC-005 [GREEN regression proof]
CC-004 → CC-006, CC-007, CC-008, CC-009, CC-010, CC-011 (parallel pgTAP + race script)
CC-001 → CC-012 (domain/recurring.ts)                                    [Slice A closes]

CC-013 (card table+view) → CC-014 (security) → CC-015 (pgTAP)                              [Slice B]
CC-013 → CC-016 [RED] → CC-017 [GREEN] (credit-card.ts)
CC-014, CC-017 → CC-019 (account-repository); CC-012 → CC-020 (recurring-repository, parallel)
CC-019, CC-020 → CC-021 (re-exports + Zod union)                         [Slice B closes]

CC-018, CC-021 → CC-022 (AccountForm); CC-021 → CC-023 (cuentas row); CC-021 → CC-024 (dashboard)
CC-021 → CC-025 [RED forms] → CC-026, CC-027 [GREEN] (parallel)
CC-022, CC-023, CC-024, CC-026, CC-027 → CC-028 (pnpm verify + full pgTAP, last)            [Slice C closes]
```

CC-002, CC-006..CC-011, CC-015 are correctness-proof gates, not literal RED-before-code — per this
project's TDD policy, DB migrations aren't TDD-gated, but the atomicity/replay/concurrency properties
CC-004/CC-013 establish MUST be pgTAP/script-proven before the owning task is marked done. CC-003/CC-005
(expense-key regression), CC-016/CC-017 (domain mirror), and CC-025/CC-026/CC-027 (form branching) ARE
explicit RED-first gates covering the design's named critical-logic surfaces.
