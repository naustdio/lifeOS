# Proposal: LifeOS Foundation — Architecture + Finance Module

## Intent

LifeOS is a **personal**, mobile-first web app where one person tracks their whole life (Finance, Health, Nutrition, Recipes, Shopping List, Car Control, Goals) in one place instead of scattered apps, notes, and spreadsheets. Today nothing exists: no stack, no schema, no boundaries. Finance is the base module every money-producing module must register through, so it must be built first and built right — a wrong money model or a leaky module boundary is the most expensive thing to retrofit.

Success: the owner signs in with Google, records real MXN income/expenses/transfers across their accounts, sees an accurate month summary and a daily dashboard feed — and a future module (Shopping List, Car Control) can post a transaction through a stable Finance API without touching Finance tables.

## Locked Decisions (from user)

| Topic | Decision |
|---|---|
| **Product focus** | **Personal-first.** The UI is 100% single-person; the owner never sees "household" language. Sharing is a secondary, opt-in feature added later. |
| Data ownership | Tenant key stays `household_id` in the DB (auto-created single-member space on signup) so sharing later is a feature toggle, not a migration. |
| Roles | `owner` / `member` only. No read-only `viewer` role. |
| Offline | No offline data sync. App ships as an **installable PWA** (manifest + service worker shell) so push can be added without re-architecting. |
| Platform | Responsive web, **mobile-first**. Desktop is responsive-decent, not a dedicated design pass in this MVP. |
| Backend | Supabase (Postgres + Auth + Storage) |
| Auth | Google OAuth only (Supabase Auth) |
| Security | Standard auth + RLS; no HIPAA/field encryption |
| Currency | MXN only |
| UI language | **Spanish** (interface, labels, seeded categories) |
| Theme | **Light + dark from day one**, driven by design tokens |
| Financial period | Calendar month (day 1 → end of month) |
| Data migration | None — starting from zero, no CSV import needed |
| Testing | Tests on critical logic (balances, transfers, RLS policies, Finance API). **Not** strict TDD. |
| Next module after Finance | Health + Nutrition |

## Scope

### In Scope
- **Architecture decision record**: modular monolith, schema-per-module, dependency rules, enforcement.
- **Design system**: color/spacing/radius/shadow tokens for light + dark, base components (see Design Direction).
- **Identity kernel**: Google auth, profile, auto-created personal space, RLS tenancy model.
- **Finance accounts**: cash, checking, credit card, savings, **liability** (mortgage/loan with rate, term, monthly payment, remaining balance), **savings goal** (target amount + progress).
- **Finance categories**: two-level income/expense taxonomy, seeded in Spanish, **user-customizable**.
- **Finance transactions**: income/expense/transfer, linked transfer pairs, void lifecycle.
- **Recurring transactions**: scheduled fixed expenses that surface as **pending** on the due date and are confirmed with one tap.
- **Budgets**: per-category monthly limit with spent-vs-limit progress.
- **Dashboard feed**: cross-module card feed (day 1: Finance-only cards) — total balance, month income/expense, recent movements, spending-by-category chart, pending recurring items.
- **Finance public API**: the call-in seam other modules will use, with idempotency and origin references.
- **App skeleton**: Next.js + Supabase auth wiring, PWA manifest/service-worker shell, module folder structure, boundary lint rules, migrations.

### Out of Scope (non-goals)
- Health, Nutrition, Recipes, Shopping List, Car Control, Goals implementation (only stub seams documented).
- **Push notifications** — the PWA shell ships ready, but Web Push (VAPID keys, scheduled Supabase function) lands after Finance. *(Note: on iOS, web push only works when the app is added to the Home Screen.)*
- Credit-card limit and statement/due dates (v1.1 — balance only for now).
- Split-expense settlement ("who owes whom"); `paid_by_user_id` exists in the DB but is hidden in a personal-mode UI.
- Multi-currency and FX; bank/card sync; receipt photo attachments/OCR.
- Offline sync, native wrapper.
- Household invite/sharing UI (schema-ready, not built).
- CSV import/export, advanced analytics, audit UI.

## Capabilities

