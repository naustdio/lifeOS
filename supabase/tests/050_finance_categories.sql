-- pgTAP — category depth/kind trigger + per-space seed isolation
-- (design.md §3.4, §3.5, tasks.md T-022/T-035 subset explicitly in this run's scope)

begin;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000006a', 'cat-a@example.com', '{"full_name":"Cat A"}'),
  ('00000000-0000-0000-0000-00000000006b', 'cat-b@example.com', '{"full_name":"Cat B"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000000006aa', 'personal', '00000000-0000-0000-0000-00000000006a', '00000000-0000-0000-0000-00000000006a'),
  ('00000000-0000-0000-0000-0000000006bb', 'personal', '00000000-0000-0000-0000-00000000006b', '00000000-0000-0000-0000-00000000006b')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000006aa', '00000000-0000-0000-0000-00000000006a', 'owner'),
  ('00000000-0000-0000-0000-0000000006bb', '00000000-0000-0000-0000-00000000006b', 'owner')
on conflict do nothing;

-- finance.ensure_default_categories is deliberately NOT granted to authenticated (design.md
-- §5.5/§6.1) — reachable only through app.bootstrap_user(). Exercise it the same way the real
-- sign-in flow does. ensure_personal_space() is idempotent and resolves the already-seeded
-- household via personal_owner_user_id, so this only tops up categories.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000006a","role":"authenticated"}';
select lives_ok(
  $$ select app.bootstrap_user() $$,
  'app.bootstrap_user() seeds space A''s categories without error'
);

reset role; reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000006b","role":"authenticated"}';
select lives_ok(
  $$ select app.bootstrap_user() $$,
  'app.bootstrap_user() seeds space B''s categories without error'
);
reset role; reset request.jwt.claims;

select is(
  (select count(*) from finance.categories where household_id = '00000000-0000-0000-0000-0000000006aa' and template_key = 'expense.home'),
  1::bigint, 'space A has exactly one "Casa" category from the template'
);

-- rename in space A does not affect space B's copy
update finance.categories set name = 'Renombrada' where household_id = '00000000-0000-0000-0000-0000000006aa' and template_key = 'expense.home';

select is(
  (select name from finance.categories where household_id = '00000000-0000-0000-0000-0000000006aa' and template_key = 'expense.home'),
  'Renombrada', 'renaming a default in space A changes only space A''s row'
);
select is(
  (select name from finance.categories where household_id = '00000000-0000-0000-0000-0000000006bb' and template_key = 'expense.home'),
  'Casa', 'space B''s copy is unaffected by space A''s rename'
);

-- re-running the bootstrap (as on every sign-in) never overwrites the rename (idempotent
-- top-up, not upsert)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000006a","role":"authenticated"}';
select lives_ok(
  $$ select app.bootstrap_user() $$,
  're-running app.bootstrap_user() is idempotent'
);
reset role; reset request.jwt.claims;
select is(
  (select name from finance.categories where household_id = '00000000-0000-0000-0000-0000000006aa' and template_key = 'expense.home'),
  'Renombrada', 're-running ensure_default_categories does not overwrite the rename'
);

-- one-level nesting trigger: a child of a child is rejected
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000006a","role":"authenticated"}';

select throws_ok(
  $$ insert into finance.categories (household_id, parent_id, name, kind)
     values ('00000000-0000-0000-0000-0000000006aa',
             (select id from finance.categories where household_id = '00000000-0000-0000-0000-0000000006aa' and template_key = 'expense.home.rent'),
             'Nieto', 'expense') $$,
  '22023', null, 'a category may not be nested more than one level deep'
);

-- ---------------------------------------------------------------------------
-- Sibling-name-collision (tasks.md T-035, categories_unique_name index): creating or renaming
-- a top-level category to the same name (case/whitespace-insensitive) as an existing sibling in
-- the same space is rejected with 23505 -> facade maps to CATEGORY_NAME_TAKEN, not silently
-- allowed and not silently ignored.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into finance.categories (household_id, name, kind)
     values ('00000000-0000-0000-0000-0000000006aa', '  renombrada  ', 'expense') $$,
  '23505', null,
  'creating a top-level category whose name collides (case/whitespace-insensitive) with an existing sibling is rejected with 23505'
);

do $$
declare v_other uuid;
begin
  insert into finance.categories (household_id, name, kind)
  values ('00000000-0000-0000-0000-0000000006aa', 'Otra Categoria', 'expense')
  returning id into v_other;
  perform set_config('lifeos.test.other_cat', v_other::text, false);
end $$;

select throws_ok(
  $$ update finance.categories set name = 'Renombrada'
     where id = current_setting('lifeos.test.other_cat')::uuid $$,
  '23505', null,
  'renaming a category to collide with an existing sibling name is rejected with 23505'
);

select * from finish();
rollback;
