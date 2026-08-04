# Design: LifeOS Foundation — Architecture + Finance Core

> **Cycle scope**: slices 1 and 2 only (scaffold + design system + identity, and Finance core
> incl. the public `finance/api` seam). Slices 3–5 (Finance UI screens beyond verification,
> recurring, budgets, dashboard feed) are deferred per the proposal's approved cycle-scope decision.
>
> **Size note**: the `sdd-design` skill sets an 800-word budget. The orchestrator's task contract
> for this change explicitly requires DDL-level schema, RLS policy strategy, and seam justification.
> The explicit contract wins; this document is intentionally longer than the default budget.
>
> **Revision 2** reconciles four post-draft decisions: seeded categories are renamable
> (§3.2, §3.5, §6), the headline balance is *available money* not net worth (§3.3), the housing
> category seeds as `"Casa"` (§3.5), and a transaction can be moved between accounts (§5.4).
>
> **Revision 3** is a strictly additive gap closure: `finance.create_account()` (§5.6) — the seam
> function the `finance.accounts` INSERT row of §4.2 already implied but never specified. Nothing
> else in this document changed.

## Technical Approach

One Next.js (App Router) deployment over one Supabase Postgres. Boundaries are expressed
**twice** so neither layer can silently rot:

| Boundary | Compile-time expression | Runtime expression |
|---|---|---|
| Module isolation | `src/modules/{name}/api/` barrel + ESLint | one Postgres schema per module, no cross-schema FK |
| Composition root | `src/app/` may import many module barrels | `app` schema — the only place that calls into two modules |
| Finance write seam | `server-only` TS facade in `finance/api` | `SECURITY DEFINER` function; DML revoked from `authenticated` |
| Tenancy | `householdId` required on every seam input | RLS policies written against household membership |

Everything money-related is derived, never stored mutable: balances come from a view, not a
column. Everything tenant-related carries `household_id` from migration 1, while the UI never
utters the word.

---

## 1. Project Structure

```
D:\PROYECTOS\LIFE_OS\
├─ src/
│  ├─ app/                              # routing + composition ONLY, no domain logic
│  │  ├─ layout.tsx                     # <html> + ThemeProvider + SW registration
│  │  ├─ manifest.ts                    # MetadataRoute.Manifest -> /manifest.webmanifest
│  │  ├─ (public)/entrar/page.tsx       # sign-in screen (Spanish copy)
│  │  ├─ auth/callback/route.ts         # PKCE code exchange + app.bootstrap_user()
│  │  ├─ auth/salir/route.ts            # sign-out
│  │  └─ (app)/                         # authenticated shell: pill bottom nav + lime FAB
│  │     ├─ layout.tsx
│  │     ├─ page.tsx                    # home (balance hero)
│  │     ├─ cuentas/…                   # accounts
│  │     └─ movimientos/…               # transactions
│  ├─ design-system/
│  │  ├─ tokens/primitives.css          # raw palette — never referenced by components
│  │  ├─ tokens/semantic.css            # :root + .dark semantic tokens
│  │  ├─ ui/                            # retokenized shadcn primitives (button, card, sheet…)
│  │  └─ patterns/                      # BalanceHero, MoneyAmount, CategoryChip, FabMenu
│  ├─ modules/
│  │  ├─ core/
│  │  │  ├─ domain/                     # pure: entities, invariants, no imports from data/ui
│  │  │  ├─ data/                       # Supabase repositories + row↔entity mappers
│  │  │  ├─ ui/containers/              # data-bound (server components / 'use client')
│  │  │  ├─ ui/components/              # presentational, props-only
│  │  │  └─ api/index.ts                # THE public surface
│  │  └─ finance/                       # identical five-part shape
│  ├─ shared/
│  │  ├─ supabase/{browser,server,middleware}.ts
│  │  ├─ result.ts                      # Result<T, AppError>
│  │  └─ money.ts                       # centavos ↔ es-MX display
│  └─ middleware.ts                     # session refresh + route protection
├─ supabase/
│  ├─ migrations/                       # timestamped; see §3
│  ├─ tests/                            # pgTAP (.sql) — RLS, balances, idempotency
│  └─ config.toml
├─ public/{sw.js, icons/, offline.html}
├─ tests/{unit, e2e}                    # Vitest / Playwright
└─ eslint.config.mjs
```

**Layering rationale (proportionate hexagonal, not ceremonial).** `domain/` is pure TypeScript
with zero Supabase imports — that is where balance math, transfer-pair construction, and category
depth rules live, and it is the only layer with cheap fast tests. `data/` is the adapter. `ui/`
follows container-presentational: containers fetch/mutate, components take props and render.
There is deliberately **no** `application/usecase/` layer and **no** repository interface +
implementation pair — with one adapter (Supabase) that indirection buys nothing for a solo
project and costs real reading time.

`design-system/` may not import from `modules/`. `modules/*/domain/` may not import from
`data/` or `ui/`. Both are lint-enforced (§2).

---

## 2. Boundary Enforcement

Three complementary gates, because each alone has a hole.

**Gate A — `eslint-plugin-boundaries`** (resolves both aliased and relative imports, which is why
it beats bare `no-restricted-imports`):

```js
// eslint.config.mjs (flat config, excerpt)
settings: {
  'boundaries/elements': [
    { type: 'app',            pattern: 'src/app/**' },
    { type: 'design-system',  pattern: 'src/design-system/**' },
    { type: 'shared',         pattern: 'src/shared/**' },
    { type: 'module-api',     pattern: 'src/modules/*/api/**',    capture: ['module'] },
    { type: 'module-domain',  pattern: 'src/modules/*/domain/**', capture: ['module'] },
    { type: 'module-data',    pattern: 'src/modules/*/data/**',   capture: ['module'] },
    { type: 'module-ui',      pattern: 'src/modules/*/ui/**',     capture: ['module'] },
  ],
},
rules: {
  'boundaries/no-unknown': 'error',
  'boundaries/element-types': ['error', {
    default: 'disallow',
    rules: [
      { from: 'app',           allow: ['module-api', 'design-system', 'shared'] },
      { from: 'design-system', allow: ['design-system', 'shared'] },
      { from: 'shared',        allow: ['shared'] },
      // inside a module: same-module internals are free
      { from: 'module-api',    allow: [['module-domain', { module: '${from.module}' }],
                                      ['module-data',   { module: '${from.module}' }], 'shared'] },
      { from: 'module-ui',     allow: [['module-domain', { module: '${from.module}' }],
                                      ['module-data',   { module: '${from.module}' }],
                                      'module-api', 'design-system', 'shared'] },
      { from: 'module-data',   allow: [['module-domain', { module: '${from.module}' }], 'shared'] },
      { from: 'module-domain', allow: ['shared'] },   // domain stays pure
    ],
  }],
},
```

The `module-ui → module-api` entry allows *any* module's api barrel — that is the intended
cross-module door. Everything else cross-module is `disallow` by default. `app` is the composition
root: it is the one element type allowed to reach into several module barrels at once.

**Gate B — dependency direction.** A second `boundaries/element-types` block forbids
`finance → {shopping_list, car_control, …}` (money-producing modules depend on Finance, never the
reverse) and forbids any module importing `core`'s internals. `core` may never import `finance`.

**Gate C — the build actually fails.** Do not rely on Next.js running ESLint during `next build`
(that behavior has changed across Next major versions — verify against the installed version at
implementation time). Instead define an explicit gate:

```json
"scripts": { "verify": "eslint . --max-warnings=0 && tsc --noEmit && node scripts/check-tokens.mjs && next build" }
```

`verify` is what CI and the pre-commit hook run. A committed fixture under
`tests/boundary-fixtures/illegal-import.ts.txt` is copied into place by a lint test that asserts
ESLint reports exactly one `boundaries/element-types` error — so the rule itself is tested, not
merely configured.

`check-tokens.mjs` fails on any `#rrggbb` literal or `-[#…]` Tailwind arbitrary color outside
`src/design-system/tokens/`.

---

## 3. Database Design

Migrations (timestamped by `supabase migration new`, shown here by logical order):

| # | File | Slice | Contents |
|---|---|---|---|
| 1 | `core_schema.sql` | 1 | `core` tables + indexes |
| 2 | `core_security.sql` | 1 | membership helpers, RLS policies, grants |
| 3 | `core_bootstrap.sql` | 1 | `core.ensure_personal_space()` |
| 4 | `app_bootstrap.sql` | 1 | `app` schema + `app.bootstrap_user()` (core only, at this point) |
| 5 | `finance_schema.sql` | 2 | `finance` tables, constraints, indexes, balance + summary views |
| 6 | `finance_security.sql` | 2 | RLS policies, grant revocation |
| 7 | `finance_category_templates.sql` | 2 | the canonical Spanish default taxonomy (catalog, not user rows) |
| 8 | `finance_api.sql` | 2 | `SECURITY DEFINER` seam functions + EXECUTE grants |
| 9 | `app_bootstrap_finance.sql` | 2 | `CREATE OR REPLACE app.bootstrap_user()` to also seed categories |

