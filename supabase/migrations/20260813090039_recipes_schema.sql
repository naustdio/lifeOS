-- `recipes` schema — design.md Schema section (recipes-module, 4th peer module).
-- Household-shared recipe book: recipe + relational ingredients/steps + an append-only audit
-- trail. No `visibility` column anywhere — every policy is `core.is_member(household_id)`,
-- full stop (settled: cooking content has no sensitivity dimension).

create schema recipes;

create table recipes.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  title text not null check (length(btrim(title)) between 1 and 120),
  category text not null check (category in ('desayuno','comida','cena','postre','snack')),
  portions int not null default 1 check (portions between 1 and 99),
  video_url text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on recipes.recipes (household_id, created_at desc) where is_deleted = false;
create trigger recipes_touch_updated_at before update on recipes.recipes
  for each row execute function core.touch_updated_at();

create table recipes.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes.recipes(id) on delete cascade,
  position int not null check (position >= 0),
  name text not null check (length(btrim(name)) between 1 and 80),
  quantity numeric(10,2) check (quantity > 0),   -- null for 'al gusto'
  unit text not null,
  unique (recipe_id, position) deferrable initially deferred
);

create table recipes.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes.recipes(id) on delete cascade,
  position int not null check (position >= 0),
  instruction text not null check (length(btrim(instruction)) >= 1),
  unique (recipe_id, position) deferrable initially deferred
);

-- Decision 2: `set null`, NOT cascade. A hard delete destroys the recipe's CONTENT; its
-- accountability trail survives as a title-stamped orphan. Do not "fix" this to cascade —
-- full cascade would let hard-delete launder the very audit trail it should be answerable to.
create table recipes.recipe_changes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  recipe_id uuid references recipes.recipes(id) on delete set null,
  recipe_title text not null,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (action in ('created','edited','soft_deleted','restored','hard_deleted')),
  reason text not null check (length(btrim(reason)) >= 3),
  created_at timestamptz not null default now()
);
create index on recipes.recipe_changes (recipe_id, created_at desc);
create index on recipes.recipe_changes (household_id, created_at desc);

create table recipes.custom_units (
  household_id uuid not null references core.households(id) on delete cascade,
  unit_name text not null check (length(btrim(unit_name)) between 1 and 24),
  created_at timestamptz not null default now(),
  primary key (household_id, unit_name)
);
