-- app_bootstrap.sql (design.md §6.1, slice 1)
-- `app` is the composition root at the database layer — the DB-layer mirror
-- of `src/app/`. It is the ONLY schema allowed to call into more than one
-- module. This exists so `core` never has to call `finance`, which would
-- invert the `finance -> core` dependency direction enforced by ESLint.
--
-- Slice 1 ships this function calling ONLY `core.ensure_personal_space()`.
-- The slice-2 migration `app_bootstrap_finance.sql` will
-- `CREATE OR REPLACE` it to also call `finance.ensure_default_categories()`
-- in the same transaction — do NOT implement or reference `finance.*` here.
create schema if not exists app;

create or replace function app.bootstrap_user()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  v_household := core.ensure_personal_space();
  return v_household;
end;
$$;

grant usage on schema app to authenticated;

-- `core.ensure_personal_space` itself remains NOT granted to `authenticated`
-- — reachable only through this function.
revoke execute on function app.bootstrap_user() from public;
grant execute on function app.bootstrap_user() to authenticated;