### New Capabilities
- `design-system`: color/typography/spacing/radius/shadow tokens, light+dark theming, base component set.
- `module-architecture`: module boundaries, schema-per-module, allowed dependency direction, enforcement rules.
- `identity`: Google auth, profile, auto-created personal space, RLS tenancy model (sharing-ready, not exposed).
- `finance-accounts`: account types incl. liability and savings-goal, derived balances, archiving.
- `finance-categories`: two-level Spanish taxonomy, seeded defaults plus user-created categories.
- `finance-transactions`: income/expense/transfer entries, linked transfer pairs, void lifecycle.
- `finance-recurring`: recurring definitions, due-date materialization as pending, one-tap confirmation.
- `finance-budgets`: per-category monthly limits and spent-vs-limit progress.
- `finance-module-api`: public cross-module write API, origin references, idempotency guarantees.
- `dashboard-feed`: the cross-module card feed contract plus Finance's first card providers.

### Modified Capabilities
- None (greenfield).

## Approach

**Frontend/meta-framework: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (retokenized).** Chosen over SvelteKit/Nuxt because `@supabase/ssr` has first-class Next.js session/cookie integration, Server Actions and Route Handlers give a natural server-side home for the Finance seam, and it matches the project's React/atomic-design/container-presentational conventions.

**Modular monolith with explicit seams.** One Next.js deploy, one Supabase Postgres, **one Postgres schema per module** (`core`, `finance`, later `health`, …) so boundaries are visible and grantable. In code, `src/modules/{name}/` with `domain/`, `data/`, `ui/`, and a single public barrel `api/`. ESLint import rules forbid importing anything but another module's `api/`.

**Personal-first UI over a sharing-ready schema.** This is the key product/architecture reconciliation:
- Every domain row carries `household_id`. On first sign-in a single-member space is auto-created; the owner never sees the word "household," never picks a space, never assigns "who paid."
- Because the tenant key already exists, enabling sharing later is an invite flow plus UI reveal — **not** a migration of every table and RLS policy.
- `core` (identity) remains a mandatory kernel every module depends on and ships before Finance. `finance` is a narrow hub only money-producing modules depend on.

**Synchronous, atomic call-in for cross-module money writes.** The seam lives **server-side**, not client-direct: PostgREST/`supabase-js` cannot span multiple statements in one transaction, so a Shopping List checkout and its Finance transaction could not be made atomic from the browser. Server Actions/Route Handlers (or a `SECURITY DEFINER` Postgres function with a pinned `search_path`) execute both writes in a single Postgres transaction. Client-direct Supabase reads under RLS remain fine for lists and dashboards.

**RLS is the security floor, not the only guard.** Base policy is membership in the row's `household_id`; server-side code additionally enforces account-visibility rules.

**Dashboard feed as a contract, not a hardcoded screen.** Each module registers card providers (`getFeedCards(period)`); the dashboard composes and orders them. Day 1 only Finance provides cards, but Health or Car Control plug in later without touching the dashboard.

### Design Direction

Derived from twelve reference screens the user supplied — a consistent fintech/wellness visual language:

| Token group | Direction |
|---|---|
| Brand accent | Lime/chartreuse (`#C6F432` family) — primary CTAs, active nav, progress fills, positive highlights |
| Contrast accent | Near-black (`#111`) — floating nav pill, hero balance card, primary dark buttons |
| Surfaces (light) | Very light neutral page (`#F0F0F0` family), white cards |
| Surfaces (dark) | Near-black page, elevated dark-gray cards, **same** lime accent |
| Semantic | Green for income, red for expense — on amounts only, never as brand color |
| Radius | Cards 20–24px, buttons/chips/nav full pill |
| Elevation | Soft, wide, low-opacity shadows (subtle neumorphism — never harsh) |
| Hierarchy | The big number rules: balance is the hero of the screen, everything orbits it |
| Iconography | Line icons inside circular chips |
| Mobile layout | Floating pill bottom nav with a **central lime FAB** for quick expense/income entry — the most repeated action gets the best real estate |
| Desktop layout | Left white sidebar (lime active state) + card grid |

### Finance entities (MVP shape)

