# Design: Finance Budgets — Per-Category Monthly Limits

> **Size note**: the `sdd-design` skill sets an 800-word budget. As in the archived
> `lifeos-foundation` design, the orchestrator's task contract for this change explicitly requires
> DDL-level schema, an RLS policy table, and a §9-style testing table. The explicit contract wins.
>
> **Inputs**: `proposal.md` (decided: table shape, plain RLS with no seam, `budget_progress` with
> `security_invoker = true`, client-side confirmation, no rollover via current-month filtering) and
> `specs/finance-budgets/spec.md` (8 requirements). Nothing decided there is re-litigated here.
> Conventions are inherited verbatim from `archive/lifeos-foundation/design.md` §3, §4, §9 and from
> the shipped migrations `20260804090005_finance_schema.sql` / `20260804090006_finance_security.sql`.

## Technical Approach

Budgets are **configuration**; progress is **derived** — the same rule that makes
`finance.account_balances` trustworthy (§3.3). One additive table, one `BEFORE INSERT/UPDATE`
trigger for the cross-table rule a CHECK cannot express (§3.4), one `security_invoker` view, and
plain RLS with **no `SECURITY DEFINER` seam** — the precedent set by `finance.categories` in §4.2:
plain user-owned reference data with no money invariant and no multi-row atomicity requirement, so
direct RLS-guarded CRUD is proportionate and an extra definer would only add escalation surface.

`finance/api` is not touched. `finance/api/index.ts` must show **zero diff**.

Two new migrations, mirroring the shipped schema/security split:

| # | File | Contents |
|---|---|---|
| 10 | `*_finance_budgets.sql` | `finance.budgets`, expense-kind trigger, `updated_at` trigger, `finance.budget_progress` |
| 11 | `*_finance_budgets_security.sql` | RLS enable + 3 policies, grants |

---

## 1. `finance.budgets` (DDL)

```sql
-- Opt-in monthly spending limit, one per expense category per space. Configuration only:
-- no spent column, no period column (no rollover/history — see the proposal's deviation note).
create table finance.budgets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  category_id  uuid not null references finance.categories(id) on delete restrict,
  limit_cents  bigint not null check (limit_cents > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint budgets_one_per_category unique (household_id, category_id)
);
```

`on delete restrict` on `category_id` matches `finance.transactions.category_id` and is consistent
with the locked decision that **categories are never hard-deleted** — the restrict is a backstop,
not a workflow. No additional index: `budgets_one_per_category` is a unique btree on
`(household_id, category_id)`, whose leading column already serves the only read shape
(`where household_id = $1`).

`limit_cents > 0` means **zero is not "budget off"** — see §6, Decision 4.

```sql
-- Cross-table rule Postgres cannot express as a CHECK: the referenced category must be
-- expense-kind and must live in the same space. Mirrors finance.enforce_category_shape().
create or replace function finance.enforce_budget_category()
returns trigger language plpgsql as $$
declare v_category finance.categories;
begin
  select * into v_category from finance.categories where id = new.category_id;
  if not found then
    raise exception 'category not found' using errcode = '22023';
  end if;
  if v_category.household_id <> new.household_id then
    raise exception 'budget must share household with its category' using errcode = '22023';
  end if;
  if v_category.kind <> 'expense' then
    raise exception 'budgets may only be set on expense categories' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger budgets_enforce_category
  before insert or update of category_id, household_id on finance.budgets
  for each row execute function finance.enforce_budget_category();

create trigger budgets_touch_updated_at
  before update on finance.budgets
  for each row execute function core.touch_updated_at();
```

Style is copied from the shipped `finance.enforce_category_shape()` exactly: plain (invoker)
`plpgsql`, **no** `security definer` and therefore **no** `set search_path = ''` (that pairing is
required only for definer functions, §4.1), `22023` for semantic rejection, `before insert or
update of <the columns that matter>`, and a separate `core.touch_updated_at()` trigger.

The household check is not redundant with RLS: a member of two spaces could otherwise budget space
A's category under space B's `household_id`, and RLS alone cannot express a cross-row assertion
(§4.3).

