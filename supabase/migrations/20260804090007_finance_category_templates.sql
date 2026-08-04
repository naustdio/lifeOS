-- Canonical Spanish default taxonomy (catalog) + the idempotent per-space copy function.
-- Per design.md §3.5. Fixed `key` values + ON CONFLICT DO NOTHING make this migration
-- idempotent — this is a migration, not supabase/seed.sql, so it reaches deployed projects.
-- Sub-slice 2A.

insert into finance.category_templates (key, parent_key, name, kind, sort_order) values
  ('income.salary',        null, 'Salario',                'income',  1),
  ('income.freelance',     null, 'Trabajo independiente',  'income',  2),
  ('income.investments',   null, 'Inversiones',             'income',  3),
  ('income.gifts',         null, 'Regalos',                 'income',  4),
  ('income.other',         null, 'Otros ingresos',          'income',  5),
  ('expense.food',         null, 'Comida',                  'expense', 1),
  ('expense.transport',    null, 'Transporte',               'expense', 2),
  ('expense.home',         null, 'Casa',                     'expense', 3),
  ('expense.health',       null, 'Salud',                    'expense', 4),
  ('expense.entertainment',null, 'Entretenimiento',          'expense', 5),
  ('expense.education',    null, 'Educación',                'expense', 6),
  ('expense.clothing',     null, 'Ropa',                     'expense', 7),
  ('expense.personal',     null, 'Cuidado personal',         'expense', 8),
  ('expense.debt',         null, 'Pagos de deuda',           'expense', 9),
  ('expense.other',        null, 'Otros gastos',             'expense', 10)
on conflict (key) do nothing;

insert into finance.category_templates (key, parent_key, name, kind, sort_order) values
  ('expense.food.groceries',    'expense.food',      'Supermercado',          'expense', 1),
  ('expense.food.restaurants',  'expense.food',      'Restaurantes',          'expense', 2),
  ('expense.transport.fuel',    'expense.transport', 'Gasolina',              'expense', 1),
  ('expense.transport.public',  'expense.transport', 'Transporte público',    'expense', 2),
  ('expense.transport.maint',   'expense.transport', 'Mantenimiento',         'expense', 3),
  ('expense.home.rent',         'expense.home',      'Renta',                 'expense', 1),
  ('expense.home.utilities',    'expense.home',      'Servicios',             'expense', 2),
  ('expense.home.internet',     'expense.home',      'Internet',              'expense', 3)
on conflict (key) do nothing;

create or replace function finance.ensure_default_categories(p_household_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform core.assert_member(p_household_id);

  -- pass 1: top-level templates
  insert into finance.categories (household_id, template_key, parent_id, name, kind, icon, sort_order)
  select p_household_id, t.key, null, t.name, t.kind, t.icon, t.sort_order
    from finance.category_templates t
   where t.parent_key is null
  on conflict (household_id, template_key) where template_key is not null do nothing;

  -- pass 2: children, resolving the parent through the rows just ensured
  insert into finance.categories (household_id, template_key, parent_id, name, kind, icon, sort_order)
  select p_household_id, t.key, c.id, t.name, t.kind, t.icon, t.sort_order
    from finance.category_templates t
    join finance.categories c
      on c.household_id = p_household_id and c.template_key = t.parent_key
   where t.parent_key is not null
  on conflict (household_id, template_key) where template_key is not null do nothing;
end $$;

-- Deliberately NOT granted to authenticated: reachable only through app.bootstrap_user().
revoke all on function finance.ensure_default_categories(uuid) from public, anon, authenticated;
