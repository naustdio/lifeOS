# Tasks: Finance Account Types — Inversiones & Prestado

> Task IDs use `A-` (Slice A — DB + contracts) and `B-` (Slice B — UI) prefixes. Each task cites the
> spec requirement(s) it satisfies via `finance-account-types-expansion/Requirement Name`. Design
> section references use `design.md §N`. **Strict TDD is `false`** for this project
> (`sdd-init/life_os`) — critical-logic focus, not blanket TDD. DB migrations and pgTAP are NOT
> TDD-gated (they are their own proof layer). RED-first ordering applies only to the two genuinely
> pure-logic surfaces the design names: `domain/account.ts`'s type union/`ASSET_TYPES`/`requires*Detail`
> exhaustiveness, and `CreateAccountInputSchema`'s two new discriminated branches. UI wiring
> (`AccountForm` fieldsets) also gets one RED gate because the design explicitly specifies its
> assertable behavior (fieldset reveal, sign-hint text, `min={0}`).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~760 total (design.md §"PR Slicing") |
| 1000-line budget risk | Low per slice / Medium if shipped as one PR |
| Chained PRs recommended | Yes |
| Suggested split | Slice A (DB + contracts) → Slice B (UI) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No — chain strategy already resolved to `stacked-to-main` per session
context, matching the `finance-categories-icon-color` precedent.
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
1000-line budget risk: Low (each slice individually, ~430/~330) / Medium (single PR mixes PL/pgSQL,
RLS, TS contracts, and React in one review pass even though 760 < 1000)

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Both account types are creatable and correctly classed **server-side**, with the inverted `loaned` sign guard proven, before any UI can reach them | Slice A | `pnpm vitest run tests/unit/account-domain.test.ts tests/unit/create-account-schema.test.ts` + `supabase test db` | `supabase db reset` + pgTAP run against local stack (`supabase/tests/040_finance_money.sql`) | Down path in design.md §"Migration/Rollout" (drop seam, drop 2 detail tables, restore prior CHECK/`derive_account_class`/`create_account`/grant) — valid only while no row of either type exists; revert `domain/account.ts` and `api/index.ts` sites (c)-(f), no call sites outside Slice A |
| 2 | The `/cuentas` screen lets a household create Inversiones/Prestado accounts via the form and see rendimiento/counterparty on the list, on top of a seam that already validates every rule | Slice B | `pnpm vitest run tests/unit/account-form-render.test.tsx` | Manual: create one `investment` and one `loaned` account via `/cuentas` against local Supabase, verify list card shows rendimiento (gain and loss) and counterparty | Revert `AccountForm.tsx`, `actions.ts`, `account-repository.ts`, `/cuentas` card changes — Slice A (DB + contracts) is unaffected, both types remain creatable via RPC |

---

## Slice A — DB + Contracts (~430 lines)

### (a) Database

- [x] A-001 — Migration: `supabase/migrations/20260804090019_finance_account_types.sql`
  (renumbered from `...018` to `...019` — `...018` was taken by the independently-branched
  `feat/finance-transaction-subtypes` change; confirmed via `git ls-tree` before naming the file)
  - **Design-time step first**: confirm the live type-CHECK constraint name via the `pg_constraint`
    query in design.md §1.1 (expected `accounts_type_check`); record the confirmation in a comment
    above the DROP, do not guess the name.
  - DROP+ADD `accounts_type_check` widened to 8 literals (design.md §1.1).
  - `derive_account_class()` — site (a): add `investment`/`loaned` to the asset branch, `raise`
    catch-all untouched (design.md §1.3).
  - Two detail tables `account_investment_details`, `account_loaned_details` (design.md §1.2).
  - `create_account()` — site (b): **DROP+CREATE** (not `create or replace` — different arg list
    produces a second overload), 7 new `p_*` params (no reuse across type branches), two new
    `v_has_*` flags extending every existing exclusivity test, two new validation branches, the
    **separate, inverted** `loaned` sign guard immediately after the existing liability guard
    (never appended to its `in (...)` list), two new detail inserts with `coalesce` defaults
    (design.md §1.4, Decisions 1-3).
  - `update_investment_value()` — new seam: ownership assert, reject negative, no transaction write
    (design.md §1.5, Decision 8).
  - Grants — rewrite `create_account`'s grant to the 20-argument signature, append
    `update_investment_value` grant (design.md §1.6).
  - Satisfies: `Eight Account Types`, `Investment Account Detail`, `Loaned Account Detail`,
    `Loaned Account Balance-Sign Guard`, `Account-Type Knowledge Consistency` (DB sites).
  - Depends on: none. Parallel: sequential (must land before A-002, A-003).

- [x] A-002 — Migration: `supabase/migrations/20260804090020_finance_account_types_security.sql`
  (renumbered from `...019` to `...020`, same collision as A-001)
  - RLS enable + SELECT policy (`can_read_account`) + `grant select` for both new detail tables
    (design.md §1.7). No implicit grant exists (`alter default privileges ... revoke`), so the
    explicit grant is required or reads silently return zero rows.
  - Depends on: A-001. Parallel: sequential.