## 2. `finance.budget_progress` (DDL)

```sql
-- CRITICAL: `security_invoker = true`. Without it the view runs as its OWNER and silently
-- bypasses RLS on finance.budgets and finance.transactions — the Supabase `security_definer_view`
-- data-leak footgun, exactly as called out for account_balances/household_summary. A regular
-- view (never materialized) is required: materialized views do not honor RLS at all.
create view finance.budget_progress with (security_invoker = true) as
select b.id           as budget_id,
       b.household_id,
       b.category_id,
       b.limit_cents,
       -- expense amount_cents are NEGATIVE (signed convention, §3.3 / decision #2);
       -- negate to report spend as a positive magnitude.
       coalesce(sum(-t.amount_cents), 0) as spent_cents
from finance.budgets b
left join finance.transactions t
       on t.household_id = b.household_id
      and t.category_id  = b.category_id
      and t.status       = 'posted'
      and t.type         = 'expense'
      and t.occurred_on >= date_trunc('month', current_date)::date
      and t.occurred_on <  (date_trunc('month', current_date) + interval '1 month')::date
group by b.id;
```

**Sargable month filter, deliberately.** The spec states the rule as
`date_trunc('month', occurred_on) = date_trunc('month', current_date)`. Written that way the
expression on `occurred_on` is not indexable and the existing partial index
`finance.transactions (household_id, category_id, occurred_on) where status = 'posted' and type <> 'transfer'`
cannot be range-scanned. The half-open `>= … < …` rewrite above is semantically identical for a
`date` column and lets the planner use that index directly — which is why the proposal can claim
"no new index required". `t.type = 'expense'` implies the index's `type <> 'transfer'` predicate,
so the partial index remains applicable.

`LEFT JOIN` is required: a budget with zero spend this month must still return a row reading
`spent_cents = 0` (spec: "progress resets implicitly on month change"). `group by b.id` follows
`account_balances`' shape — `b.id` is the primary key, so the other `b.*` columns are functionally
dependent and legal to select.

`status = 'posted'` excludes voids and `type = 'expense'` excludes transfers and income, satisfying
the *Voided and Transfer Transactions Excluded From Spend* requirement in one predicate each.
`current_date` is evaluated in the database's timezone-free `date` domain, consistent with the
schema's existing convention; no `timestamptz` conversion is introduced.

## 3. RLS and Grants

```sql
alter table finance.budgets enable row level security;
```

| Table / view | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `finance.budgets` | `core.is_member(household_id)` | `core.is_member(household_id)` | `core.is_member(household_id)` (USING + WITH CHECK) | `core.is_member(household_id)` — budgets have no dependents, so a hard delete is data-safe (§6, Decision 4) |
| `finance.budget_progress` | inherits `budgets` + `transactions` policies via `security_invoker` | n/a (view) | n/a | n/a |

```sql
create policy budgets_select on finance.budgets
  for select to authenticated
  using (core.is_member(household_id));

create policy budgets_insert on finance.budgets
  for insert to authenticated
  with check (core.is_member(household_id));

create policy budgets_update on finance.budgets
  for update to authenticated
  using (core.is_member(household_id))
  with check (core.is_member(household_id));

create policy budgets_delete on finance.budgets
  for delete to authenticated
  using (core.is_member(household_id));

grant select, insert, update, delete on finance.budgets to authenticated;
grant select on finance.budget_progress to authenticated;
```

Every policy is `TO authenticated`, so `anon` short-circuits without evaluating a predicate; an
RLS-enabled table with no matching policy denies by default. Note the shape §4.2 insists on: the
tenant key is household membership, **never `auth.uid()`**.

`alter default privileges in schema finance revoke all on tables from anon, authenticated`
(migration 6) means the new table and view arrive with **no** grants — the two `grant` lines above
are load-bearing, not decoration. The view also needs its own grant: `security_invoker` governs
*policy evaluation*, not table privileges.

## 4. TypeScript Layer

### `src/modules/finance/domain/budget.ts` (pure — no Supabase import)

