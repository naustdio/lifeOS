# Design: Finance Recurring — Reminded Fixed Expenses

> **Size note**: the `sdd-design` skill sets an 800-word budget. As in the archived
> `lifeos-foundation` and `finance-budgets` designs, the orchestrator's task contract for this
> change explicitly requires DDL-level schema, exact definer-function bodies, and a §11-style
> testing table. The explicit contract wins.
>
> **Inputs**: `proposal.md` (decided and NOT re-litigated here: table shape, cursor-not-queue model,
> two new `SECURITY DEFINER` seam functions for confirm/discard, reuse of the `tx_idempotency`
> index, `origin_module` CHECK widening, confirm-date-defaults-to-original-due-date, pause/resume
> jumping to a future occurrence, delete-sets-null, the "Más" nav overflow scope expansion).
> `specs/` was not present at design time; the proposal's requirement list is the equivalent input.
> Conventions inherited verbatim from `archive/lifeos-foundation/design.md` §3–§5/§9,
> `archive/finance-budgets/design.md` §1–§8, and the shipped migrations `…0005_finance_schema.sql`,
> `…0006_finance_security.sql`, `…0008_finance_api.sql`, `…0010/0011_finance_budgets*.sql`.

## Technical Approach

A recurring definition is **configuration** (plain RLS CRUD, exactly `finance.budgets`); confirming
one is a **money seam** (two writes that must not diverge, exactly `record_transaction`). The
cursor is a single `next_due_date` column — there is no occurrence table, no queue, and therefore
nothing to reconcile.

Three migrations, mirroring the shipped schema / security / api split:

| # | File | Contents |
|---|---|---|
| 12 | `*_finance_recurring.sql` | `finance.recurring_transactions` + index + `updated_at` trigger, `finance.advance_due_date()`, `finance.recurring_due` view, the two ALTERs on `finance.transactions` |
| 13 | `*_finance_recurring_security.sql` | RLS enable + 4 policies, 2 grants |
| 14 | `*_finance_recurring_api.sql` | `confirm_recurring_transaction`, `discard_recurring_occurrence`, EXECUTE grants |

`finance/api/index.ts` gains functions and one widened union; no existing signature changes.

---

## 1. `finance.recurring_transactions` (DDL)

```sql
-- A recurring expense DEFINITION plus its single due-date cursor. Never an occurrence log:
-- one row per definition, forever. `next_due_date` is the only mutable schedule state.
create table finance.recurring_transactions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  account_id   uuid not null references finance.accounts(id)   on delete restrict,
  category_id  uuid not null references finance.categories(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),   -- POSITIVE magnitude, see below
  description  text not null default '' check (length(description) <= 200),
  frequency    text not null check (frequency in ('monthly','weekly','biweekly','yearly')),
  next_due_date date not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Serves BOTH reads: the definition list (`where household_id = $1`, leading column) and the
-- due/banner query (`where household_id = $1 and active and next_due_date <= current_date`).
create index on finance.recurring_transactions (household_id, next_due_date) where active;

create trigger recurring_transactions_touch_updated_at
  before update on finance.recurring_transactions
  for each row execute function core.touch_updated_at();
```

`amount_cents > 0` is a **positive magnitude**, deliberately unlike `finance.transactions.amount_cents`
(signed, §3.3): a definition is a template, not a ledger row, and the sign is derived at confirm
time exactly as `record_transaction` derives it from `p_kind`. Expense-only this cycle, so no
`kind` column — the frequency domain and the expense-only rule are both closed sets in the proposal.

`on delete restrict` on `account_id`/`category_id` matches `finance.transactions` and the locked
"accounts/categories are archived, never hard-deleted" decision.

**Index decision (the proposal deferred this — resolved: YES, add it).** The partial index above
mirrors the shipped `finance.accounts (household_id) where archived_at is null` precedent. The due
query runs on **every Home render** (the banner), which makes it the highest-frequency read in the
app; `(household_id, next_due_date) where active` is a covering range scan for it and its leading
column also serves the plain list. One small btree on a table of tens of rows per space is the
cheaper side of the tradeoff. No separate `(household_id)` index is added — redundant with this one.

No cross-table `enforce_*` trigger is added here, unlike `finance.budgets`: the household/kind
assertions live in the confirm seam (§4), which is the only path that can turn a definition into
money. A mis-scoped definition created via direct PostgREST is inert until confirmed, and confirm
rejects it.

## 2. `finance.transactions` — the two ALTERs

