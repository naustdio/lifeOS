# Proposal: Credit Card Balance Visibility & Auto-Pay

## Intent

A credit card is the one account type LifeOS models as debt but describes with **zero terms**. `finance.accounts` accepts `credit_card` and the trigger derives `class='liability'`, but `account_liability_details` is gated to `type='liability'` only (`domain/account.ts:19-21`, `api/index.ts:127`, `AccountForm.tsx:79`) — and its shape (`original_amount_cents`, `interest_rate_bp`, `term_months`, `start_date`) is an amortizing-loan shape with no cut-off day, due day, or credit limit. So the app can show *how much* a card owes but never *when it is due* or *how close to the limit* it is. Paying the card is also fully manual: `recurring_transactions` is single-account, `category_id NOT NULL`, and `confirm_recurring_transaction()` hardcodes `type='expense'` — it cannot express "pay FROM checking TO the card", which is structurally a two-leg transfer.

## Scope

### In Scope
- New **optional** `finance.account_credit_card_details` table (credit limit, statement/cut-off day, due day, minimum-payment rule), keyed 1:1 to `accounts`, created only for `type='credit_card'`.
- Due-date-aware surfacing: `/cuentas` card rows show due day + used-vs-limit; dashboard adds an "owed soon" signal beside the existing `debt_cents` card.
- **Transfer mode for recurring**: nullable `to_account_id` + a `type` discriminator on `recurring_transactions`, nullable `category_id` with a transfer-shaped constraint, and `confirm_recurring_transaction()` branching to insert TWO rows sharing one `transfer_group_id`.
- Redesigned idempotency key so two legs of one occurrence cannot collide on the existing unique index.
- Auto-pay creation UI in `/recurrentes` (from-account → card, amount rule).

### Out of Scope
- **Installment grouping / "compra a meses"** — separate change `finance-installment-groups` (5b), not yet designed.
- **Statement import** (file upload, CSV/OFX parsing, dedup, review screen) — deferred to a future cycle; `transactions.external_id` stays inert.
- Interest/APR accrual, minimum-payment computation from a real statement, rewards/points, multi-currency, netting `debt_cents` into `available_cents` (the assets-only hero rule stands).
- Backfilling detail rows for existing cards, or making card details mandatory.
- Auto-executing payments without user confirmation — auto-pay produces a **due proposal**, confirmed like every other recurring item.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `finance-accounts`: `credit_card` accounts MAY carry optional card terms (limit, statement day, due day, minimum-payment rule); absence MUST remain valid and render a defined empty state.
- `finance-recurring`: a recurring definition MAY be a two-leg transfer between two accounts instead of a single categorized expense; confirming one MUST post exactly one balanced pair, idempotently.
- `dashboard-home`: the debt surface MUST distinguish "owed" from "due soon" using card due dates.
- `finance-module-api`: `CreateAccountInput`'s `credit_card` variant gains an optional detail sub-object; recurring input gains a transfer variant.

## Approach

**Card terms are a new, optional table — not a reuse.** `account_liability_details` is amortizing-loan-shaped and required-on-create for `liability`. Cards need cyclical (day-of-month) and revolving (limit) fields. A separate nullable table keeps every existing card valid with no backfill and no migration of user data.

**Auto-pay reuses two proven precedents, additively.** `transfer_group_id` already pairs two opposite-signed rows with `tx_transfer_has_no_category` (`finance_schema.sql:171,185-201`), and `origin_module` was already widened once by DROP+ADD (`20260804090012:51-53`). The new work is the *branch* inside a `SECURITY DEFINER` function, not new pattern invention.

**Idempotency is the real design decision.** The unique index is `(household_id, origin_module, origin_entity_id, idempotency_key) where idempotency_key is not null`. Two legs sharing `origin_entity_id = recurring_id` and `idempotency_key = due_date` would collide, and `on conflict do nothing` would silently post a **half transfer** — an unbalanced pair that violates the transfer invariant and corrupts both balances. A per-leg suffix is the obvious candidate, but it must be chosen so that a replay still resolves to the *same pair* and a partial failure can never commit one leg. `sdd-design` must treat this as a first-class design item with pgTAP coverage, not a mechanical string tweak.

