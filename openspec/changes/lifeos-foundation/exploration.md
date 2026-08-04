# Exploration: LifeOS Foundation — General Architecture + Finance Module

## Current State

Greenfield project. No code, no stack, no git repo (`D:\PROYECTOS\LIFE_OS`). `openspec/config.yaml` confirms: tech stack, architecture, testing, and style are all "not decided yet." It already encodes two durable rules relevant here: (1) Finance is the base module — flag any other-module change that assumes/requires Finance data, (2) mobile-first scenarios must account for small-viewport behavior.

Scope requested: general architecture direction + deep-dive on Finance as the foundation module. Health/Nutrition/Recipes/ShoppingList/CarControl/Goals are named but only Finance gets a full data-model pass in this phase.

## Affected Areas

None (no code exists). Only path touched: `openspec/changes/lifeos-foundation/`.

## Approaches

### A. Overall system architecture

1. **Modular Monolith (single deployable, enforced internal module boundaries)** — one codebase/one deploy, modules as folders/packages (finance/, health/, car-control/...) each with its own domain layer, sharing one database.
   - Pros: Fastest to build/ship for solo or small-team; single DB means cross-module transactions (e.g. ShoppingList checkout → Finance transaction) are trivial and consistent; lowest ops overhead; natural fit for a personal life-tracking app at this scale.
   - Cons: No runtime-enforced isolation — boundaries only hold if the team keeps discipline; can't scale/deploy modules independently later without refactor.
   - Effort: Low-Medium.

2. **Microservices (one deployable per module)** — modules communicate over HTTP/gRPC or a message bus.
   - Pros: True independent scaling/deployment; boundaries enforced at the network level.
   - Cons: Ops overhead disproportionate to a single-user/small-family app; a Finance write triggered from CarControl becomes a distributed-transaction problem instead of a local call; slows early velocity substantially.
   - Effort: High. Not recommended at this stage.

3. **Modular Monolith with explicit service seams** — same as (1) but each module exposes only a defined public interface (e.g. `FinanceModule.recordTransaction(...)`), no other module reaches into Finance's tables directly; structured so a module could be extracted into its own service later if scale ever demands it.
   - Pros: Keeps (1)'s speed while reducing the "boundaries erode over time" risk; leaves a real extraction path open without paying microservices tax now.
   - Cons: A bit more upfront design discipline (defining/enforcing public module APIs, e.g. via lint rules or folder-import restrictions).
   - Effort: Medium.

4. **Micro-frontends (separate deployable UI per module)** — e.g. Module Federation.
   - Pros: Frontend team independence, independent UI deploys.
   - Cons: Overkill for a single cohesive mobile-first app; adds bundle-size/perf overhead (bad for mobile-first goal specifically); makes a consistent shared design system/navigation harder.
   - Effort: High. Not recommended for this project's scale.

**Stack candidates (not a decision — options for propose phase):** Frontend framework: React/Next.js (biggest ecosystem, mature PWA tooling), SvelteKit (smallest bundles, best raw mobile perf), Nuxt/Vue (middle ground). Backend: colocated in the same meta-framework vs a separate API service (Node/Fastify, Go, Python/FastAPI). Database: PostgreSQL is the natural default given Finance's relational/ledger shape; SQLite is viable for a simple single-user self-hosted case. Hosting: Vercel/Netlify + managed Postgres (Neon/Supabase/Railway), or a VPS. Note: this session has a Supabase MCP tool configured — worth surfacing to the user as a candidate (auth + Postgres + storage bundled), not as an assumption.

### B. Cross-module Finance data/event pattern