```sql
-- `recurring_id` already ships as an unconstrained nullable uuid ("reserved column, unused this
-- cycle", …0005_finance_schema.sql:177). This change gives it its purpose; it is CONSTRAINED, not
-- created. `on delete set null` matches how a deleted definition must behave: already-posted
-- transactions keep their history and simply lose the back-reference (proposal, Delete).
alter table finance.transactions
  add constraint transactions_recurring_id_fkey
  foreign key (recurring_id) references finance.recurring_transactions(id) on delete set null;

-- Widen the origin domain by exactly one additive value. The current constraint is an inline
-- CHECK on the column, named by Postgres `transactions_origin_module_check`
-- (`check (origin_module in ('manual','shopping_list','car_control'))`, …0005:172-173).
-- Existing rows all satisfy the wider predicate, so no validation failure is possible.
alter table finance.transactions drop constraint transactions_origin_module_check;
alter table finance.transactions add  constraint transactions_origin_module_check
  check (origin_module in ('manual','shopping_list','car_control','recurring'));
```

The constraint name MUST be verified at implementation time with
`\d+ finance.transactions` / `select conname from pg_constraint where conrelid = 'finance.transactions'::regclass`
before the migration is written — an inline unnamed CHECK gets an auto-generated name, and dropping
the wrong one silently removes a different invariant. This is the one implementation-time lookup in
this design (see §13).

`tx_origin_requires_keys` (`origin_module = 'manual' or (origin_entity_id is not null and
idempotency_key is not null)`) is **untouched and load-bearing** for this change: it is what forces
every `'recurring'` row to carry both keys, which is what makes §4's idempotency reachable.

## 3. `finance.advance_due_date()` + `finance.recurring_due` (DDL)

```sql
-- Single source of schedule truth on the SQL side; called by BOTH seam functions so confirm and
-- discard can never drift. Plain (invoker) immutable sql — no `security definer`, therefore no
-- `set search_path = ''` (that pairing is required only for definer functions, §4.1); the body is
-- fully schema-qualified-free (built-ins only) and depends on no table.
create or replace function finance.advance_due_date(p_date date, p_frequency text)
returns date language sql immutable as $$
  select (p_date + case p_frequency
                     when 'monthly'  then interval '1 month'
                     when 'weekly'   then interval '7 days'
                     when 'biweekly' then interval '15 days'   -- exactly 15 days, NOT "2 weeks"
                     when 'yearly'   then interval '1 year'
                   end)::date;
$$;
```

Postgres `date + interval '1 month'` **clamps** (`2026-01-31 → 2026-02-28`, `2028-01-29 →
2028-02-29`) and `+ interval '1 year'` clamps `2028-02-29 → 2029-02-28`. That is exactly the
behavior §6's TS `nextDueDate` must reproduce, byte for byte, because both compute the same cursor.

```sql
-- CRITICAL: `security_invoker = true`. Without it the view runs as its OWNER and silently bypasses
-- RLS on finance.recurring_transactions — the Supabase `security_definer_view` data-leak footgun.
-- This is the THIRD occurrence of this exact footgun in this repo (account_balances /
-- household_summary, budget_progress, now this): it is a HARD PROJECT CONVENTION, not a choice.
-- A regular view is required; materialized views do not honor RLS at all.
create view finance.recurring_due with (security_invoker = true) as
select r.id as recurring_id,
       r.household_id,
       r.account_id,
       r.category_id,
       r.amount_cents,
       r.description,
       r.frequency,
       r.next_due_date,
       (current_date - r.next_due_date) as days_overdue   -- 0 on the due date itself
from finance.recurring_transactions r
where r.active
  and r.next_due_date <= current_date;
```

Named `recurring_due` rather than `recurring_transactions_due`: the row is a *due definition*, not a
transaction, and the shorter name matches `budget_progress`/`household_summary`. `days_overdue` is
exposed from the view **and** recomputed purely in TS (§6) — the view value drives server-rendered
copy, the pure function drives client-side re-render without a round trip; §11 pins them together.

## 4. The two seam functions (DDL)

