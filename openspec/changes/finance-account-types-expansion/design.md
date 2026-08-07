# Design: Finance Account Types — Inversiones & Prestado

> **Size note**: the `sdd-design` skill sets an 800-word budget. As in
> `finance-categories-icon-color/design.md` and `archive/finance-budgets/design.md`, the
> orchestrator's task contract for this change explicitly requires DDL for two detail tables, the
> exact edit to each of six type-knowledge sites, `pg_constraint` verification guidance, form/action
> shapes, and a PR-slicing assessment. The explicit contract wins.
>
> **Inputs**: `proposal.md` (+ Engram `sdd/finance-account-types-expansion/proposal`). Product
> assumptions already encoded there (manual valuation only, no market data, cost-basis headline,
> free-text counterparty, no interest on `prestado`) are fixed constraints and are not re-litigated.
> Conventions inherited verbatim from `20260804090005/6/8` and `20260804090012`.

## Technical Approach

Widen an existing bounded domain; invent nothing. `finance.accounts.type` grows from 6 to 8 literals
(`investment`, `loaned`), both deriving `class = 'asset'` through the **unchanged** trigger mechanism.
Two detail tables mirror `account_liability_details` / `account_goal_details` exactly — same
`account_id` PK, same `on delete cascade`, same `can_read_account()` SELECT policy, same "written only
by the definer seam" rule. `create_account()` gains one validation branch and one detail insert per
new type. One new seam function, `update_investment_value()`, exists because an investment's current
value is the single mutable detail field in the whole accounts subsystem.

The entire risk of this change is **drift**: the account-type domain is duplicated across six sites
(§4). The design's job is to make that update mechanical and ordered, and to collapse one of the six
duplications permanently (Decision 5).

## 1. Migrations

Two files, following the established `*_schema` / `*_security` split:

| File | Contents |
|---|---|
| `supabase/migrations/20260804090018_finance_account_types.sql` | Type CHECK DROP+ADD, `derive_account_class()` replace, 2 detail tables, `create_account()` DROP+CREATE, `update_investment_value()`, both grants |
| `supabase/migrations/20260804090019_finance_account_types_security.sql` | RLS enable + SELECT policy + `grant select` for the 2 new tables |

> **Numbering**: `…017` is taken by the unmerged `finance-categories-icon-color` change. These two
> changes are independent and branch from the same base; if that change merges second, its `…017`
> still applies cleanly (different tables). Do not renumber either at apply time.

### 1.1 Type CHECK — verify the constraint name FIRST

The constraint at `20260804090005_finance_schema.sql:14-15` is an **inline, unnamed** CHECK, so its
name is Postgres-generated. `20260804090012_finance_recurring.sql:46-53` records the exact precedent:
its comment states the name was *confirmed against the local stack* before the DROP was written.

Do the same before writing this migration — this is a mandatory design-time step, not a suggestion:

```sql
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'finance.accounts'::regclass and contype = 'c';
```

Expected: `accounts_type_check`. **If it differs, use the returned name.** Record the confirmation in
a comment above the DROP, in the same voice as migration 12. A guessed name fails the migration at
apply time with `constraint … does not exist`.

```sql
alter table finance.accounts drop constraint accounts_type_check;   -- name confirmed via pg_constraint
alter table finance.accounts add  constraint accounts_type_check
  check (type in ('cash','checking','credit_card','savings','liability','savings_goal',
                  'investment','loaned'));
```

Purely widening: every existing row satisfies the new predicate, so validation cannot fail and no
backfill exists.

### 1.2 Detail tables

```sql
create table finance.account_investment_details (
  account_id           uuid primary key references finance.accounts(id) on delete cascade,
  cost_basis_cents     bigint not null check (cost_basis_cents >= 0),
  current_value_cents  bigint not null check (current_value_cents >= 0),
  valued_on            date   not null default current_date
);

create table finance.account_loaned_details (
  account_id             uuid primary key references finance.accounts(id) on delete cascade,
  counterparty_name      text   not null check (length(btrim(counterparty_name)) between 1 and 60),
  original_amount_cents  bigint not null check (original_amount_cents > 0),
  term_months            int    check (term_months > 0),          -- optional, no interest column
  expected_return_date   date                                     -- optional
);
```

