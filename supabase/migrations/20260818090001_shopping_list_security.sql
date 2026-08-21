-- `shopping_list` RLS + grants — design.md RLS section. Every policy is `to authenticated` and
-- `core.is_member(household_id)`, with NO visibility branch and NO security-definer seam
-- (`explore.md` precedent #2 — no mandatory-reason audit trail exists for this module, unlike
-- `recipes.recipes`). `ingredient_store_defaults`, `store_types`, `lists`, and `items` all carry
-- `household_id` directly, so no `exists` hop is needed anywhere.

alter table shopping_list.lists                     enable row level security;
alter table shopping_list.store_types                enable row level security;
alter table shopping_list.ingredient_store_defaults   enable row level security;
alter table shopping_list.items                       enable row level security;

create policy shopping_list_lists_all on shopping_list.lists
  for all to authenticated
  using (core.is_member(household_id))
  with check (core.is_member(household_id));

create policy shopping_list_store_types_all on shopping_list.store_types
  for all to authenticated
  using (core.is_member(household_id))
  with check (core.is_member(household_id));

create policy shopping_list_ingredient_store_defaults_all on shopping_list.ingredient_store_defaults
  for all to authenticated
  using (core.is_member(household_id))
  with check (core.is_member(household_id));

create policy shopping_list_items_all on shopping_list.items
  for all to authenticated
  using (core.is_member(household_id))
  with check (core.is_member(household_id));

revoke all on all tables    in schema shopping_list from anon, authenticated;
revoke all on all functions in schema shopping_list from anon, authenticated;
alter default privileges in schema shopping_list revoke all on tables    from anon, authenticated;
alter default privileges in schema shopping_list revoke all on functions from anon, authenticated;

grant usage on schema shopping_list to authenticated;
grant select, insert, update, delete
  on shopping_list.lists, shopping_list.store_types,
     shopping_list.ingredient_store_defaults, shopping_list.items
  to authenticated;