> **Gotcha:** the category template catalog goes in a **migration**, not `supabase/seed.sql`.
> `seed.sql` runs only on local `db reset`; it never reaches a remote project. Fixed `key` values
> plus `ON CONFLICT DO NOTHING` make the migration idempotent.

### 3.1 `core`

```sql
create schema if not exists core;

create table core.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table core.households (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null default 'personal',
  base_currency           char(3) not null default 'MXN' check (base_currency = 'MXN'),
  -- non-null ONLY for auto-created personal spaces; the unique index is what makes
  -- first-sign-in bootstrap race-free (see §6).
  personal_owner_user_id  uuid unique references auth.users(id) on delete cascade,
  created_by              uuid not null references auth.users(id),
  created_at              timestamptz not null default now()
);

create table core.household_members (
  household_id uuid not null references core.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner','member')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index on core.household_members (user_id);
```

### 3.2 `finance` — accounts and categories

```sql
create schema if not exists finance;

create table finance.accounts (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references core.households(id) on delete cascade,
  name                   text not null check (length(btrim(name)) between 1 and 60),
  type                   text not null check (type in
                           ('cash','checking','credit_card','savings','liability','savings_goal')),
  -- 'asset' balances roll into the headline "available money" figure; 'liability' balances
  -- are debt and are shown separately. Trigger-derived from `type` — see §3.4.
  class                  text not null check (class in ('asset','liability')),
  visibility             text not null default 'household'
                           check (visibility in ('household','private')),
  owner_user_id          uuid not null references auth.users(id),
  opening_balance_cents  bigint not null default 0,
  currency               char(3) not null default 'MXN' check (currency = 'MXN'),
  sort_order             int not null default 0,
  archived_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint accounts_private_needs_owner
    check (visibility <> 'private' or owner_user_id is not null)
);
create index on finance.accounts (household_id) where archived_at is null;

create table finance.account_liability_details (
  account_id             uuid primary key references finance.accounts(id) on delete cascade,
  original_amount_cents  bigint not null check (original_amount_cents > 0),
  interest_rate_bp       int    not null check (interest_rate_bp >= 0),  -- basis points, integer
  term_months            int    not null check (term_months > 0),
  monthly_payment_cents  bigint not null check (monthly_payment_cents > 0),
  start_date             date   not null
);

create table finance.account_goal_details (
  account_id           uuid primary key references finance.accounts(id) on delete cascade,
  target_amount_cents  bigint not null check (target_amount_cents > 0),
  target_date          date
);
```

**Categories — per-space rows, no globally shared rows.** See §3.5 for the mechanism decision.

```sql
-- Canonical default taxonomy. NOT user data: no household_id, never rendered directly,
-- never writable by `authenticated`. Copied into each space at bootstrap.
create table finance.category_templates (
  key         text primary key,                    -- stable, English, e.g. 'expense.home.rent'
  parent_key  text references finance.category_templates(key),
  name        text not null,                       -- Spanish display name (the seed value)
  kind        text not null check (kind in ('income','expense')),
  icon        text,
  sort_order  int  not null default 0,
  constraint tmpl_one_level check (parent_key is null or parent_key <> key)
);

create table finance.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,  -- NOT NULL now
  parent_id    uuid references finance.categories(id) on delete restrict,
  name         text not null check (length(btrim(name)) between 1 and 40),
  kind         text not null check (kind in ('income','expense')),
  icon         text,
  -- Provenance only. Non-null means "this row was seeded from that template".
  -- It never restricts rename or deactivate; it exists so a later top-up can tell
  -- which defaults a space already has.
  template_key text references finance.category_templates(key) on delete set null,
  sort_order   int not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint categories_no_self_parent check (parent_id is null or parent_id <> id)
);

create index on finance.categories (household_id, kind) where archived_at is null;

-- Name uniqueness within a space and sibling group (household_id is NOT NULL, so no coalesce on it)
create unique index categories_unique_name
  on finance.categories (household_id,
                         coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
                         lower(btrim(name)));

-- Makes the seed/top-up idempotent and gives ON CONFLICT an arbiter
create unique index categories_unique_template
  on finance.categories (household_id, template_key) where template_key is not null;
```

Gone from revision 1: `is_system boolean`, the `categories_system_is_global` CHECK, and the
nullable `household_id`. All three existed only to model globally shared defaults, which the
"Rename Any Category" requirement rules out.

### 3.3 `finance.transactions`, balances, and the headline figure

```sql
create table finance.transactions (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references core.households(id) on delete cascade,
  account_id         uuid not null references finance.accounts(id) on delete restrict,
  category_id        uuid references finance.categories(id) on delete restrict,
  type               text not null check (type in ('income','expense','transfer')),
  -- SIGNED effect on the account: income > 0, expense < 0, transfer legs are +x and -x.
  amount_cents       bigint not null check (amount_cents <> 0),
  currency           char(3) not null default 'MXN' check (currency = 'MXN'),
  occurred_on        date not null,
  description        text not null default '',
  paid_by_user_id    uuid references auth.users(id),   -- split hook; hidden in personal UI
  created_by_user_id uuid not null references auth.users(id),
  status             text not null default 'posted' check (status in ('posted','void')),
  voided_at          timestamptz,
  voided_by_user_id  uuid references auth.users(id),
  void_reason        text,
  transfer_group_id  uuid,
  origin_module      text not null default 'manual'
                       check (origin_module in ('manual','shopping_list','car_control')),
  origin_entity_id   text,
  idempotency_key    text,
  external_id        text,                              -- future bank sync, unused in MVP
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint tx_sign_matches_type check (
       (type = 'income'   and amount_cents > 0)
    or (type = 'expense'  and amount_cents < 0)
    or (type = 'transfer')),
  constraint tx_transfer_group check ((type = 'transfer') = (transfer_group_id is not null)),
  constraint tx_category_required check (type = 'transfer' or category_id is not null),
  constraint tx_transfer_has_no_category check (type <> 'transfer' or category_id is null),
  constraint tx_void_fields check ((status = 'void') = (voided_at is not null)),
  -- module-originated writes MUST be idempotent and MUST name their source row
  constraint tx_origin_requires_keys check (
    origin_module = 'manual' or (origin_entity_id is not null and idempotency_key is not null))
);

create unique index tx_idempotency
  on finance.transactions (household_id, origin_module, origin_entity_id, idempotency_key)
  where idempotency_key is not null;

create index on finance.transactions (account_id) where status = 'posted';
create index on finance.transactions (household_id, occurred_on desc, id desc);
create index on finance.transactions (transfer_group_id) where transfer_group_id is not null;
create index on finance.transactions (household_id, category_id, occurred_on)
  where status = 'posted' and type <> 'transfer';
```

**Derived balance view** — the single source of truth for every number on screen:

```sql
create view finance.account_balances with (security_invoker = true) as
select a.id            as account_id,
       a.household_id,
       a.type,
       a.class,
       a.archived_at,
       a.opening_balance_cents
         + coalesce(sum(t.amount_cents) filter (where t.status = 'posted'), 0) as balance_cents
from finance.accounts a
left join finance.transactions t on t.account_id = a.id
group by a.id;
```

`security_invoker = true` (PG15+) is **mandatory**. Without it the view runs as its owner and
silently bypasses the RLS of `accounts`/`transactions` — the classic Supabase data-leak footgun,
and one the Supabase linter flags as `security_definer_view`. A regular view (not materialized) is
required because materialized views do not honour RLS.

Balance correctness under RLS holds because visibility is all-or-nothing **per account**: a user
who can see an account can see every posted transaction on it, so `sum()` is never partial.

**The headline figure is available money, not net worth.** `accounts.class` is derived by trigger
from `type`, and that mapping *is* the headline rule:

| `type` | `class` | In the hero number? |
|---|---|---|
| `cash`, `checking`, `savings`, `savings_goal` | `asset` | **yes** |
| `credit_card`, `liability` | `liability` | **no** — shown separately as debt |

```sql
create view finance.household_summary with (security_invoker = true) as
select b.household_id,
       coalesce(sum(b.balance_cents)  filter (where b.class = 'asset'),     0) as available_cents,
       coalesce(sum(-b.balance_cents) filter (where b.class = 'liability'), 0) as debt_cents
from finance.account_balances b
where b.archived_at is null
group by b.household_id;
```

`available_cents` is the hero number. `debt_cents` is a positive magnitude (liability balances are
negative, so the sum is negated) rendered in a separate card and **never subtracted from the hero**.
Net worth is deliberately not computed this cycle; `available_cents - debt_cents` is a one-line
addition if it is ever wanted, so nothing here forecloses it.