- [x] A-003 — pgTAP: `supabase/tests/040_finance_money.sql` (modify) — plan(30) → plan(50), 20 new
  assertions, all verified passing via `docker exec supabase_db_LIFE_OS psql`
  - Update header prose from "six types" to eight, and the plan count, or the suite fails on plan
    mismatch.
  - Class derivation: insert one account of each of the 8 types, assert read-back `class`
    (`investment`/`loaned` ⇒ `'asset'`). Pins site (a).
  - Sign guards (the named regression): `loaned` with a **positive** balance accepted; with a
    **negative** one raises `22023`; `credit_card`/`liability` still reject positive (Decision 1
    pin).
  - Detail exclusivity: `investment` without cost basis raises; `loaned` without/blank counterparty
    raises; `investment` carrying loan/goal/loaned detail raises; the 6 original types unaffected.
  - Defaults: `investment` created with `current_value` omitted ⇒ `current_value_cents =
    cost_basis_cents`, `valued_on = current_date`.
  - Value seam: `update_investment_value()` updates value + `valued_on`, writes zero transactions,
    rejects non-`investment`/foreign-household/non-member.
  - CHECK domain: `type = 'crypto'` still rejected; resolved constraint name matches the dropped one.
  - No regression: `household_summary`/`account_balances` output for pre-existing fixture data
    unchanged.
  - Satisfies: `Eight Account Types`, `Investment Account Detail`, `Loaned Account Detail`,
    `Loaned Account Balance-Sign Guard`, `Balance and Summary Views Unaffected`.
  - Depends on: A-002. Parallel: sequential.

### (b) TypeScript Contracts

- [x] A-004 [RED] — `tests/unit/account-domain.test.ts` (create): failing test asserting
  `deriveAccountClass` returns `'asset'` for both new types, `includedInAvailableCents` true for
  both, `requiresInvestmentDetail`/`requiresLoanedDetail` are exact, and an exhaustiveness assertion
  that `ASSET_TYPES` and the `AccountType` union share no mismatched member. Fails: `domain/account.ts`
  still has 6 literals.
  - Satisfies (drives): `Account-Type Knowledge Consistency` (TS domain scenario).
  - Depends on: A-001 (mirrors the trigger it pins). Parallel: sequential.

- [x] A-005 [GREEN] — `src/modules/finance/domain/account.ts` (modify) — site (c): read the whole
  file first (26 lines). Extend `AccountType` union to 8 literals, add both to `ASSET_TYPES`, add
  `requiresInvestmentDetail`/`requiresLoanedDetail` — implemented to satisfy A-004. No edit needed to
  `deriveAccountClass`/`includedInAvailableCents` bodies (they read `ASSET_TYPES`).
  - Depends on: A-004. Parallel: sequential.

- [x] A-006 — `src/modules/finance/api/index.ts:107` (modify) — site (d): replace the duplicate
  literal `AccountType` union with `export type { AccountType } from "../domain/account"`
  (Decision 5 — collapses one of the 7 duplication sites permanently).
  - Depends on: A-005. Parallel: yes, independent of A-007/A-008.

- [x] A-007 [RED] — `tests/unit/create-account-schema.test.ts` (create): failing test —
  `CreateAccountInputSchema` accepts a well-formed `investment` branch and a well-formed `loaned`
  branch, rejects a `loaned` with an empty/blank `counterpartyName`, rejects an `investment` carrying
  a `loaned` block. Fails: schema has no `investment`/`loaned` discriminated-union members yet.
  - Satisfies (drives): `Loaned Account Detail` (rejection scenario), `Account-Type Knowledge
    Consistency` (API schema scenario).
  - Depends on: A-006. Parallel: sequential.

- [x] A-008 [GREEN] — `src/modules/finance/api/index.ts:123` (modify) — site (e): two new
  discriminated-union branches (`investment`: `costBasisCents`/`currentValueCents`/`valuedOn`;
  `loaned`: `counterpartyName`/`originalAmountCents`/`termMonths`/`expectedReturnDate`), per
  design.md §3 — implemented to satisfy A-007.
  - Depends on: A-007. Parallel: sequential.

- [x] A-009 — `src/modules/finance/api/index.ts:271` (modify) — site (f): inline class computation
  `class: deriveAccountClass(i.type)` replacing the two-way ternary; extend the `.rpc()` call with
  the 7 new `p_*` arguments mirroring design.md §1.4/§3; add `updateInvestmentValue(input)` returning
  `Result<void>` with the same `mapPgError` shape as `createAccount`.
  - Satisfies: `Account-Type Knowledge Consistency` (class-computation scenario), `Investment Account
    Detail` (update-value scenario), `Eight Account Types` (both derive-asset scenarios).
  - Depends on: A-008. Parallel: sequential.

- [x] A-010 — `tests/unit/account-api-class.test.ts` (created, per the "or" option): unit test
  (mocked Supabase client, no DB) that `createAccount()`'s returned `class` is `'asset'` for both
  new types (site (f) regression pin) and `updateInvestmentValue()` maps `22023` through
  `mapPgError` the same way `createAccount` does. 4/4 pass.
  - Depends on: A-009. Parallel: sequential (closes out Slice A).

