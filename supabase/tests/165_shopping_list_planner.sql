-- pgTAP — shopping-list module Phase 6, weekly planner (design.md Open Question: planner
-- scoping, tasks.md 6.1/6.2). RED pass (this file's initial form): run against the database as
-- of Phase 1-5 (schema/security migrations 20260818090000/1 already applied, but no
-- `planner_slots` table yet) — every assertion below fails with a "relation does not exist"
-- error. That failure is the RED evidence, same convention as `160_shopping_list.sql`. After the
-- two migrations in tasks.md 6.2 land, this same file passes unchanged — GREEN.
--
-- Covers: (a) the table carries EXACTLY `(household_id, day, meal_slot, recipe_id)` — no
-- item/checked/state column, the design.md constraint that closes the Open Question; (b) a
-- household member can directly insert/read a slot under RLS (no seam); (c) the composite
-- primary key rejects a second recipe for the same (household_id, day, meal_slot) — "at most one
-- recipe per day/meal slot" enforced at the data layer; (d) a non-member sees zero rows and
-- cannot write.

begin;
select plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures — household A (member A1), household B (member B1, unrelated).
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000001650a1', 'shopplanner-a1@example.com', '{"full_name":"ShopPlanner A1"}'),
  ('00000000-0000-0000-0000-0000001650b1', 'shopplanner-b1@example.com', '{"full_name":"ShopPlanner B1"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000001650aa', 'personal', '00000000-0000-0000-0000-0000001650a1', '00000000-0000-0000-0000-0000001650a1'),
  ('00000000-0000-0000-0000-0000001650bb', 'personal', '00000000-0000-0000-0000-0000001650b1', '00000000-0000-0000-0000-0000001650b1')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000001650aa', '00000000-0000-0000-0000-0000001650a1', 'owner'),
  ('00000000-0000-0000-0000-0000001650bb', '00000000-0000-0000-0000-0000001650b1', 'owner')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- (a) The table carries exactly these 4 columns — no item/checked/state column.
-- ---------------------------------------------------------------------------

select columns_are('shopping_list', 'planner_slots', ARRAY['household_id', 'day', 'meal_slot', 'recipe_id']);

-- ---------------------------------------------------------------------------
-- (b) A household member can directly insert/read a slot under RLS (no seam).
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001650a1","role":"authenticated"}';

select lives_ok(
  $$ insert into shopping_list.planner_slots (household_id, day, meal_slot, recipe_id)
     values ('00000000-0000-0000-0000-0000001650aa', 'lunes', 'cena', '00000000-0000-0000-0000-0000001650f0') $$,
  'a household member can directly insert a planner slot under RLS (no seam)'
);

select is(
  (select count(*) from shopping_list.planner_slots where household_id = '00000000-0000-0000-0000-0000001650aa'),
  1::bigint,
  'the household member can read the slot back'
);

-- ---------------------------------------------------------------------------
-- (c) A second recipe for the same (household_id, day, meal_slot) violates the composite PK —
-- "at most one recipe per day/meal slot".
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into shopping_list.planner_slots (household_id, day, meal_slot, recipe_id)
     values ('00000000-0000-0000-0000-0000001650aa', 'lunes', 'cena', '00000000-0000-0000-0000-0000001650f1') $$,
  '23505', null,
  'a second recipe for the same day/meal slot violates the composite primary key'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- (d) An unrelated household member (B1) sees zero rows and cannot write.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001650b1","role":"authenticated"}';

select is(
  (select count(*) from shopping_list.planner_slots where household_id = '00000000-0000-0000-0000-0000001650aa'),
  0::bigint,
  'an unrelated household (B1) does not see household A''s planner slots'
);

select throws_ok(
  $$ insert into shopping_list.planner_slots (household_id, day, meal_slot, recipe_id)
     values ('00000000-0000-0000-0000-0000001650aa', 'martes', 'comida', '00000000-0000-0000-0000-0000001650f2') $$,
  '42501', null,
  'an unrelated household member cannot write into household A''s planner'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