Savings-goal accounts count as `asset` and therefore *do* appear in the hero — they hold real money.
Goal progress (`balance_cents / target_amount_cents`) is a separate card fed by the same balance.

**Liability accounts** reuse the same arithmetic: `opening_balance_cents` is the negative of the
outstanding principal, payments are positive transfers into the liability account, and
`balance_cents` walks toward zero. No separate remaining-balance column, no drift.

### 3.4 Trigger-enforced invariants a CHECK cannot express

| Invariant | Mechanism |
|---|---|
| `accounts.class` derived from `type` per the table above | `BEFORE INSERT/UPDATE` trigger, so the headline number never depends on a client-supplied value |
| Categories max one level deep | `BEFORE INSERT/UPDATE` trigger: reject if the chosen parent itself has a `parent_id` |
| Child category shares `kind` **and** `household_id` with its parent | same trigger (cross-space parenting is impossible even before RLS) |
| Transfer group = exactly two rows, same household, opposite signs, distinct accounts, sum zero | enforced inside `finance.record_transfer()` (both legs inserted in one statement) + a pgTAP invariant test; deliberately **not** a deferred constraint trigger — too much machinery for a solo project |
| `updated_at` maintenance | shared `core.touch_updated_at()` trigger |

### 3.5 Decision: seeded defaults are copied per space (spec mechanism choice)

The `finance-categories` spec requires that a seeded default be renamable, that the rename affect
only the renaming space, and that existing transaction references survive. The spec assigns the
mechanism to this design and offers two options.

| | Option 1 — copy per space (**chosen**) | Option 2 — global rows + per-space override table |
|---|---|---|
| Rename a default | ordinary `UPDATE` on the space's own row | upsert into an override table |
| Deactivate | ordinary `archived_at` | override row with a hidden flag |
| Read path | `select … where household_id = mine` | every read must `LEFT JOIN` overrides and `COALESCE` the name |
| Storage | ~30 rows per space | one shared set |
| Default set changes later | needs an idempotent top-up | propagates automatically |
| Failure mode | a space misses a newly added default | a forgotten join silently shows another space's name |

**Chosen: option 1.** The read path is the hot path — every category picker, every transaction row,
every future budget and chart resolves a category name. Option 2 taxes all of them with a join plus
`COALESCE` and creates a permanent "did you remember the override?" bug class whose failure mode is
*showing the wrong name*, which is exactly what the requirement forbids. Option 1 makes rename and
deactivate ordinary writes with **zero special cases**, which is what the requirement actually asks
for. Duplication is ~30 rows in a product whose expected space count is one.

Option 1's real weakness — a changing default set — is handled rather than accepted:
`finance.ensure_default_categories(household_id)` is idempotent (`ON CONFLICT (household_id,
template_key) DO NOTHING`) and runs on **every** sign-in via `app.bootstrap_user()`. Adding a row to
`finance.category_templates` in a future migration therefore tops up existing spaces on their next
sign-in, and `DO NOTHING` guarantees it **never overwrites a user's rename or un-archives something
they deactivated**. Cost per sign-in is two statements over a ~30-row catalog.

```sql
create or replace function finance.ensure_default_categories(p_household_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform core.assert_member(p_household_id);

  -- pass 1: top-level templates
  insert into finance.categories (household_id, template_key, parent_id, name, kind, icon, sort_order)
  select p_household_id, t.key, null, t.name, t.kind, t.icon, t.sort_order
    from finance.category_templates t
   where t.parent_key is null
  on conflict (household_id, template_key) where template_key is not null do nothing;

  -- pass 2: children, resolving the parent through the rows just ensured
  insert into finance.categories (household_id, template_key, parent_id, name, kind, icon, sort_order)
  select p_household_id, t.key, c.id, t.name, t.kind, t.icon, t.sort_order
    from finance.category_templates t
    join finance.categories c
      on c.household_id = p_household_id and c.template_key = t.parent_key
   where t.parent_key is not null
  on conflict (household_id, template_key) where template_key is not null do nothing;
end $$;
```

**Seed taxonomy** (template `key` is stable and English; `name` is the renamable Spanish default).
Housing seeds as **`"Casa"`**, not `"Hogar"`, so the proposal's "the word *hogar* appears nowhere in
the UI" criterion stays literally checkable:

| kind | key | name | children |
|---|---|---|---|
| income | `income.salary` | Salario | — |
| income | `income.freelance` | Trabajo independiente | — |
| income | `income.investments` | Inversiones | — |
| income | `income.gifts` | Regalos | — |
| income | `income.other` | Otros ingresos | — |
| expense | `expense.food` | Comida | Supermercado, Restaurantes |
| expense | `expense.transport` | Transporte | Gasolina, Transporte público, Mantenimiento |
| expense | `expense.home` | **Casa** | Renta, Servicios, Internet |
| expense | `expense.health` | Salud | — |
| expense | `expense.entertainment` | Entretenimiento | — |
| expense | `expense.education` | Educación | — |
| expense | `expense.clothing` | Ropa | — |
| expense | `expense.personal` | Cuidado personal | — |
| expense | `expense.debt` | Pagos de deuda | — |
| expense | `expense.other` | Otros gastos | — |

A rename that would collide with a sibling name is rejected by `categories_unique_name`; the facade
maps `23505` to a typed `CATEGORY_NAME_TAKEN` error with Spanish UI copy.

### 3.6 Anticipated deferred tables — explicitly NOT created

`finance.recurring_transactions`, `finance.budgets`, and `transactions.recurring_id` are **omitted**.
Adding them later is `CREATE TABLE` + one nullable FK column — no backfill, no NOT NULL on existing
rows, no tenant-key change. That is not a painful migration, so anticipating them now would only add
untested, unspecified surface. `paid_by_user_id`, `external_id`, and `visibility`/`owner_user_id`
**are** shipped now: they are free columns whose absence would otherwise force a semantic backfill.

---

## 4. RLS Design

### 4.1 Membership helpers (the recursion fix)

```sql
create or replace function core.is_member(p_household_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from core.household_members m
                  where m.household_id = p_household_id
                    and m.user_id = (select auth.uid()));
$$;
```

`SECURITY DEFINER` here is not laziness: a policy **on** `core.household_members` that itself
queries `core.household_members` produces `infinite recursion detected in policy`. The definer
function reads the table with RLS bypassed, breaking the cycle. `set search_path = ''` (with
fully-qualified names everywhere) is mandatory — Supabase's `function_search_path_mutable` linter
flags its absence, and a mutable search_path on a definer function is a privilege-escalation vector.

`(select auth.uid())` rather than bare `auth.uid()` lets the planner cache it as an InitPlan
instead of re-evaluating per row — the documented Supabase RLS performance pattern.

```sql
create or replace function finance.can_read_account(p_account_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from finance.accounts a
     where a.id = p_account_id
       and core.is_member(a.household_id)
       and (a.visibility = 'household' or a.owner_user_id = (select auth.uid())));
$$;
```

### 4.2 Policy strategy per table

Every table: `alter table … enable row level security;` with **no** permissive default — an RLS-enabled
table with zero policies denies everything, which is the deny-by-default floor. Every policy is
`TO authenticated` so the `anon` role short-circuits without evaluating any predicate.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `core.profiles` | `user_id = (select auth.uid())` **or** shares a household (for future sharing) | `user_id = (select auth.uid())` | same as select-own | none |
| `core.households` | `core.is_member(id)` | none (bootstrap function only) | `core.is_owner(id)` | none |
| `core.household_members` | `core.is_member(household_id)` | none (bootstrap/invite function only) | none | `core.is_owner(household_id)` |
| `finance.accounts` | `core.is_member(household_id) and (visibility='household' or owner_user_id=(select auth.uid()))` | none — seam only, via `finance.create_account()` (§5.6) | none — seam only | none |
| `finance.account_*_details` | `finance.can_read_account(account_id)` | none — seam only; written **only** inside `finance.create_account()`, in the same transaction as the account row (§5.6) | none | none |
| `finance.category_templates` | none for `authenticated` (catalog is read only by definer functions) | none | none | none |
| `finance.categories` | `core.is_member(household_id)` | `core.is_member(household_id)` | `core.is_member(household_id)` | **none** — deactivate via `archived_at`, never delete |
| `finance.transactions` | `core.is_member(household_id) and finance.can_read_account(account_id)` | none — seam only | none — seam only | **never** (no policy, plus `REVOKE DELETE`) |

The `finance.categories` row is materially simpler than revision 1: no `is_system` predicate and no
`household_id is null` branch, because after §3.5 every category row is an ordinary row owned by
exactly one space. Renaming a seeded default and renaming a hand-made category are literally the
same `UPDATE` under the same policy — which is the strongest evidence that option 1 was the right
mechanism.