| Entity | Key fields |
|---|---|
| `core.profiles` | `user_id` (auth.users), display name, avatar |
| `core.households` | name, base_currency `MXN`, created_by |
| `core.household_members` | household_id, user_id, role (`owner`/`member`) |
| `finance.accounts` | household_id, name, `type` (`cash`/`checking`/`credit_card`/`savings`/`liability`/`savings_goal`), visibility, owner_user_id, opening_balance_cents, archived_at |
| `finance.account_liability_details` | account_id, original_amount_cents, interest_rate, term_months, monthly_payment_cents, start_date |
| `finance.account_goal_details` | account_id, target_amount_cents, target_date |
| `finance.categories` | household_id (null = system default), parent_id (max 1 level), name, kind (`income`/`expense`), icon, is_system |
| `finance.transactions` | household_id, account_id, category_id, type, amount_cents (bigint minor units), currency (`MXN`, CHECK), occurred_on, description, paid_by_user_id, created_by_user_id, status (`posted`/`void`), transfer_group_id, recurring_id, origin_module, origin_entity_id, external_id |
| `finance.recurring_transactions` | household_id, account_id, category_id, amount_cents, description, frequency, next_due_on, auto_post (false in MVP), active |
| `finance.budgets` | household_id, category_id, period_month, limit_cents |

Money is stored as **integer centavos**, never float. Balances are **derived** (opening balance + sum of posted transactions) via a view — no mutable balance column, so no drift. A transfer is a **linked pair** of rows sharing `transfer_group_id`; reports exclude `type='transfer'` from income/expense so internal moves never double-count. **Savings-goal progress is fed by real transfers into the goal account** — no parallel manual counter. Transactions are **voided, never hard-deleted**, because origin modules hold references to them.

### Finance public API (the seam future modules call)

```ts
// modules/finance/api — the ONLY surface other modules may import
recordTransaction(input: RecordTransactionInput): Promise<TransactionRef>
updateOriginTransaction(origin: OriginRef, patch: TransactionPatch): Promise<TransactionRef>
voidTransaction(origin: OriginRef, reason: string): Promise<void>
findByOrigin(origin: OriginRef): Promise<TransactionRef | null>

type OriginRef = { module: 'manual' | 'shopping_list' | 'car_control'; entityId: string }
type RecordTransactionInput = {
  householdId: string; accountId: string; categoryId: string;
  amountCents: number; occurredOn: string; description: string;
  origin: OriginRef; idempotencyKey: string;
}
```

Rules that make this safe: Finance never reads a calling module's tables (`origin_entity_id` is a **soft reference**, no FK); calling modules never touch `finance.*` directly; `(origin_module, origin_entity_id, idempotency_key)` is unique, so a retried Shopping List checkout cannot double-post. Module-originated transactions post immediately as `posted` (no approval queue). Editing a source record calls `updateOriginTransaction`; deleting it calls `voidTransaction`.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| repo root | New | Next.js + TS + Tailwind scaffold, PWA manifest, ESLint boundary rules, git init |
| `supabase/migrations/` | New | `core` and `finance` schemas, RLS policies, seeded Spanish categories |
| `src/design-system/` | New | Tokens (light/dark), themed shadcn base components |
| `src/modules/core/` | New | Profile, personal-space bootstrap, tenancy helpers |
| `src/modules/finance/` | New | Domain, data access, public `api/`, UI |
| `src/modules/dashboard/` | New | Feed contract + composition |
| `src/app/` | New | Auth route, dashboard, finance screens (mobile-first) |
| `openspec/config.yaml` | Modified | Fill in stack, architecture, test runner, quality commands |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **MVP scope grew well past one deliverable** | **High** | Recurring, budgets, savings goals, liability accounts, dashboard feed, PWA, and dark mode were all added after the first draft. Must be sliced — see Delivery below. |
| RLS policy gap leaks data across spaces | Med | Policy tests per table; deny-by-default; server-side checks on top |
| Module boundaries erode as modules are added | Med | Schema-per-module + ESLint import restrictions in the **first** PR, not later |
| Personal-first UI drifts into a schema that can't share | Med | `household_id` on every row from migration 1; RLS written against membership, never against `user_id` directly |
| Dark mode retrofitted late | Low | Tokens defined before the first component; no raw hex in component code |
| Deferred split/settlement forces a refactor | Low | `paid_by_user_id` ships now as the hook; splits become child rows, not a rewrite |
| Supabase client-direct writes bypass the Finance seam | Med | Revoke direct write grants on `finance.*` for anon/authenticated; writes only via server/RPC |
| `SECURITY DEFINER` RPC written carelessly bypasses RLS | Med | Explicit membership assertion inside every definer function; pinned `search_path` |