1. **Shared Finance API/service, synchronous call-in** — other modules call `FinanceService.recordTransaction({ amount, category, originModule, originEntityId, ... })` directly (in-process call in a modular monolith, optionally in the same DB transaction as the module's own write).
   - Pros: Strong consistency — sourcing module's write and the Finance transaction succeed or fail together; single source of truth; validation centralized in Finance.
   - Cons: Direct dependency from every money-touching module onto Finance — but this matches the user's own stated requirement ("every module must register through Finance"), so it's intentional coupling.
   - Effort: Low-Medium in a modular monolith with a shared DB.

2. **Event-driven / outbox pattern** — modules emit domain events (`CarServiceCompleted`, `ShoppingListCheckedOut`); a Finance event handler consumes them asynchronously and creates the transaction.
   - Pros: True decoupling; natural audit/event log; resilient to write bursts.
   - Cons: Eventual consistency — a window where the source record exists but its Finance transaction doesn't yet; requires outbox/worker infrastructure disproportionate to a single-user/small-family app; harder to debug missing-transaction cases.
   - Effort: Medium-High.

3. **Module-owned finance-adjacent records + periodic/manual sync into Finance** — e.g. CarControl keeps its own `fuel_expense` rows; a scheduled job or manual "import" pulls them into Finance later.
   - Pros: Each module fully autonomous at write time; simplest to build in isolation.
   - Cons: Duplicated schema/validation; risk of drift, double-counting, or missed imports; two sources of truth to reconcile; works against the user's own requirement that Finance is authoritative.
   - Effort: Medium to build, High ongoing risk/maintenance.

### C. Module boundaries given the dependency chain

Stated chain: Health ↔ Nutrition ↔ Recipes → ShoppingList → Finance, and CarControl → Finance (a second, independent spoke). Goals is undefined.

- **Hub-and-spoke, narrow financial coupling (recommended direction)**: Finance is the hub; only modules that actually produce a monetary event call Finance's write API directly — i.e. ShoppingList and CarControl today. Health, Nutrition, and Recipes stay financially inert unless/until a concrete feature needs it (e.g. "cost of a recipe/meal plan"). Avoids speculative coupling.
- **Broad/proactive coupling**: give every module a Finance dependency up front "in case it's needed later." Cons: adds unused coupling and surface area to modules with no current financial concept, harder to reason about for no near-term benefit.
- **Nutrition as a Health sub-module vs a peer module**: the user floated Nutrition as "possibly a branch of Health." Sub-module reduces module count but risks tight binding to Health's internal schema; peers linked by a narrow read-only interface keeps the option to evolve either independently. Real decision point to flag for the propose phase.
- **Goals**: no detail given yet; likely cross-cutting (a goal could reference a Finance target, a Health target, etc.), so its boundary can't be designed responsibly yet — flag as open.

## Finance Module Deep-Dive

**Likely core entities (MVP):**
- `Account` — Cash, Checking, Credit Card, Savings, etc.
- `Transaction` — amount, currency, date, account_id, category_id, type (income/expense/transfer), description, `origin_module` (enum: manual, shopping_list, car_control, ...), `origin_entity_id` (nullable soft reference, not a hard FK across module boundaries), created_at.
- `Category` — at least one level of hierarchy (e.g. Transport > Fuel, Food > Groceries).
- `Transfer` handling — money moving between the user's own accounts should not count as income/expense in reports; model explicitly (e.g. `Transaction.type = 'transfer'` as a linked pair).

**Likely deferred to a fuller version (v1.5/v2, not MVP-critical):**
- `RecurringTransaction` / scheduled bills.
- `Budget` (per category/period).
- Multi-currency (FX rates, conversion at report time).
- Bank/card import or sync (Plaid-like) — an `external_id`/`source` field on `Transaction` costs little to add now even if deferred.
- Multi-user/family shared accounts with permissions.
- Receipt attachments, richer analytics/dashboards.

**Open questions Finance needs answered before design (blocking):**
1. Single-user only, or multi-user/family shared finances (shared accounts, "who paid", permissions)?
2. Manual entry only for v1, or is bank/card sync a real goal even if deferred?
3. Single currency (assume local currency, unconfirmed) or multi-currency from day one?
4. Do module-originated transactions post immediately, or is there a review/approval ("pending" vs "confirmed") step?
5. Can a sourcing module update/void its Finance transaction later (e.g. editing a Car Service cost after the fact)?

## Open Questions / Ambiguities Blocking a Solid Proposal

1. **Platform scope**: plain responsive web, or PWA (installable, offline-capable, push notifications) from v1? Native wrapper (Capacitor/React Native) later or out of scope?
2. **Auth/user model**: single user vs multi-user/family from the start. Affects nearly every table (ownership, permissions).
3. **Hosting/deployment preference and budget**: free-tier only vs willing to pay for managed Postgres/hosting? (Session has a Supabase MCP tool configured — worth asking, not assuming.)
4. **Time/scope constraints**: hobby/weekend-pace project, or deadline-driven?
5. **Stack preferences**: any existing preference for frontend framework, testing approach, or architecture style.
6. **Data sensitivity**: Health data implies some sensitivity even in a personal app — encryption-at-rest or any compliance posture required?
7. **Offline-first requirement**: does the app need to work with no connectivity and sync later? Major architecture driver if yes (local-first DB vs simple online-only CRUD).
8. **Currency default**: confirm base currency assumption before Finance design proceeds.

## Recommendation

Direction (not a binding decision): modular monolith with explicit service seams (A.3) as the overall architecture, paired with the synchronous Finance-API pattern (B.1) for cross-module money writes, and narrow/hub-and-spoke module coupling (C) so only ShoppingList and CarControl depend on Finance today, keeping Health/Nutrition/Recipes financially inert until a real need appears. Final stack (framework/DB/hosting), multi-user vs single-user, and PWA/offline scope should NOT be locked here — resolve interactively in sdd-propose.

## Risks

- Multiple blocking open questions (auth/user model, platform/PWA/offline scope, currency, hosting) — any stack commitment made without resolving these risks rework.
- Without enforced module-boundary discipline, a modular monolith can silently degrade into a tangled monolith as more modules (Goals, future ones) are added.
- Health data sensitivity is unaddressed.
- Nutrition-as-Health-submodule vs peer-module is unresolved and affects schema ownership.

## Ready for Proposal

No — proceed to `sdd-propose` in interactive mode. It should resolve, at minimum: single- vs multi-user, PWA/offline scope, base currency, and hosting preference, before locking architecture/stack and before drafting Finance's schema in detail.