```sql
-- Confirm: ONE transaction, atomically, for the CURRENT due date — then advance the cursor.
create or replace function finance.confirm_recurring_transaction(
  p_recurring_id  uuid,
  p_amount_cents  bigint default null,   -- null = use the definition's amount
  p_occurred_on   date   default null,   -- null = use the ORIGINAL next_due_date (proposal)
  p_description   text   default null)   -- null = use the definition's description
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_def    finance.recurring_transactions;
  v_due    date;
  v_amount bigint;
  v_id     uuid;
begin
  -- Lock the definition row: two concurrent confirms must serialize, or both could read the same
  -- `next_due_date`, and the second would advance the cursor twice for one posted transaction.
  select * into v_def from finance.recurring_transactions
   where id = p_recurring_id for update;
  if not found then
    raise exception 'recurring definition not found' using errcode = 'P0002';
  end if;

  perform core.assert_member(v_def.household_id);          -- same opener as every seam function

  if not v_def.active then
    raise exception 'cannot confirm a paused recurring definition' using errcode = '22023';
  end if;

  -- CRITICAL ORDERING: read the CURRENT next_due_date into v_due BEFORE advancing. The
  -- idempotency key is derived from it, so a replay of the SAME occurrence must produce the SAME
  -- key. Deriving the key after the update (or from current_date) would make every replay a new
  -- key and re-post the expense — the exact double-post this design exists to prevent.
  v_due    := v_def.next_due_date;
  v_amount := coalesce(p_amount_cents, v_def.amount_cents);

  if v_amount <= 0 then
    raise exception 'amount must be a positive magnitude' using errcode = '22023';
  end if;

  insert into finance.transactions
    (household_id, account_id, category_id, type, amount_cents, occurred_on, description,
     created_by_user_id, origin_module, origin_entity_id, idempotency_key, recurring_id)
  values
    (v_def.household_id, v_def.account_id, v_def.category_id, 'expense', -abs(v_amount),
     coalesce(p_occurred_on, v_due), coalesce(p_description, v_def.description),
     (select auth.uid()), 'recurring', p_recurring_id::text, v_due::text, p_recurring_id)
  on conflict (household_id, origin_module, origin_entity_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is null then                    -- lost the race, or an honest replay
    select id into v_id from finance.transactions
     where household_id = v_def.household_id and origin_module = 'recurring'
       and origin_entity_id = p_recurring_id::text and idempotency_key = v_due::text;
    return v_id;                          -- cursor already advanced by the winning call
  end if;

  update finance.recurring_transactions
     set next_due_date = finance.advance_due_date(v_due, v_def.frequency),
         updated_at    = now()
   where id = p_recurring_id;

  return v_id;
end $$;

-- Discard: advance the cursor by exactly one period, insert NOTHING.
create or replace function finance.discard_recurring_occurrence(p_recurring_id uuid)
returns date language plpgsql security definer set search_path = '' as $$
declare v_def finance.recurring_transactions; v_next date;
begin
  select * into v_def from finance.recurring_transactions
   where id = p_recurring_id for update;
  if not found then
    raise exception 'recurring definition not found' using errcode = 'P0002';
  end if;

  perform core.assert_member(v_def.household_id);

  if not v_def.active then
    raise exception 'cannot discard on a paused recurring definition' using errcode = '22023';
  end if;

  v_next := finance.advance_due_date(v_def.next_due_date, v_def.frequency);

  update finance.recurring_transactions
     set next_due_date = v_next, updated_at = now()
   where id = p_recurring_id;

  return v_next;
end $$;

grant execute on function
  finance.confirm_recurring_transaction(uuid, bigint, date, text),
  finance.discard_recurring_occurrence(uuid),
  finance.advance_due_date(date, text)
  to authenticated;
```

Both are `security definer set search_path = ''` and both open with `perform core.assert_member(…)`
— the established convention (§4.3: each definer re-implements the policy it bypasses). The
idempotency block is copied from `record_transaction` verbatim in shape:
`INSERT … ON CONFLICT … DO NOTHING RETURNING id INTO v_id;` then `IF v_id IS NULL THEN SELECT …`.
The key triple is `('recurring', <definition id>, <the due date being confirmed>)`, so **the second
confirm of the same occurrence returns the first transaction and advances nothing** — the early
`return` inside the null branch is what guarantees the cursor is not advanced twice.

`p_recurring_id` is passed as `p_recurring_id::text` for `origin_entity_id` (a `text` column) *and*
as a real `uuid` for the new `recurring_id` column; both are set on purpose — origin keys carry
idempotency, `recurring_id` carries the FK relationship.

## 5. RLS and Grants

```sql
alter table finance.recurring_transactions enable row level security;
```

| Table / view | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `finance.recurring_transactions` | `core.is_member(household_id)` | `core.is_member(household_id)` | `core.is_member(household_id)` (USING + WITH CHECK) | `core.is_member(household_id)` — hard delete is data-safe: the only dependent is `transactions.recurring_id`, which is `on delete set null` |
| `finance.recurring_due` | inherits the table's policy via `security_invoker` | n/a (view) | n/a | n/a |

```sql
create policy recurring_transactions_select on finance.recurring_transactions
  for select to authenticated
  using (core.is_member(household_id));

create policy recurring_transactions_insert on finance.recurring_transactions
  for insert to authenticated
  with check (core.is_member(household_id));

create policy recurring_transactions_update on finance.recurring_transactions
  for update to authenticated
  using (core.is_member(household_id))
  with check (core.is_member(household_id));

create policy recurring_transactions_delete on finance.recurring_transactions
  for delete to authenticated
  using (core.is_member(household_id));

grant select, insert, update, delete on finance.recurring_transactions to authenticated;
grant select on finance.recurring_due to authenticated;
```

