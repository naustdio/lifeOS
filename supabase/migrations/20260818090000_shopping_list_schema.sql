-- `shopping_list` schema — design.md Data Model section (shopping-list module, 5th peer schema).
-- One continuous, household-shared shopping list: an explicit `lists` row with `active`/`closed`
-- status (Decision 5), an open store-type taxonomy that a household "learns" per ingredient name
-- (Decision 1), and exploded, un-combined `items` rows — combining is a pure read/render-time
-- aggregation (`domain/combine.ts`), not modeled here. No `visibility` column anywhere — every
-- policy is `core.is_member(household_id)`, full stop, same as `recipes`.

create schema shopping_list;

create table shopping_list.lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  status text not null default 'active' check (status in ('active','closed')),
  estimated_total numeric(12,2),                       -- stamped at close (Decision 5)
  closed_at timestamptz,
  closed_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index on shopping_list.lists (household_id) where status = 'active';

create table shopping_list.store_types (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index on shopping_list.store_types (household_id, lower(name));

-- Decision 1 — household "learns" a store type per ingredient name (lowercased by the repo),
-- so a recipe-origin or loose item resolves a default without re-tagging every time.
create table shopping_list.ingredient_store_defaults (
  household_id uuid not null references core.households(id) on delete cascade,
  ingredient_name text not null check (length(btrim(ingredient_name)) between 1 and 80),
  store_type_id uuid not null references shopping_list.store_types(id) on delete cascade,
  primary key (household_id, ingredient_name)
);

create table shopping_list.items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references shopping_list.lists(id) on delete cascade,
  household_id uuid not null references core.households(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  quantity numeric(10,2) check (quantity > 0),               -- null = "al gusto"
  unit text not null,
  estimated_unit_cost numeric(10,2) check (estimated_unit_cost >= 0),  -- Decision 2, snapshotted
  store_type_id uuid references shopping_list.store_types(id) on delete set null,
  is_checked boolean not null default false,
  checked_at timestamptz,
  origin_recipe_id uuid,          -- NOT an FK: `recipes` is off-limits to this schema
  origin_recipe_title text,       -- snapshot; null on both = loose manual item
  added_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index on shopping_list.items (list_id, created_at);