```ts
export type BudgetImpact = {
  budgeted: boolean;
  limitCents: number | null;
  projectedSpentCents: number;
  crossesLimit: boolean;
};

/**
 * Pure over-budget evaluation. `spentCents` is the view's current-month spend (which ALREADY
 * includes the transaction being edited, when editing in the same category); `deltaCents` is the
 * signed change this submission makes to that spend.
 * Confirmation is warranted only when the submission INCREASES spend and the projection meets or
 * exceeds the limit (spec: "would meet or exceed" -> `>=`). A delta of zero or less never prompts,
 * so lowering an already-over-budget amount is not punished with a dialog.
 */
export function evaluateBudgetImpact(input: {
  limitCents: number | null;
  spentCents: number;
  deltaCents: number;
}): BudgetImpact;

/** Resolves which category to check and by how much, for an edit. */
export function budgetDeltaForEdit(input: {
  previousCategoryId: string | null;
  previousAmountCents: number;   // positive magnitude
  nextCategoryId: string | null;
  nextAmountCents: number;       // positive magnitude
}): { categoryId: string | null; deltaCents: number };
```

`budgetDeltaForEdit` encodes the only non-obvious arithmetic in this change:

| Case | Category checked | `deltaCents` |
|---|---|---|
| New entry | the entered category | `+amount` |
| Edit, same category | that category | `next − previous` |
| Edit, category changed | the **new** category | `+next` (the row never counted toward the new category) |

The old category is never checked on a move: its spend only decreases, and a decrease cannot cross
a limit. Exported from `domain/index.ts` alongside `amount`/`transfer`/`account`/`category`.

### `src/modules/finance/data/budget-repository.ts`

```ts
export type BudgetProgressItem = {
  budgetId: string;
  categoryId: string;
  limitCents: number;
  spentCents: number;
};

export async function listBudgetsWithProgress(
  supabase: SupabaseClient, householdId: string): Promise<BudgetProgressItem[]>;

export async function getProgressForCategory(
  supabase: SupabaseClient, householdId: string, categoryId: string,
): Promise<BudgetProgressItem | null>;

/** RLS-guarded upsert on the (household_id, category_id) unique constraint. */
export async function upsertBudgetLimit(
  supabase: SupabaseClient, householdId: string, categoryId: string, limitCents: number,
): Promise<{ error: string | null }>;

/** RLS-guarded hard delete. Budgets have no dependents, so this is a plain DELETE. */
export async function removeBudget(
  supabase: SupabaseClient, householdId: string, categoryId: string,
): Promise<{ error: string | null }>;
```

Client-direct under RLS via `supabase.schema("finance").from("budget_progress")` — **no facade, no
`.rpc()`, no `server-only` import** — identical in shape and defensiveness to
`summary-repository.ts` and `category-repository.ts`: take a `SupabaseClient` parameter (so the
same function serves server components and, later, the browser client), `Number()` every
`bigint`-backed column, and degrade to `[]` / `null` on error rather than throwing. Re-exported
from `data/index.ts`. `upsertBudgetLimit` is the one write, and it is an ordinary RLS INSERT/UPDATE
— the deliberate `finance.categories`-style exception to "every write goes through `finance/api`",
already documented in that barrel's header comment.

## 5. UI Flow

```
app/(app)/presupuestos/page.tsx        (server)
   ├─ listActiveCategories(supabase, hh, "expense")
   └─ listBudgetsWithProgress(supabase, hh) ──▶ <BudgetForm categories budgets />
                                                     ├─ setBudgetLimitAction ─▶ upsertBudgetLimit
                                                     └─ removeBudgetAction  ─▶ removeBudget

app/(app)/movimientos/page.tsx         (server)
   └─ listBudgetsWithProgress(supabase, hh) ──▶ <TransactionForm … budgets />
app/(app)/movimientos/[id]/editar/page.tsx (server)
   └─ listBudgetsWithProgress(supabase, hh) ──▶ <EditTransactionForm … budgets />

TransactionForm / EditTransactionForm  (client)
   onSubmit ─▶ evaluateBudgetImpact(...)
                 ├─ crossesLimit === false ─▶ dispatch action immediately
                 └─ crossesLimit === true  ─▶ <OverBudgetDialog>
                                                 ├─ confirm ─▶ dispatch the SAME FormData
                                                 └─ cancel  ─▶ discard, record nothing
```

