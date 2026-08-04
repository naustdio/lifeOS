# Tasks: LifeOS Foundation — Architecture + Finance Core

> Cycle scope: proposal delivery slices 1 and 2 only (scaffold + design system + identity;
> Finance core incl. the public `finance/api` seam). Slices 3-5 (polished Finance UI, recurring,
> budgets, dashboard feed) are out of scope for this cycle — see `design.md` §"Migration/Rollout"
> and the proposal's "Cycle scope decision".
>
> Task IDs are stable references for `sdd-verify` traceability. Each task cites the exact spec
> requirement(s) it satisfies via `capability/Requirement Name`. Design section references use
> `design.md §N`.

## Sub-slice grouping (size management)

The proposal flagged that slices 1-2 would likely need internal splitting to respect the 800-line
review budget. This breakdown groups tasks into three shippable sub-slices, each independently
reviewable and each landing as its own PR (or PR chain):

- **1A — Scaffold, tokens, boundary lint** (no DB, no auth logic yet)
- **1B — Identity: `core` schema, RLS, bootstrap, Google auth wiring**
- **2A — Finance schema: accounts, categories, transactions, balances**
- **2B — Finance security + `finance/api` seam (RPC functions + TS facade)**
- **2C — Minimal Finance UI to verify slice 2 end-to-end**

See the Review Workload Forecast at the end of this document for line estimates and chaining
guidance.

---

## Sub-slice 1A — Scaffold, Design System, Boundary Lint

### T-001 [x] DONE: Initialize Next.js + TypeScript + Tailwind scaffold
- Create `package.json`, `tsconfig.json`, `next.config.ts`, `@/*` path alias.
- Add the `pnpm verify` script wired to `eslint . --max-warnings=0 && tsc --noEmit && node scripts/check-tokens.mjs && next build` (design.md §2 Gate C).
- Initialize git repository (none exists yet at repo root per proposal Dependencies).
- Satisfies: `module-architecture/Module Folder Structure` (scaffolding prerequisite).
- Parallel: sequential (must land first — everything depends on it).

### T-002 [x] DONE: ESLint boundary rules (`eslint-plugin-boundaries`)
- Add `eslint.config.mjs` flat config exactly per design.md §2 Gate A: `boundaries/elements` for `app`, `design-system`, `shared`, `module-api`, `module-domain`, `module-data`, `module-ui`; `boundaries/element-types` disallow-by-default with the allow list from design.md.
- Add Gate B: forbid `finance → {shopping_list, car_control, ...}` and forbid any module reaching into `core`'s internals; `core` may never import `finance`.
- Create `src/modules/core/` and `src/modules/finance/` folder skeletons (`domain/`, `data/`, `ui/`, `api/`) even though they are empty, so the rule has real targets.
- Add committed fixture `tests/boundary-fixtures/illegal-import.ts.txt` plus a lint test asserting ESLint reports exactly one `boundaries/element-types` error (design.md §2 Gate C).
- **This MUST be the first PR that introduces the module folder structure** — per `module-architecture/Boundary Rules Ship Before Feature Code`, the rule must be active before any Finance domain code exists.
- Satisfies: `module-architecture/Import Boundary Enforcement`, `module-architecture/Allowed Dependency Direction`, `module-architecture/Boundary Rules Ship Before Feature Code`.
- Depends on: T-001.
- Parallel: sequential (governs everything built after — must land before T-005+ and all module code).