## Delivery

The 800-line review budget will be exceeded several times over. Recommended slices, each independently shippable:

1. **Scaffold + design system + identity** — Next.js/Tailwind/PWA shell, tokens (light+dark), Google auth, personal-space bootstrap, RLS foundation, boundary lint rules.
2. **Finance core** — accounts (all six types), categories with Spanish seed, transactions, transfers, derived balances, the public `finance/api` seam.
3. **Finance UI** — mobile-first screens, FAB quick entry, account list, transaction history, month summary.
4. **Recurring + budgets** — recurring definitions, pending materialization and confirmation, per-category budgets with progress.
5. **Dashboard feed** — feed contract plus Finance card providers and the spending-by-category chart.

### Cycle scope decision (user-approved)

**This SDD cycle specs and designs slices 1 and 2 only.** Slices 3–5 remain documented above as committed intent but are deliberately deferred to a follow-up SDD cycle, because they are features layered on a foundation rather than architectural risk. Specifying them now would mean writing requirements for UI and behavior the owner cannot yet evaluate against a working Finance core.

Concretely, **in scope for spec/design in this cycle**: design tokens and base components, module architecture and boundary enforcement, Google auth and personal-space bootstrap, RLS tenancy model, PWA shell, all six Finance account types with their detail tables, the Spanish category taxonomy with user customization, transactions and linked transfers, derived balances, void lifecycle, and the public `finance/api` seam with idempotency.

**Deferred to the next cycle**: Finance screens beyond what slice 2 needs to be verifiable, recurring transactions, budgets, and the dashboard feed. Their tables may still be anticipated in the schema where omitting them would force a later migration, but their behavior is not specified here.

## Rollback Plan

Greenfield, so rollback is cheap and total: `supabase db reset` (or drop the `core` and `finance` schemas) reverts all data model changes; the app scaffold is a single initial commit that can be discarded; `openspec/changes/lifeos-foundation/` is archived rather than deleted. No production data, no users, no migration path to unwind.

## Dependencies

- A Supabase project (free tier is sufficient) with URL + keys, and Google OAuth configured.
- Node.js LTS + package manager for the Next.js scaffold.
- Git repository initialized (none exists yet at `D:\PROYECTOS\LIFE_OS`).

## Success Criteria

- [ ] The owner signs in with Google and lands on a dashboard with zero setup ceremony — no space/household selection.
- [ ] The word "household"/"hogar" appears nowhere in the UI, while every row still carries `household_id` (verified in schema).
- [ ] Income, expense, and transfer entries in MXN produce correct per-account balances; transfers never appear as income or expense in the month summary.
- [ ] A liability account shows remaining balance, rate, term, and monthly payment; a savings-goal account shows progress fed by real transfers.
- [ ] A recurring expense appears as pending on its due date and posts only after explicit confirmation.
- [ ] A category budget shows spent-vs-limit for the current calendar month.
- [ ] Calling `finance.recordTransaction` twice with the same `idempotencyKey` creates exactly one transaction.
- [ ] An ESLint rule fails the build when a module imports outside another module's `api/` barrel.
- [ ] Every screen is usable at 375px width and renders correctly in both light and dark themes.
- [ ] The app is installable to a phone home screen (valid manifest + service worker).

## Question Rounds — resolved

Both rounds are closed; all answers are recorded in Locked Decisions above. Notable reversals from the first draft: the product is **personal-first** (not household-first) at the UI level; `viewer` role dropped; recurring transactions, budgets, and savings goals moved **into** MVP scope; plain responsive web upgraded to an **installable PWA** (push itself deferred).