**Progress is fetched on the server and passed as a prop**, not fetched from the client. The two
forms are already `"use client"` components whose data (`accounts`, `categories`) arrives as props
from a server component — adding a `budgets: BudgetProgressItem[]` prop follows that pattern
exactly, avoids introducing a browser Supabase client into a form, and keeps the RTL render tests
(`tests/unit/transaction-form-render.test.tsx`, `edit-transaction-form-render.test.tsx`) prop-driven
with no network mocking. `getProgressForCategory` exists for a single-category re-read (edit page,
future dashboard card) and is the reason the repository exposes both shapes.

**Wiring the pre-submit check into a Server Action form.** Both forms use React 19
`useActionState` with `<form action={dispatch}>`. The check inserts a client-side gate without
abandoning the server action: switch to `<form onSubmit={...}>`, `event.preventDefault()` only when
`crossesLimit`, stash the `FormData` in state, render `OverBudgetDialog`, and on confirm call
`startTransition(() => dispatch(pendingFormData))` — `useActionState`'s dispatch accepts `FormData`
directly, so the confirmed submission is byte-identical to the unconfirmed one. This is what makes
the spec's "confirming records the transaction unchanged" true by construction rather than by
careful re-assembly.

- `TransactionForm.tsx` — gate applies to the `expense` tab only (income and transfer tabs are
  unaffected; transfers carry no `category_id` at all). Delta = entered amount.
- `EditTransactionForm.tsx` — gate uses `budgetDeltaForEdit` over the `transaction` prop it already
  receives (`categoryId`, `amountCents`) versus the submitted values. The void form is untouched.
- `OverBudgetDialog.tsx` — new, in `src/app/(app)/movimientos/`, imported by the edit form as
  `../../OverBudgetDialog` (the same relative path the edit form already uses for `../../actions`).
  Presentational: props in, `onConfirm`/`onCancel` out, Spanish copy, no data access.

**`presupuestos/` screen (minimal).** One row per active expense category (`listActiveCategories`
with `kind = "expense"`, so archived categories disappear from the list automatically — this is the
entire mechanism behind the *Archived Category* requirement; the budget row itself is never
touched). Each row: category name, an opt-in control, a limit input in MXN, and a progress bar
(`spentCents / limitCents`, clamped at 100%, `text-expense` once at or over the limit). A budgeted
row also shows a "quitar presupuesto" action calling `removeBudgetAction`; confirming reverts the
row to its unbudgeted state (no limit, no progress bar), re-enabling the opt-in control. Layout is
a single column, usable at 375px, using existing semantic tokens only — `check-tokens.mjs` rejects
raw hex.

## 6. Key Decisions

