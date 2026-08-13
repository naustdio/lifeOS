-- `recipes` RLS + grants — design.md RLS section. Every policy is `to authenticated` and
-- `core.is_member(...)`, with NO visibility branch (settled: recipes have no sensitivity
-- dimension). Children scope through an `exists` on the parent. DML is revoked on `recipes.recipes`
-- (Decision 1) — the seam functions from the prior migration are the only write path; the DELETE
-- policy below is defence-in-depth for `hard_delete_recipe`'s own `core.is_owner` check
-- (Decision 3), since `security definer` bypasses RLS but this policy still gates any future
-- direct-DELETE path.

alter table recipes.recipes            enable row level security;
alter table recipes.recipe_ingredients enable row level security;
alter table recipes.recipe_steps       enable row level security;
alter table recipes.recipe_changes     enable row level security;
alter table recipes.custom_units       enable row level security;

create policy recipes_select on recipes.recipes
  for select to authenticated
  using (core.is_member(household_id));

-- No INSERT/UPDATE policy: DML is revoked below; the seam is the only write path (Decision 1).
create policy recipes_delete on recipes.recipes
  for delete to authenticated
  using (core.is_owner(household_id));           -- Decision 3, defence in depth

create policy recipe_ingredients_select on recipes.recipe_ingredients
  for select to authenticated
  using (exists (
    select 1 from recipes.recipes r
     where r.id = recipe_id and core.is_member(r.household_id)
  ));

create policy recipe_steps_select on recipes.recipe_steps
  for select to authenticated
  using (exists (
    select 1 from recipes.recipes r
     where r.id = recipe_id and core.is_member(r.household_id)
  ));

-- Scoped on the denormalized household_id so it still resolves once recipe_id goes null
-- (Decision 2 — a hard-deleted recipe's audit rows survive as orphans).
create policy recipe_changes_select on recipes.recipe_changes
  for select to authenticated
  using (core.is_member(household_id));

create policy custom_units_select on recipes.custom_units
  for select to authenticated
  using (core.is_member(household_id));

revoke all on all tables    in schema recipes from anon, authenticated;
revoke all on all functions in schema recipes from anon, authenticated;
alter default privileges in schema recipes revoke all on tables    from anon, authenticated;
alter default privileges in schema recipes revoke all on functions from anon, authenticated;

grant usage on schema recipes to authenticated;
grant select on recipes.recipes, recipes.recipe_ingredients, recipes.recipe_steps,
                recipes.recipe_changes, recipes.custom_units to authenticated;
-- `recipes.recipes`/`recipe_ingredients`/`recipe_steps`/`custom_units` get select-only above;
-- `delete` on `recipes.recipes` is granted separately since it's guarded by its own RLS policy
-- and is a real, if defence-in-depth, direct-DELETE path (`hard_delete_recipe` itself runs as
-- the function owner and does not need this grant).
grant delete on recipes.recipes to authenticated;

grant execute on function recipes.create_recipe(uuid, text, text, int, text, jsonb, jsonb, text) to authenticated;
grant execute on function recipes.update_recipe(uuid, text, text, int, text, jsonb, jsonb, text) to authenticated;
grant execute on function recipes.soft_delete_recipe(uuid, text) to authenticated;
grant execute on function recipes.hard_delete_recipe(uuid, text) to authenticated;
-- recipes.is_builtin_unit: no EXECUTE grant — internal helper called only by the seam functions
-- above (definer functions), never invoked directly by client code.
