-- pgTAP — recipes-module ingredient catalog fast-follow (migration
-- `20260814140000_recipes_ingredient_catalog.sql`). Covers: (a) creating a recipe auto-populates
-- the household's ingredient catalog with each ingredient name; (b) a duplicate name (any casing)
-- does not create a second catalog row; (c) a household member may insert/update a catalog entry
-- directly (unlike `recipes.recipes`, which forbids direct writes) to attach a photo/icon; (d) an
-- unrelated household cannot see another household's catalog.

begin;
select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000001510a1', 'ingcat-a1@example.com', '{"full_name":"IngCat A1"}'),
  ('00000000-0000-0000-0000-0000001510b1', 'ingcat-b1@example.com', '{"full_name":"IngCat B1"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000001510aa', 'personal', '00000000-0000-0000-0000-0000001510a1', '00000000-0000-0000-0000-0000001510a1'),
  ('00000000-0000-0000-0000-0000001510bb', 'personal', '00000000-0000-0000-0000-0000001510b1', '00000000-0000-0000-0000-0000001510b1')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000001510aa', '00000000-0000-0000-0000-0000001510a1', 'owner'),
  ('00000000-0000-0000-0000-0000001510bb', '00000000-0000-0000-0000-0000001510b1', 'owner')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- (a) create_recipe auto-catalogs its ingredient names; (b) a same-name-different-case
-- ingredient on a second recipe does not create a duplicate catalog row.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001510a1","role":"authenticated"}';

select recipes.create_recipe(
  '00000000-0000-0000-0000-0000001510aa'::uuid, 'Tacos', 'comida', 4, null,
  '[{"name":"Tortilla","quantity":8,"unit":"pieza","position":0},{"name":"Cebolla","quantity":1,"unit":"pieza","position":1}]'::jsonb,
  '[]'::jsonb, 'primera carga'
);

select recipes.create_recipe(
  '00000000-0000-0000-0000-0000001510aa'::uuid, 'Sopa', 'comida', 2, null,
  '[{"name":"CEBOLLA","quantity":1,"unit":"pieza","position":0}]'::jsonb,
  '[]'::jsonb, 'segunda carga'
);

reset role;
reset request.jwt.claims;

select is(
  (select count(*) from recipes.ingredient_catalog where household_id = '00000000-0000-0000-0000-0000001510aa'),
  2::bigint,
  'create_recipe auto-catalogs each distinct ingredient name, case-insensitively deduped (Tortilla + Cebolla, not a third row for CEBOLLA)'
);

select is(
  (select name from recipes.ingredient_catalog
    where household_id = '00000000-0000-0000-0000-0000001510aa' and lower(name) = 'tortilla'),
  'Tortilla',
  'the catalog keeps the first-seen casing of a name'
);

-- ---------------------------------------------------------------------------
-- (c) A household member can insert/update a catalog entry directly (attach a photo/icon)
-- without going through a seam function.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001510a1","role":"authenticated"}';

select lives_ok(
  $$ update recipes.ingredient_catalog
       set icon = '🧅'
     where household_id = '00000000-0000-0000-0000-0000001510aa' and lower(name) = 'cebolla' $$,
  'a household member can attach an icon to a catalog entry directly (no seam function required)'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- (d) An unrelated household cannot see another household's catalog.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001510b1","role":"authenticated"}';

select is(
  (select count(*) from recipes.ingredient_catalog where household_id = '00000000-0000-0000-0000-0000001510aa'),
  0::bigint,
  'an unrelated household (B1) cannot see household A''s ingredient catalog'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