`counterparty_name` reuses the 1–60 `btrim` length shape of `accounts.name`. `term_months` and
`expected_return_date` are **nullable** — unlike `account_liability_details`, where all five columns
are `not null` — because a personal loan usually has no schedule (proposal Business Rule, Q3
assumption: no interest, no schedule enforcement). There is deliberately **no** `interest_rate_bp`.

`current_value_cents` is `not null`; the seam defaults it to `cost_basis_cents` when the caller omits
it, which is what makes "rendimiento reads 0, never NULL" structural rather than a UI concern.

### 1.3 `derive_account_class()` — site (a)

Read `20260804090005_finance_schema.sql:50-66` in full before editing. The **only** change is adding
both literals to the existing asset branch. The `else raise 'unknown account type'` arm stays — it is
the failure that would fire if this site were missed, and it must keep firing for a genuinely unknown
type:

```sql
if new.type in ('cash','checking','savings','savings_goal','investment','loaned') then
  new.class := 'asset';
elsif new.type in ('credit_card','liability') then
  new.class := 'liability';
else
  raise exception 'unknown account type: %', new.type using errcode = '22023';
end if;
```

The trigger `accounts_derive_class` and its `before insert or update of type` binding are untouched.

### 1.4 `create_account()` — site (b)

**DROP before CREATE — mandatory.** `create or replace` with new defaulted parameters produces a
*second overload*, not a replacement, because the argument list differs. PostgREST calls this RPC with
**named** arguments and would then fail with "could not choose the best candidate function". The old
`grant execute` also stays attached to the stale overload. So:

```sql
drop function finance.create_account(uuid, text, text, bigint, text, int,
                                     bigint, int, int, bigint, date, bigint, date);
create function finance.create_account( … ) …
```

Seven new parameters, appended after the goal block. **No parameter is reused across type branches** —
`loaned` gets its own `p_loaned_amount_cents` / `p_loaned_term_months` rather than borrowing
liability's `p_original_amount_cents` / `p_term_months`, so the mutually-exclusive `v_has_*` flags stay
mechanical and a mis-shaped submit cannot be silently accepted by the wrong branch:

```sql
  -- investment detail: cost basis required when p_type = 'investment', all null otherwise
  p_cost_basis_cents      bigint default null,
  p_current_value_cents   bigint default null,
  p_valued_on             date   default null,
  -- loaned detail: counterparty + amount required when p_type = 'loaned', all null otherwise
  p_counterparty_name     text   default null,
  p_loaned_amount_cents   bigint default null,
  p_loaned_term_months    int    default null,
  p_expected_return_date  date   default null)
```

Two new flags beside the existing `v_has_liab` / `v_has_goal`:

```sql
v_has_inv   boolean := p_cost_basis_cents is not null or p_current_value_cents is not null
                    or p_valued_on is not null;
v_has_loan  boolean := p_counterparty_name is not null or p_loaned_amount_cents is not null
                    or p_loaned_term_months is not null or p_expected_return_date is not null;
```

Every existing exclusivity test must be extended, not just the new ones — the `liability` branch's
`or v_has_goal` becomes `or v_has_goal or v_has_inv or v_has_loan`, and likewise for `savings_goal`.
The final `elsif v_has_liab or v_has_goal` catch-all becomes a four-way disjunction. Two new branches:

```sql
elsif p_type = 'investment' then
  if p_cost_basis_cents is null or v_has_liab or v_has_goal or v_has_loan then
    raise exception 'investment accounts require a cost basis and no other detail'
      using errcode = '22023';
  end if;
elsif p_type = 'loaned' then
  if p_counterparty_name is null or btrim(p_counterparty_name) = ''
     or p_loaned_amount_cents is null or v_has_liab or v_has_goal or v_has_inv then
    raise exception 'loaned accounts require a counterparty and amount, and no other detail'
      using errcode = '22023';
  end if;
```

**The balance-sign guard — the highest-risk edit in the change.** The existing guard
(`20260804090008:60-63`) is:

```sql
if p_type in ('credit_card','liability') and p_opening_balance_cents > 0 then
  raise exception 'a liability opening balance is zero or negative' using errcode = '22023';
end if;
```

`loaned` must **not** be added to that `in (…)` list. It gets its own, separate, **inverted** guard
immediately after it:

```sql
-- a receivable is money owed TO the household: the exact inverse of the liability rule above
if p_type = 'loaned' and p_opening_balance_cents < 0 then
  raise exception 'a loaned opening balance is zero or positive' using errcode = '22023';
end if;
```