**Day-of-month is a rule, not a date.** Statement/due days are `int 1..31`; the "next due date" is derived, with a defined clamp for short months.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/migrations/` | New | `account_credit_card_details`; `recurring_transactions` `type` + `to_account_id` + nullable `category_id`; `confirm_recurring_transaction()` transfer branch |
| `supabase/tests/` | Modified | pgTAP: pair atomicity, idempotent replay, no half-transfer, RLS, day clamping |
| `src/modules/finance/domain/account.ts` | Modified | `supportsCardDetail()` alongside `requiresLiabilityDetail()` |
| `src/modules/finance/domain/transfer.ts` | Reference | `buildTransferPair()` shape mirrored server-side |
| `src/modules/finance/api/index.ts` | Modified | Account + recurring input variants |
| `src/app/(app)/cuentas/` | Modified | Card detail fieldset, due day + limit usage on list |
| `src/app/(app)/recurrentes/` | Modified | Transfer-mode form + confirm sheet |
| `src/app/(app)/page.tsx` | Modified | "Due soon" signal; `available_cents` rule untouched |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Idempotency collision posts a half transfer** | **High** | Highest-risk item. `sdd-design` owns the key scheme; both legs in one statement/transaction; pgTAP replay + concurrency tests before any UI work |
| `SECURITY DEFINER` branch weakens `assert_member` guarantees | Med | Membership assert stays the function opener; both accounts validated against the same `household_id` |
| Nullable `category_id` breaks existing expense recurrings | Med | Constraint mirrors `tx_transfer_has_no_category`: category required iff `type='expense'` |
| Existing cards with no detail row render broken UI | Med | Detail optional by design; explicit empty state, never a crash or `NaN` |
| Due day 29-31 in February | Low | Clamp to last day of month, defined in spec and covered by tests |
| Users read "due soon" as an automatic payment | Med | Auto-pay proposes; confirmation stays mandatory, copy states it |
| 400-line review budget exceeded | High | Flag to `sdd-tasks`: expect stacked slices (card detail table+UI → recurring transfer schema+function → auto-pay UI) |

## Rollback Plan

Additive and reversible in two independent slices. Card details: `drop table finance.account_credit_card_details;` plus reverting the `credit_card` API variant and the `/cuentas` fieldset — no `accounts` row is mutated. Recurring transfer mode: revert `confirm_recurring_transaction()` to the current single-insert body, restore `category_id NOT NULL` (safe only if no transfer-type definition exists; the down path deletes `type='transfer'` definitions first), and drop `to_account_id` + `type`. Transactions already posted by auto-pay are ordinary `type='transfer'` rows with a valid `transfer_group_id` and survive rollback intact. `account_balances`, `household_summary`, and the assets-only hero rule are never touched.

## Dependencies

- `finance.transactions.transfer_group_id` + its pairing constraints, `origin_module` CHECK widening precedent, `finance.recurring_transactions` + `confirm_recurring_transaction()` — all present and archived.
- Radix `select` convention for the from-account and day-of-month pickers.

## Assumptions Needing User Confirmation

1. Card terms are **optional** — existing cards keep working with no detail row and no backfill.
2. Auto-pay **proposes** a payment for confirmation; it never posts silently.
3. Auto-pay amount is a fixed amount per occurrence (not "pay full statement balance" — that needs statement data we do not have).
4. Statement day and due day are stored as day-of-month integers, not dates.
5. `debt_cents` stays separate from `available_cents`; this change adds urgency, not netting.
6. One auto-pay definition per card is enough for the first slice.

## Success Criteria

- [ ] A credit card can be created with, and edited to add or remove, limit / statement day / due day.
- [ ] A credit card with no detail row still lists, balances, and transacts exactly as today.
- [ ] `/cuentas` shows each card's next due date and limit usage; a card without terms shows a defined empty state.
- [ ] The dashboard distinguishes total debt from amounts due within the current cycle, without changing `available_cents`.
- [ ] Confirming an auto-pay posts exactly two opposite-signed rows sharing one `transfer_group_id`, with no category.
- [ ] Replaying the same auto-pay occurrence posts nothing new and returns the same pair — **never one leg**.
- [ ] Two concurrent confirms of the same occurrence produce exactly one pair and one cursor advance.
- [ ] Existing expense-type recurring definitions and their confirm flow show zero behavior change.
- [ ] A due day of 31 resolves correctly in February.
- [ ] Another household's accounts are never selectable as an auto-pay source or target (RLS + `assert_member`).
- [ ] `pnpm verify` and the pgTAP suite pass.
