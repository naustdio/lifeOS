-- Recipe-level photo + prep duration — recipes-module fast-follow (UI-polish round, photo-card
-- redesign). `prep_minutes` is a plain column set by the write seam like every other core field;
-- `photo_path` is set OUTSIDE the seam via a small dedicated function, same reasoning as
-- `recipes.ingredient_catalog`'s direct writes — attaching a photo carries no mandatory-reason
-- audit requirement, and the recipe doesn't exist yet at the moment `create_recipe` returns (the
-- client uploads the file only after it has a real `recipe_id` to point at, mirroring
-- `nutrition_visit_photos`' "upload after the fact" shape).

alter table recipes.recipes
  add column prep_minutes int check (prep_minutes is null or prep_minutes between 1 and 1440),
  add column photo_path text;

-- `create or replace function` does NOT replace a function when the parameter list changes shape
-- (even by only appending a defaulted trailing param) — it silently creates a SECOND overload,
-- leaving the old 8-arg signature callable and blind to `prep_minutes`. Drop it explicitly first
-- so only the new 9-arg signature exists.
drop function if exists recipes.create_recipe(uuid, text, text, int, text, jsonb, jsonb, text);
drop function if exists recipes.update_recipe(uuid, text, text, int, text, jsonb, jsonb, text);

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
begin
  perform core.assert_member(p_household_id);

  insert into recipes.recipes (household_id, owner_user_id, title, category, portions, video_url, prep_minutes)
  values (p_household_id, (select auth.uid()), p_title, p_category, coalesce(p_portions, 1), p_video_url, p_prep_minutes)
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
    insert into recipes.recipe_ingredients (recipe_id, position, name, quantity, unit)
    values (p_recipe_id, (v_item->>'position')::int, v_item->>'name',
            nullif(v_item->>'quantity', '')::numeric, v_item->>'unit');

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

-- Sets/clears a recipe's photo pointer — owner-of-the-write-seam-aside, any household member may
-- attach a photo (matches `recipes.ingredient_catalog`'s direct-write reasoning: no mandatory-
-- reason audit trail needed for a photo, unlike an actual recipe edit).
create or replace function recipes.set_recipe_photo(p_recipe_id uuid, p_photo_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id from recipes.recipes where id = p_recipe_id and not is_deleted;
  if v_household_id is null then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  perform core.assert_member(v_household_id);

  update recipes.recipes set photo_path = p_photo_path where id = p_recipe_id;
end;
$$;

grant execute on function recipes.create_recipe(uuid, text, text, int, text, jsonb, jsonb, text, int) to authenticated;
grant execute on function recipes.update_recipe(uuid, text, text, int, text, jsonb, jsonb, text, int) to authenticated;
grant execute on function recipes.set_recipe_photo(uuid, text) to authenticated;

-- First Storage bucket for recipe-level (not ingredient-level) photos — private, path convention
-- `{household_id}/{uuid}.{ext}`, same shape as `recipes-ingredient-photos`.
insert into storage.buckets (id, name, public)
values ('recipes-photos', 'recipes-photos', false)
on conflict (id) do nothing;

create policy recipes_photos_object_select on storage.objects
  for select to authenticated
  using (bucket_id = 'recipes-photos'
         and core.is_member((storage.foldername(name))[1]::uuid));

create policy recipes_photos_object_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipes-photos'
              and core.is_member((storage.foldername(name))[1]::uuid));

create policy recipes_photos_object_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipes-photos'
         and core.is_member((storage.foldername(name))[1]::uuid));