Every policy is `TO authenticated`, so `anon` short-circuits. Migration 6's
`alter default privileges in schema finance revoke all on tables from anon, authenticated` means the
new table and view arrive with **no** grants — both `grant` lines are load-bearing, not decoration,
and the view needs its own (`security_invoker` governs policy evaluation, not privileges). The
tenant key is household membership, never `auth.uid()`.

`UPDATE` under plain RLS covers edit, pause (`active = false`) and resume — none of them move money.
Only `next_due_date` advancement *tied to a posting* needs the seam.

## 6. `src/modules/finance/domain/recurring.ts` (pure — no Supabase import)

Mirrors `domain/budget.ts` exactly: pure functions, ISO `YYYY-MM-DD` strings in and out, no `Date`
leaking across the boundary, no I/O. Re-exported from `domain/index.ts`.

```ts
export type Frequency = "monthly" | "weekly" | "biweekly" | "yearly";

/**
 * Advances an ISO date by exactly one period. MUST stay behaviorally identical to
 * finance.advance_due_date() — the SQL seam and this function compute the same cursor.
 *   monthly  — same day next month, CLAMPED to the last day of a shorter month
 *              (2026-01-31 → 2026-02-28; 2028-01-31 → 2028-02-29 in a leap year)
 *   weekly   — +7 days
 *   biweekly — +15 days EXACTLY (a fixed 15-day interval, not "every 2 weeks")
 *   yearly   — same month/day next year, 2028-02-29 → 2029-02-28 on a non-leap year
 * Clamping is one-way and non-restoring: 01-31 → 02-28 → 03-28. That anchor-day DRIFT is
 * accepted (§10 Decision 5) precisely because Postgres drifts identically.
 */
export function nextDueDate(current: string, frequency: Frequency): string;

/** Whole days the cursor is past `today`. 0 on the due date, negative is impossible by caller
 *  contract but returns a negative number rather than throwing (display clamps at 0). */
export function daysOverdue(nextDueDate: string, today: string): number;

/** Resume: the first occurrence STRICTLY AFTER `today`, by repeated `nextDueDate`. Never returns
 *  an accrued-overdue date, so reactivating a long-paused definition surfaces no backlog. Loop is
 *  hard-capped (weekly over a decade is ~520 iterations; cap 2000, then return the last value). */
export function nextFutureDueDate(current: string, frequency: Frequency, today: string): string;
```

All three use UTC date construction (`Date.UTC` / `toISOString().slice(0,10)`) so the result never
depends on the runtime's timezone — the same discipline the `date`-typed SQL columns already imply.

## 7. TS layer split (`server-only` vs client-safe)

Exactly the `api/index.ts` vs `api/budget-evaluation.ts` split established by `finance-budgets`, and
for the same reason: the recurring list rows, the confirm sheet and the frequency picker are
`"use client"` components that need the date arithmetic for display, and `api/index.ts` starts with
`import "server-only"` (importing it from a client component is a build error).

| File | `server-only`? | Exports |
|---|---|---|
| `src/modules/finance/api/index.ts` | **yes** (unchanged first statement) | `confirmRecurring`, `discardRecurring` (rpc wrappers over §4, returning `Result<…>` via the existing `mapPgError`); re-exports `listRecurringDefinitions`, `listDueRecurring`, `countDueRecurring`, `createRecurringDefinition`, `updateRecurringDefinition`, `setRecurringActive`, `deleteRecurringDefinition` from `../data`; widened `OriginModule` + `OriginRefSchema` enum |
| `src/modules/finance/api/recurring-schedule.ts` | **no** — deliberately, like `budget-evaluation.ts` | `nextDueDate`, `daysOverdue`, `nextFutureDueDate`, `type Frequency`, `type RecurringListItem`, `type DueRecurringItem` |

Both live under `src/modules/*/api/**`, so both satisfy the ESLint `module-api` boundary for `app`
imports (Gate A). `recurring-schedule.ts` imports only from `../domain/recurring` and `../data` types
— no framework, no Supabase.

`src/modules/finance/data/recurring-repository.ts` (new, re-exported from `data/index.ts`): plain
client-direct RLS reads/writes in the `budget-repository.ts` shape — take a `SupabaseClient`,
`Number()` every `bigint` column, degrade to `[]`/`null` on error. CRUD/pause/resume/delete are the
same documented `finance.categories`-style plain-RLS exception; only confirm/discard go through
`.rpc()`.