`investment` gets no guard at all (it behaves like `cash`/`savings`). Detail inserts append two
`elsif` arms mirroring the liability/goal ones, with
`coalesce(p_current_value_cents, p_cost_basis_cents)` and `coalesce(p_valued_on, current_date)`.

### 1.5 `update_investment_value()` — new seam

```sql
create function finance.update_investment_value(
  p_household_id uuid, p_account_id uuid, p_current_value_cents bigint,
  p_valued_on date default null)
returns void language plpgsql security definer set search_path = '' as $$
```

Body: `perform core.assert_member(p_household_id)`; assert the account exists, belongs to
`p_household_id`, and has `type = 'investment'` (raise `22023` otherwise — never trust the client's
account id); reject a negative value; `update finance.account_investment_details set
current_value_cents = …, valued_on = coalesce(p_valued_on, current_date) where account_id = …`.
Display-only: it writes **no** transaction (proposal Q1 assumption — an unrealized valuation is not
income).

### 1.6 Grants — site (b), second half

`20260804090008_finance_api.sql:373-382` lists every seam function by its **full argument signature**.
`create_account`'s entry must be rewritten to the 20-argument list, and the new seam appended:

```sql
grant execute on function
  finance.create_account(uuid, text, text, bigint, text, int, bigint, int, int, bigint, date,
                         bigint, date, bigint, bigint, date, text, bigint, int, date),
  finance.update_investment_value(uuid, uuid, bigint, date),
  …unchanged entries…
  to authenticated;
```

Missing this makes every account creation fail with `permission denied for function create_account` —
the single most likely "it worked locally last week" regression in this change.

### 1.7 Security migration

```sql
alter table finance.account_investment_details enable row level security;
alter table finance.account_loaned_details     enable row level security;

create policy account_investment_details_select on finance.account_investment_details
  for select to authenticated using (finance.can_read_account(account_id));
create policy account_loaned_details_select on finance.account_loaned_details
  for select to authenticated using (finance.can_read_account(account_id));

grant select on finance.account_investment_details, finance.account_loaned_details to authenticated;
```

The `alter default privileges … revoke` in `20260804090006:63-64` means new tables get **no** implicit
grant, so the explicit `grant select` is required. SELECT only: writes stay seam-exclusive, exactly
like the two existing detail tables.

## 2. Data Flow

```
AccountForm (client)  ──type──▶  fieldset branch (investment | loaned)
        │ FormData
        ▼
cuentas/actions.ts  ──▶  CreateAccountInput (Zod discriminated union)
        │
        ▼
finance/api createAccount()  ──rpc──▶  finance.create_account()
                                            ├─ assert_member
                                            ├─ detail-exclusivity check
                                            ├─ sign guard  (liability: >0 ✗ | loaned: <0 ✗)
                                            ├─ insert accounts ──▶ TRIGGER derive_account_class ⇒ 'asset'
                                            └─ insert account_{investment,loaned}_details

/cuentas list ◀── account-repository ◀── accounts + account_balances + 4 detail tables
                       rendimiento = current_value_cents − balance_cents   (derived, never stored)
```

## 3. TypeScript Contracts

`src/modules/finance/domain/account.ts` — site (c), read the whole file first (26 lines):

```ts
export type AccountType =
  | "cash" | "checking" | "credit_card" | "savings" | "liability" | "savings_goal"
  | "investment" | "loaned";

const ASSET_TYPES: ReadonlySet<AccountType> =
  new Set(["cash", "checking", "savings", "savings_goal", "investment", "loaned"]);

export function requiresInvestmentDetail(t: AccountType) { return t === "investment"; }
export function requiresLoanedDetail(t: AccountType)     { return t === "loaned"; }
```

`deriveAccountClass` / `includedInAvailableCents` need **no** edit: they read `ASSET_TYPES`. The
file's header comment ("pure mirror of the trigger") stays literally true only if (a) and (c) move
together.

`src/modules/finance/api/index.ts` — sites (d), (e), (f):