**Deviation (not a task, required to keep Slice A standalone-buildable)**: widening `AccountType`
(A-005) makes `src/app/(app)/cuentas/actions.ts`'s pre-existing `else` fallback branch fail
`tsc --noEmit` — `CreateAccountInput`'s new `investment`/`loaned` members require a detail object
the pre-Slice-B form never submits. Added a minimal guard branch (`type === "investment" ||
type === "loaned"` → return `VALIDATION_ERROR`) so Slice A compiles alone, per design.md's own
"each slice must have... clear finish, autonomous scope, verification" contract. This is NOT
B-004's real `investment`/`loaned` action branches — those still land in Slice B.

---

## Slice B — UI (~330 lines, stacked on Slice A)

### (c) Account Read Path

- [x] B-001 — `src/modules/finance/data/account-repository.ts` (modify): two more parallel
  `.in("account_id", ids)` selects against `account_investment_details`/`account_loaned_details`,
  extend `AccountListItem` with both optional detail blocks (design.md §1, "read path" of the 7-site
  checklist — omitting this renders the new types with no detail block).
  - Satisfies: `Account-Type Knowledge Consistency` (read-path scenario).
  - Depends on: A-010 (consumes the finalized `AccountType`/detail shapes). Parallel: yes,
    independent of B-002/B-003 until B-006.

### (d) AccountForm

- [x] B-002 [RED] — `tests/unit/account-form-render.test.tsx` (create or extend): failing RTL test —
  selecting "Inversiones"/"Prestado" reveals the matching fieldset and hides the others; the `loaned`
  sign hint reads "Para dinero prestado, el saldo inicial debe ser cero o positivo." and the input
  carries `min={0}`; the investment helper text names manual capture ("la app no consulta precios de
  mercado"). Fails: `TYPE_LABELS` has 6 entries, no `investment`/`loaned` fieldsets exist yet.
  - Satisfies (drives): `Account-Type Knowledge Consistency` (form scenario), `Loaned Account
    Balance-Sign Guard` (client-hint scenario, mirrors the DB guard).
  - Depends on: A-010. Parallel: sequential.

- [x] B-003 [GREEN] — `src/app/(app)/cuentas/AccountForm.tsx` (modify): `TYPE_LABELS` adds
  `investment: "Inversiones"`, `loaned: "Prestado"`; extract `signHintFor(type)` helper making the
  opening-balance hint three-way (debt types `max={0}`, `loaned` `min={0}` + inverted copy,
  unconstrained otherwise); two new fieldsets after the goal block per design.md §6 field lists —
  implemented to satisfy B-002.
  - Depends on: B-002. Parallel: sequential.

- [x] B-004 — `src/app/(app)/cuentas/actions.ts` (modify, `:29-80`): two new `else if` branches
  (`investment`, `loaned`) before the final `else`, using the existing `toOptionalCents` helper, per
  design.md §6. No new `ERROR_COPY` key needed (`22023` already maps to `ACCOUNT_DETAIL_REQUIRED`).
  - Satisfies: `Investment Account Detail`, `Loaned Account Detail` (creation-flow scenarios).
  - Depends on: B-003. Parallel: yes, parallel with B-001/B-005 once B-003 lands.

### (e) Cuentas List

- [x] B-005 — `src/app/(app)/cuentas/page.tsx` (or list card component, per design.md §6 "/cuentas
  list"): render rendimiento (`current_value_cents − balance_cents`, shown as gain **or loss**,
  never clamped) plus `valued_on` for `investment`, and `counterparty_name` for `loaned`.
  - Satisfies: `Account-Type Knowledge Consistency` (read-path rendering scenario).
  - Depends on: B-001, B-004. Parallel: sequential (closes out Slice B).

---

## Dependency Summary (critical path)

```
A-001 (migration schema) → A-002 (security) → A-003 (pgTAP)                       [Slice A, DB]
A-001 → A-004 [RED] → A-005 [GREEN] (domain/account.ts)
A-005 → A-006 (re-export union, site d)
A-006 → A-007 [RED] → A-008 [GREEN] (CreateAccountInputSchema, site e)
A-008 → A-009 (inline class + rpc args + updateInvestmentValue, site f) → A-010 (regression pin)  [Slice A closes]
A-010 → B-001 (account-repository read path)
A-010 → B-002 [RED] → B-003 [GREEN] (AccountForm)
B-003 → B-004 (actions.ts)                          [parallel with B-001 once B-003 lands]
B-001, B-004 → B-005 (cuentas list rendering, last)                                [Slice B closes]
```

A-001/A-002/A-003 (migration + pgTAP) are not TDD gates — they are their own proof layer, matching
the `finance-categories-icon-color`/`finance-budgets` precedent. A-004, A-007, and B-002 ARE explicit
RED-first gates: they cover the design's named pure-logic and assertable-UI surfaces (type-union
exhaustiveness, schema branch validation, form fieldset reveal + sign-hint text) and must fail before
their GREEN implementation task lands.
