# Exploration: recipes-module (new peer module, content-only MVP)

## Current State
- `src/modules/` currently has three peer modules: `core`, `finance`, `health`. Each follows `domain/` (pure predicates, zero framework imports), `data/` (RLS-guarded Supabase CRUD repositories), `api/index.ts` (the single cross-module barrel, `import "server-only"` as its first statement).
- `eslint.config.mjs` boundary rules (`boundaries/element-types`) are defined generically against glob patterns `src/modules/*/api|domain|data|ui/**` with a `${from.module}` capture — no module name is hardcoded anywhere in the config. `health` required zero new ESLint entries when it was added; the same is true for `recipes`.
- `core.households` / `core.household_members` + `core.is_member(household_id)` (`supabase/migrations/20260804090001_core_schema.sql`, `20260804090002_core_security.sql`) is the base multi-tenancy primitive every module's RLS keys off.
- `health`'s RLS (`supabase/migrations/20260804090034_health_security.sql`) layers a `visibility` CHECK (`household`/`private`) + `owner_user_id` on top of `core.is_member(household_id)`, gating SELECT so a `private` row is only visible to its owner — built specifically for medical/financial sensitivity.
- `health.nutrition_visit_photos` (`src/modules/health/data/nutrition-photo-repository.ts`) is the only Storage-bucket precedent: private bucket, owner-scoped path, server-only signed URLs.
- The module hub (`src/app/(app)/page.tsx`) is a static hardcoded `MODULES: ModuleItem[]` array — "Adding a module is one new `MODULES` entry."
- Each module owns a route group `src/app/(app)/(module-name)/` with its own `layout.tsx` owning that module's nav (module-architecture spec requirement, proven by `(finance)` and `(health)`).
- No `jsonb` columns exist anywhere in the schema (checked `finance`, `core`, `health` migrations) — every one-to-many relationship is a relational child table with FK.
- No `recipes`/`shopping_list` schema, module, or migration exists in the tracked repo. The only prior artifact, `openspec/changes/health-nutrition-recipes/exploration.md`, is stale/untracked and superseded by this session's explicit peer-module decision — not used as input.

## Affected Areas
- `supabase/migrations/` — new `recipes` schema DDL + RLS/grants migration pair, following the two-file split every prior module uses.
- `src/modules/recipes/domain/` — new pure predicates/types mirroring `health/domain/event.ts`'s "mirror the DB CHECK constraints" convention.
- `src/modules/recipes/data/` — new RLS-guarded repository(ies).
- `src/modules/recipes/api/index.ts` — new sole public barrel, `server-only` first line.
- `eslint.config.mjs` — NOT affected; glob-based rules already cover it, confirmed by direct read.
- `src/app/(app)/(recipes)/` — new route group + `layout.tsx` + pages.
- `src/app/(app)/page.tsx` — one new `MODULES` entry.
- `openspec/specs/module-architecture/spec.md` — no changes needed, already module-name-agnostic.

## Approaches
1. **Household-shared recipes, no private/visibility split, ingredients as a child table** — `recipes.recipes` (title, portions, instructions, category, household_id, owner_user_id for authorship/write-gating only) + `recipes.recipe_ingredients` (recipe_id FK, name, quantity, unit, position). RLS: any household member can read/write; no `visibility` column.
   - Pros: matches what a recipe actually is (shared, non-sensitive); avoids importing a privacy mechanism with no use case; relational ingredients match the codebase's 100%-relational convention; smallest RLS surface.
   - Cons: departs from the "every module has visibility+owner_user_id" default; adding private-recipe support later needs a migration.
   - Effort: Low.

2. **Mirror health/finance exactly — add `visibility`+owner-gated-read split** — same shape plus a `visibility` CHECK column and owner-gated SELECT policy identical to `health.events`.
   - Pros: perfect structural consistency with existing modules; zero deliberation, proven copy-paste shape.
   - Cons: adds a mechanism with no motivating use case for cooking content; unused UI toggle and RLS complexity/tests for a case the domain doesn't call for.
   - Effort: Low-Medium.

3. **Ingredients as a jsonb array column instead of a child table.**
   - Pros: fewer tables, one round trip.
   - Cons: breaks precedent (zero jsonb anywhere in this codebase); loses relational querying needed by the already-planned future shopping-list-generation change; no natural per-ingredient ordering without embedding array-index semantics.
   - Effort: Low, but works against the explicitly-flagged next follow-up change.

## Recommendation
**Approach 1**, combined with the settled module/route/hub mechanics common to all approaches. Drop the visibility/private split (no sensitivity dimension exists for cooking content — copying it by default would be the needless complexity the brief asked to check for, not manufacture), keep `owner_user_id` for write-gating/authorship only, model ingredients as a relational child table (matches the codebase's zero-jsonb convention and keeps the door open for the deferred shopping-list-generation change to join/aggregate ingredients), and defer a recipe photo entirely — the nutrition-photo precedent is real infrastructure (Storage bucket + RLS storage policies + signed-URL flow) beyond what "content-only MVP" calls for; recommend it as an easy follow-up once the base module exists. Minimal shape: `title`, `category`/tag (single text field, no taxonomy table), `portions` (integer), `instructions` (single text block — a `recipe_steps` child table is over-engineering for MVP), and `recipe_ingredients` rows (`name`, `quantity`, `unit`, `position`).

## Risks
- A future genuine "private recipe" need would require a migration under Approach 1, not a toggle — accepted tradeoff, no current evidence for the need.
- Single-text `instructions` loses per-step structure (timers, images) — acceptable for MVP, should be reconfirmed in design.md.
- `recipe_ingredients.unit` as free text (not an enum) may need normalization once shopping-list-generation is built later — flag in design.md, don't block now.
- No existing from-scratch-module test scaffolding to copy; design/tasks should budget both domain-predicate unit tests and an RLS/integration pass mirroring `supabase/tests/*` and `tests/integration/finance-facade.test.ts`.

## Ready for Proposal
Yes — architecture mechanics are fully confirmed by direct code reads with zero ambiguity; the one real design decision (drop visibility split, child-table ingredients, defer photo) has a clear, precedent-grounded recommendation ready for `sdd-propose`.

## Key Learnings
1. `eslint-plugin-boundaries` config in `eslint.config.mjs` is fully generic over `src/modules/*/api|domain|data|ui/**` with a `${from.module}` capture, so any new peer module gets Gate A protection with zero new ESLint lines.
2. The `visibility`+`owner_user_id`-gated-SELECT RLS pattern in `health`/`finance` exists to solve per-record sensitivity that a cooking-content recipe does not have, so it should not be copied by default into a new module.
3. This codebase has zero jsonb columns anywhere; every one-to-many relationship is a relational child table with a foreign key, the precedent-consistent shape for a recipe's ingredient list.
4. No `recipes` or `shopping_list` schema, module, or migration exists in the tracked repository; the only prior artifact is a stale, superseded exploration file.
5. The module hub at `src/app/(app)/page.tsx` uses a static hardcoded `MODULES` array, so adding Recipes is a one-line change, not a registry update.