**One accepted, additive signature change** to the barrel: `OriginModule` and `OriginRefSchema`'s
enum widen from 3 to 4 members. This is the proposal's own *Modified Capabilities* entry, it is
purely additive (no existing caller can break), and it is required for the seam's rows to typecheck.
The proposal's "barrel signatures show zero diff" criterion is read the way `finance-budgets`
already read it: **no existing signature changes**.

## 8. Data flow

```
(app)/recurrentes/page.tsx           (server)
  ├─ listRecurringDefinitions(sb, hh) ─▶ <RecurringList items />        (client)
  ├─ listDueRecurring(sb, hh)         ─▶ <RecurringList due />
  ├─ listActiveAccounts / listActiveCategories(kind="expense")
  └─ listBudgetsWithProgress(sb, hh)  ─▶ <ConfirmRecurringSheet budgets />  (client)

<ConfirmRecurringSheet>  (client, amount/date/description prefilled from the due item;
                          date defaults to the ORIGINAL next_due_date, not today)
  onSubmit ─▶ evaluateBudgetImpact(...)        [api/budget-evaluation, unchanged]
               ├─ crossesLimit === false ─▶ dispatch confirmRecurringAction
               └─ crossesLimit === true  ─▶ <OverBudgetDialog>          [reused verbatim]
                                              ├─ confirm ─▶ dispatch the SAME FormData
                                              └─ cancel  ─▶ post nothing, cursor unmoved

confirmRecurringAction (server action) ─▶ confirmRecurring ─▶ rpc confirm_recurring_transaction
discardRecurringAction                 ─▶ discardRecurring ─▶ rpc discard_recurring_occurrence
pause/resume/delete actions            ─▶ setRecurringActive / deleteRecurringDefinition (plain RLS)
                                          resume computes next via nextFutureDueDate(cur, freq, today)

(app)/page.tsx (server) ─ countDueRecurring(sb, hh) ─▶ <DueRecurringBanner count href="/recurrentes" />
(app)/layout.tsx        ─ NavPill: Inicio · FAB · Cuentas · **Más** ─▶ <OverflowMenu> (client)
```

## 9. UI design

**`(app)/recurrentes/` screen.** Server container + client pieces, mirroring `presupuestos/`:

- **List** — one row per definition, grouped *due first*. Row is a **new
  `patterns/RecurringRow.tsx`**, not `TransactionRow`: it must render a due/overdue state
  (`Vence hoy` / `Vencida hace 12 días` from `daysOverdue`, `text-expense` when overdue), a paused
  state (muted, `En pausa`), a frequency label, and two inline actions (`Confirmar` / `Omitir`).
  Bending `TransactionRow` to carry that would fork a shipped pattern used by Home and Movimientos.
  Same conventions as its siblings: `React.forwardRef`, `cn`, semantic tokens only (`check-tokens.mjs`
  rejects raw hex). Zero definitions renders the shipped `EmptyState` (icon `Repeat`, CTA
  "Nueva recurrente").
- **Create/edit form** — `RecurringForm.tsx`, the `AccountForm`/`BudgetForm` shape: `Select` for
  account, category (expense only), and **frequency — the `design-system/ui/select` Radix component,
  never a raw `<select>`** (standing `finance-ui-polish` convention), `Input type="number"` for the
  amount, `Input type="date"` for the first `next_due_date`, `Input` for the description, one
  `useActionState` server action.
- **Confirm flow** — `ConfirmRecurringSheet.tsx`: prefilled editable amount/date/description, the
  date defaulting to the original `next_due_date`. Gate is `evaluateBudgetImpact` +
  `OverBudgetDialog`, wired **exactly** as `TransactionForm` does it (`onSubmit` →
  `event.preventDefault()` only when `crossesLimit` → stash `FormData` → on confirm
  `startTransition(() => dispatch(stashed))`), so the confirmed submission is byte-identical.
- **Pause/delete** — inline row actions; delete asks for confirmation and states that posted
  transactions are kept.

**Home banner.** `patterns/DueRecurringBanner.tsx`, rendered on `(app)/page.tsx`
**between `<QuickActionRow />` and the debt `Card`** — after the two elements the polish design
fixed to the top of the screen, before every optional card, and rendered only when `count > 0`.
Copy: `3 recurrentes por confirmar` (singular `1 recurrente por confirmar`), whole row links to
`/recurrentes`. Same `Card`-based composition and forwardRef/cn conventions as `BalanceHero`.

**"Más" overflow nav.** `(app)/layout.tsx` keeps the shipped `NavPill` markup and swaps the fourth
slot only:

```tsx
// BEFORE: <Link href="/presupuestos" aria-label="Presupuestos"><Target …/></Link>
// AFTER — the Presupuestos direct slot is REMOVED; its route is unchanged and it now
// lives inside the menu. Icon-only, per the shipped icon-only nav convention.
<OverflowMenu
  items={[
    { href: "/presupuestos", label: "Presupuestos", icon: Target },
    { href: "/recurrentes",  label: "Recurrentes",  icon: Repeat },
  ]}
/>
```

`OverflowMenu` renders its own trigger — a `<button aria-label="Más" aria-expanded>` with
`MoreHorizontal`, styled with the **exact same class string** as the sibling nav links
(`flex h-11 w-11 items-center justify-center rounded-pill …`) so the pill's geometry is unchanged.
It lands in **`src/design-system/patterns/OverflowMenu.tsx`**, not `ui/`: `ui/` holds
framework-primitive wrappers (`button`, `card`, `input`, `select`, `nav-pill`) while `patterns/`
holds composed app shapes (`FabMenu`, `QuickActionRow`, `EmptyState`) — this is a composed
nav-affordance with app semantics, and `FabMenu` is the exact precedent for a nav-slot pattern.
It is a `"use client"` disclosure sheet (overlay + `Card` + link list) reusing `OverBudgetDialog`'s
overlay markup, closing on backdrop click, `Escape`, and route change. **No Radix DropdownMenu**:
the proposal forbids new packages and only `@radix-ui/react-select`/`react-slot` are installed.

Bounded, per the proposal's risk note: one slot swapped, one new component, no pill restyle, no
other route moved.

## 10. Key decisions

| # | Decision | Rejected alternative | Rationale |
|---|---|---|---|
| 1 | Confirm/discard are `SECURITY DEFINER` seams; CRUD/pause/resume/delete are plain RLS | one definer for everything; or a `p_recurring_id` parameter on `record_transaction` | Only confirm has a two-write invariant (post + advance). Widening `record_transaction` would put a cursor side effect on the general money path used by every module |
| 2 | Idempotency key = the **current** `next_due_date`, read before advancing | key = `current_date`, or a per-confirm uuid | The key must identify the *occurrence*, not the attempt. Reading it after the update, or from today, makes every replay a fresh key and double-posts the expense |
| 3 | `select … for update` on the definition before reading the cursor | rely on `ON CONFLICT` alone | `ON CONFLICT` already dedupes the transaction, but without the row lock two concurrent confirms could each advance the cursor once — skipping a period. The lock plus the early `return` in the replay branch makes the cursor move at most once per occurrence |
| 4 | Partial index `(household_id, next_due_date) where active` | no index (rely on seq scan) | Resolves the proposal's deferred question. The due query runs on every Home render; the index also serves the list. Mirrors the shipped `accounts` partial-index precedent |
| 5 | Accept anchor-day drift after a month-end clamp (01-31 → 02-28 → 03-28) | store an `anchor_day` and restore to it | A restoring cursor needs a second column and a second rule that Postgres's own date arithmetic does not implement — the SQL seam and the TS function would then have to be hand-matched. Drift is identical on both sides for free |
| 6 | New `RecurringRow` pattern | reuse/extend `TransactionRow` | Due/overdue/paused state and inline confirm/omit actions are not a transaction row's shape; forking a pattern used by Home and Movimientos is the larger risk |
| 7 | `OverflowMenu` in `patterns/`, hand-rolled disclosure | `ui/` + `@radix-ui/react-dropdown-menu` | `patterns/` is where composed app affordances live (`FabMenu` precedent), and the proposal forbids new packages |
| 8 | Additive widening of `OriginModule`/`OriginRefSchema` | a separate un-typed escape hatch | Purely additive union growth; no existing caller can break, and the proposal lists it as a modified capability |

## 11. Testing strategy

