-- core_schema.sql (design.md §3.1, slice 1)
-- `core` is the identity kernel every other module depends on and ships
-- first (module-architecture spec: "Schema-Per-Module").

create schema if not exists core;

create table core.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table core.households (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null default 'personal',
  base_currency           char(3) not null default 'MXN' check (base_currency = 'MXN'),
  -- non-null ONLY for auto-created personal spaces; the unique index is what
  -- makes first-sign-in bootstrap race-free (design.md §6.2).
  personal_owner_user_id  uuid unique references auth.users(id) on delete cascade,
  created_by              uuid not null references auth.users(id),
  created_at              timestamptz not null default now()
);

create table core.household_members (
  household_id uuid not null references core.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner','member')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index on core.household_members (user_id);

-- Shared `updated_at` maintenance trigger (design.md §3.4). Used by
-- `core.profiles` here; `finance.*` tables reuse the same function in
-- slice 2.
create or replace function core.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on core.profiles
for each row
execute function core.touch_updated_at();
