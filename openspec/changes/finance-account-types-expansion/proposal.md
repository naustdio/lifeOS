# Proposal: Finance Account Types — Inversiones & Prestado

## Intent

Two real money positions have no home in the app. **Inversiones** (invested capital) is today either faked as a `savings` account — which hides return entirely — or left out, so the household's net worth reads low. **Prestado** (money lent to a person) is worse: it is a receivable, but the only shaped type with an amount/term/schedule is `liability`, whose sign convention is the exact opposite, so recording it either inverts the headline or is skipped and simply forgotten.

`finance.accounts.type` has exactly 6 values and `class` is trigger-derived. This change widens both by two, adds the matching detail tables, and wires the form — nothing more.

## Scope

### In Scope
- Migration: DROP+ADD the `accounts.type` CHECK to include `investment` and `loaned`; extend `finance.derive_account_class()` so both map to **`asset`**.
- `finance.account_investment_details`: `cost_basis_cents`, `current_value_cents` (manually updated), `valued_on`.
- `finance.account_loaned_details`: `counterparty_name` (required), `original_amount_cents`, optional `term_months` / `expected_return_date`.
- `finance.create_account()`: new params, per-type detail-required validation, and an **inverted** opening-balance guard for `loaned`.
- A seam function to update an investment's current value (the only mutable detail field).
- Domain + api: `AccountType` union, `ASSET_TYPES`, `CreateAccountInputSchema`, `requires*Detail` helpers, and the inline `class` computation in `createAccount()`.
- `AccountForm.tsx` (2 labels + 2 fieldsets) and `cuentas/actions.ts` FormData branching.
- pgTAP coverage for both class derivations, both sign guards, and detail-mismatch rejection.

### Out of Scope
- **No market-data integration of any kind** — no price feeds, tickers, symbols, quotes, or external APIs. Value is typed by the user.
- No price/valuation history table, no charts over time, no return-rate (IRR/CAGR) math.
- No automated interest, dividend, coupon, or accrual posting for either type.
- No debt-collection reminders, payment plans, or notifications for `prestado`.
- No new transaction type or subtype; contributions, withdrawals, and repayments are ordinary transfers.
- No multi-currency, no per-holding breakdown inside one investment account.
- No changes to `household_summary`, `account_balances`, `month_summary`, or `category_spend` — verified to key off `class`, not `type`.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `finance-accounts`: the account-type domain grows to 8; both new types derive `class = 'asset'`; `loaned` gains an inverted opening-balance rule and a required counterparty; `investment` gains a manually-maintained current value distinct from its derived balance.
- `finance-module-api`: `createAccount()` accepts two new discriminated-union branches; a new seam function updates an investment's current value.

## Business Rules

1. **Both new types are assets.** `prestado` is a receivable (owed *to* the household), not a debt. It must be its own branch in the asset set, never reached by inverting `liability`.
2. **`loaned` opening balance MUST be zero or positive** — the exact inverse of the existing `credit_card`/`liability` guard (`> 0 → raise`). Copying that guard verbatim silently inverts the household's net worth.
3. **`counterparty_name` is required** on a `prestado` account. A receivable with no debtor is not a record.
4. **Investment value is manual and current.** `current_value_cents` is whatever the user last typed, with `valued_on` recording when. The app never fetches, infers, or extrapolates it.
5. **Rendimiento is derived, never stored**: `current_value_cents − balance_cents`, consistent with the project's existing derived-balance convention. It may be negative.
6. **Cost basis is the derived balance.** Contributions and withdrawals are ordinary transfers, so `account_balances.balance_cents` already *is* the net capital in. `cost_basis_cents` records only the amount at creation.
7. **Repayment on a `prestado` account is a transfer** from the loaned account to a cash/checking account. It reduces the receivable and raises real cash — no new transaction semantics.
8. **`class` stays trigger-derived.** No client, form, or action may supply it.

## Approach

**Widen, don't invent.** Follow the exact DROP+ADD pattern already proven safe on `transactions.origin_module` (`20260804090012_finance_recurring.sql:46-53`). Add two detail tables mirroring the `account_liability_details` / `account_goal_details` shape so the discriminated union stays uniform.

**Atomic type-knowledge update.** The account-type domain is duplicated across **six** sites, not three. All must move in one migration + one commit or `class` drifts and the RPC rejects valid input:

| # | Site | What breaks if missed |
|---|---|---|
| 1 | `20260804090005:14-15` type CHECK | insert rejected outright |
| 2 | `20260804090005:50-66` `derive_account_class()` | `raise 'unknown account type'` — hard fail |
| 3 | `20260804090008:44-63` `create_account()` validation + sign guard | detail rows never written; wrong sign accepted |
| 4 | `domain/account.ts:5,8` `AccountType` + `ASSET_TYPES` | client preview shows the account as debt |
| 5 | `api/index.ts:107,123,271` union + Zod schema + inline `class` | seam returns `class:"liability"` for both new types |
| 6 | `AccountForm.tsx:15-22,70-131` + `actions.ts:46-70` | type unselectable / details dropped |

**Verify the constraint name first.** Migration 12's comment records that its name was confirmed via `select conname from pg_constraint where conrelid = 'finance.transactions'::regclass and contype = 'c'`. Do the same for `finance.accounts` at design time — do not guess `accounts_type_check`.

