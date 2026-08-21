-- pgTAP — shopping-list module Phase 1 (design.md Decisions 1/2/5, tasks.md 1.1/1.4/1.5).
--
-- RED pass (this file's initial form): run against the PRE-migration database. The
-- `shopping_list` schema does not exist yet, so every assertion below fails (either a hard
-- "schema/relation does not exist" error, or a genuine assertion failure for statements phrased
-- as row-count checks). That failure is the RED evidence, same convention as `150_recipes.sql`'s
-- and `140_nutrition_visits.sql`'s Phase 1. After the two migrations in tasks.md 1.2/1.3 land,
-- this same file passes unchanged — GREEN (1.4).
--
-- Covers: (a) a non-member sees zero rows across all 4 tables (`lists`, `store_types`,
-- `ingredient_store_defaults`, `items`) — no-visibility-leak, design.md "every policy is
-- core.is_member(household_id), full stop"; (b) a second `active` list for the same household
-- violates the partial unique index (Decision 5); (c) `items.estimated_unit_cost < 0` is rejected
-- by the CHECK constraint (Decision 2); (d) a household member can write directly under RLS with
-- no seam function (design.md "direct-RLS write" discipline, unlike `recipes.recipes`).

begin;
select plan(10);

-- ---------------------------------------------------------------------------
-- Fixtures — household A (members A1, A2), household B (member B1, unrelated).
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000001600a1', 'shoplist-a1@example.com', '{"full_name":"ShopList A1"}'),
  ('00000000-0000-0000-0000-0000001600a2', 'shoplist-a2@example.com', '{"full_name":"ShopList A2"}'),
  ('00000000-0000-0000-0000-0000001600b1', 'shoplist-b1@example.com', '{"full_name":"ShopList B1"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000001600aa', 'personal', '00000000-0000-0000-0000-0000001600a1', '00000000-0000-0000-0000-0000001600a1'),
  ('00000000-0000-0000-0000-0000001600bb', 'personal', '00000000-0000-0000-0000-0000001600b1', '00000000-0000-0000-0000-0000001600b1')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000001600aa', '00000000-0000-0000-0000-0000001600a1', 'owner'),
  ('00000000-0000-0000-0000-0000001600aa', '00000000-0000-0000-0000-0000001600a2', 'member'),
  ('00000000-0000-0000-0000-0000001600bb', '00000000-0000-0000-0000-0000001600b1', 'owner')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- (d) Member A1 creates the household's active list, a store type, an ingredient default, and a
-- loose item, all via direct RLS-gated writes (no seam function exists in this module).
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001600a1","role":"authenticated"}';

select lives_ok(
  $$ insert into shopping_list.lists (id, household_id)
     values ('00000000-0000-0000-0000-0000001600e0', '00000000-0000-0000-0000-0000001600aa') $$,
  'a household member can directly insert the household''s active list under RLS (no seam)'
);

select lives_ok(
  $$ insert into shopping_list.store_types (id, household_id, name)
     values ('00000000-0000-0000-0000-0000001600e1', '00000000-0000-0000-0000-0000001600aa', 'Supermercado') $$,
  'a household member can directly insert a store type under RLS'
);

select lives_ok(
  $$ insert into shopping_list.ingredient_store_defaults (household_id, ingredient_name, store_type_id)
     values ('00000000-0000-0000-0000-0000001600aa', 'tortilla', '00000000-0000-0000-0000-0000001600e1') $$,
  'a household member can directly insert an ingredient store default under RLS'
);

select lives_ok(
  format($$ insert into shopping_list.items
       (id, list_id, household_id, name, quantity, unit, added_by_user_id)
     values ('00000000-0000-0000-0000-0000001600e2', '00000000-0000-0000-0000-0000001600e0',
             '00000000-0000-0000-0000-0000001600aa', 'Papel higiénico', 4, 'pieza', %L::uuid) $$,
         '00000000-0000-0000-0000-0000001600a1'),
  'a household member can directly insert a loose item under RLS'
);

-- ---------------------------------------------------------------------------
-- (b) A second `active` list for the same household violates the partial unique index
-- (Decision 5 — at most one active list per household).
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into shopping_list.lists (household_id) values ('00000000-0000-0000-0000-0000001600aa') $$,
  '23505', null,
  'a second active list for the same household violates the partial unique index'
);

-- ---------------------------------------------------------------------------
-- (c) items.estimated_unit_cost < 0 is rejected by the CHECK constraint (Decision 2).
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$ insert into shopping_list.items
       (list_id, household_id, name, quantity, unit, estimated_unit_cost, added_by_user_id)
     values ('00000000-0000-0000-0000-0000001600e0', '00000000-0000-0000-0000-0000001600aa',
             'Aguacate', 2, 'pieza', -5.00, %L::uuid) $$,
         '00000000-0000-0000-0000-0000001600a1'),
  '23514', null,
  'a negative estimated_unit_cost is rejected by the CHECK constraint'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- (a) No-visibility-leak: an unrelated household member (B1) sees zero rows across all 4 tables.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001600b1","role":"authenticated"}';

select is(
  (select count(*) from shopping_list.lists where household_id = '00000000-0000-0000-0000-0000001600aa'),
  0::bigint,
  'an unrelated household (B1) does not see household A''s list'
);

select is(
  (select count(*) from shopping_list.store_types where household_id = '00000000-0000-0000-0000-0000001600aa'),
  0::bigint,
  'an unrelated household (B1) does not see household A''s store types'
);

select is(
  (select count(*) from shopping_list.ingredient_store_defaults where household_id = '00000000-0000-0000-0000-0000001600aa'),
  0::bigint,
  'an unrelated household (B1) does not see household A''s ingredient store defaults'
);

select is(
  (select count(*) from shopping_list.items where household_id = '00000000-0000-0000-0000-0000001600aa'),
  0::bigint,
  'an unrelated household (B1) does not see household A''s items'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