Note the shape: **no table has a policy referencing `auth.uid()` as the tenant key.** The tenant key is
always household membership; `auth.uid()` appears only as the *private-account* modifier and for
self-profile. That is precisely what makes enabling sharing later a UI reveal instead of a policy rewrite.

Write policies are absent by design for `accounts`/`transactions` — writes cannot happen through
PostgREST at all (§5), so a permissive write policy would be dead code with a live blast radius.
`finance.categories` is the deliberate exception: it is plain user-owned reference data with no
money invariants, so direct RLS-guarded CRUD is proportionate and avoids three pointless RPCs.

### 4.3 Why RLS is not the whole guard

RLS answers "may this role touch this row?" It cannot answer:

- multi-row invariants (a transfer's two legs must sum to zero),
- idempotency (a unique index does that, not a policy),
- semantic legality (an `expense` row whose `category_id.kind = 'income'`),
- cross-object assertions (the destination account of a *move* must be in the same space — §5.4),
- privilege ceilings inside `SECURITY DEFINER` functions, where RLS is bypassed by definition.

So each seam function opens with `perform core.assert_member(p_household_id);` which raises
`insufficient_privilege` — the definer's own explicit re-implementation of the policy it bypasses.

### 4.4 How policies get tested

pgTAP via `supabase test db` against the local stack (`supabase/tests/*.sql`). Each policy test
follows the same shape:

```sql
-- impersonate a specific user for the remainder of the transaction
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-b-uuid>","role":"authenticated"}';
select is_empty($$ select 1 from finance.transactions where household_id = '<household-a>' $$,
                'user B sees zero rows from household A');
```

Mandatory cases per protected table: (a) member sees own rows, (b) non-member sees zero rows,
(c) `anon` sees zero rows, (d) private-account rows are invisible to a non-owner member,
(e) a direct `INSERT`/`UPDATE`/`DELETE` on `accounts`/`transactions` as `authenticated` raises
`insufficient_privilege` — (e) is the regression test that the seam cannot be bypassed.
`basejump/supabase-test-helpers` (`tests.create_supabase_user`, `tests.authenticate_as`) removes the
JWT boilerplate; **verify it is installable against the pinned Supabase CLI version before adopting
it**, otherwise hand-roll the `set local` pattern above.

---

## 5. The Finance API Seam (load-bearing decision)

### 5.1 Decision: two-layer seam — `server-only` TypeScript facade over a `SECURITY DEFINER` Postgres function

| Option | Cross-module atomicity | Bypassable from browser | Cost |
|---|---|---|---|
| A. `supabase-js` direct from the client, RLS only | none — each call is its own transaction | trivially | lowest |
| B. Server Action issuing several `supabase-js` calls | **none** — PostgREST cannot span statements | no (if grants revoked) | low |
| C. Route Handler + raw `pg` connection with `BEGIN/COMMIT` | yes | no | must hand-set `request.jwt.claims` to restore RLS context; extra pooling concern on serverless |
| D. `SECURITY DEFINER` PL/pgSQL function called via `.rpc()` from a Server Action | **yes — a function body is one transaction** | no (DML revoked) | PL/pgSQL is harder to unit test than TS |
| E. Supabase Edge Function | same as B or D | no | extra deploy unit + cold start, no added guarantee |

**Chosen: D, wrapped by a TypeScript facade.**

- `src/modules/finance/api/index.ts` — the *compile-time* boundary. Starts with `import 'server-only'`
  so any client component importing it fails the build. Validates input with Zod, maps to exactly one
  `.rpc()` call, maps PG error codes to a typed `Result<T, AppError>`. This is the file ESLint points
  every other module at.
- `finance.create_account` / `record_transaction` / `record_transfer` / `update_transaction` /
  `update_origin_transaction` / `void_transaction` / `find_by_origin` — the *runtime* boundary.
  Atomicity, idempotency, and the membership assertion live here.

**Rejected B** because a transfer is two rows and a Shopping-List checkout is a foreign row plus a
Finance row; neither can be made atomic through PostgREST. Rejected C because it re-implements, by
hand and fallibly, the RLS context that a definer function gets for free — `auth.uid()` still resolves
correctly inside a definer function because it reads the session-scoped `request.jwt.claims` GUC, which
is unaffected by the role switch. Rejected E for adding a deploy unit that buys nothing here.

### 5.2 Atomicity rule for cross-module writes (state it once, enforce it everywhere)

> A write that must be atomic with a Finance write is expressed as **a single Postgres function call**.
> The calling module's own definer function performs its inserts and then calls
> `finance.record_transaction(...)` inside the same transaction; any exception rolls back both.
> A write that does not need atomicity (manual entry from the Finance UI) calls the TS facade from a
> Server Action. **There is no third path.**

At the DB layer the seam is therefore the granted `EXECUTE` on `finance.record_transaction`, mirroring
the TS `api/` barrel exactly. `finance` never reads another schema's tables; `origin_entity_id` is
`text` with **no foreign key**, which is what keeps the coupling one-directional and lets a calling
module's row be deleted without cascading into money history.

### 5.3 Idempotency

```sql
insert into finance.transactions (…)
values (…)
on conflict (household_id, origin_module, origin_entity_id, idempotency_key)
  where idempotency_key is not null
do nothing
returning id into v_id;

if v_id is null then                    -- lost the race, or an honest replay
  select id into v_id from finance.transactions
   where household_id = p_household_id and origin_module = p_origin_module
     and origin_entity_id = p_origin_entity_id and idempotency_key = p_idempotency_key;
end if;
```

Two concurrent identical calls: the second blocks on the unique index until the first commits, then
`DO NOTHING` yields nothing and the follow-up `SELECT` (READ COMMITTED) finds the committed row. Both
callers receive the same `TransactionRef`. Exactly one row exists — the proposal's success criterion.

The partial index (`where idempotency_key is not null`) plus the `tx_origin_requires_keys` CHECK
removes the NULL-distinctness trap entirely: manual entries have a NULL key and are simply outside the
index, while every module-originated row is forced to carry both `origin_entity_id` and
`idempotency_key`.

**Sharpening vs the proposal:** the unique key is `(household_id, origin_module, origin_entity_id,
idempotency_key)` — `household_id` is prepended so one tenant's key can never collide with another's.

### 5.4 Correcting a transaction, including moving it between accounts

Recording an expense against the wrong account is an expected, frequent mistake, and void-and-recreate
was rejected as the remedy. `accountId` is therefore part of the patch surface.

**Balance correctness is free — confirmed, not assumed.** `finance.account_balances` computes
`sum(amount_cents) … where t.account_id = a.id` at query time against no materialized state. Changing
`transactions.account_id` from A to B means the very next read of the view recomputes **both** A and B
correctly. There are no compensating entries, no recalculation job, and no window of inconsistency —
the whole point of the derived-balance decision, now paying for itself.

```sql
create or replace function finance.update_transaction(
  p_transaction_id uuid,
  p_account_id     uuid   default null,   -- null = leave unchanged
  p_category_id    uuid   default null,
  p_amount_cents   bigint default null,   -- positive magnitude; sign re-derived from type
  p_occurred_on    date   default null,
  p_description    text   default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_tx finance.transactions;
begin
  select * into v_tx from finance.transactions where id = p_transaction_id;
  if not found then raise exception 'transaction not found' using errcode = 'P0002'; end if;

  perform core.assert_member(v_tx.household_id);
  if not finance.can_read_account(v_tx.account_id) then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;
  if v_tx.status = 'void' then
    raise exception 'cannot edit a voided transaction' using errcode = '22023';
  end if;

  if p_account_id is not null and p_account_id <> v_tx.account_id then
    -- a transfer leg's meaning is defined by its pair; moving one leg is not expressible
    if v_tx.type = 'transfer' then
      raise exception 'cannot move a transfer leg; void the transfer and record it again'
        using errcode = '22023';
    end if;
    -- destination must be in the SAME space, visible to the caller, and not archived
    if not exists (select 1 from finance.accounts a
                    where a.id = p_account_id
                      and a.household_id = v_tx.household_id
                      and a.archived_at is null)
       or not finance.can_read_account(p_account_id) then
      raise exception 'invalid destination account' using errcode = '42501';
    end if;
  end if;

  update finance.transactions set
    account_id   = coalesce(p_account_id, account_id),
    category_id  = coalesce(p_category_id, category_id),
    amount_cents = case when p_amount_cents is null then amount_cents
                        when type = 'expense' then -abs(p_amount_cents)
                        else abs(p_amount_cents) end,
    occurred_on  = coalesce(p_occurred_on, occurred_on),
    description  = coalesce(p_description, description),
    updated_at   = now()
  where id = p_transaction_id;

  return p_transaction_id;
end $$;
```

**Why transfer legs reject the move.** A transfer is a statement about *two* accounts. Repointing one
leg leaves the other leg untouched, so the pair silently stops describing a coherent movement, and
there is no single correct reading of the user's intent (did they mean to change the source, or record
a different transfer entirely?). Since a transfer is one seam call to create, the honest remedy is
`voidTransaction` on the group plus a fresh `recordTransfer` — cheap, unambiguous, and it leaves an
accurate history. The facade surfaces `TRANSFER_LEG_NOT_MOVABLE` so the UI can offer exactly that
as a one-tap action rather than a dead end.

