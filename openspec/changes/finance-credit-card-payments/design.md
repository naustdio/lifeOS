# Design: Credit Card Balance Visibility & Auto-Pay

> **Size note**: the `sdd-design` skill sets an 800-word budget. As in `finance-categories-icon-color/design.md`
> and `archive/finance-budgets/design.md`, the orchestrator's task contract for this change explicitly
> requires DDL-level schema, an exact idempotency SQL shape, RPC control flow, screen shapes, and a
> §-style testing table. The explicit contract wins.
>
> **Inputs**: `proposal.md` (owner-confirmed: optional card terms, fixed auto-pay amount, proposal-not-
> autopost, day-of-month integers, no `available_cents` netting). `specs/` is authored in parallel by
> `sdd-spec`; this design is derived from `proposal.md` and the shipped migrations directly.
> Conventions inherited verbatim from `20260804090005_finance_schema.sql`, `..._finance_api.sql`,
> and `..._finance_recurring_api.sql`.

## Technical Approach

Two independent seams, deliberately not coupled:

1. **Card terms** are descriptive metadata in a new **optional** 1:1 table under **plain RLS** — the same
   documented exception as `finance.categories` / budgets / recurring definitions. They participate in no
   balance invariant, so no `SECURITY DEFINER` seam and, critically, **no change to `finance.create_account`'s
   13-parameter signature**.
2. **Auto-pay** is a `type` discriminator on `recurring_transactions` plus a branch inside the existing
   `confirm_recurring_transaction()` definer, reusing the proven `transfer_group_id` pair and the `:out`/`:in`
   idempotency-suffix idea from `record_transfer` — but with a **stronger** insert shape (§3).

Derived numbers (days-until-due, utilization, over-limit) live in a `security_invoker` view mirrored by a
pure TS module, exactly as `account_balances` / `budget_progress` / `recurring_due` already do.

## 1. Migration — `20260804090018_finance_credit_cards.sql`

```sql
-- §1a. Optional card terms. 1:1, cascade-deleted with the account, gated to credit cards.
create table finance.account_credit_card_details (
  account_id           uuid primary key references finance.accounts(id) on delete cascade,
  credit_limit_cents   bigint check (credit_limit_cents is null or credit_limit_cents > 0),
  statement_day        int    check (statement_day between 1 and 31),
  due_day              int    check (due_day between 1 and 31),
  min_payment_cents    bigint check (min_payment_cents is null or min_payment_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger account_credit_card_details_touch_updated_at
  before update on finance.account_credit_card_details
  for each row execute function core.touch_updated_at();

-- Type gate as a trigger, not a CHECK: a CHECK cannot reference finance.accounts.
create or replace function finance.enforce_card_detail_account_type() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from finance.accounts a
                  where a.id = new.account_id and a.type = 'credit_card') then
    raise exception 'card terms apply only to credit_card accounts' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger account_credit_card_details_type_gate
  before insert or update of account_id on finance.account_credit_card_details
  for each row execute function finance.enforce_card_detail_account_type();
```

Every column except `account_id` is nullable: a card may carry a limit with no due day, or a due day with
no limit. Absence of the whole row is the normal state for every existing card — **no backfill**.

```sql
-- §1b. recurring_transactions gains a shape discriminator.
alter table finance.recurring_transactions
  add column type text not null default 'expense' check (type in ('expense','transfer')),
  add column to_account_id uuid references finance.accounts(id) on delete restrict,
  alter column category_id drop not null;

-- Mirrors tx_transfer_has_no_category / tx_category_required on finance.transactions.
alter table finance.recurring_transactions
  add constraint recurring_expense_shape check (
    type <> 'expense' or (category_id is not null and to_account_id is null)),
  add constraint recurring_transfer_shape check (
    type <> 'transfer' or (category_id is null and to_account_id is not null
                           and to_account_id <> account_id));
```

`default 'expense'` makes the ALTER a no-op for every existing definition, and both shape constraints are
satisfied by every existing row (`category_id` was `NOT NULL`), so validation cannot fail on deploy.

