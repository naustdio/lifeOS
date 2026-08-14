-- Ingredient catalog — recipes-module fast-follow (UI-polish round). A per-household, growing
-- list of previously-typed ingredient names, each optionally carrying a photo or a picked emoji
-- icon, offered as autocomplete suggestions on later recipes ("reuse everything gathered so
-- far" per the user's request). Deliberately NOT scoped through the write seam like
-- `recipes.recipes` — a catalog entry carries no mandatory-reason audit requirement, it is a
-- lightweight reference list, so household members may insert/update it directly under RLS,
-- matching `recipes.custom_units`'s existing shape but adding a direct write path for the
-- Server-Action-driven photo/icon attach flow (nutrition_visit_photos' pattern: upload happens
-- as its own atomic action, independent of the recipe's own save).

create table recipes.ingredient_catalog (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  photo_path text,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ingredient_catalog_household_lower_name_key
  on recipes.ingredient_catalog (household_id, lower(name));
create index on recipes.ingredient_catalog (household_id, name);
create trigger ingredient_catalog_touch_updated_at before update on recipes.ingredient_catalog
  for each row execute function core.touch_updated_at();

alter table recipes.ingredient_catalog enable row level security;

create policy ingredient_catalog_select on recipes.ingredient_catalog
  for select to authenticated using (core.is_member(household_id));

create policy ingredient_catalog_insert on recipes.ingredient_catalog
  for insert to authenticated with check (core.is_member(household_id));

-- Lets a member fill in a photo/icon for an entry the recipe seam already auto-created bare
-- (name only) — never lets them rename another household's entry, since the row must already be
-- visible to them (the USING clause) before an UPDATE is even considered.
create policy ingredient_catalog_update on recipes.ingredient_catalog
  for update to authenticated using (core.is_member(household_id)) with check (core.is_member(household_id));

revoke all on recipes.ingredient_catalog from anon, authenticated;
grant select, insert, update on recipes.ingredient_catalog to authenticated;

-- Extend both write-seam functions to auto-catalog every ingredient name used, bare (no
-- photo/icon) — mirrors the existing `is_builtin_unit` / `custom_units` upsert already in this
-- file's sibling migration, just for names instead of units. `on conflict ... do nothing`: the
-- seam never overwrites a photo/icon a member already attached.
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

-- First Storage bucket owned by the recipes module — private, path convention
-- `{household_id}/{uuid}.{ext}`, enforced by the object policies below (mirrors
-- `health-nutrition-photos`' shape from `20260811090037_health_nutrition_visits.sql`, but scoped
-- to household membership rather than a single owner, matching the rest of this module).
insert into storage.buckets (id, name, public)
values ('recipes-ingredient-photos', 'recipes-ingredient-photos', false)
on conflict (id) do nothing;

create policy recipes_ingredient_photos_object_select on storage.objects
  for select to authenticated
  using (bucket_id = 'recipes-ingredient-photos'
         and core.is_member((storage.foldername(name))[1]::uuid));

create policy recipes_ingredient_photos_object_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipes-ingredient-photos'
              and core.is_member((storage.foldername(name))[1]::uuid));

create policy recipes_ingredient_photos_object_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipes-ingredient-photos'
         and core.is_member((storage.foldername(name))[1]::uuid));
