-- `recipes` write seam — design.md Decision 1. Direct DML on `recipes.recipes` is revoked from
-- `authenticated` (grants set in the next migration); these `security definer` functions are the
-- ONLY write path, so "a reason is mandatory" is true at the transaction boundary, not merely a
-- UI validation. Mirrors `finance.record_transaction`'s shape (20260804090008_finance_api.sql).
--
-- Ingredients/steps arrive as `jsonb` PARAMETERS (still stored relationally in child tables — the
-- zero-jsonb rule is about columns, not RPC argument shapes).

-- Decision 4: the built-in unit list, duplicated here (matches `domain/unit.ts`'s RECIPE_UNITS)
-- so the seam only persists a genuinely custom unit into recipes.custom_units, not every
-- built-in one on every save.
create or replace function recipes.is_builtin_unit(p_unit text)
returns boolean language sql immutable set search_path = '' as $$
  select p_unit = any(array[
    'g','kg','ml','l','taza','cucharada','cucharadita','pieza','pizca',
    'oz','lb','diente','manojo','al gusto'
  ]);
$$;

create or replace function recipes.create_recipe(
  p_household_id uuid,
  p_title        text,
  p_category     text,
  p_portions     int,
  p_video_url    text,
  p_ingredients  jsonb,
  p_steps        jsonb,
  p_reason       text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_recipe_id uuid;
  v_item jsonb;
begin
  perform core.assert_member(p_household_id);

  insert into recipes.recipes (household_id, owner_user_id, title, category, portions, video_url)
  values (p_household_id, (select auth.uid()), p_title, p_category, coalesce(p_portions, 1), p_video_url)
  returning id into v_recipe_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    insert into recipes.recipe_ingredients (recipe_id, position, name, quantity, unit)
    values (v_recipe_id, (v_item->>'position')::int, v_item->>'name',
            nullif(v_item->>'quantity', '')::numeric, v_item->>'unit');

    if (v_item->>'unit') is not null and not recipes.is_builtin_unit(v_item->>'unit') then
      insert into recipes.custom_units (household_id, unit_name)
      values (p_household_id, v_item->>'unit')
      on conflict do nothing;
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
  p_reason      text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_household_id uuid;
  v_item jsonb;
begin
  select household_id into v_household_id from recipes.recipes where id = p_recipe_id and not is_deleted;
  if v_household_id is null then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  perform core.assert_member(v_household_id);

  update recipes.recipes
     set title = p_title, category = p_category, portions = coalesce(p_portions, 1), video_url = p_video_url
   where id = p_recipe_id;

  delete from recipes.recipe_ingredients where recipe_id = p_recipe_id;
  delete from recipes.recipe_steps where recipe_id = p_recipe_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    insert into recipes.recipe_ingredients (recipe_id, position, name, quantity, unit)
    values (p_recipe_id, (v_item->>'position')::int, v_item->>'name',
            nullif(v_item->>'quantity', '')::numeric, v_item->>'unit');

    if (v_item->>'unit') is not null and not recipes.is_builtin_unit(v_item->>'unit') then
      insert into recipes.custom_units (household_id, unit_name)
      values (v_household_id, v_item->>'unit')
      on conflict do nothing;
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

create or replace function recipes.soft_delete_recipe(p_recipe_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_household_id uuid;
  v_title text;
begin
  select household_id, title into v_household_id, v_title
    from recipes.recipes where id = p_recipe_id and not is_deleted;
  if v_household_id is null then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  perform core.assert_member(v_household_id);

  update recipes.recipes set is_deleted = true where id = p_recipe_id;

  insert into recipes.recipe_changes (household_id, recipe_id, recipe_title, actor_user_id, action, reason)
  values (v_household_id, p_recipe_id, v_title, (select auth.uid()), 'soft_deleted', p_reason);
end;
$$;

-- Decision 2 + Decision 3: owner-only, and the recipe's own audit trail survives the delete as a
-- title-stamped orphan (recipe_id null) — content is destroyed, accountability is not.
create or replace function recipes.hard_delete_recipe(p_recipe_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_household_id uuid;
  v_title text;
begin
  select household_id, title into v_household_id, v_title
    from recipes.recipes where id = p_recipe_id;
  if v_household_id is null then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  perform core.assert_member(v_household_id);

  if not core.is_owner(v_household_id) then
    raise exception 'only the household owner may permanently delete a recipe' using errcode = '42501';
  end if;

  delete from recipes.recipes where id = p_recipe_id;

  insert into recipes.recipe_changes (household_id, recipe_id, recipe_title, actor_user_id, action, reason)
  values (v_household_id, null, v_title, (select auth.uid()), 'hard_deleted', p_reason);
end;
$$;