```sql
-- §1c. Due-date derivation. Clamp is the whole point: due_day 31 in February is the 28th/29th.
create or replace function finance.clamp_day_to_month(p_day int, p_month_start date)
returns date language sql immutable as $$
  select p_month_start + (least(p_day,
    extract(day from (p_month_start + interval '1 month - 1 day'))::int) - 1);
$$;

create or replace function finance.next_card_due_date(p_due_day int, p_from date)
returns date language sql immutable as $$
  select case
    when p_due_day is null then null
    when finance.clamp_day_to_month(p_due_day, date_trunc('month', p_from)::date) >= p_from
      then finance.clamp_day_to_month(p_due_day, date_trunc('month', p_from)::date)
    else finance.clamp_day_to_month(p_due_day,
           (date_trunc('month', p_from) + interval '1 month')::date)
  end;
$$;

-- §1d. The read surface. security_invoker = true — 4th occurrence of the project's hard rule.
create view finance.credit_card_status with (security_invoker = true) as
select a.id as account_id, a.household_id, a.name,
       b.balance_cents,
       -b.balance_cents                                     as owed_cents,   -- liability sign flip
       d.credit_limit_cents, d.statement_day, d.due_day, d.min_payment_cents,
       finance.next_card_due_date(d.due_day, current_date)  as next_due_date,
       (finance.next_card_due_date(d.due_day, current_date) - current_date) as days_until_due,
       case when d.credit_limit_cents is null or d.credit_limit_cents = 0 then null
            else ((-b.balance_cents) * 10000 / d.credit_limit_cents)::int end as utilization_bp,
       (d.credit_limit_cents is not null and -b.balance_cents > d.credit_limit_cents) as over_limit,
       (d.account_id is not null)                           as has_terms
from finance.accounts a
join finance.account_balances b on b.account_id = a.id
left join finance.account_credit_card_details d on d.account_id = a.id
where a.type = 'credit_card' and a.archived_at is null;
```

Every derived column is `NULL`-safe when the detail row is absent — `has_terms = false` is the empty state
the UI renders, never `NaN`.

`20260804090019_finance_credit_cards_security.sql`: `alter table ... enable row level security`;
`select`/`insert`/`update`/`delete` policies all `using (finance.can_read_account(account_id))`, plus
`grant select, insert, update, delete on finance.account_credit_card_details to authenticated`. Delete is
granted here (unlike `finance.categories`) because removing terms is a real user action with no history to
preserve. The view inherits RLS from its base tables through `security_invoker`.

## 2. Migration — `20260804090020_finance_recurring_transfer_api.sql`