```ts
// (d) line 107 — was a duplicate literal union; now the domain is the single TS source of truth
export type { AccountType } from "../domain/account";

// (e) line 123 — two new branches on the discriminated union
z.object({ ...BaseAccountFields, type: z.literal("investment"),
  investment: z.object({
    costBasisCents: z.number().int().nonnegative(),
    currentValueCents: z.number().int().nonnegative().optional(),
    valuedOn: z.string().optional(),
  }) }),
z.object({ ...BaseAccountFields, type: z.literal("loaned"),
  loaned: z.object({
    counterpartyName: z.string().trim().min(1).max(60),
    originalAmountCents: z.number().int().positive(),
    termMonths: z.number().int().positive().optional(),
    expectedReturnDate: z.string().optional(),
  }) }),

// (f) line 271 — inline class computation inside createAccount()'s return value
class: deriveAccountClass(i.type),   // was: i.type === "credit_card" || i.type === "liability" ? …
```

Plus, in the same function, two `const` extractions and seven `p_*` arguments on the `.rpc()` call,
mirroring lines 248-264.

`api/index.ts` also gains `updateInvestmentValue(input)` — same `Result<T>` + `mapPgError` shape as
`createAccount`, returning `Result<void>`.

## 4. The Six-Site Checklist — apply in THIS order

Order matters: each step's failure mode is caught by the next step's test run, and moving TS before
SQL produces a build that compiles and then fails at runtime.

| # | Site | Exact edit | Failure if missed |
|---|---|---|---|
| a | `20260804090005:50-66` `derive_account_class()` (§1.3) — **read in full first** | add 2 literals to the asset branch | `raise 'unknown account type'` — every insert hard-fails |
| b | `20260804090008:44-63` `create_account()` (§1.4) **+ its grant at :374** (§1.6) | DROP+CREATE, 7 params, 2 flags, 2 branches, inverted sign guard, 2 detail inserts, rewritten grant signature | detail rows never written; **negative `loaned` balance accepted → net worth inverts**; or `permission denied for function` |
| c | `domain/account.ts` (§3) — **read the whole file first** | union + `ASSET_TYPES` + 2 `requires*Detail` helpers | client preview renders an asset account as debt |
| d | `api/index.ts:107` `AccountType` union | replace the literal union with a re-export from `domain` | type error, or a silently narrower public union |
| e | `api/index.ts:123` `CreateAccountInputSchema` | 2 new discriminated-union branches | `VALIDATION_ERROR` before the request ever leaves the app |
| f | `api/index.ts:271` inline class computation | `deriveAccountClass(i.type)` | seam returns `class:"liability"` for both new types |

Also required, outside the six (read path, slice B): `data/account-repository.ts` must fetch both new
detail tables and extend `AccountListItem` — otherwise the new types render with no detail block.

## 5. Key Decisions

| # | Decision | Rejected alternative | Rationale |
|---|---|---|---|
| 1 | `loaned` gets its own asset-branch guard, inverted (`< 0` raises) | add `'loaned'` to the existing `in ('credit_card','liability')` list | The two rules are exact opposites. Reusing the liability list is a one-token edit that silently inverts household net worth — the change's highest-impact failure, and the reason the guard is a *separate statement* rather than a widened list |
| 2 | Dedicated `p_loaned_*` params; zero reuse of liability params | reuse `p_original_amount_cents` / `p_term_months` | Shared params make `v_has_liab` true for a `loaned` submit, so exclusivity checks stop being mechanical and the wrong branch can accept a mis-shaped payload |
| 3 | DROP + CREATE `create_account()` | `create or replace` | Different arg list ⇒ a second overload, not a replacement. PostgREST's named-argument call then fails to choose a candidate, and the old grant stays on the stale overload |
| 4 | Manual `current_value_cents` + `valued_on`; rendimiento derived | store rendimiento; price-history table; any quote source | Explicit non-goal. A stored derived figure drifts the moment either input changes; the project's whole balance layer is already derived (`account_balances`) |
| 5 | `api/index.ts` re-exports `AccountType` from `domain` | keep two parallel literal unions | Permanently removes one of the six duplication sites at the cost of one line. The public export name is unchanged, so `cuentas/actions.ts` and every other consumer are unaffected |
| 6 | Two separate detail tables | one table with nullable columns for both; extend `account_liability_details` | Mirrors the existing `liability`/`goal` split, keeps every column `not null` where it is genuinely required, and keeps a receivable structurally distinct from a debt |
| 7 | `term_months` / `expected_return_date` nullable on `loaned` | mirror liability's all-`not null` shape | A personal loan usually has no schedule; forcing one produces fake data. No `interest_rate_bp` column at all (proposal Q3) |
| 8 | `update_investment_value()` writes no transaction | post an income/expense adjustment | An unrealized valuation is not income (proposal Q1). Posting one would inflate the month summary with money that was never received |
| 9 | Headline keeps `balance_cents` (cost basis); rendimiento shown separately | count investments at current value in `available_cents` | "Dinero disponible" stays a *cash-availability* figure (proposal Q2). Requires **no** change to `household_summary` / `account_balances` — those key off `class`, which is why this change touches zero views |