| # | Decision | Rejected alternative | Rationale |
|---|---|---|---|
| 1 | Plain RLS, no `SECURITY DEFINER` seam | a `finance.set_budget()` definer | A budget write is one row with no multi-row invariant and no atomicity need — §4.2's exact reasoning for `finance.categories`. A definer would add escalation surface for nothing |
| 2 | Half-open `occurred_on` range instead of `date_trunc(occurred_on) = …` | the literal spec expression | Semantically identical, but sargable — it is what lets the existing partial index serve the query, so no new index is needed |
| 3 | Progress passed to the forms as a server-fetched prop | client-side fetch inside the form on category change | Matches the existing prop-driven form pattern, keeps the RTL render tests network-free, and one small query per page load is cheaper than a fetch per keystroke |
| 4 | **DELETE policy included this slice**; removing a budget deletes the row | a `budgets.archived_at` soft-delete, or deferring removal to a later cycle | Unlike categories, budgets have **no dependents** (nothing FKs to them, money history never references them), so a hard delete is data-safe. `limit_cents > 0` already forbids "0 = off", so removal needs to be a real DELETE, not a flag. User-confirmed: ship it now rather than leave the opt-in feature without a symmetric opt-out |
| 5 | Trigger also asserts `category.household_id = budget.household_id` | kind check only | RLS cannot express a cross-row tenant assertion (§4.3); a multi-space member could otherwise budget another space's category |
| 6 | `spent_cents` reported as a positive magnitude (`sum(-amount_cents)`) | leaking the negative signed value to the UI | The signed convention is a storage decision (§3.3 / decision #2); a progress bar comparing negative spend to a positive limit would invert every comparison in the domain function |

## 7. File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/*_finance_budgets.sql` | Create | §1 table + triggers, §2 view |
| `supabase/migrations/*_finance_budgets_security.sql` | Create | §3 RLS enable, 3 policies, 2 grants |
| `supabase/tests/*_budgets.sql` | Create | pgTAP suites per §8 |
| `src/modules/finance/domain/budget.ts` | Create | `evaluateBudgetImpact`, `budgetDeltaForEdit` (pure) |
| `src/modules/finance/domain/index.ts` | Modify | Re-export `./budget` |
| `src/modules/finance/data/budget-repository.ts` | Create | `listBudgetsWithProgress`, `getProgressForCategory`, `upsertBudgetLimit` |
| `src/modules/finance/data/index.ts` | Modify | Re-export `./budget-repository` |
| `src/app/(app)/presupuestos/page.tsx` | Create | Server container: active expense categories + progress |
| `src/app/(app)/presupuestos/BudgetForm.tsx` | Create | Client: toggle + limit input + progress bar per category |
| `src/app/(app)/presupuestos/actions.ts` | Create | `setBudgetLimitAction` / `removeBudgetAction` server actions over `upsertBudgetLimit` / `removeBudget` |
| `src/app/(app)/movimientos/OverBudgetDialog.tsx` | Create | Presentational confirm dialog (Spanish copy) |
| `src/app/(app)/movimientos/TransactionForm.tsx` | Modify | `budgets` prop + pre-submit gate on the expense tab |
| `src/app/(app)/movimientos/page.tsx` | Modify | Fetch budgets, pass down |
| `src/app/(app)/movimientos/[id]/editar/EditTransactionForm.tsx` | Modify | `budgets` prop + `budgetDeltaForEdit` gate |
| `src/app/(app)/movimientos/[id]/editar/page.tsx` | Modify | Fetch budgets, pass down |
| `src/modules/finance/api/index.ts` | **Untouched** | Zero diff is a success criterion |
| `tests/unit/finance-budget-domain.test.ts` | Create | Pure evaluation tests |
| `tests/unit/budget-form-render.test.tsx` | Create | RTL render, per the `*-form-render.test.tsx` precedent |
| `tests/unit/{transaction,edit-transaction}-form-render.test.tsx` | Modify | New `budgets` prop + dialog assertions |

## 8. Testing Strategy

| Layer | What is tested | Tooling |
|---|---|---|
| Unit (pure, no DB) | `evaluateBudgetImpact`: under limit → no prompt; exactly at limit → prompt (`>=` boundary); over → prompt; unbudgeted (`limitCents = null`) → never prompt; zero/negative delta → never prompt even when already over. `budgetDeltaForEdit`: same-category delta is `next − previous`, category-change delta is `+next` against the new category, unchanged submission yields delta 0 | Vitest against `modules/finance/domain/budget.ts` |
| Database — tenancy | **RLS on `finance.budgets`**: member sees own rows; non-member sees zero; `anon` sees zero; a member can `DELETE` their own household's budget row; a non-member's `DELETE` affects zero rows | pgTAP via `supabase test db` |
| Database — `security_invoker` regression | **Non-member session reading `finance.budget_progress` for space A returns zero rows** even though space A has budgets with spend. This is the explicit regression test for the `security_definer_view` footgun and MUST fail if `with (security_invoker = true)` is dropped from the view | pgTAP |
| Database — expense-kind trigger | Insert referencing an income category raises `22023` and creates no row; insert referencing an expense category succeeds; `UPDATE … set category_id = <income category>` is rejected too; a category from another space is rejected | pgTAP |
| Database — current-month progress | A posted expense from **last month does not count** while this month's does; `spent_cents` is a positive magnitude; a voided expense is excluded; a `transfer` row carrying a `category_id` is excluded; an income row in the same category is excluded; a budget with no transactions returns a row with `spent_cents = 0` (LEFT JOIN regression) | pgTAP |
| Database — uniqueness & archive | A second budget for the same `(household_id, category_id)` violates `budgets_one_per_category`; `limit_cents = 0` is rejected; **archiving a budgeted category leaves the budget row byte-identical** (no cascade, no flag) | pgTAP |
| Contract | None new. `finance/api` is untouched, and budget reads/writes are plain PostgREST under RLS with no error-code mapping layer — asserting the repository's shape would only re-test `supabase-js`. The repositories' defensive degradation (`error → [] / null`) is exercised through the render tests | — |
| RTL render | `BudgetForm` renders a row per active expense category, shows a progress bar and a "quitar presupuesto" action only for budgeted ones, and offers no income category; removing a budget reverts the row to unbudgeted. `TransactionForm`: crossing the limit renders the dialog and does **not** dispatch; confirming dispatches once; cancelling dispatches never; staying under the limit dispatches with no dialog. `EditTransactionForm`: raising an amount past the limit prompts; lowering it does not; switching to a budgeted category over its limit prompts | Vitest + Testing Library, per `tests/unit/*-form-render.test.tsx` |
| E2E | Not required for this slice — every behavior above is covered at a cheaper layer, and the existing Playwright smoke set already covers record/correct flows. Optional addition: 375px light/dark render of `/presupuestos` | Playwright (optional) |
| Static gates | `pnpm verify`: ESLint boundaries (`app → module-api/design-system/shared` only; `domain` stays pure), `tsc --noEmit`, `check-tokens.mjs`, `next build`; plus **`git diff --exit-code src/modules/finance/api/`** | `pnpm verify` |

## Threat Matrix

**N/A** — this change introduces no routing, shell command, subprocess, VCS/PR automation,
executable-file classification, or process-integration boundary. Its real adversarial surface is
application-level and is covered explicitly instead: RLS view leakage (§2 `security_invoker` +
its named pgTAP regression test), cross-space budget creation (§1 trigger household assertion),
semantic bypass of the expense-only rule via direct PostgREST insert (§1 trigger, tested), and
tenant isolation on the table itself (§3 policies, tested). The client-side confirmation is
**advisory UX, not an invariant** — bypassing it is an accepted design consequence
(proposal risk table), because refusing to record real money movement is the worse failure.

## Migration / Rollout

Fully additive and reversible, exactly as the proposal's rollback plan states. Deployment order is
migrations first, then app — the new screen and the form gates degrade to "no budgets exist, never
prompt" if the app ships first, so the ordering is a preference, not a hazard.

Down path:

```sql
drop view    if exists finance.budget_progress;
drop table   if exists finance.budgets cascade;              -- drops its own triggers and policies
drop function if exists finance.enforce_budget_category();
```

No existing table is altered, no column is backfilled, no `NOT NULL` is retrofitted, no tenant key
changes, and no existing row is mutated — so dropping budgets returns the schema bit-for-bit to its
post-`lifeos-foundation` shape. UI rollback is deleting `src/app/(app)/presupuestos/` and reverting
the two form call sites plus their two server pages. Because `finance/api` is untouched, no other
module or seam consumer can break.

## Open Questions

Both product questions raised during design review are resolved (user-confirmed):

- **Turning a budget off** — a real `DELETE` (§3, §4, §6 Decision 4), not a soft-delete flag. Ships
  in this cycle.
- **Archived-but-budgeted categories** — hidden entirely from the budgets screen, exactly as this
  design already specified (they fall out of `listActiveCategories`; the budget row is untouched).

One implementation-time item remains:

- [ ] **Verify at implementation time, not by assumption**: that `useActionState`'s dispatch accepts
      a stashed `FormData` inside `startTransition` on the pinned React/Next versions. Everything
      load-bearing in the database layer (`security_invoker`, partial-index sargability, invoker
      trigger semantics, `ON CONFLICT` against a unique constraint) is version-stable Postgres
      behavior.