**Purely additive at the data level.** Zero rows of either new type exist, so the widened CHECK cannot fail validation and **no backfill or migration of existing accounts is needed**.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/migrations/` | New | Type CHECK DROP+ADD, trigger branches, 2 detail tables + RLS, `create_account()` replace, value-update seam |
| `supabase/tests/040_finance_money.sql` | Modified | Header says "six types"; extend to 8 + both sign guards |
| `src/modules/finance/domain/account.ts` | Modified | Union, `ASSET_TYPES`, new `requires*Detail` helpers |
| `src/modules/finance/api/index.ts` | Modified | Union, Zod branches, `createAccount()` RPC args + `class` computation |
| `src/app/(app)/cuentas/AccountForm.tsx` | Modified | 2 labels, 2 fieldsets, sign-hint logic per type |
| `src/app/(app)/cuentas/actions.ts` | Modified | 2 FormData branches |
| `src/app/(app)/cuentas/` (list) | Modified | Show rendimiento / counterparty on the new cards |
| Balance & summary views | Unchanged | Key off `class`; explicitly not touched |

## Edge Cases

- **Existing accounts**: none of either type exist. No backfill, no reclassification, no data migration.
- **Investment with no value yet**: `current_value_cents` defaults to `cost_basis_cents`, so rendimiento reads `0`, never NULL or a blank card.
- **Negative rendimiento**: a loss is valid and must render as such, not clamp to zero.
- **Fully repaid `prestado`**: balance reaches `0`; the account stays visible and archivable — it is not auto-closed.
- **Overpayment / partial repayment**: allowed; balance simply follows the transfers.
- **Stale valuation**: `valued_on` lets the UI mark a value as old. No blocking, no nagging in this slice.
- **Withdrawing more than invested**: balance may go negative; surfaced, not blocked.
- **Archiving**: both types use the existing `archived_at` path unchanged.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `loaned` sign guard copied from `liability` → net worth inverts | **High** | Written as an explicit business rule; pgTAP asserts a positive opening balance is *accepted* and a negative one *rejected* |
| One of the 6 type-knowledge sites missed → `class` drift | **High** | Table above is the checklist; a pgTAP assertion per type pins `class` server-side |
| Guessed CHECK constraint name → migration fails on apply | Med | `pg_constraint` introspection is a mandatory design-time step |
| "Current value" read as a live/synced number by the user | Med | UI labels it as manual with `valued_on`; non-goal stated in the spec |
| Investment current value silently enters `available_cents` | Med | Headline keeps using derived `balance_cents` (cost basis); rendimiento shown separately. Needs user confirmation (Q2) |
| `create_account()` param list grows past readability | Low | Grouping/refactor deferred; signature change is already breaking-by-replace, and the grant list at `20260804090008:374` must be updated to match |
| 400-line review budget | Med | Flag to `sdd-tasks`: likely 2 slices (DB+seam+tests → domain/api/UI) |

## Rollback Plan

Additive and reversible while no rows of the new types exist. Down path: `drop table finance.account_investment_details, finance.account_loaned_details;` then DROP+ADD the `accounts.type` CHECK back to the original 6 values, restore the prior `derive_account_class()` and `create_account()` bodies from `20260804090005` / `20260804090008`, and drop the value-update seam. UI/domain rollback is a plain revert. No existing account, transaction, budget, or view row is mutated, so no historical figure can change. **After any real account of either type exists, rollback requires deleting or retyping those accounts first** — the CHECK narrowing would otherwise fail validation.

## Dependencies

- `finance.accounts`, `derive_account_class()`, `create_account()`, `account_balances`, `household_summary` — all present from archived `lifeos-foundation`.
- Radix `Select` convention (`src/design-system/ui/select.tsx`) for the type dropdown — already used by `AccountForm`.
- Independent of `finance-categories-icon-color` (roadmap #1, implemented but unmerged); no shared files. Branch from the same base to keep the diff clean.

## Proposal question round

These product questions would sharpen the spec. Assumptions in **bold** are what the proposal currently encodes if unanswered.

1. When you update an investment's current value, should the app record a movement (so the gain appears in the month's income) or only change the displayed value? **Assumed: display only — a valuation is not income until realized.**
2. Should the "dinero disponible" headline count an investment at its current value, or stay at capital-in (cost basis)? **Assumed: cost basis, so the headline stays a cash-availability figure and unrealized gains don't inflate it.**
3. For `prestado`, do you need interest on money you lend, or is it always a plain amount owed back? **Assumed: plain amount, no interest, no schedule enforcement.**
4. Is `counterparty_name` free text, or should it eventually link to a household member / contact? **Assumed: free text in this slice.**
5. Should either new type be excluded from budgets and category spend? **Assumed: unchanged — they behave like any other asset account.**

## Success Criteria

- [ ] A user can create an "Inversiones" account with a cost basis, later type a new current value, and see rendimiento (positive or negative) computed as value minus balance.
- [ ] A user can create a "Prestado" account naming who owes the money and how much, with a **positive** opening balance accepted.
- [ ] A negative opening balance on a `prestado` account is rejected **by the database**, not only by the form.
- [ ] Both new types report `class = 'asset'` when read back from the server, in every one of the 6 type-knowledge sites' code paths.
- [ ] A repayment recorded as a transfer lowers the `prestado` balance and raises the destination account by the same amount.
- [ ] No existing account changes type, class, or balance after the migration; `household_summary` and `account_balances` output is byte-identical for pre-existing data.
- [ ] Creating any of the 6 original types still works unchanged, including both existing detail blocks.
- [ ] Zero references to any external price, quote, ticker, or market-data source anywhere in the diff.
- [ ] `pnpm verify` and the full pgTAP suite pass.