**Cross-space move is impossible** because the destination-account assertion above compares
`a.household_id = v_tx.household_id` *inside* the definer, where RLS is bypassed. This is a concrete
instance of §4.3: no row-level policy can express "this row's new parent must match that row's tenant."

**Atomicity and idempotency.** The function body is one transaction, so the guard checks and the
`UPDATE` cannot separate. Updates need no idempotency row: applying the same patch twice produces the
same final state, and `updateOriginTransaction` resolves its target deterministically by
`(household_id, origin_module, origin_entity_id)` — a replay therefore hits the same row. There is
deliberately **no** optimistic-concurrency version column; a single-user product does not have the
concurrent-editor problem that would justify it. `updated_at` is bumped; a full audit trail of edits
is out of scope for this cycle.

**Sharpening vs the proposal:** the proposal listed only `updateOriginTransaction(origin, patch)`,
which cannot address a manual entry (its `origin_entity_id` is NULL and is not resolvable). Since
mis-keyed manual entries are the dominant case for this feature, the seam also exposes
`updateTransaction(id, patch)`. Both delegate to the one function above;
`update_origin_transaction` resolves origin → id and then calls it, so there is exactly one code path
carrying the guards.

### 5.5 Making the seam unbypassable

```sql
revoke all on all tables    in schema finance from anon, authenticated;
revoke all on all functions in schema finance from anon, authenticated;
alter default privileges in schema finance revoke all on tables    from anon, authenticated;
alter default privileges in schema finance revoke all on functions from anon, authenticated;

grant usage on schema finance to authenticated;
grant select on finance.accounts, finance.account_liability_details, finance.account_goal_details,
                finance.categories, finance.transactions,
                finance.account_balances, finance.household_summary
      to authenticated;                                   -- reads only, still RLS-filtered
grant insert, update on finance.categories to authenticated;  -- the one user-owned table; no DELETE
-- finance.category_templates: no grant at all. Definer functions read it; users never touch it.

grant execute on function finance.create_account(…),
                          finance.record_transaction(…), finance.record_transfer(…),
                          finance.update_transaction(…), finance.update_origin_transaction(…),
                          finance.void_transaction(…), finance.find_by_origin(…)
      to authenticated;

grant usage   on schema app to authenticated;
grant execute on function app.bootstrap_user() to authenticated;
-- finance.ensure_default_categories and core.ensure_personal_space are NOT granted to
-- authenticated: they are internal steps, reachable only through app.bootstrap_user().
```

Layered with: `import 'server-only'` in the facade, the ESLint barrel rule, and the Data-API "Exposed
schemas" setting (expose `core`, `finance`, and `app`; the `service_role` key never reaches the
browser). Reads default to **server components** using the server Supabase client; client-direct reads
stay possible for future realtime/optimistic UI, which is why the SELECT grants exist at all.

**Sequence — cross-module write:**

```
ShoppingList container ──▶ Server Action ──▶ .rpc('shopping_list.checkout', …)
                                                     │  ┌──── one Postgres transaction ────┐
                                                     ├─▶│ insert shopping_list.checkout    │
                                                     │  │ perform core.assert_member(hh)   │
                                                     │  │ finance.record_transaction(…)    │
                                                     │  │   └ ON CONFLICT DO NOTHING       │
                                                     │  └── commit  or  rollback BOTH ─────┘
                                                     ▼
                                          Result<TransactionRef> ──▶ revalidatePath('/')
```

### 5.6 Creating an account (account row + required detail row, atomically)

`finance.accounts` has no INSERT policy and no INSERT grant (§4.2, §5.5), so account creation needs a
seam function exactly like transaction writes do. Two of the six account types are **incomplete
without a second row** — `liability` requires `finance.account_liability_details` and `savings_goal`
requires `finance.account_goal_details` — and a client-side "insert account, then insert detail"
sequence can leave an account stranded without its detail row if the second call fails. That is the
same multi-row-invariant problem as a transfer pair (§4.3), so it gets the same answer: **one
`SECURITY DEFINER` function, one transaction.**

**`household_id` is a parameter, not session-resolved.** This follows the existing seam convention
without exception: `finance.ensure_default_categories(p_household_id)` takes it explicitly, every
seam input type carries `householdId` (Technical Approach table), and every definer opens with
`perform core.assert_member(p_household_id)` (§4.3). A caller may belong to several spaces once
sharing is enabled, so the space cannot be inferred from the session; the *assertion* — not the
parameter — is what makes it safe. `update_transaction` resolving the household from the target row
is not a counter-example: an existing row already determines its own space.

**`owner_user_id` is the opposite case** — it is *not* a parameter. It is taken from
`(select auth.uid())` inside the definer, because a client-supplied owner on a `private` account
would let a caller create an account visible only to someone else.

#### The `class` mapping this function enforces

`accounts.class` decides whether an account's balance lands in the hero "available money" figure
(§3.3), so it must never be client-supplied. The mapping is:

| `type` | `class` | Detail row | In `available_cents`? |
|---|---|---|---|
| `cash`, `checking`, `savings` | `asset` | none | **yes** |
| `savings_goal` | `asset` | `account_goal_details` (**required**) | **yes** |
| `credit_card` | `liability` | none | no — counted in `debt_cents` |
| `liability` | `liability` | `account_liability_details` (**required**) | no — counted in `debt_cents` |

`create_account()` takes **no `class` parameter and inserts none**. The `BEFORE INSERT` trigger of
§3.4 is the single authority for the mapping (a `BEFORE ROW` trigger fires before the `NOT NULL`
and `CHECK` constraints are evaluated, so omitting the column is legal). Duplicating the mapping in
the function body would create a second place for it to drift from the headline rule; the function's
job is to guarantee the *detail row*, the trigger's job is to guarantee `class`.

```sql
create or replace function finance.create_account(
  p_household_id          uuid,
  p_name                  text,
  p_type                  text,
  p_opening_balance_cents bigint default 0,
  p_visibility            text   default 'household',
  p_sort_order            int    default 0,
  -- liability detail: all five required when p_type = 'liability', all null otherwise
  p_original_amount_cents bigint default null,
  p_interest_rate_bp      int    default null,
  p_term_months           int    default null,
  p_monthly_payment_cents bigint default null,
  p_start_date            date   default null,
  -- savings-goal detail: target amount required when p_type = 'savings_goal', null otherwise
  p_target_amount_cents   bigint default null,
  p_target_date           date   default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user       uuid := (select auth.uid());
  v_account_id uuid;
  v_has_liab   boolean := p_original_amount_cents is not null or p_interest_rate_bp is not null
                       or p_term_months is not null or p_monthly_payment_cents is not null
                       or p_start_date is not null;
  v_has_goal   boolean := p_target_amount_cents is not null or p_target_date is not null;
begin
  perform core.assert_member(p_household_id);          -- same opener as every other seam function

  -- detail block must match the type exactly: required when owed, forbidden otherwise
  if p_type = 'liability' then
    if p_original_amount_cents is null or p_interest_rate_bp is null or p_term_months is null
       or p_monthly_payment_cents is null or p_start_date is null or v_has_goal then
      raise exception 'liability accounts require complete loan detail and no goal detail'
        using errcode = '22023';
    end if;
  elsif p_type = 'savings_goal' then
    if p_target_amount_cents is null or v_has_liab then
      raise exception 'savings-goal accounts require a target amount and no loan detail'
        using errcode = '22023';
    end if;
  elsif v_has_liab or v_has_goal then
    raise exception 'detail fields are not applicable to this account type' using errcode = '22023';
  end if;

  -- liability balances are negative principal walking toward zero (§3.3)
  if p_type in ('credit_card','liability') and p_opening_balance_cents > 0 then
    raise exception 'a liability opening balance is zero or negative' using errcode = '22023';
  end if;

  insert into finance.accounts (household_id, name, type, visibility, owner_user_id,
                                opening_balance_cents, sort_order)
  values (p_household_id, btrim(p_name), p_type, p_visibility, v_user,
          p_opening_balance_cents, p_sort_order)
  returning id into v_account_id;     -- `class` omitted on purpose: the §3.4 trigger derives it

  if p_type = 'liability' then
    insert into finance.account_liability_details
      (account_id, original_amount_cents, interest_rate_bp, term_months,
       monthly_payment_cents, start_date)
    values (v_account_id, p_original_amount_cents, p_interest_rate_bp, p_term_months,
            p_monthly_payment_cents, p_start_date);
  elsif p_type = 'savings_goal' then
    insert into finance.account_goal_details (account_id, target_amount_cents, target_date)
    values (v_account_id, p_target_amount_cents, p_target_date);
  end if;

  return v_account_id;
end $$;
```

