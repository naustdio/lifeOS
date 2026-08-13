# Proposal: Recipes Module (New Peer Module, Audited Household Recipe Book)

## Intent

The household has no place to keep the recipes it actually cooks: they live in TikTok saves, screenshots, and memory, so a recipe cannot be searched, corrected, or reused reliably. This change adds `recipes` as a fourth peer module (`core`/`finance`/`health`/`recipes`) holding household-shared recipes with structured ingredients and numbered steps, an auditable change history, and one optional video reference.

**Scope note:** this MVP is deliberately larger than a "content-only" recipe list. The audit trail with mandatory reasons, the two-tier soft/hard-delete permission model, and the video-reference field were each chosen by the user during a requirements interview — they are not orchestrator-introduced scope creep.

## Scope

### In Scope

- New module `src/modules/recipes/` (`domain/`, `data/`, `api/index.ts`) mirroring `health`'s shape; no ESLint changes (glob rules already cover it).
- Schema `recipes`: `recipes` (title, category enum, portions, video_url, household_id, owner_user_id, soft-delete columns), `recipe_ingredients` (name, quantity, unit, position), `recipe_steps` (position, text), `recipe_changes` (actor, action, reason, timestamp).
- RLS via `core.is_member(household_id)` only — **no `visibility`/private split** (settled: recipes have no sensitivity dimension).
- Fixed category enum: Desayuno / Comida / Cena / Postre / Snack — drives filtering and future Nutrition meal-plan linkage.
- `portions` integer, informational display only (no quantity recalculation).
- Unit input: fixed icon picklist (g, kg, ml, l, taza, cucharada, cucharadita, pieza, pizca — finalize in design) **plus** free-text fallback for units outside the list.
- Search by recipe name + filter by category.
- Any member may edit or soft-delete; **a reason is mandatory and the save is blocked without it**. Only `core.household_members.role = 'owner'` may hard-delete, behind a distinct strong confirmation.
- Soft-deleted recipes are excluded from list/search; row and history survive (mirrors the existing void-don't-hard-delete pattern).
- Change history rendered in a "Historial de cambios" section on recipe detail, collapsed by default.
- Video reference **Phase 1**: store one URL string; render a native embed for recognized platforms (TikTok oEmbed, YouTube, Google Drive `/preview`), plain clickable link otherwise. Video bytes are never downloaded, transcoded, or re-hosted.
- Route group `src/app/(app)/(recipes)/` with its own `layout.tsx`; one new entry in the hub's `MODULES` array.

### Out of Scope

Each item below was considered and explicitly deferred by the user, not overlooked:

- **Recipe photos** — deferred to the immediate follow-up cycle (user: "no lo olvide"). This is the next recommended change, not a someday item.
- Portion-based ingredient scaling ("view for N portions").
- Per-recipe estimated cost (`estimated_unit_cost` on ingredients).
- A ShoppingList module (multi-recipe aggregation, check-off, Finance-linked real spend) — a distinct future module, not part of Recipes.
- Ingredient-based search.
- Self-hosted video upload — **Phase 2**, see Dependencies.
- Any `visibility`/private-recipe mechanism.

## Capabilities

### New Capabilities

- `recipes-catalog`: recipe record (title, category, portions), ordered ingredients and numbered steps as relational children, name search and category filter.
- `recipes-history`: mandatory-reason edit and soft-delete audit trail, owner-only hard delete with strong confirmation, collapsed history view.
- `recipes-video-reference`: one optional URL per recipe, platform-recognized embed with link fallback, no media re-hosting.
- `recipes-module-api`: the `recipes/api` barrel as the sole cross-module entry point (Gate A), mirroring `finance-module-api`.

### Modified Capabilities

- None. `module-hub`'s "Hardcoded Module Discovery" requirement already covers adding a card; `module-architecture` is module-name-agnostic.

## Approach

Exploration Approach 1, extended by the interview outcomes. Two-file migration split (DDL, then RLS/grants) as every prior module. Ingredients **and** steps are relational child tables with a `position` column — consistent with the codebase's zero-jsonb convention and independently reorderable. `recipe_changes` is an append-only child table written inside the same server action as every mutation, so a reason-less write cannot produce a recipe row. Hard delete is a separate server action gated on the caller's `core.household_members.role`, enforced in RLS as well as UI. The video field stays a plain `text` column; embedding is a pure client-side URL-pattern decision with a link fallback, adding zero infrastructure.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | `recipes` schema DDL + RLS/grants pair |
| `src/modules/recipes/domain/` | New | Category/unit/reason predicates mirroring DB CHECKs |
| `src/modules/recipes/data/` | New | Recipe, ingredient, step, history repositories |
| `src/modules/recipes/api/index.ts` | New | Sole public barrel, `server-only` first line |
| `src/app/(app)/(recipes)/` | New | Layout, list/search, create/edit, detail |
| `src/app/(app)/page.tsx` | Modified | One new `MODULES` entry |
| `src/design-system/patterns/` | New | Ingredient row, step row, video embed |
| `eslint.config.mjs` | None | Glob boundary rules already cover new modules |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Combined scope far exceeds the 800-line review budget | High | `sdd-tasks` must forecast stacked slices (schema+RLS → module data/domain → CRUD routes → history/permissions → video embed) |
| Link rot: a referenced video is deleted or moved by its host | Med | Accepted by the user in exchange for zero copyright exposure and zero infrastructure; render a graceful fallback link |
| Third-party embed CSP/iframe friction (TikTok, Drive) | Med | Fallback to a plain link is always available; verify per-platform in design |
| Mandatory-reason rule bypassed by a future write path | Med | Single server-action write seam per mutation; DB `NOT NULL` on `recipe_changes.reason` |
| Owner-only hard delete enforced in UI but not DB | Med | Enforce in the RLS DELETE policy, not only the action |
| First from-scratch module with no test scaffolding to copy | Low | Budget domain unit tests + an RLS pass mirroring `supabase/tests/*` |

## Rollback Plan

Revert the app commit and drop the `recipes` schema (`drop schema recipes cascade`). Nothing outside the module is touched except one `MODULES` array entry in `src/app/(app)/page.tsx`, restored in one line. No existing table, policy, or module is modified, so revert cannot affect Finance, Health, or Core data.

## Dependencies

- `core.households` / `core.household_members` / `core.is_member` — shipped.
- `core.household_members.role = 'owner'` is the authority for hard delete — no new role model.
- **Next cycle (confirmed):** recipe photos, using the `health.nutrition_visit_photos` private-bucket + signed-URL precedent.
- **Next-next cycle (confirmed roadmap, not this change):** video Phase 2 — self-recorded video upload and hosting, which removes the copyright concern because the content is the user's own. Needs its own infrastructure design (storage, compression/transcoding); this repo currently has no background-job or queue infrastructure.

## Success Criteria

- [ ] A household member can create a recipe with title, category, portions, N ordered ingredients, and N numbered steps, and find it again by name and by category filter.
- [ ] An edit or soft-delete without a reason is rejected; with a reason it appears in "Historial de cambios" with actor and timestamp.
- [ ] A soft-deleted recipe disappears from list and search while its row and full history remain in the database.
- [ ] A non-owner member cannot hard-delete a recipe — blocked at the RLS policy, not only the UI.
- [ ] A recipe with a TikTok/YouTube/Drive URL renders an embed; any other URL renders a clickable link; no video bytes are stored by the app.
- [ ] No `visibility` column, no photo upload, no cost field, and no shopping-list code appear in the diff.

## Delivery Notes (cached preflight)

Execution mode: interactive · Artifact store: hybrid · Delivery strategy: ask-on-risk · Review budget: 800 changed lines · strict_tdd: false (critical-logic focus).

## Proposal question round

Decisions 1–8 from the requirements interview are settled and are NOT re-asked. Remaining genuine product questions for the user before specs/design:

1. **Unit picklist final contents** — SETTLED: extended list — `g, kg, ml, l, taza, cucharada, cucharadita, pieza, pizca, oz, lb, diente, manojo, al gusto`.
2. **Free-text unit reuse** — SETTLED: a typed unit outside the picklist is persisted per-household and offered in the picklist for future recipes (the picklist grows with use, not just a one-off string).
3. **History granularity** — SETTLED: per-save entry only (who + timestamp + stated reason), no field-level diff.