| Layer | What is tested | Tooling |
|---|---|---|
| Unit (pure, no DB) | `nextDueDate` for all four frequencies: monthly normal (`2026-03-15 → 2026-04-15`), **month-end clamp** (`2026-01-31 → 2026-02-28`, `2028-01-31 → 2028-02-29`), post-clamp **drift** (`2026-02-28 → 2026-03-28`), **year rollover** (`2026-12-31 → 2027-01-31`); weekly `+7` across a month and a year boundary; **biweekly = exactly 15 days** (`2026-01-20 → 2026-02-04`, never 14); yearly same month/day (`2026-06-01 → 2027-06-01`) and **leap-day clamp** (`2028-02-29 → 2029-02-28`); timezone independence (identical result under `TZ=UTC` and `TZ=America/Mexico_City`) | Vitest, `tests/unit/finance-recurring-domain.test.ts` |
| Unit (pure) | `daysOverdue`: 0 on the due date, 12 when 12 days past, negative when in the future, correct across a month and a year boundary. `nextFutureDueDate`: a 6-month-paused monthly definition resumes to the first date strictly after today, never an accrued past date; an already-future cursor is returned unchanged; the loop cap terminates | Vitest |
| DB — tenancy | RLS on `finance.recurring_transactions`: member sees own rows; non-member sees zero; `anon` sees zero; member can INSERT/UPDATE/DELETE own rows; a non-member's UPDATE/DELETE affects zero rows | pgTAP, `supabase/tests/090_finance_recurring.sql` |
| DB — **`security_invoker` regression** | A non-member session selecting `finance.recurring_due` for space A returns **zero rows** even though space A has due items. Explicit, named regression for the `security_definer_view` footgun; MUST fail if `with (security_invoker = true)` is dropped | pgTAP |
| DB — idempotency | Calling `confirm_recurring_transaction` **twice for the same due date** yields exactly ONE `finance.transactions` row, both calls return the same id, and `next_due_date` advanced exactly ONE period (not two) | pgTAP |
| DB — confirm/discard atomicity & correctness | Confirm posts one row with `origin_module='recurring'`, `origin_entity_id = <definition id>`, `idempotency_key = <original due date>`, `recurring_id = <definition id>`, `type='expense'`, **negative** `amount_cents`, and `occurred_on = ` the original due date when `p_occurred_on` is null; the cursor advanced by exactly one period. A confirm that raises (non-member, paused, non-positive amount) leaves **zero** transactions AND an unchanged cursor. Discard advances the cursor and inserts nothing. Confirm/discard by a non-member raise `42501`; on a missing id, `P0002`; on a paused definition, `22023` | pgTAP |
| DB — pause/resume & delete | Pausing removes the row from `recurring_due` while leaving `next_due_date` frozen; resuming with a recomputed future date surfaces no backlog. **Deleting a definition leaves its posted transactions present with `recurring_id = NULL`** (the `on delete set null` FK) and never blocks | pgTAP |
| DB — origin domain | `origin_module='recurring'` is accepted after the widening; an unknown value is still rejected; **existing `manual`/`shopping_list`/`car_control` rows and `record_transaction` behavior are unchanged** (regression against the widened CHECK) | pgTAP |
| RTL render | `recurrentes` screen: due items render first with `Vencida hace 12 días`, paused ones read `En pausa` and offer no confirm; zero definitions render `EmptyState`; the frequency picker is the design-system `Select` (no raw `<select>` in the tree). Confirm sheet: date prefills the original due date (not today); crossing a limit renders `OverBudgetDialog` and does **not** dispatch; confirming dispatches once with identical `FormData`; cancelling dispatches never. Home: banner renders only when `count > 0`, pluralizes, links to `/recurrentes`. Nav: "Más" is reachable at 375px and its menu exposes **both** `Presupuestos` and `Recurrentes` links (the reachability regression for the removed direct slot) | Vitest + Testing Library, `tests/unit/{recurring-form,recurring-list,due-banner,overflow-menu,home-page}-render.test*` |
| Static gates | `pnpm verify`: ESLint boundaries (`app → module-api` only; `domain/recurring.ts` imports nothing), `tsc --noEmit`, `check-tokens.mjs`, `next build`. Plus an assertion that `api/recurring-schedule.ts` does **not** contain `server-only` | `pnpm verify` |
| E2E | Not required — every behavior above is covered more cheaply. Optional: 375px light/dark render of `/recurrentes` and the "Más" menu | Playwright (optional) |