Both inserts are in one function body and therefore one transaction: a violated detail `CHECK`
(`original_amount_cents > 0`, `term_months > 0`, …) rolls the account row back too, so
**an account without its required detail row is not a reachable state.** No idempotency key is
needed — account creation is a deliberate, user-initiated act with no module-originated replay path,
and accounts carry no natural business key (two accounts may legitimately be named "Efectivo").

It lives in migration **8, `finance_api.sql`**, beside the other seam functions, with its `EXECUTE`
grant in the same block (§5.5).

---

## 6. Identity and Personal-Space Bootstrap

**Three Supabase clients**, one per execution context, in `src/shared/supabase/`:
`browser.ts` (`createBrowserClient`), `server.ts` (`createServerClient` over `next/headers` cookies,
with `setAll` wrapped in try/catch because Server Components cannot write cookies), and
`middleware.ts` (the refresh path).

**Middleware** (`src/middleware.ts`) creates `NextResponse.next({ request })`, builds a server client
whose `setAll` writes cookies to **both** `request.cookies` and the response, calls
`await supabase.auth.getUser()` to refresh the session, and returns that exact response object.
Returning a freshly-constructed response without copying its cookies silently logs users out — the
single most common `@supabase/ssr` mistake. Use `getUser()` (validates against the Auth server), never
`getSession()`, for any authorization decision server-side. *(Newer `@supabase/ssr` releases expose
`getClaims()` for local verification with asymmetric signing keys — verify support against the pinned
version before substituting it.)*

The `matcher` excludes `/_next/static`, `/_next/image`, `/icons`, `/sw.js`, `/manifest.webmanifest`,
and image extensions, so the service worker and manifest are never gated by auth.

**Sequence — first sign-in:**

```
/entrar  ──▶ signInWithOAuth({ provider:'google', options:{ redirectTo:'/auth/callback?next=/' }})
                  │
                  ▼            (PKCE: verifier stored in a cookie by @supabase/ssr)
          Google consent ──▶ GET /auth/callback?code=…
                  │
                  ├─ supabase.auth.exchangeCodeForSession(code)      → session cookies set
                  ├─ supabase.rpc('bootstrap_user')  ┌─── ONE transaction ──────────────┐
                  │      (schema: 'app')             │ core.ensure_personal_space()     │
                  │                                  │ finance.ensure_default_categories│
                  │                                  └──────────────────────────────────┘
                  └─ redirect(next ?? '/')                → no ceremony, no space picker
```

### 6.1 `app` — the composition root at the database layer

Option 1 in §3.5 means first sign-in must touch **both** `core` and `finance`. Having
`core.ensure_personal_space()` call into `finance` would invert the declared dependency direction
(`finance → core`, never the reverse) and quietly make the identity kernel depend on a money module.

The fix mirrors the TypeScript layout exactly: `src/app/` is the composition root that may import
several module barrels, so the database gets an `app` schema playing the same role and bound by the
same rule — **`app` may call into modules; modules may not call into `app` or into each other except
downward.** It contains exactly one function this cycle.

```sql
create schema if not exists app;

create or replace function app.bootstrap_user()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_household uuid;
begin
  v_household := core.ensure_personal_space();
  perform finance.ensure_default_categories(v_household);   -- added by the slice-2 migration
  return v_household;
end $$;
```

Slice 1 ships this function with only the `core` line; the slice-2 migration `CREATE OR REPLACE`s it
to add the `finance` line. That is exactly how a composition root is supposed to evolve, and it keeps
first sign-in **atomic**: a user never ends up with a space but no categories, because both steps
commit or roll back together.

### 6.2 The bootstrap itself

```sql
create or replace function core.ensure_personal_space()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_household uuid;
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  insert into core.profiles (user_id, display_name, avatar_url)
  select v_user,
         coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
         u.raw_user_meta_data ->> 'avatar_url'
    from auth.users u where u.id = v_user
  on conflict (user_id) do update
     set display_name = excluded.display_name,
         avatar_url   = excluded.avatar_url,
         updated_at   = now();

  insert into core.households (name, personal_owner_user_id, created_by)
  values ('personal', v_user, v_user)
  on conflict (personal_owner_user_id) do nothing
  returning id into v_household;

  if v_household is null then                       -- concurrent caller won the race
    select id into v_household from core.households where personal_owner_user_id = v_user;
  end if;

  insert into core.household_members (household_id, user_id, role)
  values (v_household, v_user, 'owner')
  on conflict (household_id, user_id) do nothing;

  return v_household;
end $$;
```

**Race resolution.** The `personal_owner_user_id UNIQUE` index is the actual guarantee, not the code
path: two concurrent first sign-ins (two tabs, or a callback racing a middleware retry) both attempt
the insert; Postgres serializes them on the index, the loser's `DO NOTHING` yields no row, and the
follow-up `SELECT` returns the winner's household. Both callers end up in the same space. The category
seed inherits the same protection through `categories_unique_template`. The whole of
`app.bootstrap_user()` is therefore safe to call on every sign-in — which is what makes the
default-taxonomy top-up in §3.5 free.

**Rejected alternative: an `AFTER INSERT` trigger on `auth.users`.** It is the more common Supabase
pattern and is race-free by construction, but any exception inside it makes sign-up fail with an opaque
`Database error saving new user`, and it is awkward to test and to evolve when the invite flow lands.
Explicit, idempotent, application-invoked bootstrap fails **open and visibly** instead.

**Failure mode if bootstrap somehow does not run:** deny-by-default RLS means the user sees an empty
app, never another tenant's data. That is the correct direction to fail.

---

## 7. Design System Implementation

**Three token layers, one direction of reference.**

1. `tokens/primitives.css` — the raw palette in OKLCH (`--lime-400`, `--ink-950`, `--neutral-050`…).
   Components may never reference these.
2. `tokens/semantic.css` — `:root { --background; --surface; --foreground; --accent; --income;
   --expense; --radius-card; --shadow-soft; }` and `.dark { … }` overriding the *same* names.
   Only the values change between themes; no component knows a theme exists.
3. Tailwind v4 `@theme inline { --color-background: var(--background); … }` maps semantic tokens to
   utility classes, so `bg-surface text-expense rounded-card` works. `@theme inline` (rather than plain
   `@theme`) is required for values that are `var()` references resolved at use-site — it is the exact
   pattern the shadcn Tailwind-v4 template uses.

**shadcn retokenization is a value swap, not a fork.** shadcn primitives already consume
`--background/--foreground/--primary/--card/--border/--radius`. Overriding those variable *values* in
`tokens/semantic.css` retokenizes every generated component at once, with no component edits. LifeOS
adds `--income`, `--expense`, `--accent-brand` (lime `#C6F432` family), `--nav-pill` (near-black `#111`),
and `--shadow-soft` on top. Components are copied into `src/design-system/ui/` and treated as owned
source. Radius: `--radius-card: 22px`, `--radius-pill: 9999px`.

**Light/dark switching:** `next-themes` with `attribute="class"`, `defaultTheme="system"`, and
`suppressHydrationWarning` on `<html>`. The inline pre-hydration script prevents the flash. Two
`<meta name="theme-color" media="(prefers-color-scheme: …)">` tags keep the mobile browser chrome in
sync; the manifest's static `theme_color` cannot do that alone.

**"No raw hex in component code" is enforced, not requested:** `scripts/check-tokens.mjs` in `pnpm verify`
rejects any `#rrggbb` or `bg-[#…]` outside `src/design-system/tokens/`.

**Semantic colors are amount-only.** Green income / red expense apply to numbers and trend arrows —
never to brand surfaces, buttons, or nav. Lime is the only brand accent, identical in both themes.

---

## 8. PWA Shell

