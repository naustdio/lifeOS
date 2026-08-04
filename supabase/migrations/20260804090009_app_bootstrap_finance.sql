-- CREATE OR REPLACE app.bootstrap_user() to add the Finance step. Both steps commit or roll
-- back together in one transaction — per design.md §6.1. Sub-slice 2A.

create or replace function app.bootstrap_user()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_household uuid;
begin
  v_household := core.ensure_personal_space();
  perform finance.ensure_default_categories(v_household);
  return v_household;
end $$;