## 12. File changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/*_finance_recurring.sql` | Create | §1 table + partial index + trigger, §2 FK + `origin_module` widening, §3 `advance_due_date` + `recurring_due` view |
| `supabase/migrations/*_finance_recurring_security.sql` | Create | §5 RLS enable, 4 policies, 2 grants |
| `supabase/migrations/*_finance_recurring_api.sql` | Create | §4 confirm/discard definers + EXECUTE grants |
| `supabase/tests/090_finance_recurring.sql` | Create | pgTAP suites per §11 |
| `src/modules/finance/domain/recurring.ts` | Create | `nextDueDate`, `daysOverdue`, `nextFutureDueDate`, `Frequency` (pure) |
| `src/modules/finance/domain/index.ts` | Modify | Re-export `./recurring` |
| `src/modules/finance/data/recurring-repository.ts` | Create | List / due / count / create / update / setActive / delete (plain RLS) |
| `src/modules/finance/data/index.ts` | Modify | Re-export `./recurring-repository` |
| `src/modules/finance/api/index.ts` | Modify | `confirmRecurring` / `discardRecurring` rpc wrappers, repo re-exports, widened `OriginModule` + `OriginRefSchema` |
| `src/modules/finance/api/recurring-schedule.ts` | Create | Client-safe pure re-exports (no `server-only`) |
| `src/app/(app)/recurrentes/page.tsx` | Create | Server container: definitions, due items, accounts, expense categories, budgets |
| `src/app/(app)/recurrentes/RecurringForm.tsx` | Create | Client create/edit form (design-system `Select` for frequency) |
| `src/app/(app)/recurrentes/RecurringList.tsx` | Create | Client list + pause/delete/omit actions |
| `src/app/(app)/recurrentes/ConfirmRecurringSheet.tsx` | Create | Client confirm-with-edit + `OverBudgetDialog` gate |
| `src/app/(app)/recurrentes/actions.ts` | Create | Server actions: create/update/setActive/delete/confirm/discard |
| `src/design-system/patterns/RecurringRow.tsx` | Create | Row with due/overdue/paused state + inline actions |
| `src/design-system/patterns/DueRecurringBanner.tsx` | Create | Home banner, count + link |
| `src/design-system/patterns/OverflowMenu.tsx` | Create | Client "Más" disclosure sheet (no new package) |
| `src/app/(app)/layout.tsx` | Modify | 4th slot swapped: `Presupuestos` link → `OverflowMenu` |
| `src/app/(app)/page.tsx` | Modify | `countDueRecurring` + banner between `QuickActionRow` and the debt card |
| `src/app/(app)/movimientos/OverBudgetDialog.tsx` | **Untouched** | Reused verbatim by the confirm sheet |
| `tests/unit/finance-recurring-domain.test.ts` + 5 render tests | Create | Per §11 |

**Review workload note for `sdd-tasks`**: this exceeds the 400-line PR budget. The natural split is
three slices with clean boundaries — (a) migrations 12–14 + pgTAP, (b) domain + data + api split +
unit tests, (c) `recurrentes/` screen + banner + nav overflow + render tests.

## Threat matrix

**N/A** — no routing, shell command, subprocess, VCS/PR automation, executable-file classification,
or process-integration boundary. The real adversarial surface is application-level and is covered
explicitly instead: RLS view leakage (§3 `security_invoker` + its named pgTAP regression),
cross-tenant confirm/discard (§4 `core.assert_member` in both definers, tested), privilege
escalation through the definers (`set search_path = ''`, no dynamic SQL, no user-supplied
identifiers), and double-posting (§4 idempotency + row lock, tested). The client-side over-budget
gate remains **advisory UX, not an invariant**, unchanged from `finance-budgets`.

## Migration / rollout

Additive and reversible in **two independent halves**, exactly as the proposal states. Deploy
migrations first, then the app; if the app ships first it degrades to "no definitions exist, no
banner", so the ordering is a preference, not a hazard.

Schema down path:

```sql
drop function if exists finance.confirm_recurring_transaction(uuid, bigint, date, text);
drop function if exists finance.discard_recurring_occurrence(uuid);
drop view     if exists finance.recurring_due;
alter table finance.transactions drop constraint if exists transactions_recurring_id_fkey;
drop table    if exists finance.recurring_transactions cascade;  -- drops its policies + index
drop function if exists finance.advance_due_date(date, text);
-- Narrowing the origin_module CHECK back to three values is SAFE ONLY after deleting or voiding
-- any origin_module='recurring' rows. Otherwise LEAVE THE WIDENED CHECK: it is inert.
```

`recurring_id` returns to an unconstrained nullable column and **no existing transaction row is
mutated or deleted**, so the ledger is unaffected either way. UI down path: delete
`src/app/(app)/recurrentes/`, remove the banner from `page.tsx`, and restore the direct
`Presupuestos` `<Link>` in `layout.tsx`'s fourth slot. Neither half depends on the other at runtime.

## Open questions

Both questions the proposal deferred are resolved here:

- **Due-query index** — YES, `(household_id, next_due_date) where active` (§1, §10 Decision 4).
- **Due-items read shape** — a `security_invoker` view, `finance.recurring_due` (§3), not an
  ad-hoc repository query.

One implementation-time lookup remains:

- [ ] **Verify, do not assume, the exact current `origin_module` CHECK constraint name** on
      `finance.transactions` (`select conname from pg_constraint where conrelid =
      'finance.transactions'::regclass and contype = 'c'`) before writing migration 12's
      `drop constraint`. It is an inline unnamed CHECK, so its name is Postgres-generated;
      `transactions_origin_module_check` is the expected value but must be confirmed. Everything
      else load-bearing (`ON CONFLICT` against the partial unique index, `for update` row locking,
      `date + interval` clamping, `security_invoker`) is version-stable Postgres behavior.