`src/app/manifest.ts` returns a `MetadataRoute.Manifest` (Next serves it at `/manifest.webmanifest`):
`id: '/'`, `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, `orientation: 'portrait'`,
`background_color` = light page neutral, `theme_color: '#111111'` (the nav pill), icons at 192 and 512
plus one 512 `purpose: 'maskable'`.

**Service worker: hand-written `public/sw.js`, root scope, no build plugin.**

| Request class | Strategy |
|---|---|
| Navigations | network-first → `/offline.html` fallback |
| `/_next/static/**`, `/icons/**` | cache-first (content-hashed, immutable) |
| Anything to Supabase, `/auth/**`, Server Actions, any non-GET | **network-only, never cached** |

That last row is the security-relevant one: caching an authenticated response would put money data in
a shared cache and could survive a sign-out. With "no offline data sync" as a locked decision, the SW's
entire job is shell + static assets, which a ~60-line auditable file does better than a plugin.
*Rejected:* Serwist (the maintained `next-pwa` successor) — capable and App-Router-aware, but it adds a
build step and a generated precache manifest whose contents must still be audited for the same rule.

**Web-Push readiness without building push.** Registering a root-scoped SW *now* is the whole
architectural prerequisite; adding push later is then additive. So `sw.js` ships with empty `push` and
`notificationclick` listeners in place, and the registration call lives in a client component in the
root layout. A `core.push_subscriptions` table is deliberately **not** created (a later `CREATE TABLE`
is not a painful migration). Note for later: on iOS, Web Push requires the app to be added to the Home
Screen and permission requested from a user gesture.

---

## 9. Testing Strategy

Critical-logic focus, no TDD mandate, **no coverage threshold**.

| Layer | What is tested | Tooling |
|---|---|---|
| Unit (pure, no DB) | signed-amount normalization (positive UI input + type → signed cents), transfer-pair construction, balance arithmetic, `class`→headline mapping, category depth/kind rules, `es-MX` MXN formatting, calendar-month boundaries | Vitest against `modules/*/domain/` |
| Database — tenancy | **RLS per table** (member / non-member / anon / private-account, and direct-DML-denied on `accounts`/`transactions` raising `42501`), definer-function membership assertion | pgTAP via `supabase test db` |
| Database — money | derived-balance view correctness incl. voids; transfer sum-zero invariant; **idempotency: same key twice → exactly one row**; `available_cents` excludes `credit_card` and `liability`; savings-goal balance included in the hero | pgTAP |
| Database — account creation | `create_account` sets `class` correctly for all six types; a `liability` or `savings_goal` account **always** has its detail row; a failing detail `CHECK` rolls the account row back (no orphan account); missing or mismatched detail raises `22023`; a non-member raises `42501`; `owner_user_id` is the caller regardless of input | pgTAP |
| Database — corrections | **moving a transaction between accounts leaves BOTH balances correct**; moving a transfer leg is rejected; moving to an account in another space is rejected; editing a voided transaction is rejected | pgTAP |
| Database — categories | seeded defaults land per space; **renaming a default in space A does not change space B**; `ensure_default_categories` re-run inserts only missing templates and never overwrites a rename or un-archives a deactivation; sibling-name collision is rejected; transactions still resolve a renamed and an archived category | pgTAP |
| Contract | `finance/api` facade: Zod rejection of bad input, PG error → `AppError` mapping (`23505`→`CATEGORY_NAME_TAKEN`, `22023`→`TRANSFER_LEG_NOT_MOVABLE`), replay returns the same `TransactionRef` | Vitest against `supabase start` |
| E2E (thin smoke set) | sign-in → dashboard with zero ceremony and categories already present; record expense; **correct an expense onto the right account and see both balances update**; record transfer and confirm it is absent from month income/expense; 375px layout; light and dark render | Playwright |
| Static gates | ESLint boundary fixture produces exactly one error; `check-tokens.mjs` rejects a raw hex; `tsc --noEmit` | `pnpm verify` |

**E2E auth caveat:** do not automate the real Google consent screen. Playwright authenticates against
the local stack with an admin-minted session (`auth.admin.generateLink` or a seeded password user) and
injects the cookies; the real Google flow is verified manually once per environment.

---

## 10. Key Decisions Summary (and divergences from the proposal)

| # | Decision | Rejected alternative | Rationale |
|---|---|---|---|
| 1 | Two-layer Finance seam: `server-only` TS facade → `SECURITY DEFINER` PG function | Server Action with multiple `supabase-js` calls; raw `pg` + `BEGIN` | Only a function body gives one-transaction atomicity for a transfer pair or a cross-module write, while preserving `auth.uid()` for free |
| 2 | **Signed** `amount_cents` (income +, expense −, transfer ±) | magnitude + separate `direction` column | Makes the balance view a plain `sum()`; cost is that reports must `abs()` for display, which is one helper. *Sharpens the proposal, which left sign unstated.* |
| 3 | Unique idempotency key prefixed with `household_id`, partial index `WHERE idempotency_key IS NOT NULL` | the proposal's bare `(origin_module, origin_entity_id, idempotency_key)` | Prevents cross-tenant key collision and sidesteps NULL-distinctness for manual entries |
| 4 | `text + CHECK` for `type`, `kind`, `status`, `role`, `visibility`, `class` | Postgres `ENUM` | Enum values cannot be removed or reordered; a CHECK is a one-line `ALTER` |
| 5 | Bootstrap via idempotent RPC + `personal_owner_user_id UNIQUE` | `AFTER INSERT` trigger on `auth.users` | A failing auth trigger breaks sign-up with an opaque error; explicit bootstrap fails open and visibly, and the unique index still guarantees race-safety |
| 6 | **Default categories copied per space** (`category_templates` catalog → ordinary household rows), `is_system` and nullable `household_id` removed | global default rows + per-space override table | Rename/deactivate become ordinary writes with zero special cases, which is exactly what the spec asks; option 2 taxes every read path with a join+`COALESCE` whose failure mode is showing the wrong name (§3.5) |
| 7 | `app` schema as the DB composition root calling `core` then `finance` in one transaction | letting `core.ensure_personal_space()` call `finance` | Preserves the `finance → core` direction that ESLint enforces in TypeScript, and keeps first sign-in atomic (§6.1) |
| 8 | **Headline = available money**: `sum(balance) where class='asset'`; `credit_card` and `liability` shown separately, never subtracted | net worth as the hero number | User decision. `finance.household_summary` exposes `available_cents` and `debt_cents` separately, so net worth stays a one-line addition if ever wanted |
| 9 | `accounts.class` (`asset`/`liability`) as a trigger-derived column | deriving from `type` in the UI | The headline number must not depend on a client-side type list that drifts |
| 10 | **`accountId` IS patchable**; the definer asserts same-space + visible + non-archived destination; transfer legs reject the move | excluding `accountId`; void-and-recreate for every mistake | Mis-assigning an account is a frequent, expected mistake. The derived-balance view makes both accounts correct on the next read with zero compensating work (§5.4) |
| 11 | Added `updateTransaction(id, patch)` beside `updateOriginTransaction(origin, patch)` | origin-only updates, as the proposal listed | A manual entry has a NULL `origin_entity_id` and is not addressable by origin — yet manual entries are the dominant correction case |
| 12 | Liability remaining balance derived from the same balance view (opening = −principal) | dedicated `remaining_balance_cents` column | No second source of truth, no drift — same reasoning as account balances |
| 13 | Hand-written `sw.js`, no PWA build plugin | Serwist / `next-pwa` | The only requirement is shell caching + root-scope registration for future push; a plugin's generated precache still needs the same audit |
| 14 | `eslint-plugin-boundaries` + an explicit `pnpm verify` gate | `no-restricted-imports` patterns; relying on `next build`'s lint step | Path-resolving rules catch relative escapes; an explicit gate is not hostage to Next's changing lint-on-build behavior |
| 15 | Recurring and budget tables **not** created this cycle | anticipating them in the schema | Adding a table plus a nullable FK column later requires no backfill — not a painful migration |
| 16 | Category template catalog seeded in a **migration**, not `seed.sql` | `supabase/seed.sql` | `seed.sql` runs only on local `db reset`; it never reaches a deployed project |
| 17 | No `application/` layer, no repository interface/impl pair | textbook hexagonal layering | One adapter (Supabase) means the port abstraction has no second implementation to justify it; proportionate to a solo project |
| 18 | **`finance.create_account()` seam function** writing the account row and its required detail row in one transaction; `household_id` is a parameter (asserted), `owner_user_id` and `class` are server-derived | an INSERT grant on `finance.accounts` + a second client call for the detail row | Two of six account types are invalid without a detail row, and a two-step client sequence can strand an account without one — the same multi-row invariant the transfer pair has (§5.6). A client-supplied `owner_user_id` would break private-account visibility; a client-supplied `class` would let the hero number be forged |

---

## File Changes

| File | Action | Description |
|---|---|---|
| `package.json`, `tsconfig.json`, `next.config.ts` | Create | Next.js App Router + TS scaffold; `@/*` path alias; `verify` script |
| `eslint.config.mjs` | Create | Flat config with `boundaries` element types and dependency-direction rules |
| `scripts/check-tokens.mjs` | Create | Fails on raw hex outside the tokens directory |
| `src/middleware.ts` | Create | Session refresh + protected-route redirect; asset/SW matcher exclusions |
| `src/shared/supabase/{browser,server,middleware}.ts` | Create | Three `@supabase/ssr` clients |
| `src/shared/{result,money}.ts` | Create | `Result<T, AppError>`; centavos ↔ `es-MX` MXN |
| `src/design-system/tokens/{primitives,semantic}.css` | Create | Two token layers, light + dark |
| `src/design-system/ui/**`, `patterns/**` | Create | Retokenized shadcn primitives; `BalanceHero`, `MoneyAmount`, `CategoryChip`, `FabMenu` |
| `src/app/{layout.tsx,manifest.ts,globals.css}` | Create | Theme provider, SW registration, manifest |
| `src/app/auth/callback/route.ts` | Create | PKCE exchange + `app.bootstrap_user()` |
| `src/app/(public)/entrar/page.tsx` | Create | Google sign-in screen (Spanish copy) |
| `src/app/(app)/**` | Create | Authenticated shell + minimal accounts/transactions screens to make slice 2 verifiable, incl. the account-correction affordance |
| `src/modules/core/{domain,data,ui,api}/**` | Create | Profile, tenancy helpers, session accessors |
| `src/modules/finance/{domain,data,ui,api}/**` | Create | Money domain rules, category CRUD, repositories, the public seam |
| `supabase/migrations/*_core_{schema,security,bootstrap}.sql` | Create | §3.1, §4, §6.2 |
| `supabase/migrations/*_app_bootstrap.sql` | Create | `app` schema + composition-root function (§6.1) |
| `supabase/migrations/*_finance_{schema,security,category_templates,api}.sql` | Create | §3.2–§3.5, §4, §5 |
| `supabase/migrations/*_app_bootstrap_finance.sql` | Create | `CREATE OR REPLACE app.bootstrap_user()` to add the category seed |
| `supabase/tests/*.sql` | Create | pgTAP RLS / balance / correction / category suites |
| `public/{sw.js,offline.html,icons/*}` | Create | PWA shell |
| `tests/{unit,e2e}/**` | Create | Vitest + Playwright |
| `openspec/config.yaml` | Modify | Fill stack, architecture, test runner (`vitest` + `supabase test db`), quality commands |

## Interfaces / Contracts

```ts
// src/modules/finance/api/index.ts — the ONLY surface other modules may import
import 'server-only';

export type OriginRef  = { module: 'manual' | 'shopping_list' | 'car_control'; entityId: string };
export type TransactionRef = { id: string; householdId: string; status: 'posted' | 'void' };
export type AccountRef = { id: string; householdId: string; type: AccountType; class: 'asset' | 'liability' };

export type AccountType = 'cash' | 'checking' | 'credit_card' | 'savings' | 'liability' | 'savings_goal';

/**
 * A Zod DISCRIMINATED UNION on `type`, so the detail block is required exactly when the type
 * demands it and rejected otherwise — the facade refuses the malformed shape before it can reach
 * the definer's `22023`. `class` is absent on purpose: it is derived server-side (§5.6).
 * `ownerUserId` is likewise absent — the definer takes it from the session.
 */