### T-003 [x] DONE: `scripts/check-tokens.mjs` raw-hex gate
- Script fails on any `#rrggbb` literal or `-[#...]` Tailwind arbitrary color found outside `src/design-system/tokens/`.
- Wire into `pnpm verify` (already referenced by T-001's script; this task implements the script itself).
- Satisfies: `design-system/No Raw Hex in Components` (enforcement mechanism).
- Depends on: T-001.
- Parallel: yes, parallel with T-002.

### T-004 [x] DONE: Design tokens — primitives + semantic layers (light + dark)
- `src/design-system/tokens/primitives.css` — raw OKLCH palette (`--lime-400`, `--ink-950`, `--neutral-050`, etc.). Components never reference these directly.
- `src/design-system/tokens/semantic.css` — `:root { --background; --surface; --foreground; --accent; --income; --expense; --radius-card; --shadow-soft; ... }` plus `.dark { ... }` overriding the same names with distinct values (design.md §7).
- Tailwind v4 `@theme inline` mapping in `globals.css`.
- Satisfies: `design-system/Token Definitions` (both light and dark values per token).
- Depends on: T-001.
- Parallel: yes, parallel with T-002/T-003.

### T-005 [x] DONE: Retokenized base component set (shadcn primitives + patterns)
- Copy shadcn primitives into `src/design-system/ui/` (button, card, sheet, input, etc.), retokenized by overriding `--background/--foreground/--primary/--card/--border/--radius` values only — no component forking.
- Build patterns: `BalanceHero`, `MoneyAmount`, `CategoryChip`, `FabMenu` in `src/design-system/patterns/`.
- Pill-shaped buttons/chips/nav (`--radius-pill: 9999px`), 20-24px card radius (`--radius-card: 22px`).
- `MoneyAmount` renders income in the `--income` (green) token and expense in the `--expense` (red) token — never brand accent.
- Satisfies: `design-system/Base Component Set`, `design-system/No Raw Hex in Components`, `design-system/Dual Theme Support` (scenario: semantic amount colors remain consistent).
- Depends on: T-003, T-004.
- Parallel: sequential after T-003/T-004.

### T-006 [x] DONE: Theme selection (system preference + persisted override)
- `next-themes` with `attribute="class"`, `defaultTheme="system"`, `suppressHydrationWarning` on `<html>`, inline pre-hydration script to prevent flash.
- Explicit user override control (light/dark) that persists across sessions and takes precedence until the user returns to "system-following," which clears the stored override.
- Two `<meta name="theme-color" media="(prefers-color-scheme: ...)">` tags for mobile browser chrome sync.
- Satisfies: `design-system/Theme Selection` (all three scenarios: first-visit system default, manual override persistence, clearing override).
- Depends on: T-004, T-005.
- Parallel: sequential.

### T-007 [x] DONE: Mobile-first layout verification harness
- Base layout shell tested/verified at 375px viewport (Playwright or manual checklist wired into `pnpm verify`'s E2E smoke pass — see T-029).
- Satisfies: `design-system/Mobile-First Layout`.
- Depends on: T-005.
- Parallel: yes, can run alongside T-006.

### T-008 [x] DONE: PWA shell — manifest + service worker
- `src/app/manifest.ts` returning `MetadataRoute.Manifest`: `id: '/'`, `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, `orientation: 'portrait'`, `theme_color: '#111111'`, icons at 192/512 plus one 512 `purpose: 'maskable'`.
- Hand-written `public/sw.js` (no build plugin, per design.md §8 rejection of Serwist/next-pwa): network-first + `/offline.html` fallback for navigations; cache-first for `/_next/static/**` and `/icons/**`; **network-only, never cached** for Supabase calls, `/auth/**`, Server Actions, and any non-GET request.
- Empty `push`/`notificationclick` listeners as web-push readiness scaffolding (no `core.push_subscriptions` table — deliberately deferred).
- SW registration in a client component in the root layout.
- `src/middleware.ts` matcher excludes `/_next/static`, `/_next/image`, `/icons`, `/sw.js`, `/manifest.webmanifest`, image extensions.
- **Trap**: caching an authenticated response would leak money data into a shared cache and could survive sign-out — the network-only rule for non-GET/Supabase/auth traffic is the security-relevant line, do not relax it.
- Satisfies: proposal Success Criteria "installable to a phone home screen (valid manifest + service worker)".
- Depends on: T-001.
- Parallel: yes, parallel with T-002–T-006.

---

## Sub-slice 1B — Identity Kernel (`core` schema, RLS, bootstrap, Google auth)

### T-009: `core` schema migration — profiles, households, household_members
- Migration `core_schema.sql`: `core.profiles`, `core.households` (incl. `personal_owner_user_id uuid unique` — the race-free bootstrap anchor), `core.household_members` (`role` CHECK `in ('owner','member')`, composite PK, index on `user_id`).
- Exact DDL per design.md §3.1.
- Satisfies: `identity/Roles Are Owner or Member Only` (schema-level CHECK), `module-architecture/Schema-Per-Module`.
- Depends on: T-001 (repo scaffold exists so `supabase/migrations/` has a home).
- Parallel: sequential (first DB migration).

### T-010: `core.is_member()` and membership helper functions
- `core.is_member(p_household_id)` — **MUST be `SECURITY DEFINER`, language `sql stable`, `set search_path = ''`, using `(select auth.uid())`** (not bare `auth.uid()`, for InitPlan caching).
- **Known trap**: a plain (non-definer) SQL function used inside a policy on `core.household_members` that itself queries `core.household_members` produces `infinite recursion detected in policy`. `SECURITY DEFINER` is what breaks the cycle — do not "simplify" this to a regular function.
- `core.assert_member(p_household_id)` raising `insufficient_privilege` (42501) — used inside every later `SECURITY DEFINER` seam function per design.md §4.3.
- `core.is_owner(p_household_id)` for owner-only policies (households UPDATE, household_members DELETE).
- Satisfies: `identity/RLS Enforced by Household Membership` (mechanism prerequisite).
- Depends on: T-009.
- Parallel: sequential.

### T-011: RLS policies — `core.*` tables + grants
- Migration `core_security.sql`: `alter table ... enable row level security` on all three `core` tables, zero permissive default (deny-by-default floor).
- Policies exactly per design.md §4.2 table for `core.profiles`, `core.households`, `core.household_members` — all `TO authenticated`.
- No INSERT policy on `households`/`household_members` — bootstrap/invite function only (enforced via SECURITY DEFINER, not RLS INSERT policy).
- Satisfies: `identity/RLS Enforced by Household Membership` (both scenarios: member reads own household's rows, non-member denied).
- Depends on: T-010.
- Parallel: sequential.

### T-012: `core.ensure_personal_space()` — idempotent bootstrap
- Exact function per design.md §6.2: creates/updates `core.profiles`, inserts `core.households` with `ON CONFLICT (personal_owner_user_id) DO NOTHING`, falls back to `SELECT` on conflict (race resolution), inserts `core.household_members` with `ON CONFLICT DO NOTHING`.
- **Known trap**: the `personal_owner_user_id UNIQUE` index is the actual concurrency guarantee — two concurrent first sign-ins race on the index, the loser's `DO NOTHING` yields no row, and the follow-up `SELECT` returns the winner's household. Both callers must end up in the same space; write a pgTAP or integration test that actually issues two concurrent calls, not just a single-call happy path.
- Satisfies: `identity/Auto-Created Personal Space on First Sign-In` (both scenarios: first sign-in creates silently, returning user does not duplicate).
- Depends on: T-011.
- Parallel: sequential.

### T-013: `app` schema + `app.bootstrap_user()` composition root (core-only step)
- Migration `app_bootstrap.sql`: `create schema app`, `app.bootstrap_user()` calling `core.ensure_personal_space()` only at this point (finance step added in T-020).
- `grant execute on function app.bootstrap_user() to authenticated`. `core.ensure_personal_space` itself NOT granted to `authenticated` — reachable only through `app.bootstrap_user()`.
- **Design rationale to preserve**: this exists so `core` never has to call `finance` (which would invert the `finance → core` dependency direction enforced by ESLint). `app` is the DB-layer mirror of `src/app/` as composition root — the only schema allowed to call into two modules.
- Satisfies: `identity/Auto-Created Personal Space on First Sign-In` (composition-root mechanism); architectural prerequisite for slice 2's `app_bootstrap_finance.sql` (T-020).
- Depends on: T-012.
- Parallel: sequential.

### T-014: Three Supabase clients + middleware session refresh
- `src/shared/supabase/browser.ts` (`createBrowserClient`), `server.ts` (`createServerClient` over `next/headers` cookies, `setAll` wrapped in try/catch), `middleware.ts` (refresh path).
- `src/middleware.ts`: builds a server client whose `setAll` writes cookies to **both** `request.cookies` and the response, calls `await supabase.auth.getUser()` (never `getSession()` for authorization decisions), returns that exact response object.
- **Known trap**: constructing a fresh `NextResponse` without copying its cookies silently logs users out — the most common `@supabase/ssr` mistake. Verify the returned response object is the one whose cookies were mutated, not a new one.
- Satisfies: `identity/Google OAuth Only` (session plumbing prerequisite).
- Depends on: T-001.
- Parallel: yes, can run parallel with T-009–T-013 (pure TS/Next code, no DB dependency until T-015).

### T-015: Google OAuth sign-in flow + callback
- `(public)/entrar/page.tsx` — Spanish sign-in screen offering **only** "Iniciar sesión con Google," calling `signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback?next=/' } })`.
- `auth/callback/route.ts` — `exchangeCodeForSession(code)`, then `supabase.rpc('bootstrap_user')` (schema `app`), then `redirect(next ?? '/')`.
- `auth/salir/route.ts` — sign-out.
- Satisfies: `identity/Google OAuth Only` (both requirement and scenario), `identity/Auto-Created Personal Space on First Sign-In` (end-to-end wiring), proposal Success Criteria "owner signs in with Google and lands on a dashboard with zero setup ceremony."
- Depends on: T-013, T-014.
- Parallel: sequential.

### T-016: pgTAP — `core` RLS + bootstrap race tests
- Mandatory cases per design.md §4.4 for `core.profiles`, `core.households`, `core.household_members`: member sees own rows, non-member sees zero rows, `anon` sees zero rows.
- Concurrency test for `core.ensure_personal_space()`: two concurrent first-sign-in calls end up in the same household with no duplicate rows (the race-resolution scenario from T-012).
- Satisfies: `identity/RLS Enforced by Household Membership`, `identity/Auto-Created Personal Space on First Sign-In` (test coverage per design.md §9 testing strategy table, row "Database — tenancy").
- Depends on: T-012, T-011.
- Parallel: yes, can run parallel with T-014/T-015 once T-011/T-012 land.

### T-017: "No household/hogar in UI" verification checklist + minimal auth shell
- Minimal authenticated shell (`(app)/layout.tsx`, home page stub) that never renders "household"/"hogar" text and has no space-selection control.
- Add a static-text-scan check (grep-based or Playwright text-assertion) as part of the E2E smoke set (T-029) asserting neither string appears on any authenticated screen.
- Satisfies: `identity/Household Terminology Hidden From UI`.
- Depends on: T-015.
- Parallel: sequential (needs the auth shell from T-015 to have something to scan).

---

## Sub-slice 2A — Finance Schema: Accounts, Categories, Transactions, Balances

### T-018: `finance.accounts` + detail tables migration
- Migration `finance_schema.sql` (accounts portion): `finance.accounts` exactly per design.md §3.2 — `type` CHECK across all six values (`cash`, `checking`, `credit_card`, `savings`, `liability`, `savings_goal`), `class` CHECK (`asset`/`liability`), `visibility` CHECK, `currency` CHECK (`MXN` only), `accounts_private_needs_owner` constraint, partial index on non-archived rows.
- `finance.account_liability_details` and `finance.account_goal_details` per design.md §3.2.
- **Trigger trap**: `accounts.class` MUST be trigger-derived from `type` (BEFORE INSERT/UPDATE), never client-supplied — this is what makes the headline "available money" figure trustworthy. Implement the trigger in this task, not deferred.
- Satisfies: `finance-accounts/Six Account Types`, `finance-accounts/Liability Account Detail`, `finance-accounts/Savings-Goal Account Detail` (schema half; goal-progress computation is T-024/T-027).
- Depends on: T-013 (needs `core.households` to exist for the FK).
- Parallel: sequential (first Finance migration).

### T-019: `finance.category_templates` + `finance.categories` migration
- Migration `finance_category_templates.sql` (catalog) and the `finance.categories` portion of `finance_schema.sql`, exactly per design.md §3.2/§3.5.
- `finance.category_templates`: catalog table, no `household_id`, `tmpl_one_level` CHECK, seeded with the full Spanish taxonomy table from design.md §3.5 (housing seeds as **"Casa"**, not "Hogar" — literal requirement from the proposal's UI-language success criterion).
- `finance.categories`: `household_id NOT NULL` (no globally-shared rows — this is the option-1 mechanism decision from design.md §3.5, chosen over global-rows-plus-override), `template_key` FK `on delete set null` (provenance only, never restricts rename/deactivate), `categories_unique_name` unique index (household_id, coalesce(parent_id, zero-uuid), lower(btrim(name))), `categories_unique_template` partial unique index (arbiter for `ON CONFLICT` in T-022).
- **Trap — do not resurrect revision-1 fields**: no `is_system boolean`, no `categories_system_is_global` CHECK, no nullable `household_id`. Those existed only to model globally-shared defaults, which the "Rename Any Category" requirement rules out.
- One-level-nesting trigger + same-`kind`-and-`household_id`-as-parent trigger (design.md §3.4).
- **Trap**: system categories are seeded via `finance.category_templates` in a **migration file**, never in `supabase/seed.sql` — `seed.sql` only runs on local `db reset` and never reaches a deployed project.
- Satisfies: `finance-categories/Two-Level Taxonomy`, `finance-categories/Seeded Spanish Defaults` (schema half — actual per-space copy happens in T-022), `finance-categories/User-Created Categories`.
- Depends on: T-013.
- Parallel: yes, parallel with T-018 (different tables, same migration file group, can be authored together or split).

### T-020: `finance.transactions` migration
- Migration `finance_schema.sql` (transactions portion) exactly per design.md §3.3: signed `amount_cents` (income > 0, expense < 0, transfer legs ±), all CHECK constraints (`tx_sign_matches_type`, `tx_transfer_group`, `tx_category_required`, `tx_transfer_has_no_category`, `tx_void_fields`, `tx_origin_requires_keys`), `tx_idempotency` partial unique index on `(household_id, origin_module, origin_entity_id, idempotency_key) WHERE idempotency_key IS NOT NULL`, all four secondary indexes.
- **Trap**: the idempotency unique index is household-prefixed (`household_id` first column) specifically so one tenant's key can never collide with another tenant's — this sharpens the proposal's bare `(origin_module, origin_entity_id, idempotency_key)` tuple. Do not drop the `household_id` prefix.
- Satisfies: `finance-transactions/Transaction Types and Money Representation`, `finance-transactions/Linked Transfer Pairs` (schema half), `finance-module-api/Idempotent recordTransaction` (schema half).
- Depends on: T-018 (FK to accounts), T-019 (FK to categories).
- Parallel: sequential after T-018/T-019.

### T-021: `finance.account_balances` and `finance.household_summary` views
- Exact DDL per design.md §3.3.
- **CRITICAL TRAP — do not omit `security_invoker = true` on EITHER view.** Without it, the view runs as its owner and silently bypasses RLS on `accounts`/`transactions` — the classic Supabase data-leak footgun (flagged by the Supabase linter as `security_definer_view`). Both `finance.account_balances` and `finance.household_summary` need this, not just one.
- `finance.household_summary.available_cents` = `sum(balance) where class = 'asset'` (includes `cash`, `checking`, `savings`, `savings_goal`); `debt_cents` = `sum(-balance) where class = 'liability'` as a **positive magnitude** (includes `credit_card`, `liability`), rendered separately and **never subtracted from `available_cents`**.
- Regular view, not materialized (materialized views do not honor RLS).
- Satisfies: `finance-accounts/Derived Balances` (both scenarios), `finance-accounts/Savings-Goal Account Detail` (goal-progress-from-balance scenario).
- Depends on: T-020.
- Parallel: sequential.

### T-022: `finance.ensure_default_categories()` — idempotent per-space seed
- Exact function per design.md §3.5: two-pass insert (top-level templates, then children resolved via the just-inserted parent rows), `ON CONFLICT (household_id, template_key) WHERE template_key IS NOT NULL DO NOTHING`.
- **Trap**: `DO NOTHING` must never overwrite a user's rename or un-archive something they deactivated — this is what makes it safe to re-run on every sign-in (top-up semantics when new templates are added later). Do not implement this as an upsert that touches `name`/`archived_at`.
- `perform core.assert_member(p_household_id)` guard at the top (design.md §4.3 pattern — definer functions re-implement the assertion RLS would otherwise provide).
- Satisfies: `finance-categories/Seeded Spanish Defaults` (actual per-space copy mechanism — design's chosen "option 1" resolving the spec's open mechanism question).
- Depends on: T-019.
- Parallel: sequential, but can run parallel with T-020/T-021 (different function, same schema).

### T-023: `finance.can_read_account()` + RLS policies on `finance.*`
- `finance.can_read_account(p_account_id)` per design.md §4.1: `SECURITY DEFINER`, checks `core.is_member` plus `visibility = 'household' OR owner_user_id = auth.uid()`.
- Migration `finance_security.sql`: RLS enabled on every `finance` table, policies exactly per design.md §4.2 table. Note the deliberate asymmetry: `finance.accounts`/`finance.transactions` have **SELECT-only** policies (writes are seam-only, no INSERT/UPDATE/DELETE policy); `finance.categories` has SELECT+INSERT+UPDATE policies (no DELETE — deactivate via `archived_at`); `finance.category_templates` has **no grant at all** for `authenticated` — read only by definer functions.
- Grant revocation per design.md §5.5: `revoke all on all tables/functions in schema finance from anon, authenticated`, then explicit re-grants (SELECT on read tables/views, INSERT+UPDATE only on `categories`, EXECUTE on seam functions — seam functions themselves land in T-025/T-026, this task does the revoke/base-grant scaffolding).
- Satisfies: `identity/RLS Enforced by Household Membership` (finance tables), `finance-module-api/Public API Is the Only Cross-Module Write Surface` (grant-revocation half).
- Depends on: T-021, T-022.
- Parallel: sequential.

### T-024: Vitest — pure domain logic unit tests
- `modules/finance/domain/` pure functions + tests: signed-amount normalization (positive UI input + type → signed cents), transfer-pair construction (two rows, opposite signs, same `transfer_group_id`, sum zero), balance arithmetic helper, `class` → headline-inclusion mapping, category depth/kind rules (pure validation before hitting the DB trigger), `es-MX` MXN formatting (centavos → display string), calendar-month boundary helper (day 1 → end of month).
- No DB dependency — Vitest against `modules/*/domain/` only, per design.md §9 testing strategy table row "Unit (pure, no DB)".
- Satisfies: cross-cutting — underlies `finance-transactions/Transaction Types and Money Representation`, `finance-transactions/Linked Transfer Pairs`, `finance-accounts/Derived Balances`, `finance-categories/Two-Level Taxonomy`. This is the pure-logic layer the pgTAP suites (T-032–T-035) do not duplicate.
- Depends on: T-020 (needs the transaction shape settled), but is otherwise DB-independent and can be authored in parallel with T-021–T-023.
- Parallel: yes.

### T-025: pgTAP — money invariants (balances, transfers, idempotency, headline split, account creation)
- Cases per design.md §9 row "Database — money": derived-balance view correctness including voids; transfer sum-zero invariant; idempotency (same key twice → exactly one row); `available_cents` excludes `credit_card` and `liability`; savings-goal balance included in the hero.
- Explicit `security_invoker` regression test: query the view as a low-privilege user who is NOT a member of the household and confirm zero rows returned (this is the direct regression test for the T-021 trap).
- **Cases per design.md §9 row "Database — account creation"** (`finance.create_account()`, T-026, design.md §5.6):
  - happy-path creation for each of the six account types (`cash`, `checking`, `credit_card`, `savings`, `liability`, `savings_goal`), asserting `class` is trigger-set correctly per the §3.4/§5.6 mapping table (never client-supplied);
  - `liability` and `savings_goal` creation atomically inserts the matching detail row (`account_liability_details`/`account_goal_details`) in the same transaction — no orphan account is a reachable state;
  - a mismatched detail block (missing required liability/goal fields, or a detail block supplied for a type that forbids one) is rejected with `22023`;
  - **a `credit_card` or `liability` account with a positive `opening_balance_cents` is rejected with `22023`** — debt is represented as zero or negative, never positive (confirmed rule, design.md §3.3/§5.6);
  - a failing detail `CHECK` (e.g. `term_months <= 0`) rolls the account row back too (no orphan account row survives);
  - a non-member of `p_household_id` raises `42501` via `core.assert_member`;
  - `owner_user_id` on the created row is always the caller (`auth.uid()`), regardless of any input attempting to set it.
- Satisfies: `finance-accounts/Derived Balances`, `finance-transactions/Transfers Excluded From Income/Expense Reporting`, `finance-module-api/Idempotent recordTransaction`, `finance-accounts/Six Account Types`, `finance-accounts/Liability Account Detail`, `finance-accounts/Savings-Goal Account Detail` (pgTAP coverage, design.md §9 row "Database — account creation").
- Depends on: T-021, T-025's own subject T-026 (idempotency and account-creation cases need the seam function — see note below: split idempotency/account-creation tests into T-032 if the seam isn't ready yet; otherwise author balance/transfer-sum-zero portions here and idempotency/account-creation portions alongside T-026).
- Parallel: yes, parallel with T-024.

---

## Sub-slice 2B — Finance Security + `finance/api` Seam

### T-026: `finance.record_transaction()`, `finance.record_transfer()`, and `finance.create_account()` RPC functions
- `SECURITY DEFINER`, `set search_path = ''`, `perform core.assert_member(p_household_id)` guard.
- `record_transaction`: derives signed `amount_cents` from `kind` (income/expense) + positive magnitude input; enforces the idempotency insert pattern from design.md §5.3 exactly (`INSERT ... ON CONFLICT ... DO NOTHING RETURNING id INTO v_id; IF v_id IS NULL THEN SELECT ... follow-up`).
- `record_transfer`: inserts both legs of a transfer pair in one statement (same `transfer_group_id`, opposite signs, sum zero) — this is the design's chosen enforcement point for "transfer group = exactly two rows, opposite signs, sum zero" (deliberately not a deferred constraint trigger, per design.md §3.4).
- **Trap**: two concurrent identical `record_transaction` calls — the second blocks on the unique index until the first commits, `DO NOTHING` yields nothing, and the READ-COMMITTED follow-up `SELECT` finds the committed row. Both callers must receive the same `TransactionRef`. Write a concurrency test for this, not just a single-call test.
- `create_account`: exact function per design.md §5.6 — writes the `finance.accounts` row and its required `account_liability_details`/`account_goal_details` row in the **same transaction**, so an account without its required detail row is not a reachable state (a violated detail `CHECK` rolls the account row back too).
  - **Trap — `search_path` pinning**: `set search_path = ''` with fully-qualified names, same as every other seam function — omitting it is a Supabase `function_search_path_mutable` linter finding and a privilege-escalation vector.
  - **Trap — membership assertion**: opens with `perform core.assert_member(p_household_id)`, identical to every other seam function's opener (design.md §4.3); `household_id` is a parameter (not session-resolved) per the existing seam convention, but the assertion — not the parameter — is what makes it safe.
  - **Trap — atomic detail-row insert**: the account insert and the `liability`/`savings_goal` detail insert happen in one function body/one transaction, never as two separate client calls — this is the same multi-row-invariant problem as the transfer pair (design.md §4.3, §5.6).
  - **Trap — class mapping is NOT duplicated here**: `create_account` takes no `class` parameter and inserts none. The `BEFORE INSERT` trigger from T-018 is the *single* authority deriving `class` from `type`; re-implementing that mapping in this function would create a second place for it to drift from the headline "available money" rule (design.md §5.6).
  - **Trap — detail-block/type mismatch**: reject with `22023` when the liability/goal detail fields don't exactly match what `p_type` requires (all five liability fields present and no goal fields for `liability`; `target_amount_cents` present and no liability fields for `savings_goal`; no detail fields at all for the other four types).
  - **Trap — positive opening balance on debt-bearing types**: `credit_card` and `liability` accounts reject a positive `p_opening_balance_cents` with `22023` — debt is represented as zero or negative (opening balance is the negative of outstanding principal, per design.md §3.3/§5.6), never as a positive number.
  - `owner_user_id` is taken from `(select auth.uid())` inside the definer, never accepted as a parameter — a client-supplied owner on a `private` account would let a caller create an account visible only to someone else.
- Lives in migration 8, `finance_api.sql`, beside the other seam functions (design.md §5.6).
- Satisfies: `finance-transactions/Transaction Types and Money Representation`, `finance-transactions/Linked Transfer Pairs`, `finance-module-api/Idempotent recordTransaction`, `finance-module-api/Server-Side, Atomic Execution`, `finance-module-api/Module-Originated Transactions Post Immediately`, `finance-accounts/Six Account Types`, `finance-accounts/Liability Account Detail`, `finance-accounts/Savings-Goal Account Detail` (write-path mechanism completing T-018's schema).
- Depends on: T-023.
- Parallel: sequential.

### T-027: `finance.update_transaction()` / `finance.update_origin_transaction()` RPC functions
- Exact function per design.md §5.4: guard checks (not found → `P0002`; membership via `core.assert_member`; caller can read the account via `can_read_account`; voided transaction rejected with `22023`).
- **Trap — transfer-leg-reject rule**: if `p_account_id` is supplied, differs from the current `account_id`, AND `v_tx.type = 'transfer'` → raise with errcode `22023`, mapped by the facade to `TRANSFER_LEG_NOT_MOVABLE`. This must be checked before the destination-account validation, not after.
- **Trap — cross-space move rejection**: destination account must satisfy `a.household_id = v_tx.household_id AND a.archived_at IS NULL AND finance.can_read_account(p_account_id)`, evaluated **inside the definer** where RLS is bypassed — this is the concrete instance of "no RLS policy can express a cross-object same-tenant assertion" from design.md §4.3.
- `amount_cents` re-derivation: positive magnitude in, sign re-derived from the *existing* `type` (expense → negative, else positive) — never accept a signed value from the patch.
- `update_origin_transaction` resolves `(household_id, origin_module, origin_entity_id)` → transaction id, then delegates to `update_transaction` — exactly one code path carrying the guards (per design.md §5.4 "sharpening vs proposal" note).
- Satisfies: `finance-module-api/Update and Void Follow the Source Record` (update half); proposal-level requirement for `updateTransaction`/`updateOriginTransaction` incl. cross-account move + transfer-leg-reject rule (design.md §5.4, Key Decisions #10, #11).
- Depends on: T-026.
- Parallel: sequential.

### T-028: `finance.void_transaction()` and `finance.find_by_origin()` RPC functions
- `void_transaction`: transitions `status` to `void`, sets `voided_at`/`voided_by_user_id`/`void_reason`. **Voiding one leg of a transfer pair must void the linked leg in the same operation** (same `transfer_group_id`) — single transaction, both rows or neither.
- `find_by_origin`: resolves `(household_id, origin_module, origin_entity_id)` → `TransactionRef` or NULL — never throws when absent.
- Satisfies: `finance-transactions/Void Lifecycle, Never Hard-Delete` (both scenarios, incl. "voiding one side of a transfer voids both sides"), `finance-module-api/Update and Void Follow the Source Record` (void half), `finance-module-api/findByOrigin Returns Null, Not an Error, When Absent`.
- Depends on: T-026.
- Parallel: yes, parallel with T-027 (different functions, same dependency on T-026).

### T-029: Grant EXECUTE on seam functions; finalize `finance_api.sql` migration
- Migration `finance_api.sql`: `grant execute on function finance.create_account(...), finance.record_transaction(...), finance.record_transfer(...), finance.update_transaction(...), finance.update_origin_transaction(...), finance.void_transaction(...), finance.find_by_origin(...) to authenticated` (design.md §5.5).
- Confirm no direct DML grants exist anywhere on `finance.accounts`/`finance.account_liability_details`/`finance.account_goal_details`/`finance.transactions` for `authenticated` (T-023 already revoked; this task is the final audit + the pgTAP regression test target for T-033) — `finance.accounts` INSERT is "none — seam only, via `finance.create_account()`" per design.md §4.2.
- Satisfies: `finance-module-api/Public API Is the Only Cross-Module Write Surface` (grant half — completes what T-023 started), `finance-accounts/Six Account Types` (grant half — the seam is the only reachable write path).
- Depends on: T-026, T-027, T-028.
- Parallel: sequential.

### T-030: `CREATE OR REPLACE app.bootstrap_user()` to add the Finance step
- Migration `app_bootstrap_finance.sql`: `app.bootstrap_user()` now calls `core.ensure_personal_space()` **then** `finance.ensure_default_categories(v_household)` in the same transaction.
- **Trap — this is the composition-root correctness requirement called out explicitly in the task brief**: both steps must commit or roll back together so a user never ends up with a space but no categories. Do not implement this as two separate RPC calls from the client — it must be one function body, one transaction.
- `finance.ensure_default_categories` remains NOT granted directly to `authenticated` — reachable only through `app.bootstrap_user()`.
- Satisfies: `finance-categories/Seeded Spanish Defaults` (wired into first sign-in), `identity/Auto-Created Personal Space on First Sign-In` (extended to include categories).
- Depends on: T-022, T-013.
- Parallel: sequential (must land after both the core bootstrap and the category-seed function exist).

### T-031: `src/modules/finance/api/index.ts` — TS facade over the RPC seam
- `import 'server-only'` as the first line — any client component importing this file fails the build.
- Zod validation of every input type (`CreateAccountInput`, `RecordTransactionInput`, `TransactionPatch`, `OriginRef`) before the `.rpc()` call.
- Exactly one `.rpc()` call per exported function: `createAccount`, `recordTransaction`, `recordTransfer`, `updateTransaction`, `updateOriginTransaction`, `voidTransaction`, `findByOrigin` — matching the interface in design.md §"Interfaces/Contracts" verbatim (note `kind: 'income' | 'expense'` + always-positive `amountCents` on the transaction-input side; sign is a seam-internal concern).
- `createAccount(i: CreateAccountInput): Promise<Result<AccountRef>>` — `CreateAccountInput` is a Zod **discriminated union on `type`** exactly per design.md §"Interfaces/Contracts": the base fields (`householdId`, `name`, `openingBalanceCents?`, `visibility?`, `sortOrder?`) plus a `type`-keyed branch requiring `liability: {...}` only when `type = 'liability'` and `goal: {...}` only when `type = 'savings_goal'`, rejecting either detail block for the other four types **before** the call ever reaches the definer's `22023`. `class` and `ownerUserId` are absent from the type by design — both are server-derived (design.md §5.6).
- PG error code → typed `Result<T, AppError>` mapping: `23505` → `CATEGORY_NAME_TAKEN`, `22023` from `create_account` → `ACCOUNT_DETAIL_REQUIRED`, `22023` (transfer-leg-move) → `TRANSFER_LEG_NOT_MOVABLE`, `42501` from `create_account` → `NOT_A_MEMBER`, `42501` (destination account cross-space/archived/invisible) → `INVALID_DESTINATION_ACCOUNT`, `P0002` → not-found equivalent.
- Satisfies: `finance-module-api/Public API Is the Only Cross-Module Write Surface` (compile-time half — `server-only` + ESLint barrel targeting), `finance-module-api/Origin as a Soft Reference` (facade never queries calling-module schemas by construction), `finance-accounts/Six Account Types`, `finance-accounts/Liability Account Detail`, `finance-accounts/Savings-Goal Account Detail` (TS-contract half — Zod discriminated union), all remaining `finance-module-api` requirements at the TS-contract level.
- Depends on: T-029, T-030.
- Parallel: sequential.

### T-032: Vitest contract tests — `finance/api` facade against local Supabase
- Against `supabase start`, per design.md §9 row "Contract": Zod rejection of malformed input (incl. a `CreateAccountInput` with a `type` mismatched to its detail block, or a detail block on a type that forbids one); each PG error code → `AppError` mapping case from T-031 (incl. `create_account`'s `22023`→`ACCOUNT_DETAIL_REQUIRED` and `42501`→`NOT_A_MEMBER`); a replay of `recordTransaction` with the same idempotency key returns the same `TransactionRef` (not a new one).
- Satisfies: `finance-module-api/Idempotent recordTransaction` (facade-level replay assertion), all facade error-mapping requirements, `finance-accounts/Six Account Types` (facade-level Zod rejection coverage).
- Depends on: T-031.
- Parallel: sequential.

### T-033: pgTAP — RLS direct-DML-denied regression + definer-recursion-guard
- Direct `INSERT`/`UPDATE`/`DELETE` on `finance.accounts`/`finance.transactions` as `authenticated` (bypassing the seam) MUST raise `insufficient_privilege` (42501) — this is the regression test that the seam cannot be bypassed (design.md §4.4 case (e)).
- Definer-function membership-assertion test: calling any seam function as a non-member of the target household raises the assertion error from `core.assert_member`.
- **Definer-recursion-guard test**: exercise `core.is_member()` from a policy context and confirm no `infinite recursion detected in policy` error — regression test for the T-010 trap.
- Private-account visibility test: private-visibility accounts invisible to a non-owner member (design.md §4.4 case (d)).
- Satisfies: `finance-module-api/Public API Is the Only Cross-Module Write Surface` (runtime regression), `identity/RLS Enforced by Household Membership` (finance tables + recursion-guard).
- Depends on: T-029, T-023.
- Parallel: yes, parallel with T-032.

### T-034: pgTAP — corrections (account move, transfer-leg-reject, void-lock)
- Moving a transaction between accounts leaves **both** balances correct (query `finance.account_balances` for source and destination after the move — this is the "balance correctness is free" claim from design.md §5.4, verify it is actually true, not just architecturally plausible).
- Moving a transfer leg is rejected with `TRANSFER_LEG_NOT_MOVABLE`/`22023`.
- Moving to an account in another space is rejected with `INVALID_DESTINATION_ACCOUNT`/`42501`.
- Editing a voided transaction is rejected.
- Voiding one side of a transfer pair voids the linked leg in the same operation (also covers `finance-transactions/Void Lifecycle` scenario).
- Satisfies: `finance-transactions/Void Lifecycle, Never Hard-Delete` (both scenarios), the design's §5.4 correction rules (design.md Key Decisions #10), design.md §9 row "Database — corrections" in full.
- Depends on: T-027, T-028.
- Parallel: yes, parallel with T-032/T-033.

### T-035: pgTAP — category rename/deactivate isolation + idempotent top-up
- Seeded defaults land per space; renaming a default in space A does not change space B's copy; `ensure_default_categories` re-run inserts only missing templates and never overwrites a rename or un-archives a deactivation; sibling-name collision rejected (`categories_unique_name` → `23505` → facade maps to `CATEGORY_NAME_TAKEN`); transactions still resolve a renamed and an archived category correctly.
- Satisfies: `finance-categories/Rename Any Category` (both scenarios), `finance-categories/Deactivate Categories Instead of Deleting` (both scenarios), `finance-categories/Seeded Spanish Defaults`, `finance-accounts/Account Archiving` (the analogous archived-but-queryable pattern, cross-checked against categories).
- Depends on: T-022, T-023.
- Parallel: yes, parallel with T-032–T-034.

---

## Sub-slice 2C — Minimal Finance UI to Verify Slice 2 End-to-End

> Per the task brief: this is **not** a polished UI pass. Enough screens to exercise account
> creation, transaction entry, transfers, corrections, and the balance/summary view. Full Finance
> UI (FAB quick entry, category charts, polished history) is deferred to the next SDD cycle
> (proposal delivery slice 3).

### T-036: Minimal account list + creation screen
- `(app)/cuentas/` — list active accounts (excludes archived, per `finance-accounts/Account Archiving`), a creation form covering all six account types with their type-specific detail fields (liability: rate/term/monthly payment/start date; savings_goal: target amount/date).
- Server Actions call `finance.api.createAccount()` (the `finance/api` facade from T-031, design.md §5.6/§"Interfaces/Contracts") for the write — this is the UI's proof that the account-creation seam works end-to-end, exactly mirroring how T-037 calls `recordTransaction`/`recordTransfer`. The form's per-type fields map directly onto `CreateAccountInput`'s discriminated union (`liability`/`goal` detail blocks appear only for their respective type). Reads (the active-account list) go through `src/modules/finance/data/` repositories directly (client-direct Supabase reads under RLS remain fine per design.md's approach).
- Surface the facade's `ACCOUNT_DETAIL_REQUIRED` and `NOT_A_MEMBER` error mappings as inline form errors.
- Satisfies: `finance-accounts/Six Account Types`, `finance-accounts/Liability Account Detail`, `finance-accounts/Savings-Goal Account Detail` (UI verification), `finance-accounts/Account Archiving`.
- Depends on: T-021, T-031 (needs the facade's `createAccount` export, not just T-023's RLS/balances-view reads).
- Parallel: sequential.

### T-037: Minimal transaction entry screen (income/expense/transfer)
- `(app)/movimientos/` — entry form for income/expense (category picker excludes deactivated categories, no "who paid" field per `finance-transactions/paid_by_user_id Hidden From Personal-Mode UI`) and transfer (source + destination account picker).
- Calls `recordTransaction`/`recordTransfer` from the `finance/api` facade (T-031) via a Server Action — this is the UI's proof that the seam works end-to-end.
- Satisfies: `finance-transactions/Transaction Types and Money Representation`, `finance-transactions/Linked Transfer Pairs`, `finance-transactions/paid_by_user_id Hidden From Personal-Mode UI`, `finance-categories/Deactivate Categories Instead of Deleting` (picker exclusion scenario).
- Depends on: T-031, T-036.
- Parallel: sequential.

### T-038: Minimal transaction correction affordance
- Edit-in-place on a transaction row: change account (exercises the cross-account move), change amount/category/date/description.
- When the target is a transfer leg, surface `TRANSFER_LEG_NOT_MOVABLE` and offer void-and-re-record as the one-tap remedy (per design.md's Open Question — this cycle chooses to implement the remedy affordance since it is needed to verify the transfer-leg-reject rule end-to-end, not just at the API layer).
- Void action on any posted transaction with a reason field.
- Satisfies: `finance-module-api/Update and Void Follow the Source Record` (UI verification), `finance-transactions/Void Lifecycle, Never Hard-Delete` (UI verification), design.md §5.4 correction rules (UI verification).
- Depends on: T-037.
- Parallel: sequential.

### T-039: Minimal balance/summary view
- Home screen (`(app)/page.tsx`) showing `available_cents` as the hero figure and `debt_cents` as a separate card (never subtracted from the hero), per-account balances list, savings-goal progress (`balance_cents / target_amount_cents`).
- Satisfies: `finance-accounts/Derived Balances`, `finance-accounts/Savings-Goal Account Detail` (goal progress display), proposal Success Criteria "liability account shows remaining balance... savings-goal account shows progress fed by real transfers," "transfers never appear as income or expense in the month summary."
- Depends on: T-021, T-036.
- Parallel: yes, parallel with T-037/T-038 once T-036 lands (reads only, no write dependency).

### T-040: E2E smoke suite (Playwright)
- Per design.md §9 row "E2E (thin smoke set)": sign-in → dashboard with zero ceremony and categories already present; record expense; correct an expense onto the right account and see both balances update; record transfer and confirm it is absent from month income/expense; 375px layout; light and dark render.
- **Auth caveat**: do not automate the real Google consent screen. Authenticate against the local stack with an admin-minted session (`auth.admin.generateLink` or a seeded password user) and inject cookies; the real Google flow is verified manually once per environment.
- Also folds in the "no household/hogar text" scan from T-017 and the 375px check from T-007.
- Satisfies: cross-cutting end-to-end verification of proposal Success Criteria as a whole (sign-in ceremony, no household language, transfer exclusion, liability/goal display, ESLint boundary build failure — separately verified in T-002, 375px + theme rendering).
- Depends on: T-006, T-008, T-017, T-036, T-037, T-038, T-039.
- Parallel: sequential (last task — integrates everything).

---

## Review Workload Forecast

Cached session review budget: **800 changed lines**. Estimates below are rough LOC per
task/group including migrations, TS, and tests; actual line counts will vary with implementation
style.

| Sub-slice | Tasks | Est. changed lines | Budget risk (800-line threshold) | Chaining recommendation |
|---|---|---|---|---|
| 1A — Scaffold, tokens, boundary lint | T-001–T-008 | ~900–1200 | **Over budget as one PR.** | Split into 2 PRs: (a) T-001–T-003 scaffold+lint (~350 lines) — must land first per spec's "boundary rules ship before feature code," (b) T-004–T-008 tokens+components+PWA (~600–850 lines, still borderline — consider further splitting T-008 PWA shell into its own PR). |
| 1B — Identity kernel | T-009–T-017 | ~700–950 | **Borderline/over.** | Split into 2 PRs: (a) T-009–T-013 DB migrations + bootstrap (~350–450 lines, SQL-heavy, high review value in isolation), (b) T-014–T-017 auth wiring + UI shell + pgTAP (~400–500 lines). Chain (b) on (a). |
| 2A — Finance schema | T-018–T-025 | ~900–1100 | **Over budget as one PR.** | Split into 2 PRs: (a) T-018–T-021 core DDL + views (~500–600 lines — this is the highest-risk-of-subtle-bug group: `security_invoker`, triggers, signed amounts; keep it reviewable alone), (b) T-022–T-025 category-seed function + RLS policies + unit/pgTAP tests (~450–550 lines). Chain (b) on (a). |
| 2B — Finance API seam | T-026–T-035 | ~1050–1360 | **Over budget, needs 2–3 PRs.** | Split into: (a) T-026–T-030 seam RPC functions + grants + bootstrap wiring (~550–660 lines — the load-bearing correctness surface: idempotency, transfer-leg-reject, cross-space guard, and now `create_account`'s atomic detail-row insert + class-mapping non-duplication; reviewers should focus here), (b) T-031–T-032 TS facade + contract tests (~340–450 lines — the added `CreateAccountInput` discriminated union and its two new error mappings are a few dozen lines, not a budget-tipping addition), (c) T-033–T-035 pgTAP regression suites (~350–450 lines, can review in parallel with (b) since both depend only on (a)). |
| 2C — Minimal Finance UI | T-036–T-040 | ~600–800 | Near budget, likely fits in one PR if screens stay minimal per scope instruction. | Single PR is acceptable — T-036 now calls the confirmed `finance.api.createAccount()` facade rather than resolving an open design gap, so no preceding split PR is needed on that account. |

**Decision needed before `sdd-apply` runs**: yes — the sub-slice → PR chaining above is a
recommendation, not a binding plan. Confirm before implementation starts whether the 5 sub-slices
should map to 5 top-level PRs each internally chained as described (10–12 PRs total), or whether a
coarser grouping is acceptable to the reviewer.

**Resolved since the prior revision of this document**: T-036's account-write mechanism gap
(previously item 2 here) is closed. `finance.create_account()` is now fully specified in
design.md §5.6 (revision 3) and folded into T-026 (function body), T-029 (EXECUTE grant), T-031/
T-032 (TS facade + contract tests), T-025 (pgTAP coverage), and T-036 (UI call site). Line-count
impact: one additional ~70-line `plpgsql` function plus its grant line (T-026/T-029), a ~30-line
Zod discriminated-union type plus two error-mapping cases (T-031), and a handful of new pgTAP
cases (T-025) — a few dozen lines total. This does **not** tip T-026–T-030 or T-031–T-032 over the
800-line PR boundary on its own; the 2B estimate above is nudged up slightly to reflect it, but the
recommended 3-way PR split for 2B is unchanged.

---

## Dependency Summary (critical path)

```
T-001 → T-002 (boundary lint, MUST be first PR with module folders)
T-001 → T-009 → T-010 → T-011 → T-012 → T-013 (core kernel + composition root)
T-013 → T-015 (Google auth wiring)                    T-001 → T-014 (Supabase clients, parallel)
T-013 → T-018/T-019 (finance schema, parallel with each other)
T-018,T-019 → T-020 (transactions) → T-021 (balance views)
T-019 → T-022 (category seed fn) → T-030 (bootstrap composition, needs T-013 too)
T-021,T-022 → T-023 (finance RLS + can_read_account)
T-023 → T-026 (record_transaction/transfer/create_account) → T-027,T-028 (update/void) → T-029 (grants)
T-029,T-030 → T-031 (TS facade) → T-032 (contract tests)
T-031 → T-036 → T-037 → T-038; T-036 → T-039
all UI + T-002 + T-016/T-033 (pgTAP suites) → T-040 (E2E smoke, last)
```

Testing tasks (T-016, T-024, T-025, T-032–T-035) are NOT strict TDD gates — they accompany the
critical-logic tasks they test (balances, transfers, idempotency, RLS, category isolation) rather
than every task in the breakdown, per the design's testing strategy.
