# Design: Finance Dashboard Feed — Month Summary, Category Spend, Recent Movements

> **Size note**: the `sdd-design` skill sets an 800-word budget. As in the archived
> `lifeos-foundation`, `finance-budgets` and `finance-recurring` designs, the orchestrator's task
> contract for this change explicitly requires DDL-level schema, exact component contracts and a
> §-style testing table. The explicit contract wins.
>
> **Inputs**: `proposal.md` (decided and NOT re-litigated: three cards, current-calendar-month
> period, no card-provider registry, no chart library, no `categories.color` column, CSS-only bar
> list extending `ProgressBar`'s technique) and `specs/dashboard-home/spec.md` +
> `specs/finance-transactions/spec.md` (6 requirements + 1 delta, including the resolved rule that
> transfers MAY appear in the recent-movements preview but MUST NOT contribute to any total).
> Conventions read from the real shipped source: `…0005_finance_schema.sql`,
> `…0010/0011_finance_budgets*.sql`, `data/summary-repository.ts`, `data/budget-repository.ts`,
> `data/transaction-repository.ts`, `patterns/ProgressBar.tsx`, `patterns/TransactionRow.tsx`,
> `patterns/EmptyState.tsx`, `api/index.ts`, `api/budget-evaluation.ts`, `app/(app)/page.tsx`.

## Technical Approach

Two new `security_invoker` views plus two repository reads plus two presentational patterns. No new
table, no column, no write path, no package. Home stays a thin server component that calls typed
`finance/api` reads directly — no registry, per the spec's Architecture Note.

One migration pair, mirroring the shipped schema / security split:

| # | File | Contents |
|---|---|---|
| 15 | `*_finance_dashboard.sql` | `finance.month_summary` + `finance.category_spend` views |
| 16 | `*_finance_dashboard_security.sql` | the two `grant select … to authenticated` lines |

---

## 1. Aggregation shape — resolved: SQL views (proposal open item #1)

**PostgREST makes this decision, it is not a preference.** Supabase's REST layer exposes no
server-side `GROUP BY`; there is no `.group()`. A "plain repository read" for spending-by-category
would therefore mean `select amount_cents, category_id …` for every posted expense row in the month
and summing in JS — an unbounded row transfer over the wire that grows with usage, on the highest
frequency page in the app. Only a view or an RPC can group server-side.

Between view and RPC: this project already has four derived views (`account_balances`,
`household_summary`, `budget_progress`, `recurring_due`) and reserves `SECURITY DEFINER` RPCs for
**money seams** — writes with a multi-statement invariant. These are read-only aggregates with no
invariant to protect, so an RPC would be a definer where none is warranted, and would have to
re-implement `core.assert_member` for nothing. **Views win.**

`finance.budget_progress` is close but cannot be reused: it starts `from finance.budgets`, so it
only knows categories that have a budget. Spending-by-category must show **un-budgeted** actuals.

**Acceptance criterion (non-negotiable):** both views MUST carry `with (security_invoker = true)`.
This is the **fifth** occurrence of the Supabase `security_definer_view` footgun in this repo
(`account_balances`, `household_summary`, `budget_progress`, `recurring_due`, now these two). It is a
hard project convention, not a choice, and §8 pins a named pgTAP regression to each new view.
Regular views only — materialized views do not honor RLS at all.

## 2. DDL

```sql
-- Current-calendar-month income/expense totals for the dashboard "Este mes" card.
-- CRITICAL: `security_invoker = true` — without it this view runs as its OWNER and silently
-- bypasses RLS on finance.transactions (Supabase linter: `security_definer_view`). Fifth
-- occurrence of this footgun in this repo; it is a hard convention. Regular view only —
-- materialized views do not honor RLS.
create view finance.month_summary with (security_invoker = true) as
select t.household_id,
       -- income amount_cents are POSITIVE, expense amount_cents are NEGATIVE (signed
       -- convention, …0005 `tx_sign_matches_type`); negate expenses to report spend as a
       -- positive magnitude, exactly as budget_progress.spent_cents does.
       coalesce(sum( t.amount_cents) filter (where t.type = 'income'),  0) as income_cents,
       coalesce(sum(-t.amount_cents) filter (where t.type = 'expense'), 0) as expense_cents
from finance.transactions t
where t.status = 'posted'
  and t.type  <> 'transfer'
  and t.occurred_on >= date_trunc('month', current_date)::date
  and t.occurred_on <  (date_trunc('month', current_date) + interval '1 month')::date
group by t.household_id;

-- Current-calendar-month expense total per category, for the ranked CSS bar list.
-- `security_invoker = true` for the same reason; it also makes the categories join obey
-- the categories SELECT policy rather than the view owner's privileges.
create view finance.category_spend with (security_invoker = true) as
select t.household_id,
       t.category_id,
       c.name as category_name,
       coalesce(sum(-t.amount_cents), 0) as spent_cents
from finance.transactions t
join finance.categories c on c.id = t.category_id
where t.status = 'posted'
  and t.type   = 'expense'          -- excludes 'transfer' AND 'income' in one predicate
  and t.occurred_on >= date_trunc('month', current_date)::date
  and t.occurred_on <  (date_trunc('month', current_date) + interval '1 month')::date
group by t.household_id, t.category_id, c.name;
```

```sql
-- migration 6's `alter default privileges in schema finance revoke all on tables from
-- anon, authenticated` means both views arrive with NO grants — these lines are
-- load-bearing, not decoration. `security_invoker` governs policy evaluation, not privileges.
grant select on finance.month_summary  to authenticated;
grant select on finance.category_spend to authenticated;
```

**Transfer exclusion is doubly enforced** and matches the shipped rule: `month_summary` filters
`type <> 'transfer'`, `category_spend` filters `type = 'expense'`, and a transfer row cannot carry a
`category_id` at all (`tx_transfer_has_no_category`). Voided rows are excluded by `status = 'posted'`.

**Both predicates match the shipped partial index verbatim** — `finance.transactions
(household_id, category_id, occurred_on) where status = 'posted' and type <> 'transfer'`. The
partial predicate is satisfiable by both views, and `household_id` is the leading column. No new
index is added.

**Window boundary — deliberate.** The spec says "day 1 through today"; the DDL uses the full
`[month_start, month_start + 1 month)` window, **identical to `budget_progress`**. A future-dated
posting inside the current month would be counted by both. Capping at `current_date` here would make
Home's category spend disagree with `/presupuestos`'s spend for the same category — a visible
contradiction that is strictly worse than counting a rare forward-dated row. `current_date` resolves
in the database session timezone (UTC on Supabase), same as `budget_progress`; consistency, again,
is the point.

## 3. Repository functions

Both land in **`src/modules/finance/data/summary-repository.ts`** (extend, do not create a new file).
That file already owns "household-level derived-view reads" (`household_summary`); both new views are
exactly that. `category-repository.ts` is deliberately not used: it owns CRUD over the `categories`
**table**, and a transactions-derived aggregate is a different concern.

```ts
export type MonthSummary = { incomeCents: number; expenseCents: number };

/** `finance.month_summary` read. Zero rows (no qualifying transactions this month) resolves to
 *  zero/zero rather than an error — same degrade-not-throw contract as getHouseholdSummary,
 *  and the reason the card can never render NaN. */
export async function getMonthSummary(
  supabase: SupabaseClient,
  householdId: string,
): Promise<MonthSummary> {
  const { data, error } = await supabase
    .schema("finance")
    .from("month_summary")
    .select("income_cents, expense_cents")
    .eq("household_id", householdId)
    .maybeSingle();

  if (error || !data) return { incomeCents: 0, expenseCents: 0 };

  return { incomeCents: Number(data.income_cents), expenseCents: Number(data.expense_cents) };
}

export type CategorySpendRow = { categoryId: string; categoryName: string; spentCents: number };

/** `finance.category_spend` read, ranked highest-first. `limit` caps the Home card at the top
 *  categories; ordering is done server-side so the cap is a true top-N, not a truncated page. */
export async function listCategorySpend(
  supabase: SupabaseClient,
  householdId: string,
  limit = 5,
): Promise<CategorySpendRow[]> {
  const { data, error } = await supabase
    .schema("finance")
    .from("category_spend")
    .select("category_id, category_name, spent_cents")
    .eq("household_id", householdId)
    .order("spent_cents", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    categoryId: row.category_id as string,
    categoryName: row.category_name as string,
    spentCents: Number(row.spent_cents),
  }));
}
```

`Number()` on every `bigint`-backed column and degrade-to-`[]`/zero on error: the exact
`summary-repository.ts` / `budget-repository.ts` client-direct RLS shape, unchanged.

**One additive change to `transaction-repository.ts`** — the preview needs *posted* rows, but
`listRecentTransactions` returns posted **and** void (it powers `/movimientos`, which must show
corrections). Rather than fork its account/category name-join, add a trailing optional options bag:

```ts
export async function listRecentTransactions(
  supabase: SupabaseClient,
  householdId: string,
  limit = 25,
  options: { postedOnly?: boolean } = {},   // ← new, defaulted: every existing call site is unchanged
): Promise<TransactionListItem[]>
// … inside the query builder, before .order():
//   const base = options.postedOnly ? q.eq("status", "posted") : q;
```

Purely additive, no existing signature breaks, no duplicated join logic.

`data/index.ts` re-exports `./summary-repository` with `export *`, so the two new functions and their
types appear automatically. `api/index.ts` adds them to its existing read re-export block (Gate A:
`app` may only import a module's `api/` barrel).

### `server-only` split: NOT needed — explicit reasoning

`finance-budgets` created `api/budget-evaluation.ts` (no `server-only`) for exactly one reason:
`evaluateBudgetImpact` is a **pure function a `"use client"` component must run before submitting**.
`finance-recurring` created `api/recurring-schedule.ts` for the same reason (client-side date
arithmetic). **Neither reason exists here.** Every read in this change is a server-rendered Supabase
call issued by `page.tsx`; there is no client component and no pre-submit gate. The only pure logic —
the category color rotation — is presentational and lives in `design-system/patterns/`, which is
already importable from anywhere. So `finance/api/index.ts` keeps its `import "server-only"` first
statement and **no third api file is created**.

## 4. Component contracts

Both are `design-system/patterns/` components in the shipped house style: `React.forwardRef`, `cn`,
semantic tokens only (`check-tokens.mjs` rejects raw hex), no `"use client"` (they are pure
presentational server-renderable components, like `ProgressBar`/`TransactionRow`).

### 4.1 `MonthSummaryCard`

```tsx
export interface MonthSummaryCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** e.g. "Agosto 2026" — formatted by the caller, never a Date across the boundary. */
  monthLabel: string;
  /** Pre-formatted es-MX MXN strings, same contract as TransactionRow.formattedAmount. */
  formattedIncome: string;
  formattedExpense: string;
}
```

Renders `Card` > `CardHeader` (`CardTitle className="text-sm text-muted-foreground"` = the shipped
debt-card title style) > `CardContent className="grid grid-cols-2 gap-4"`, each cell a muted `Ingresos`
/ `Gastos` label above a `<MoneyAmount kind="income" | "expense" />`. Two columns at 375px is
comfortable because `MoneyAmount` is a single line. No net/balance figure — out of scope.

### 4.2 `CategorySpendList`

```tsx
export interface CategorySpendListItem {
  categoryId: string;
  categoryName: string;
  spentCents: number;
  /** Pre-formatted es-MX MXN. */
  formattedAmount: string;
}

export interface CategorySpendListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Caller supplies them already ranked highest-first (the view + `.order()` do it). */
  items: CategorySpendListItem[];
}
```

**Bar technique — extends `ProgressBar`, does not import it.** `ProgressBar` hardcodes
`bg-primary`/`bg-expense` and renders a `value / limit` label; this list needs per-category color and
a name+amount row, and there is no limit to progress against. Forking `ProgressBar`'s props to carry
that would damage a pattern used by Home's savings goals and `/presupuestos`. The **track and fill
class strings are copied verbatim** so the two read as one family:

```tsx
const maxCents = items[0]?.spentCents ?? 0;                       // items are ranked desc
// Mirrors ProgressBar's `limitCents > 0 ? … : 0` divide-by-zero guard — the reason no bar
// can render NaN. `Math.max(2, …)` keeps a tiny category visible as a sliver rather than
// a zero-width bar that reads as broken.
const pct = maxCents > 0 ? Math.max(2, Math.round((item.spentCents / maxCents) * 100)) : 0;

<div className="h-2 w-full overflow-hidden rounded-pill bg-secondary" aria-hidden>
  <div
    className={cn("h-full rounded-pill transition-[width] duration-200 ease-out", barClass)}
    style={{ width: `${pct}%` }}
  />
</div>
```

`aria-hidden` on the track, and **no `role="progressbar"`** — deliberately unlike `ProgressBar`.
These bars encode relative magnitude, not progress toward a limit; announcing `aria-valuenow={63}`
with no meaningful max would be worse than silence. The category name and the formatted amount are
real text in the same row, so a screen reader already gets the full information.

**Deterministic color rotation — token-backed, no new tokens, no hex.** A fixed six-entry array of
already-approved token classes with opacity modifiers (Tailwind resolves `/70` against the same
`var()`-backed token, so `check-tokens.mjs` and both themes are satisfied):

```tsx
const CATEGORY_BAR_CLASSES = [
  "bg-primary",
  "bg-accent-brand",
  "bg-primary/70",
  "bg-accent-brand/70",
  "bg-primary/45",
  "bg-accent-brand/45",
] as const;

/** Stable per-category color: an FNV-1a-style hash of the category UUID, NOT the render index.
 *  Index-keyed rotation would recolor a category the moment its rank changed; the spec requires
 *  the same category to render the same color across reloads. Pure and exported for unit test. */
export function categoryBarClass(categoryId: string): string {
  let h = 2166136261;
  for (let i = 0; i < categoryId.length; i++) {
    h ^= categoryId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return CATEGORY_BAR_CLASSES[Math.abs(h) % CATEGORY_BAR_CLASSES.length];
}
```

`income`/`expense` tokens are deliberately excluded from the palette: they carry app-wide
money-direction meaning, and every row here is already an expense. Collisions (two categories, same
class) are acceptable — the name and amount disambiguate, and the spec asks for stability, not
uniqueness.

## 5. Recent movements preview — resolved: **4 rows** (proposal open item #2)

| Option | Tradeoff |
|---|---|
| 3 | On a quiet household this is often a single day's activity — reads as "nothing happened", the opposite of the card's purpose |
| **4** | **Chosen.** ~4 × 64px ≈ 256px, the same visual weight as the shipped accounts card, so Home's rhythm is unchanged. Enough rows to show a pattern, too few to be mistaken for a list |
| 5 | At 375px this starts to read as *the* movements list, which the spec explicitly forbids ("MUST NOT duplicate or replace `/movimientos`") |

Implementation: `listRecentTransactions(supabase, spaceId, 4, { postedOnly: true })`. Rows reuse the
shipped **`TransactionRow`** (`title` = description or category name, `subtitle` = `"Gasto · 2026-08-05"`
style, `formattedAmount` = `formatCentsAsMXN`, `kind` from `type`), inside a `Card` whose header
carries a `Link href="/movimientos"` "Ver todos". No new pattern component is created for this card —
`Card` + `TransactionRow` + `Link` is the exact composition Home already uses for accounts.

**Transfers**: the preview does **not** filter `type`, so a transfer legitimately appears as a row —
the spec's resolved rule. It is rendered with `kind={t.amountCents >= 0 ? "income" : "expense"}` on
the leg's own sign. It reaches no total, because totals come from §2's views, which exclude it in SQL.
The card is a *feed*, not an aggregate; that separation is the whole reason the rule is safe.

## 6. Home composition — resolved (proposal open item #3)

Current real order in `src/app/(app)/page.tsx`: `BalanceHero` → `QuickActionRow` →
`DueRecurringBanner` (conditional) → debt `Card` (conditional) → accounts `Card`/`EmptyState` →
savings-goal cards → profile card.

New order:

```
BalanceHero                     ─┐
QuickActionRow                   │  balance-sheet + fixed top block
DueRecurringBanner  (conditional)│  (untouched — fixed by finance-ui-polish / finance-recurring)
debt Card           (conditional)┘
──────────────────────────────────
MonthSummaryCard                ─┐  "where did it go this month?" — the flow narrative,
CategorySpendList                │  in funnel order: totals → breakdown of the expense total
recent movements Card            ┘  → the raw rows, ending in the link out to /movimientos
──────────────────────────────────
accounts Card / EmptyState       ┐
savings-goal cards               │  detail, drill-in, and account chrome
profile Card                     ┘
```

**Rationale.** The debt card is a balance-sheet completion of the hero and stays glued to it. The
three new cards form one continuous month story and must not be split by an unrelated card. They go
**above** the accounts list because the accounts list is the detail the hero already summarizes and
`/cuentas` already owns, whereas the missing month story is the entire reason this change exists —
burying it below accounts + goal cards would put it under the fold at 375px and defeat the change.
Rejected alternative: append all three after the goal cards (least disruptive diff, but exactly that
below-the-fold failure). Rejected alternative: place them above the debt card (splits the hero's
balance-sheet group).

Data fetching joins the existing `Promise.all` — 5 parallel reads instead of 3, no new round trip
in series, per the proposal's performance mitigation.

## 7. Empty states

The spec is binding here ("each affected card MUST render an explicit empty state using the shipped
`EmptyState` pattern"), so all three use `EmptyState`, and each card checks **its own** data
independently — the partial-month scenario (income only ⇒ summary populated, category list empty) falls
out of that for free. `EmptyState.action` is optional, and only the first card gets a CTA: three
stacked identical "Nueva transacción" buttons would be noise, and one action per screen region is the
shipped convention.

| Card | Condition | icon | heading | description | action |
|---|---|---|---|---|---|
| Month summary | `incomeCents === 0 && expenseCents === 0` | `CalendarRange` | Aún no hay movimientos este mes | Registra un gasto o un ingreso para ver tu resumen. | `<Button asChild size="sm"><Link href="/movimientos">Nueva transacción</Link></Button>` |
| Spending by category | `items.length === 0` | `PieChart` | Sin gastos por categoría | Cuando registres gastos verás aquí en qué se te va el dinero. | none |
| Recent movements | `items.length === 0` | `Receipt` | Sin movimientos recientes | Tus últimos movimientos aparecerán aquí. | none |

All icons are already-installed `lucide-react` exports. No card renders a `0%`, a bar, or a figure in
its empty branch, so `NaN` is unreachable by construction — the totals path has a zero-row degrade
(§3) and the bar path has a `maxCents > 0` guard (§4.2).

## 8. Testing strategy

| Layer | What is tested | Tooling |
|---|---|---|
| Unit (pure, no DB) | `categoryBarClass`: same UUID ⇒ same class across calls (stability, the spec scenario); output is always a member of `CATEGORY_BAR_CLASSES`; distinct UUIDs spread across the palette; empty string does not throw; the class never contains `#` (token-only regression) | Vitest, `tests/unit/category-spend-color.test.ts` |
| Unit (pure, no DB) | The bar-percentage rule extracted alongside the component: top item ⇒ 100; half the top ⇒ 50; a 1-cent item against a large top ⇒ **2**, never 0; `maxCents === 0` ⇒ 0 and **never `NaN`**; an empty list yields no bars | Vitest |
| DB — **`security_invoker` regression** | A non-member session selecting `finance.month_summary` and `finance.category_spend` for space A returns **zero rows** even though space A has posted transactions this month. Two explicit named regressions for the `security_definer_view` footgun; each MUST fail if `with (security_invoker = true)` is dropped from its view | pgTAP, `supabase/tests/100_finance_dashboard.sql` |
| DB — period boundary | A posting dated the **1st at 00:00 of the current month** is included; the **last day of the previous month** is excluded; the **1st of next month** is excluded. Asserted relative to `current_date`, never a hardcoded date, so the suite does not rot | pgTAP |
| DB — transfer & void exclusion | A posted `transfer` pair contributes **zero** to `month_summary.income_cents`/`expense_cents` and produces **no** `category_spend` row; a `void` expense is excluded from both; income never leaks into `expense_cents` and vice versa. Totals are compared against a hand-computed expected value | pgTAP |
| DB — sign & shape | `expense_cents` and `spent_cents` are **positive magnitudes** (the `-amount_cents` negation), matching `budget_progress.spent_cents`; `category_spend` emits exactly one row per `(household_id, category_id)` with the correct `category_name`; a household with no qualifying rows yields **zero rows** (not a zero row) from both views | pgTAP |
| DB — consistency with budgets | For a budgeted category, `category_spend.spent_cents` equals `budget_progress.spent_cents` for the same category and month. Pins the §2 window-boundary decision so the two screens can never disagree | pgTAP |
| RTL render | `MonthSummaryCard`: renders both formatted figures with income/expense token treatment and the month label; the zero/zero branch renders the `EmptyState` heading and its CTA links to `/movimientos`. `CategorySpendList`: three items render highest-first with three bars whose inline `width` is descending, the top bar is `100%`, no `NaN`/`undefined` appears in any style attribute, the same category id yields the same class in two separate renders, and the empty list renders the `EmptyState` — never a bar | Vitest + Testing Library, `tests/unit/{month-summary-card,category-spend-list}-render.test.tsx` |
| RTL render — Home | Populated: the three cards appear in the §6 order (assert on DOM order, not just presence), between the debt card and the accounts card, and the preview shows exactly **4** rows with a `/movimientos` link. Empty: all three render their own `EmptyState` and the document contains no `NaN` and no orphan `0%`. Mixed: income-only data renders real summary totals **and** the category `EmptyState` simultaneously (the spec's partial-month scenario). Transfers: a transfer among the recent rows appears as a preview row while the summary totals are unchanged | Vitest + Testing Library, `tests/unit/home-page-render.test.tsx` (extend the shipped file) |
| Static gates | `pnpm verify`: `check-tokens.mjs` (no hex in the new patterns), ESLint boundaries (`app` imports only `finance/api`; the patterns import nothing from `modules/`), `tsc --noEmit`, `next build`. Plus an assertion that **`package.json` dependencies are byte-identical** — the proposal's "no chart library" guard | `pnpm verify` |
| Diff gate | `src/modules/finance/**` write paths (`recordTransaction`, `recordTransfer`, `updateTransaction`, `void*`, `confirm/discardRecurring`, budget/recurring writes) show **zero diff** | review gate |
| E2E | Not required — every behavior above is covered more cheaply. Optional: 375px light/dark screenshot of Home with all three cards populated | Playwright (optional) |

## 9. File changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/*_finance_dashboard.sql` | Create | §2 `finance.month_summary` + `finance.category_spend`, both `security_invoker = true` |
| `supabase/migrations/*_finance_dashboard_security.sql` | Create | §2 the two `grant select … to authenticated` lines |
| `supabase/tests/100_finance_dashboard.sql` | Create | pgTAP suites per §8 (invoker regressions, boundary, transfer/void, sign, budget consistency) |
| `src/modules/finance/data/summary-repository.ts` | Modify | §3 `getMonthSummary`, `listCategorySpend` + their types (extend, no new file) |
| `src/modules/finance/data/transaction-repository.ts` | Modify | §3 additive optional `options: { postedOnly?: boolean }` on `listRecentTransactions` |
| `src/modules/finance/data/index.ts` | **Untouched** | Already `export * from "./summary-repository"` |
| `src/modules/finance/api/index.ts` | Modify | Add the two reads + types to the existing read re-export block. No new api file, no `server-only` change (§3) |
| `src/design-system/patterns/MonthSummaryCard.tsx` | Create | §4.1 |
| `src/design-system/patterns/CategorySpendList.tsx` | Create | §4.2 incl. exported pure `categoryBarClass` |
| `src/app/(app)/page.tsx` | Modify | §6 order + two reads added to the existing `Promise.all`; recent-movements card composed inline from `Card` + `TransactionRow` |
| `tests/unit/category-spend-color.test.ts` | Create | §8 |
| `tests/unit/month-summary-card-render.test.tsx` | Create | §8 |
| `tests/unit/category-spend-list-render.test.tsx` | Create | §8 |
| `tests/unit/home-page-render.test.tsx` | Modify | §8 Home composition, empty, mixed, transfer cases |
| `package.json` | **Untouched** | Enforced, not assumed (§8 static gate) |

**Review workload note for `sdd-tasks`**: this is near, not over, the 400-line budget. If the
forecast crosses it, the natural split is two slices with clean boundaries — (a) migrations 15–16 +
pgTAP + the two repository reads + the `postedOnly` option, (b) the two patterns + Home composition +
render tests. Slice (a) is independently shippable and inert without (b).

## Threat matrix

**N/A** — no routing, shell command, subprocess, VCS/PR automation, executable-file classification,
or process-integration boundary. The real adversarial surface is application-level and is covered
explicitly instead: RLS view leakage (§2 `security_invoker` on both views + a named pgTAP regression
each in §8), and read-only-ness (no `SECURITY DEFINER` function, no write path, no new grant beyond
two `select`s to `authenticated`; `anon` remains revoked by migration 6's default privileges).

## Migration / rollout

Additive and reversible in **two independent halves**, exactly as the proposal states. Deploy the two
migrations first, then the app; if the app ships first, both reads degrade to zero/`[]` (§3) and Home
renders three empty states — degraded, never broken. If the migrations ship first, they are inert:
nothing reads them.

Schema down path — views only, so nothing can be damaged:

```sql
drop view if exists finance.category_spend;
drop view if exists finance.month_summary;
```

No table, column, constraint, index, trigger, policy, or row is created or mutated anywhere in this
change, so the ledger cannot be affected by either applying or reverting it. UI down path: remove the
three cards from `page.tsx`, delete `patterns/MonthSummaryCard.tsx` and `patterns/CategorySpendList.tsx`,
and drop the `postedOnly` option — Home returns to its current shape and the new `finance/api` read
exports become additive and unreferenced. Neither half depends on the other at runtime.

## Open questions

All three items the proposal routed here are resolved:

- **Aggregation shape** — two `security_invoker` **views** (§1, §2). PostgREST has no server-side
  `GROUP BY`, which removes "plain repository read" from the option set; an RPC would be an
  unwarranted `SECURITY DEFINER` on a read-only aggregate.
- **Recent-movements preview count** — **4** (§5).
- **Card order** — the three cards form one block between the debt card and the accounts card (§6).

No blocking questions remain. One implementation-time verification, cheap and non-blocking:

- [ ] Confirm the next free migration timestamp prefix (`…0015` / `…0016`) against
      `supabase/migrations/` at authoring time rather than assuming it.