export type CreateAccountInput = {
  householdId: string;
  name: string;                       // 1–60 chars after trim
  openingBalanceCents?: number;       // default 0; must be <= 0 for credit_card / liability
  visibility?: 'household' | 'private';   // default 'household'
  sortOrder?: number;
} & (
  | { type: 'cash' | 'checking' | 'savings' | 'credit_card' }
  | { type: 'liability'; liability: {
        originalAmountCents: number;  // > 0
        interestRateBp: number;       // basis points, integer >= 0
        termMonths: number;           // > 0
        monthlyPaymentCents: number;  // > 0
        startDate: string;            // ISO date
      } }
  | { type: 'savings_goal'; goal: { targetAmountCents: number; targetDate?: string } }
);

/** One `.rpc('create_account', …)` call. Maps `22023` → `ACCOUNT_DETAIL_REQUIRED`, `42501` → `NOT_A_MEMBER`. */
export declare function createAccount(i: CreateAccountInput): Promise<Result<AccountRef>>;

/** Positive magnitude in centavos; the seam derives the stored sign from `kind`. */
export type RecordTransactionInput = {
  householdId: string; accountId: string; categoryId: string;
  kind: 'income' | 'expense';
  amountCents: number;          // > 0 — the caller never reasons about sign
  occurredOn: string;           // ISO date, no time component
  description: string;
  origin: OriginRef;
  idempotencyKey: string;       // REQUIRED when origin.module !== 'manual'
};

/**
 * `accountId` IS patchable — correcting a mis-assigned account is an expected edit.
 * Rejected with TRANSFER_LEG_NOT_MOVABLE when the target is one leg of a transfer pair;
 * rejected with INVALID_DESTINATION_ACCOUNT when the account belongs to another space,
 * is archived, or is not visible to the caller. See §5.4.
 */
export type TransactionPatch = {
  accountId?:   string;
  categoryId?:  string;
  amountCents?: number;         // > 0; sign re-derived from the transaction's existing type
  occurredOn?:  string;
  description?: string;
};

export declare function recordTransaction(i: RecordTransactionInput): Promise<Result<TransactionRef>>;
export declare function recordTransfer(i: RecordTransferInput):      Promise<Result<TransferRef>>;
/** First-party/manual edits — the dominant correction path. */
export declare function updateTransaction(id: string, p: TransactionPatch): Promise<Result<TransactionRef>>;
/** Cross-module edits, addressed by the calling module's own entity id. */
export declare function updateOriginTransaction(o: OriginRef, p: TransactionPatch): Promise<Result<TransactionRef>>;
export declare function voidTransaction(o: OriginRef, reason: string): Promise<Result<void>>;
export declare function findByOrigin(o: OriginRef): Promise<Result<TransactionRef | null>>;
```

## Cross-Module Dependencies

```
                 app  (composition root — TS: src/app/ ;  DB: schema `app`)
                  │        the ONLY place allowed to call into two modules
        ┌─────────┴─────────┐
        ▼                   ▼
      core               finance ────▶ core
 (identity kernel,   (money hub)
  depends on nothing)
                          ▲
                          │  (future, one-directional — via finance/api only)
                          ├── shopping_list
                          └── car_control

design-system  →  depends on nothing in modules/
health, nutrition, recipes  →  financially inert; no Finance dependency until a real cost feature exists
```

Both directions are lint-enforced (§2 Gate B) and mirrored in the DB by the absence of any
cross-schema foreign key out of `finance`, and by `finance` never being called from `core`.

## Threat Matrix

**N/A** — this design introduces no shell command, subprocess, VCS/PR automation,
executable-file classification, or process-integration boundary. The reference matrix's rows
(documentation-like paths, git repository selection, commit state, push state, PR commands) have
no counterpart here. The change's real adversarial surface is application-level and is covered
explicitly instead: `SECURITY DEFINER` privilege escalation (§4.1 pinned `search_path` + mandatory
membership assertion), seam bypass via direct PostgREST DML (§5.5 grant revocation + a pgTAP test
asserting `42501`), RLS view leakage (§3.3 `security_invoker`), cross-tenant idempotency collision
(§5.3 household-prefixed unique index), **cross-space transaction move** (§5.4 destination
`household_id` assertion inside the definer, where RLS is bypassed), and authenticated-response
caching in the service worker (§8 network-only rule).

## Migration / Rollout

No data migration — greenfield. Deployment order is migrations first, then app. Rollback is total:
`supabase db reset` locally, or `drop schema app, finance, core cascade;` on a remote project with no
production data.

Slice 1 (scaffold + design system + identity + RLS foundation + boundary lint + `app.bootstrap_user()`
with only the `core` step) is independently shippable and must land before slice 2, because slice 2's
RLS policies depend on `core.is_member()` and its bootstrap step depends on `app.bootstrap_user()`
already existing to be replaced.

## Open Questions

Resolved since revision 1 and folded into the design: the housing category seeds as `"Casa"`;
the hero number is available money (`class = 'asset'`, so `savings_goal` is included and
`credit_card`/`liability` are not); `accountId` is patchable.

- [ ] **Should the correction UI expose "void and re-record" for transfers?** §5.4 rejects moving a
      transfer leg and returns `TRANSFER_LEG_NOT_MOVABLE`. The seam supports the remedy today
      (`voidTransaction` on the group + `recordTransfer`), but whether the UI offers it as a one-tap
      action or simply blocks the edit is a slice-3 UX call. Nothing in the schema depends on it.
- [ ] **Should a user be able to hard-delete a custom category with zero transactions?** This design
      says no (archive only, per the spec's "Deactivate Instead of Deleting" requirement) and grants
      no `DELETE`. Confirm that an archived-but-empty category cluttering the settings list is
      acceptable, or a future `deleteEmptyCategory` RPC can add it safely.
- [ ] **Verify at implementation time, do not assume:** (a) whether the pinned Next.js version still
      runs ESLint during `next build`; (b) `getClaims()` availability in the pinned `@supabase/ssr`;
      (c) `basejump/supabase-test-helpers` compatibility with the pinned Supabase CLI.
      *(Context7/WebSearch were unavailable to this agent, so these are flagged rather than asserted.
      Everything load-bearing — grants, `security_invoker`, definer recursion, `ON CONFLICT` on a
      partial index — is version-stable Postgres behavior.)*
