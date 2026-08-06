-- Category icon + color: bounded key sets, curated backfill. Per design.md
-- "finance-categories-icon-color" §1/§2. No companion *_security.sql — no policy, grant, or
-- table is introduced; categories_insert/categories_update already cover these two columns.

-- ---------------------------------------------------------------------------
-- 1. Columns (nullable: styling is OPTIONAL on create, per product decision)
-- ---------------------------------------------------------------------------

alter table finance.category_templates add column color text;
alter table finance.categories         add column color text;

-- ---------------------------------------------------------------------------
-- 2. Bounded whitelists, mirroring the accounts.type / transactions.type CHECK style.
--    icon already exists on both tables and is universally NULL today, so retrofitting the
--    CHECK cannot fail on deploy.
-- ---------------------------------------------------------------------------

alter table finance.categories add constraint categories_icon_whitelist
  check (icon is null or icon in
    ('banknote','briefcase','trending-up','gift','coins',
     'utensils','car','house','heart-pulse','clapperboard','graduation-cap','shirt',
     'sparkles','landmark','tag','shopping-cart','chef-hat','fuel','bus','wrench',
     'key','zap','wifi','plane','dumbbell','baby','paw-print','smartphone',
     'book','gamepad-2','coffee','credit-card','circle-dashed'));

alter table finance.categories add constraint categories_color_whitelist
  check (color is null or color in
    ('neutral','red','orange','amber','green','teal','blue','violet','pink'));

alter table finance.category_templates add constraint category_templates_icon_whitelist
  check (icon is null or icon in
    ('banknote','briefcase','trending-up','gift','coins',
     'utensils','car','house','heart-pulse','clapperboard','graduation-cap','shirt',
     'sparkles','landmark','tag','shopping-cart','chef-hat','fuel','bus','wrench',
     'key','zap','wifi','plane','dumbbell','baby','paw-print','smartphone',
     'book','gamepad-2','coffee','credit-card','circle-dashed'));

alter table finance.category_templates add constraint category_templates_color_whitelist
  check (color is null or color in
    ('neutral','red','orange','amber','green','teal','blue','violet','pink'));

-- ---------------------------------------------------------------------------
-- 3. Backfill — three passes, in this order. No row may remain unstyled (design.md §2's
--    23-row table + the deterministic fallback below).
-- ---------------------------------------------------------------------------

-- Pass 1 — curated template styling (23 rows), intentional and meaning-matched.
update finance.category_templates set icon = 'banknote',       color = 'green'   where key = 'income.salary';
update finance.category_templates set icon = 'briefcase',      color = 'teal'    where key = 'income.freelance';
update finance.category_templates set icon = 'trending-up',    color = 'green'   where key = 'income.investments';
update finance.category_templates set icon = 'gift',           color = 'pink'    where key = 'income.gifts';
update finance.category_templates set icon = 'coins',          color = 'neutral' where key = 'income.other';
update finance.category_templates set icon = 'utensils',       color = 'orange'  where key = 'expense.food';
update finance.category_templates set icon = 'car',            color = 'blue'    where key = 'expense.transport';
update finance.category_templates set icon = 'house',          color = 'amber'   where key = 'expense.home';
update finance.category_templates set icon = 'heart-pulse',    color = 'red'     where key = 'expense.health';
update finance.category_templates set icon = 'clapperboard',   color = 'violet'  where key = 'expense.entertainment';
update finance.category_templates set icon = 'graduation-cap', color = 'teal'    where key = 'expense.education';
update finance.category_templates set icon = 'sparkles',       color = 'violet'  where key = 'expense.personal';
update finance.category_templates set icon = 'landmark',       color = 'red'     where key = 'expense.debt';
update finance.category_templates set icon = 'tag',            color = 'neutral' where key = 'expense.other';
update finance.category_templates set icon = 'shopping-cart',  color = 'orange'  where key = 'expense.food.groceries';
update finance.category_templates set icon = 'chef-hat',       color = 'orange'  where key = 'expense.food.restaurants';
update finance.category_templates set icon = 'fuel',           color = 'blue'    where key = 'expense.transport.fuel';
update finance.category_templates set icon = 'bus',            color = 'blue'    where key = 'expense.transport.public';
update finance.category_templates set icon = 'wrench',         color = 'blue'    where key = 'expense.transport.maint';
update finance.category_templates set icon = 'key',            color = 'amber'   where key = 'expense.home.rent';
update finance.category_templates set icon = 'zap',            color = 'amber'   where key = 'expense.home.utilities';
update finance.category_templates set icon = 'wifi',           color = 'amber'   where key = 'expense.home.internet';
update finance.category_templates set icon = 'shirt',          color = 'pink'    where key = 'expense.clothing';

-- Pass 2 — categories seeded from a template inherit the curated pair. Runs after pass 1.
update finance.categories c
   set icon  = t.icon,
       color = t.color
  from finance.category_templates t
 where c.template_key = t.key
   and (c.icon is distinct from t.icon or c.color is distinct from t.color);

-- Pass 3 — pre-existing custom categories (template_key is null): deterministic fallback.
-- Icon is generic-by-kind (a wrong icon reads as a bug, a neutral one does not); color is
-- md5(id)-derived (not hashtext() — hashtext is not version-stable across major Postgres
-- versions, so a replay could recolor rows; md5 makes the assignment reproducible).
update finance.categories c set
  icon  = coalesce(c.icon, case when c.kind = 'income' then 'trending-up' else 'tag' end),
  color = coalesce(c.color, (array['neutral','red','orange','amber','green','teal','blue','violet','pink'])
                            [ (('x' || substr(md5(c.id::text), 1, 8))::bit(32)::int & 2147483647) % 9 + 1 ])
where c.template_key is null;

-- ---------------------------------------------------------------------------
-- 4. finance.ensure_default_categories() — create or replace to also copy `color`. Without
--    this, every household onboarded after this migration gets curated icons but NULL colors,
--    silently diverging from the templates (the named regression this guards against).
-- ---------------------------------------------------------------------------

create or replace function finance.ensure_default_categories(p_household_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform core.assert_member(p_household_id);

  -- pass 1: top-level templates
  insert into finance.categories (household_id, template_key, parent_id, name, kind, icon, color, sort_order)
  select p_household_id, t.key, null, t.name, t.kind, t.icon, t.color, t.sort_order
    from finance.category_templates t
   where t.parent_key is null
  on conflict (household_id, template_key) where template_key is not null do nothing;

  -- pass 2: children, resolving the parent through the rows just ensured
  insert into finance.categories (household_id, template_key, parent_id, name, kind, icon, color, sort_order)
  select p_household_id, t.key, c.id, t.name, t.kind, t.icon, t.color, t.sort_order
    from finance.category_templates t
    join finance.categories c
      on c.household_id = p_household_id and c.template_key = t.parent_key
   where t.parent_key is not null
  on conflict (household_id, template_key) where template_key is not null do nothing;
end $$;

-- Deliberately NOT granted to authenticated (unchanged): reachable only through
-- app.bootstrap_user(). create or replace does not reset grants, but restate for clarity.
revoke all on function finance.ensure_default_categories(uuid) from public, anon, authenticated;