## 6. UI Layer

### `AccountForm.tsx` (Modify)

- `TYPE_LABELS` (`:15-22`): `investment: "Inversiones"`, `loaned: "Prestado"`. The `Select` renders
  from `Object.entries(TYPE_LABELS)`, so the dropdown needs no other edit (Radix `select.tsx`
  convention, never a native `<select>`).
- Opening-balance hint (`:70-76`): today it is a two-way `credit_card || liability` test. It becomes
  three-way — `max={0}` + "debe ser cero o negativo" for the debt types; `min={0}` + **"Para dinero
  prestado, el saldo inicial debe ser cero o positivo."** for `loaned`; unconstrained otherwise.
  Extract a small `signHintFor(type)` helper rather than nesting ternaries, so the mirror of §1.4's
  two guards is readable at a glance.
- Two new fieldsets after the goal block (`:131`), same
  `flex flex-col gap-3 rounded-card border border-border p-4` + `<legend>` shape:
  - `investment` — legend "Inversión": `costBasis` (number, step .01, required),
    `currentValue` (number, step .01, optional, helper text **"Valor actual, capturado por ti — la
    app no consulta precios de mercado."**), `valuedOn` (date, optional).
  - `loaned` — legend "Datos del préstamo": `counterpartyName` (text, required, maxLength 60,
    placeholder "¿Quién te debe?"), `originalAmount` (number, step .01, required),
    `termMonths` (number, min 1, optional), `expectedReturnDate` (date, optional).

### `actions.ts` (Modify, `:29-80`)

Two `else if` branches in the existing chain, before the final `else`, using the existing
`toOptionalCents` helper:

```ts
} else if (type === "investment") {
  const valuedOn = String(formData.get("valuedOn") ?? "");
  input = { ...base, type, investment: {
    costBasisCents: toOptionalCents(formData.get("costBasis")) ?? 0,
    currentValueCents: toOptionalCents(formData.get("currentValue")),
    valuedOn: valuedOn || undefined,
  } };
} else if (type === "loaned") {
  const expected = String(formData.get("expectedReturnDate") ?? "");
  const term = Number(formData.get("termMonths") ?? 0);
  input = { ...base, type, loaned: {
    counterpartyName: String(formData.get("counterpartyName") ?? "").trim(),
    originalAmountCents: toOptionalCents(formData.get("originalAmount")) ?? 0,
    termMonths: term > 0 ? term : undefined,
    expectedReturnDate: expected || undefined,
  } };
}
```

`ERROR_COPY` needs no new key — both new raises use `22023`, which already maps to
`ACCOUNT_DETAIL_REQUIRED`; its copy already covers "or the opening balance is invalid".

### `/cuentas` list (Modify)

`account-repository.ts` gains two more parallel `.in("account_id", ids)` selects and two optional
blocks on `AccountListItem`. The card shows rendimiento (`current_value − balance`, rendered as a gain
**or a loss** — never clamped) plus `valued_on`, and the counterparty name for `loaned`.

## 7. Testing Strategy

| Layer | What is tested | Tooling |
|---|---|---|
| DB — class derivation | Insert one account of **each of the 8 types**; assert the read-back `class`. `investment` and `loaned` ⇒ `'asset'`. Pins site (a) | pgTAP |
| DB — sign guards (the named regression) | `loaned` with a **positive** opening balance is **accepted**; with a negative one **raises** `22023`. Symmetrically re-assert `credit_card`/`liability` still reject positive. This pair is what catches Decision 1 being violated | pgTAP |
| DB — detail exclusivity | `investment` with no cost basis raises; `loaned` with no counterparty (and with a blank one) raises; `investment` carrying loan/goal/loaned detail raises; the 6 original types still create with their existing detail blocks unchanged | pgTAP |
| DB — defaults | Creating an `investment` with `current_value` omitted ⇒ `current_value_cents = cost_basis_cents` and `valued_on = current_date`, so rendimiento is `0`, never NULL | pgTAP |
| DB — value seam | `update_investment_value()` updates value + `valued_on`; **writes zero transactions**; rejects a non-`investment` account, a foreign-household account, and a non-member caller | pgTAP |
| DB — CHECK domain | `type = 'crypto'` still rejected after widening; the constraint name resolved from `pg_constraint` matches what the migration dropped | pgTAP |
| DB — no regression | `household_summary` / `account_balances` output for pre-existing fixture data is unchanged after the migration | pgTAP |
| Unit — domain | `deriveAccountClass` returns `'asset'` for both new types; `includedInAvailableCents` true for both; `requires*Detail` helpers exact; the `ASSET_TYPES` set and the `AccountType` union have no member the other lacks (exhaustiveness) | Vitest |
| Unit — api | `CreateAccountInputSchema` accepts both new branches, rejects a `loaned` with an empty counterparty and an `investment` carrying a `loaned` block; `createAccount()`'s returned `class` is `'asset'` for both (site (f)) | Vitest |
| RTL | `AccountForm`: selecting Inversiones/Prestado reveals the right fieldset and hides the others; the `loaned` hint says **zero or positive** and the input carries `min={0}`; the investment helper text names manual capture | Vitest + Testing Library |
| Static gates | `pnpm verify` — ESLint boundaries (`app → api` only; `domain` pure), `tsc --noEmit`, `next build` | `pnpm verify` |

The `supabase/tests/040_finance_money.sql` header currently reads "six types" — update the prose along
with the plan count, or the suite fails on plan mismatch.

## Threat Matrix

**N/A** — no routing, shell command, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary is introduced. The real adversarial surface is application-level and is
covered explicitly: direct PostgREST RPC calls bypassing the form (every rule lives in the definer,
tested by pgTAP), cross-household writes via a forged `account_id` on `update_investment_value()`
(§1.5 ownership assert, tested), and client-supplied `class` (structurally impossible — the trigger
overwrites it and the column is never in any insert list).

## Migration / Rollout

Deploy **migrations first, then app**. A pre-migration app is unaffected (it never sends the new
types); a post-migration DB with a pre-deploy app is also fine (the widened CHECK is a superset). The
reverse order breaks: a deployed app offering "Inversiones" against an un-migrated DB fails at the
CHECK. No backfill — zero rows of either type exist.

Down path, valid **only while no row of either type exists**: `drop function
finance.update_investment_value(…)`; `drop table finance.account_investment_details,
finance.account_loaned_details`; DROP+ADD the type CHECK back to 6 literals; restore the prior
`derive_account_class()` and `create_account()` bodies (and the prior grant signature) from
`…005` / `…008`. Once real accounts of either type exist, delete or retype them first or the CHECK
narrowing fails validation.

## PR Slicing — 1000-line review budget

Estimated **~760 authored lines** total. That fits one PR under this session's 1000-line budget, but a
single PR would mix PL/pgSQL, RLS, TS contracts, and React in one review pass — and the DB half is
independently verifiable. Two stacked slices, per the `finance-categories-icon-color` / `finance-budgets`
convention (PR #1 → feature branch, PR #2 → PR #1):

| Slice | Contents | Est. lines | Standalone value |
|---|---|---|---|
| **A — DB + contracts** | Both migrations (§1), pgTAP (§7 DB rows), sites (a)–(f): `domain/account.ts`, `api/index.ts` union + Zod + class + `updateInvestmentValue`, domain/api unit tests | ~430 | Both types are creatable and correctly classed **server-side**, with the inverted guard proven, before any UI can reach them |
| **B — UI** | `AccountForm` labels + hint helper + 2 fieldsets, `actions.ts` 2 branches, `account-repository` 2 selects + type, `/cuentas` card rendering, RTL tests | ~330 | The user-facing screen, on top of a seam that already validates every rule |

Slice A is the one that must not be split further: the six sites are the atomicity boundary of this
change, and separating the SQL from the TS union produces a compiling build that fails at runtime.

## Open Questions

None blocking. Two implementation-time verifications (not assumptions to design around):

- [ ] Confirm the live `accounts` type-CHECK constraint name via the `pg_constraint` query in §1.1
      **before** writing the DROP. Do not assume `accounts_type_check`.
- [ ] Confirm `drop function finance.create_account(…13 args…)` matches the deployed signature exactly
      (`\df finance.create_account`); a mismatched drop leaves the stale overload and PostgREST then
      cannot resolve the RPC.