**The signature does not change.** `confirm_recurring_transaction(uuid, bigint, date, text) returns uuid`
covers the transfer case unchanged: from/to accounts come from the definition, and the return stays a single
`uuid` (the **out** leg's transaction id, not the group id — see Decision 4). Therefore `create or replace`
is legal and no `GRANT`/PostgREST reload is required.

> **Hard rule inherited from the sibling changes in this batch** (`finance-account-types-expansion`,
> `finance-transaction-subtypes`): `create or replace function` **cannot** add, remove, rename, or retype a
> parameter — it creates a second overload, and PostgREST then fails with *"could not choose the best
> candidate function"* (or `42725`). It also cannot change the return type (`42P13`). If implementation
> discovers a parameter is unavoidable, the migration MUST be
> `drop function finance.confirm_recurring_transaction(uuid, bigint, date, text);` → `create function ...` →
> `grant execute on function finance.confirm_recurring_transaction(<new sig>) to authenticated;` →
> `notify pgrst, 'reload schema';` — never `create or replace`. **Design intent is to avoid needing this.**

### 2.1 Control flow

```
confirm_recurring_transaction(p_recurring_id, p_amount_cents, p_occurred_on, p_description)
  │
  ├─ select * into v_def ... for update      ← UNCHANGED. Serializes concurrent confirms.
  ├─ core.assert_member(v_def.household_id)  ← UNCHANGED. Still the opener.
  ├─ active check, v_due := v_def.next_due_date (BEFORE advancing), amount > 0
  │
  ├─ if v_def.type = 'transfer'
  │     ├─ guard: to_account_id not null, <> account_id, and BOTH accounts resolve
  │     │         to v_def.household_id and are not archived            (§2.3)
  │     └─ ONE multi-row INSERT, 2 legs, suffixed keys                  (§2.2)
  │
  └─ else  (type = 'expense')
        └─ the CURRENT single INSERT, byte-identical, key = v_due::text  ← must NOT change
  │
  ├─ advance cursor (only when rows were actually inserted)
  └─ return uuid
```

### 2.2 The idempotency mechanism — the core design decision

```sql
v_group_id := gen_random_uuid();
v_out_key  := v_due::text || ':out';
v_in_key   := v_due::text || ':in';

with ins as (
  insert into finance.transactions
    (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
     created_by_user_id, transfer_group_id, origin_module, origin_entity_id, idempotency_key,
     recurring_id)
  values
    (v_def.household_id, v_def.account_id,    null, 'transfer', -abs(v_amount),
     v_on, v_desc, v_actor, v_group_id, 'recurring', p_recurring_id::text, v_out_key,
     p_recurring_id),
    (v_def.household_id, v_def.to_account_id, null, 'transfer',  abs(v_amount),
     v_on, v_desc, v_actor, v_group_id, 'recurring', p_recurring_id::text, v_in_key,
     p_recurring_id)
  on conflict (household_id, origin_module, origin_entity_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id, amount_cents
)
select count(*)::int, min(id) filter (where amount_cents < 0) into v_count, v_id from ins;

if v_count = 1 then
  -- Structurally unreachable (the two keys are inserted by ONE statement and can only
  -- conflict with a committed pair, which conflicts on BOTH). Fail closed anyway: the
  -- raise aborts the transaction, so the orphan leg is never committed.
  raise exception 'recurring transfer would post a half pair' using errcode = '40001';
elsif v_count = 0 then
  -- Honest replay, or lost the row lock race: the winner committed both legs before
  -- releasing the definition lock, so this SELECT is guaranteed to see them.
  select id into v_id from finance.transactions
   where household_id = v_def.household_id and origin_module = 'recurring'
     and origin_entity_id = p_recurring_id::text and idempotency_key = v_out_key;
  return v_id;                          -- cursor already advanced by the winning call
end if;
-- v_count = 2: advance the cursor, return the out-leg id.
```

**Why this guarantees both properties:**

| Property | Mechanism |
|---|---|
| (a) A duplicate/concurrent confirm never double-posts | Each leg's key is `<due_date>:out` / `<due_date>:in`, derived from the **pre-advance** `next_due_date` — so a replay of the same occurrence produces the *same two keys*, and the partial unique index `tx_idempotency (household_id, origin_module, origin_entity_id, idempotency_key)` rejects both. `do nothing` yields `v_count = 0` and the replay resolves to the already-posted pair. A *concurrent* call blocks on the existing `select … for update` on the definition row, so it never even reaches the INSERT until the winner has committed. |
| (b) Both legs post together or neither does | Two guarantees stacked. **Statement-level**: a multi-row `INSERT … VALUES (a),(b)` is ONE statement executed under one snapshot and one command id — no other session can ever observe leg 1 without leg 2, because visibility is granted at transaction commit, not per row. **Transaction-level**: a PostgREST `.rpc()` call is a single implicit transaction, so any `raise` (the `v_count = 1` guard, the account guards, an FK/CHECK violation on either leg) rolls back *everything*, including the cursor advance. There is no code path that commits one leg. |

**Deliberate divergence from `record_transfer`.** That function uses *two sequential* `INSERT`s with an
early return when the first conflicts. Because `ON CONFLICT DO NOTHING` does not block on a concurrently
inserted-but-uncommitted row, its recovery `SELECT` can find nothing and return `NULL`. Here that hole is
closed twice over: the definition row lock serializes callers, and the single-statement INSERT removes the
inter-statement window entirely. `record_transfer` is untouched by this change; the shape is not copied.

**The expense branch keeps the bare `v_due::text` key — no suffix.** Suffixing it would make every
already-posted historical occurrence non-conflicting on replay, i.e. it would silently re-post them. This is
the single most dangerous edit available in this file and is called out as a named pgTAP regression.

### 2.3 Tenancy inside the definer

`security definer` + `set search_path = ''` are unchanged, and `core.assert_member(v_def.household_id)`
remains the opener. The transfer branch adds, before the INSERT:

```sql
if not exists (select 1 from finance.accounts a where a.id = v_def.to_account_id
                and a.household_id = v_def.household_id and a.archived_at is null)
   or not exists (select 1 from finance.accounts a where a.id = v_def.account_id
                and a.household_id = v_def.household_id and a.archived_at is null) then
  raise exception 'both transfer accounts must belong to this household' using errcode = '42501';
end if;
```

RLS is bypassed inside a definer, so both accounts are re-validated against `v_def.household_id` explicitly —
the definition's own FK does not constrain `to_account_id` to the same household.

## 3. Domain & Data Layer

| File | Change |
|---|---|
| `src/modules/finance/domain/account.ts` | `supportsCardDetail(type) => type === "credit_card"`, beside `requiresLiabilityDetail` |
| `src/modules/finance/domain/credit-card.ts` **(new)** | Pure mirrors of §1c/§1d: `clampDueDay`, `nextDueDate`, `daysUntilDue`, `utilizationBp`, `isOverLimit`. Framework-free, no `server-only` — client components import it for previews |
| `src/modules/finance/domain/recurring.ts` | `RecurringType = "expense" \| "transfer"`; `validateRecurringShape(input)` mirroring the two CHECKs |
| `src/modules/finance/data/account-repository.ts` | `listCreditCardStatus(supabase, householdId)` over `finance.credit_card_status`; `upsertCardDetails` / `removeCardDetails` (plain RLS, `budget-repository.ts` shape, `Number()` every bigint, degrade to `[]`/`{ error }`) |
| `src/modules/finance/data/recurring-repository.ts` | `type`/`to_account_id` in the select and in `RecurringListItem`/`DueRecurringItem`; `categoryId: string \| null`; create/update accept the transfer variant |
| `src/modules/finance/api/index.ts` | Re-export the new reads/writes (ESLint boundary: `app` may only import `api/`). **`createAccount` and its RPC call are untouched** |

`ConfirmRecurringInputSchema` and `confirmRecurring()` need **zero** changes — the RPC signature is stable.
The recurring create input becomes a Zod discriminated union on `type`, mirroring `CreateAccountInputSchema`:

```ts
export const CreateRecurringInputSchema = z.discriminatedUnion("type", [
  z.object({ ...BaseRecurringFields, type: z.literal("expense"),
             categoryId: z.string().uuid() }),
  z.object({ ...BaseRecurringFields, type: z.literal("transfer"),
             toAccountId: z.string().uuid() }),   // categoryId structurally absent
]);
```

## 4. UI

**`cuentas/AccountForm.tsx`** — a third conditional fieldset beside the existing `liability` / `savings_goal`
blocks, gated on `supportsCardDetail(type)`. All four inputs optional; `statement_day` / `due_day` are Radix
`Select`s of 1–31 (never a native `<select>` — standing project convention), limit and minimum payment are
`Input type="number"`. Submitting the fieldset empty writes **no** detail row. Because card terms are a
separate table under plain RLS, the action is two steps: `createAccount()` then `upsertCardDetails()`; a
failure of step 2 leaves a valid card with no terms — the defined empty state, not a broken account.

**`cuentas/page.tsx` + row component** — each card row gains `Vence en N días` (or `Vencido hace N días`) and
a `used / limit` bar with an `over_limit` warning chip. `has_terms = false` renders
`Sin términos configurados · Agregar` — a link, never a crash or `NaN`.

**`page.tsx` (dashboard)** — beside the existing `debt_cents` card, a **"Por pagar pronto"** figure summing
`owed_cents` for cards with `days_until_due between 0 and 7`, plus an overdue count. `available_cents` and the
assets-only hero rule are **not** touched.

**`recurrentes/RecurringForm.tsx`** — a leading `Tipo` Select (`Gasto` / `Pago de tarjeta`). `expense` keeps
today's Cuenta + Categoría. `transfer` swaps Categoría for `Tarjeta destino` (options filtered to
`class = 'liability'`) and relabels Cuenta as `Cuenta origen`. Amount copy states it is a **fixed amount per
occurrence**, not the statement balance.

