-- pgTAP — recipes-module Phase 1 (design.md Decisions 1/2/3, tasks.md 1.1/1.5/1.6).
--
-- RED pass (this file's initial form): run against the PRE-migration schema. `recipes` schema
-- doesn't exist yet, so every assertion below fails (either a hard "relation/function does not
-- exist" error, or a genuine assertion failure for statements phrased as row-count checks). That
-- failure is the RED evidence, same convention as `140_nutrition_visits.sql`'s Phase 1. After the
-- three migrations in tasks.md 1.2/1.3/1.4 land, the same file passes unchanged — GREEN (1.5).
--
-- Covers: (a) a non-member cannot see another household's recipes/ingredients/steps/custom_units
-- (no-visibility-leak, design.md "every policy is core.is_member, full stop"); (b) a non-owner
-- calling recipes.hard_delete_recipe is rejected with 42501 (Decision 3); (c) a direct INSERT into
-- recipes.recipes as `authenticated` (bypassing the seam) is denied by the revoked grant
-- (Decision 1); (d) recipe_changes.reason rejects null/blank (the mandatory-reason CHECK);
-- (e) hard_delete_recipe leaves the corresponding recipe_changes row(s) with recipe_id null, the
-- household_id and recipe_title snapshot intact, and the hard_deleted reason readable
-- (Decision 2 — "content is destroyed, accountability is not").

begin;
select plan(11);

-- ---------------------------------------------------------------------------
-- Fixtures — household A (owner A1, non-owner member A2), household B (owner B1, unrelated).
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000001500a1', 'recipes-a1@example.com', '{"full_name":"Recipes A1"}'),
  ('00000000-0000-0000-0000-0000001500a2', 'recipes-a2@example.com', '{"full_name":"Recipes A2"}'),
  ('00000000-0000-0000-0000-0000001500b1', 'recipes-b1@example.com', '{"full_name":"Recipes B1"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000001500aa', 'personal', '00000000-0000-0000-0000-0000001500a1', '00000000-0000-0000-0000-0000001500a1'),
  ('00000000-0000-0000-0000-0000001500bb', 'personal', '00000000-0000-0000-0000-0000001500b1', '00000000-0000-0000-0000-0000001500b1')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000001500aa', '00000000-0000-0000-0000-0000001500a1', 'owner'),
  ('00000000-0000-0000-0000-0000001500aa', '00000000-0000-0000-0000-0000001500a2', 'member'),
  ('00000000-0000-0000-0000-0000001500bb', '00000000-0000-0000-0000-0000001500b1', 'owner')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- (d) recipe_changes.reason rejects null / blank — check constraint, no impersonation needed.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into recipes.recipe_changes
       (household_id, recipe_id, recipe_title, actor_user_id, action, reason)
     values
       ('00000000-0000-0000-0000-0000001500aa', null, 'x', '00000000-0000-0000-0000-0000001500a1', 'created', null) $$,
  '23502', null,
  'recipe_changes.reason rejects null'
);

select throws_ok(
  $$ insert into recipes.recipe_changes
       (household_id, recipe_id, recipe_title, actor_user_id, action, reason)
     values
       ('00000000-0000-0000-0000-0000001500aa', null, 'x', '00000000-0000-0000-0000-0000001500a1', 'created', '  ') $$,
  '23514', null,
  'recipe_changes.reason rejects a blank/whitespace-only value'
);

-- ---------------------------------------------------------------------------
-- (a) No-visibility-leak: member A2 creates a recipe via the seam; B1 (unrelated household)
-- must see none of it.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001500a2","role":"authenticated"}';

select recipes.create_recipe(
  '00000000-0000-0000-0000-0000001500aa'::uuid, 'Tacos al pastor', 'comida', 4, null,
  '[{"name":"Tortilla","quantity":8,"unit":"pieza","position":0}]'::jsonb,
  '[{"position":0,"instruction":"Calentar la tortilla"}]'::jsonb,
  'primera carga de la receta'
) as v_recipe_id \gset

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001500b1","role":"authenticated"}';

select is(
  (select count(*) from recipes.recipes where id = :'v_recipe_id'::uuid),
  0::bigint,
  'an unrelated household (B1) does not see A''s recipe'
);
select is(
  (select count(*) from recipes.recipe_ingredients where recipe_id = :'v_recipe_id'::uuid),
  0::bigint,
  'an unrelated household (B1) does not see A''s ingredients'
);
select is(
  (select count(*) from recipes.recipe_steps where recipe_id = :'v_recipe_id'::uuid),
  0::bigint,
  'an unrelated household (B1) does not see A''s steps'
);
select is(
  (select count(*) from recipes.custom_units where household_id = '00000000-0000-0000-0000-0000001500aa'),
  0::bigint,
  'an unrelated household (B1) does not see A''s custom_units'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- (c) Direct INSERT bypassing the seam is denied (grants revoked, Decision 1).
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001500a1","role":"authenticated"}';

select throws_ok(
  $$ insert into recipes.recipes (household_id, owner_user_id, title, category, portions)
     values ('00000000-0000-0000-0000-0000001500aa', '00000000-0000-0000-0000-0000001500a1', 'Bypass', 'comida', 1) $$,
  '42501', null,
  'a direct INSERT into recipes.recipes bypassing the seam is denied'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- (b) Owner-only hard delete: non-owner member A2 is rejected with 42501.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001500a2","role":"authenticated"}';

select throws_ok(
  format($$ select recipes.hard_delete_recipe(%L::uuid, 'intento no autorizado') $$, :'v_recipe_id'),
  '42501', null,
  'a non-owner (A2) calling hard_delete_recipe is rejected'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- (e) Owner A1 hard-deletes: recipe gone, recipe_changes survives with recipe_id null + snapshot.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001500a1","role":"authenticated"}';

select recipes.hard_delete_recipe(:'v_recipe_id'::uuid, 'receta duplicada, se elimina para siempre');

select is(
  (select count(*) from recipes.recipes where id = :'v_recipe_id'::uuid),
  0::bigint,
  'the recipe row itself is gone after hard delete'
);

select is(
  (select count(*) from recipes.recipe_changes
    where recipe_title = 'Tacos al pastor' and action = 'hard_deleted' and recipe_id is null
      and household_id = '00000000-0000-0000-0000-0000001500aa'),
  1::bigint,
  'the hard-delete change row survives with recipe_id null, title snapshot, and correct household_id'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- (f) Owner A1 cannot hard-delete via a raw DELETE bypassing the seam — closes the gap found by
-- sdd-verify: `hard_delete_recipe` is `security definer` and does not need a DELETE grant on
-- `recipes.recipes` to do its own delete, so granting `delete` to `authenticated` only opened an
-- unaudited bypass (an owner's raw DELETE would satisfy the RLS policy yet write no
-- `recipe_changes` row, defeating Decision 2's "content destroyed, accountability not").
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001500a1","role":"authenticated"}';

select recipes.create_recipe(
  '00000000-0000-0000-0000-0000001500aa'::uuid, 'Sopa de fideo', 'comida', 2, null,
  '[]'::jsonb, '[]'::jsonb, 'carga para probar el bypass'
) as v_bypass_recipe_id \gset

select throws_ok(
  format($$ delete from recipes.recipes where id = %L::uuid $$, :'v_bypass_recipe_id'),
  '42501', null,
  'an owner''s raw DELETE bypassing the seam is denied — hard delete must go through hard_delete_recipe'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
