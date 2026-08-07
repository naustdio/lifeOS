-- Adds a handful of common categories the default taxonomy was missing (Suscripciones under
-- Casa, Seguros under Transporte, and two new top-level expense categories: Familia, Mascotas).
-- ADDITIVE ONLY — no existing template row's `name`/`parent_key` is changed, because
-- `finance.ensure_default_categories()` never updates a household's already-copied category row
-- (it only inserts missing `template_key`s), so renaming or re-parenting an existing template
-- would silently diverge old households from new ones. New template rows, by contrast, DO
-- retroactively reach existing households: `app.bootstrap_user()` calls
-- `ensure_default_categories()` on every login, and its `ON CONFLICT (household_id,
-- template_key) DO NOTHING` insert only ever adds rows for template_keys a household doesn't
-- have yet.

insert into finance.category_templates (key, parent_key, name, kind, sort_order, icon, color) values
  ('expense.home.subscriptions', 'expense.home',      'Suscripciones', 'expense', 4, 'smartphone', 'violet'),
  ('expense.transport.insurance','expense.transport',  'Seguros',       'expense', 4, 'landmark',   'blue'),
  ('expense.family',             null,                 'Familia',       'expense', 11, 'baby',      'pink'),
  ('expense.pets',                null,                 'Mascotas',      'expense', 12, 'paw-print', 'amber')
on conflict (key) do nothing;
