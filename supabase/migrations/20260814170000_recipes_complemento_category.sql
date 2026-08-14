-- Adds "complemento" to `recipes.recipes.category` (salsas/aderezos/acompañamientos — recipes
-- meant to be used as an ingredient inside another recipe, not a full standalone dish). Motivated
-- by the sub-recipe-as-ingredient feature: forcing e.g. "Salsa de tomate" into "comida" was an
-- awkward fit, and this category doubles as the filter for the sub-recipe picker in the UI.

alter table recipes.recipes drop constraint recipes_category_check;
alter table recipes.recipes add constraint recipes_category_check
  check (category in ('desayuno','comida','cena','postre','snack','complemento'));

-- Defense in depth: the UI only offers "complemento" recipes in the sub-recipe picker, but the
-- seam re-validates it server-side too (same reasoning as the existing same-household check).
create or replace function recipes.create_recipe(
  p_household_id uuid,
  p_title        text,
  p_category     text,
  p_portions     int,
  p_video_url    text,
  p_ingredients  jsonb,
  p_steps        jsonb,
  p_reason       text,
  p_prep_minutes int default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_recipe_id uuid;
  v_item jsonb;
  v_sub_recipe_id uuid;
begin
  perform core.assert_member(p_household_id);

  insert into recipes.recipes (household_id, owner_user_id, title, category, portions, video_url, prep_minutes)
  values (p_household_id, (select auth.uid()), p_title, p_category, coalesce(p_portions, 1), p_video_url, p_prep_minutes)
  returning id into v_recipe_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    v_sub_recipe_id := nullif(v_item->>'subRecipeId', '')::uuid;

    if v_sub_recipe_id is not null and not exists (
      select 1 from recipes.recipes
       where id = v_sub_recipe_id and household_id = p_household_id and not is_deleted and category = 'complemento'
    ) then
      raise exception 'sub-recipe must be a "complemento" recipe in the same household' using errcode = '42501';
    end if;

    insert into recipes.recipe_ingredients (recipe_id, position, name, quantity, unit, sub_recipe_id)
    values (v_recipe_id, (v_item->>'position')::int, v_item->>'name',
            nullif(v_item->>'quantity', '')::numeric, v_item->>'unit', v_sub_recipe_id);

    if (v_item->>'unit') is not null and not recipes.is_builtin_unit(v_item->>'unit') then
      insert into recipes.custom_units (household_id, unit_name)
      values (p_household_id, v_item->>'unit')
      on conflict do nothing;
    end if;

    if btrim(coalesce(v_item->>'name', '')) <> '' then
      insert into recipes.ingredient_catalog (household_id, name)
      values (p_household_id, btrim(v_item->>'name'))
      on conflict (household_id, lower(name)) do nothing;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    insert into recipes.recipe_steps (recipe_id, position, instruction)
    values (v_recipe_id, (v_item->>'position')::int, v_item->>'instruction');
  end loop;

  insert into recipes.recipe_changes (household_id, recipe_id, recipe_title, actor_user_id, action, reason)
  values (p_household_id, v_recipe_id, p_title, (select auth.uid()), 'created', p_reason);

  return v_recipe_id;
end;
$$;

create or replace function recipes.update_recipe(
  p_recipe_id   uuid,
  p_title       text,
  p_category    text,
  p_portions    int,
  p_video_url   text,
  p_ingredients jsonb,
  p_steps       jsonb,
  p_reason      text,
  p_prep_minutes int default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_household_id uuid;
  v_item jsonb;
  v_sub_recipe_id uuid;
begin
  select household_id into v_household_id from recipes.recipes where id = p_recipe_id and not is_deleted;
  if v_household_id is null then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  perform core.assert_member(v_household_id);

  update recipes.recipes
     set title = p_title, category = p_category, portions = coalesce(p_portions, 1),
         video_url = p_video_url, prep_minutes = p_prep_minutes
   where id = p_recipe_id;

  delete from recipes.recipe_ingredients where recipe_id = p_recipe_id;
  delete from recipes.recipe_steps where recipe_id = p_recipe_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    v_sub_recipe_id := nullif(v_item->>'subRecipeId', '')::uuid;

    if v_sub_recipe_id is not null and not exists (
      select 1 from recipes.recipes
       where id = v_sub_recipe_id and household_id = v_household_id and not is_deleted and category = 'complemento'
    ) then
      raise exception 'sub-recipe must be a "complemento" recipe in the same household' using errcode = '42501';
    end if;

    insert into recipes.recipe_ingredients (recipe_id, position, name, quantity, unit, sub_recipe_id)
    values (p_recipe_id, (v_item->>'position')::int, v_item->>'name',
            nullif(v_item->>'quantity', '')::numeric, v_item->>'unit', v_sub_recipe_id);

    if (v_item->>'unit') is not null and not recipes.is_builtin_unit(v_item->>'unit') then
      insert into recipes.custom_units (household_id, unit_name)
      values (v_household_id, v_item->>'unit')
      on conflict do nothing;
    end if;

    if btrim(coalesce(v_item->>'name', '')) <> '' then
      insert into recipes.ingredient_catalog (household_id, name)
      values (v_household_id, btrim(v_item->>'name'))
      on conflict (household_id, lower(name)) do nothing;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    insert into recipes.recipe_steps (recipe_id, position, instruction)
    values (p_recipe_id, (v_item->>'position')::int, v_item->>'instruction');
  end loop;

  insert into recipes.recipe_changes (household_id, recipe_id, recipe_title, actor_user_id, action, reason)
  values (v_household_id, p_recipe_id, p_title, (select auth.uid()), 'edited', p_reason);

  return p_recipe_id;
end;
$$;
