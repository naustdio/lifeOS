-- Per-user favorites — UI-polish fast-follow. Favoriting is a personal preference, not shared
-- household data (unlike everything else in this module), so it's a plain join table keyed by
-- `(user_id, recipe_id)` rather than a column on `recipes.recipes`. No write-seam function: same
-- direct-write-under-RLS reasoning as `recipes.ingredient_catalog` — no mandatory-reason audit
-- trail makes sense for "I starred this," and household membership is still enforced via the
-- INSERT policy's EXISTS check against the recipe's own household.

create table recipes.recipe_favorites (
  user_id uuid not null,
  recipe_id uuid not null references recipes.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

alter table recipes.recipe_favorites enable row level security;

-- A favorite is only ever visible to the user who set it — not a household-shared read, unlike
-- every other table in this module.
create policy recipe_favorites_select on recipes.recipe_favorites
  for select to authenticated using (user_id = (select auth.uid()));

create policy recipe_favorites_insert on recipes.recipe_favorites
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from recipes.recipes r
       where r.id = recipe_id and core.is_member(r.household_id) and not r.is_deleted
    )
  );

create policy recipe_favorites_delete on recipes.recipe_favorites
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on recipes.recipe_favorites from anon, authenticated;
grant select, insert, delete on recipes.recipe_favorites to authenticated;