**`recurrentes/RecurringList.tsx` + `ConfirmRecurringSheet.tsx`** — transfer rows render `Origen → Destino`
with no category chip, and the confirm sheet states explicitly that confirming posts the payment (auto-pay
proposes; it never posts silently).

## 5. Key Decisions

| # | Decision | Rejected alternative | Rationale |
|---|---|---|---|
| 1 | New optional `account_credit_card_details` table | reuse/widen `account_liability_details` | That table is amortizing-loan-shaped (`term_months`, `interest_rate_bp`) and required-on-create for `liability`. Cards need cyclical + revolving fields and must stay optional with zero backfill |
| 2 | Card terms under **plain RLS**, not through `create_account` | add 4 params to `finance.create_account` | Adding parameters means `DROP FUNCTION` on a 13-arg signature + re-GRANT + PostgREST reload, and a two-overload window if anything is missed (`42725`). Card terms guard no balance invariant, so the categories/budgets plain-RLS exception applies. Cost: a non-atomic two-step create — acceptable precisely because terms are optional |
| 3 | Per-leg key suffixes `:out`/`:in` in **one multi-row INSERT** | two sequential INSERTs (`record_transfer`'s shape); a single shared key with `on conflict do nothing`; an advisory lock | A shared key would make leg 2 conflict with leg 1 and silently post a **half transfer**. Sequential INSERTs reopen `record_transfer`'s window where the recovery SELECT can miss an uncommitted concurrent pair. One statement + the existing row lock closes both |
| 4 | `returns uuid` = the **out** leg's id | return `transfer_group_id`; `returns table` | Changing the return type requires `DROP FUNCTION` (`42P13`) and breaks `confirmRecurring()`'s `ok({ id: data as string })`. The out-leg id is a real transaction id, so every existing caller keeps working verbatim |
| 5 | Expense branch keeps the **unsuffixed** key | suffix both branches for symmetry | Every already-posted recurring transaction carries `idempotency_key = <date>`. Suffixing would make each historical occurrence replayable — a mass double-post. Asymmetry is the safe choice |
| 6 | `type` discriminator with `default 'expense'` + two shape CHECKs | a nullable `to_account_id` alone, inferring type | Inference makes `category_id is null and to_account_id is null` representable. An explicit discriminator with mirrored CHECKs (matching `tx_category_required` / `tx_transfer_has_no_category`) makes the invalid shape unstorable |
| 7 | Derived card numbers in a `security_invoker` view | compute in TS from raw rows | 4th occurrence of the project's hard view convention; keeps the dashboard aggregate a single query and prevents the due-date clamp drifting between server and client (the TS module is a tested *mirror*, not a second authority) |
| 8 | Account-type gate as a trigger | a `CHECK` on the detail table | A `CHECK` cannot reference another table. Same reasoning as `enforce_category_shape()` |

## 6. File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/20260804090018_finance_credit_cards.sql` | Create | §1a–§1d: detail table, type-gate trigger, recurring ALTERs + 2 CHECKs, date helpers, `credit_card_status` view |
| `supabase/migrations/20260804090019_finance_credit_cards_security.sql` | Create | RLS + 4 policies + grants on the detail table |
| `supabase/migrations/20260804090020_finance_recurring_transfer_api.sql` | Create | `create or replace confirm_recurring_transaction` with the transfer branch (§2) |
| `supabase/tests/0xx_finance_credit_cards.sql` | Create | pgTAP per §7 |
| `supabase/tests/*_finance_recurring.sql` | Modify | pgTAP: pair atomicity, replay, concurrency, expense-branch regression |
| `src/modules/finance/domain/account.ts` | Modify | `supportsCardDetail()` |
| `src/modules/finance/domain/credit-card.ts` | Create | Pure clamp / next-due / utilization / over-limit |
| `src/modules/finance/domain/recurring.ts` | Modify | `RecurringType`, `validateRecurringShape` |
| `src/modules/finance/data/account-repository.ts` | Modify | `listCreditCardStatus`, `upsertCardDetails`, `removeCardDetails` |
| `src/modules/finance/data/recurring-repository.ts` | Modify | `type` / `to_account_id`, nullable `categoryId` |
| `src/modules/finance/data/index.ts`, `api/index.ts` | Modify | Re-exports + `CreateRecurringInputSchema` union |
| `src/app/(app)/cuentas/AccountForm.tsx` | Modify | Card-terms fieldset (Radix Selects for the two days) |
| `src/app/(app)/cuentas/page.tsx`, `actions.ts` | Modify | Due/limit row surfacing; two-step create action |
| `src/app/(app)/page.tsx` | Modify | "Por pagar pronto" signal |
| `src/app/(app)/recurrentes/RecurringForm.tsx` | Modify | Type Select + transfer branch |
| `src/app/(app)/recurrentes/RecurringList.tsx`, `ConfirmRecurringSheet.tsx` | Modify | Transfer row rendering + confirm copy |
| `tests/unit/credit-card-domain.test.ts` | Create | Clamp / utilization / over-limit |
| `tests/unit/recurring-form-render.test.tsx`, `account-form-render.test.tsx` | Create/Modify | RTL branch coverage |

## 7. Testing Strategy

| Layer | What is tested | Tooling |
|---|---|---|
| **DB — pair atomicity** | Confirming a `type='transfer'` definition posts **exactly 2** rows, opposite signs, sum 0, one shared `transfer_group_id`, `category_id is null`, both with `recurring_id` set. Forcing a failure on the second leg (FK violation on `to_account_id`) leaves **zero** rows and an **unadvanced** cursor | pgTAP |
| **DB — replay** | Calling confirm twice for the same occurrence (cursor manually reset to the same `next_due_date`) posts **nothing new**, returns the same out-leg id, and never leaves an odd row count. `count(*) filter (where transfer_group_id = g)` stays exactly 2 | pgTAP |
| **DB — concurrency** | Two sessions confirm the same definition; the second blocks on `for update`. Assert exactly one pair, exactly one cursor advance, no `NULL` return. The named test for Decision 3 | pgTAP (2 connections) |
| **DB — no half transfer** | Pre-insert a row occupying `<due>:in` only, then confirm: the statement must raise (`40001`) and leave the pre-existing row untouched with **no** `:out` sibling. The named test for the `v_count = 1` guard | pgTAP |
| **DB — expense regression** | An existing `type='expense'` definition's confirm produces a byte-identical result to today: one row, `idempotency_key = <due>::text` **unsuffixed**, category set, cursor advanced. Fails if Decision 5 is violated | pgTAP |
| **DB — shape constraints** | `type='transfer'` with a `category_id` rejected; with `to_account_id is null` rejected; with `to_account_id = account_id` rejected; `type='expense'` with `category_id is null` rejected; existing rows all satisfy the new CHECKs | pgTAP |
| **DB — tenancy** | A `to_account_id` in another household raises `42501` inside the definer despite RLS bypass; a non-member cannot select/insert/update/delete `account_credit_card_details`; `anon` zero rows; the `credit_card_status` view leaks no other household (`security_invoker` proof) | pgTAP |
| **DB — card terms** | Detail row on a non-`credit_card` account rejected by the trigger; deleting the account cascades the detail row; a card with no detail row still appears in `credit_card_status` with `has_terms = false` and all-NULL derived columns | pgTAP |
| **DB — day clamp** | `next_card_due_date(31, '2026-02-10')` → `2026-02-28`; leap year → `2028-02-29`; day 15 when today is the 20th → next month; day 20 when today is the 20th → today | pgTAP |
| **Unit — domain** | `credit-card.ts` mirrors the SQL exactly (same fixture table as the pgTAP clamp test); `utilizationBp` returns `null` on a null/zero limit, never `NaN` or `Infinity`; `validateRecurringShape` rejects both invalid shapes | Vitest |
| **RTL** | `AccountForm`: the card fieldset appears only for `credit_card`, all fields optional, days are Radix Selects. `RecurringForm`: switching to `Pago de tarjeta` hides Categoría and shows Tarjeta destino; destination options exclude the source account. `/cuentas` row: a card with no terms renders the empty state, not `NaN` | Vitest + Testing Library |
| **Static gates** | `pnpm verify` — ESLint boundaries (`app → api/` only, `domain` pure), `tsc --noEmit`, `check-tokens.mjs`, `next build` | `pnpm verify` |

## Threat Matrix

**N/A** — no routing, shell command, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary is introduced. The genuine adversarial surface is data-level and is covered
explicitly: cross-household `to_account_id` injection into a `SECURITY DEFINER` that bypasses RLS (§2.3,
tested), direct-PostgREST writes bypassing the form (§1b CHECKs + the type-gate trigger, tested), replayed
and concurrent RPC calls (§2.2, tested), and view-level tenancy leakage (`security_invoker`, tested).

## Migration / Rollout

Deploy **migrations first, then app** — the app's selects reference `type` / `to_account_id` /
`credit_card_status`, so the reverse order breaks reads. Every DDL statement is additive or a constraint
relaxation; no existing row is mutated and no `NOT NULL` is retrofitted.

Down path, in two independent halves:

```sql
-- Card terms (fully independent, no transaction touched)
drop view finance.credit_card_status;
drop table finance.account_credit_card_details;             -- cascades the trigger
drop function finance.next_card_due_date(int, date), finance.clamp_day_to_month(int, date);

-- Auto-pay (order matters: transfer definitions must go before category_id is re-tightened)
create or replace function finance.confirm_recurring_transaction(uuid, bigint, date, text) …;
  -- ^ restore the pre-change body verbatim; signature is identical, so no DROP/GRANT/reload
delete from finance.recurring_transactions where type = 'transfer';
alter table finance.recurring_transactions
  drop constraint recurring_transfer_shape, drop constraint recurring_expense_shape,
  drop column to_account_id, drop column type,
  alter column category_id set not null;
```

Transactions already posted by auto-pay are ordinary `type='transfer'` rows with a valid
`transfer_group_id`; they survive rollback intact and keep balancing. `account_balances`,
`household_summary`, and the assets-only hero rule are never touched.

### PR Slicing — 1000-line review budget

Estimated **~1,200 authored lines**, exceeding the budget. Three stacked slices (PR #1 → feature branch,
PR #2 → PR #1, PR #3 → PR #2), following the `finance-categories-icon-color` convention. **Slice A ships
first and alone** — it carries the entire idempotency risk and the heaviest test load, and reviewing it
next to UI diff noise is exactly what the guard exists to prevent.

| Slice | Contents | Est. lines | Standalone value |
|---|---|---|---|
| **A — recurring transfer core** | §1b ALTERs + CHECKs, §2 migration (confirm branch), `domain/recurring.ts`, full pgTAP set (atomicity, replay, concurrency, half-pair, expense regression, tenancy) | ~450 | An auto-pay definition inserted by hand confirms into a correct, idempotent, tenant-safe pair. Provable with zero UI |
| **B — card terms data + reads** | §1a/§1c/§1d, security migration, `domain/credit-card.ts`, `account-repository.ts`, re-exports, card pgTAP + domain unit tests | ~350 | Card terms are storable, tenant-safe, and queryable; clamp is proven in both SQL and TS |
| **C — UI** | `AccountForm` fieldset, `/cuentas` row surfacing, dashboard signal, `RecurringForm` transfer mode, list + confirm sheet, RTL tests | ~400 | The three screens, on top of a data layer that already works |

If slice A overruns, split the DDL + shape CHECKs (A1) from the confirm-function rewrite + its pgTAP (A2);
A2 depends on A1 but A1 stands alone and is trivially reviewable.

## Open Questions

None blocking. Three implementation-time verifications (not assumptions to design around):

- [ ] Confirm the exact generated CHECK constraint name if any existing `recurring_transactions` constraint
      must be dropped (`select conname from pg_constraint where conrelid = 'finance.recurring_transactions'::regclass`),
      the same way `20260804090012:51` confirmed `transactions_origin_module_check`.
- [ ] Confirm `pg_get_functiondef` shows exactly **one** `confirm_recurring_transaction` overload after the
      migration — the `42725` guard from the sibling changes, asserted in pgTAP.
- [ ] Confirm the two-session pgTAP concurrency test is expressible in the project's harness; if not, fall
      back to a scripted two-connection integration test rather than dropping the coverage.
