-- pgTAP — health-tracking Phase 1 (design.md Decision 4, tasks.md 1.1/1.5).
--
-- RED pass (this file's initial form, tasks.md 1.1): asserts the FIXED behavior for the actual
-- privacy bug being closed — `finance.recurring_transactions_select/update/delete` had no
-- `can_read_account` gate, so a private-account recurring definition leaked to every household
-- member, including through `finance.recurring_due`. Run against the PRE-migration schema, this
-- is expected to FAIL on the "does NOT see" assertions below — that failure is the RED evidence.
-- Also covers `origin_module` still-rejects-unknown (pre-migration) and health.* CHECK/RLS cases
-- (post-migration only, added in the GREEN pass per tasks.md 1.5).

begin;
select plan(22);

-- ---------------------------------------------------------------------------
-- Fixtures — hex-only UUIDs. Household A has owner A and second member C (the non-owning
-- household member used to prove the private-account recurring definition does NOT leak).
-- Household B / member B used for cross-household isolation.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000120a1', 'health-a@example.com', '{"full_name":"Health A"}'),
  ('00000000-0000-0000-0000-0000000120b1', 'health-b@example.com', '{"full_name":"Health B"}'),
  ('00000000-0000-0000-0000-0000000120c1', 'health-c@example.com', '{"full_name":"Health C"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values
  ('00000000-0000-0000-0000-0000000120aa', 'personal', '00000000-0000-0000-0000-0000000120a1', '00000000-0000-0000-0000-0000000120a1'),
  ('00000000-0000-0000-0000-0000000120bb', 'personal', '00000000-0000-0000-0000-0000000120b1', '00000000-0000-0000-0000-0000000120b1')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000120aa', '00000000-0000-0000-0000-0000000120a1', 'owner'),
  ('00000000-0000-0000-0000-0000000120aa', '00000000-0000-0000-0000-0000000120c1', 'member'),
  ('00000000-0000-0000-0000-0000000120bb', '00000000-0000-0000-0000-0000000120b1', 'owner')
on conflict do nothing;

insert into finance.accounts (id, household_id, name, type, visibility, owner_user_id, opening_balance_cents)
values
  ('00000000-0000-0000-0000-0000000120e1', '00000000-0000-0000-0000-0000000120aa', 'Privada A', 'cash', 'private', '00000000-0000-0000-0000-0000000120a1', 0),
  ('00000000-0000-0000-0000-0000000120e2', '00000000-0000-0000-0000-0000000120aa', 'Efectivo A', 'cash', 'household', '00000000-0000-0000-0000-0000000120a1', 0)
on conflict (id) do nothing;

insert into finance.categories (id, household_id, name, kind)
values ('00000000-0000-0000-0000-0000000120f1', '00000000-0000-0000-0000-0000000120aa', 'Salud A', 'expense')
on conflict (id) do nothing;

-- The recurring definition under test: funded from A's PRIVATE account. `next_due_date` is
-- today so it also shows up in `finance.recurring_due`.
insert into finance.recurring_transactions
  (id, household_id, account_id, category_id, amount_cents, description, frequency, next_due_date)
values
  ('00000000-0000-0000-0000-0000000120d1', '00000000-0000-0000-0000-0000000120aa',
   '00000000-0000-0000-0000-0000000120e1', '00000000-0000-0000-0000-0000000120f1',
   50000, 'Medicamento cronico A', 'monthly', current_date)
on conflict (id) do nothing;

-- Regression fixture: a HOUSEHOLD-visibility recurring definition (fix must not over-restrict).
insert into finance.recurring_transactions
  (id, household_id, account_id, category_id, amount_cents, description, frequency, next_due_date)
values
  ('00000000-0000-0000-0000-0000000120d2', '00000000-0000-0000-0000-0000000120aa',
   '00000000-0000-0000-0000-0000000120e2', '00000000-0000-0000-0000-0000000120f1',
   30000, 'Suscripcion compartida', 'monthly', current_date)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Section A1 — the privacy fix (member C = non-owning household member).
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000120c1","role":"authenticated"}';

select is(
  (select count(*) from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000120d1'),
  0::bigint,
  'member C (non-owner) does NOT see A''s private-account recurring definition (SELECT)'
);

select is(
  (select count(*) from finance.recurring_due where recurring_id = '00000000-0000-0000-0000-0000000120d1'),
  0::bigint,
  'member C does NOT see A''s private-account definition in recurring_due'
);

select is(
  (select count(*) from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000120d2'),
  1::bigint,
  'member C DOES see a household-visibility recurring definition (no over-restriction)'
);

update finance.recurring_transactions set description = 'rogue edit'
 where id = '00000000-0000-0000-0000-0000000120d1';

delete from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000120d1';

select is(
  (select count(*) from finance.account_balances where account_id = '00000000-0000-0000-0000-0000000120e1'),
  0::bigint,
  'member C does NOT see A''s private account in account_balances'
);

reset role;
reset request.jwt.claims;

select is(
  (select description from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000120d1'),
  'Medicamento cronico A',
  'member C''s UPDATE on the private-account recurring definition affected zero rows'
);

select is(
  (select count(*) from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000120d1'),
  1::bigint,
  'member C''s DELETE on the private-account recurring definition affected zero rows (still exists)'
);

-- Owner A regression: must still see/manage her own private-account definition.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000120a1","role":"authenticated"}';

select is(
  (select count(*) from finance.recurring_transactions where id = '00000000-0000-0000-0000-0000000120d1'),
  1::bigint,
  'owner A still sees her own private-account recurring definition'
);

select is(
  (select count(*) from finance.recurring_due where recurring_id = '00000000-0000-0000-0000-0000000120d1'),
  1::bigint,
  'owner A still sees her own private-account definition in recurring_due'
);

reset role;
reset request.jwt.claims;

-- Cross-household isolation regression.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000120b1","role":"authenticated"}';

select is(
  (select count(*) from finance.recurring_transactions where household_id = '00000000-0000-0000-0000-0000000120aa'),
  0::bigint,
  'member B (unrelated household) sees zero of household A''s recurring definitions'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Section A2 — origin_module: unknown values still rejected; 'health' accepted once widened.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into finance.transactions
       (household_id, account_id, category_id, type, amount_cents, occurred_on,
        created_by_user_id, origin_module, origin_entity_id, idempotency_key)
     values
       ('00000000-0000-0000-0000-0000000120aa', '00000000-0000-0000-0000-0000000120e2',
        '00000000-0000-0000-0000-0000000120f1', 'expense', -100, current_date,
        '00000000-0000-0000-0000-0000000120a1', 'nonexistent_module',
        '00000000-0000-0000-0000-0000000120f9', 'idem-nonexistent-1') $$,
  '23514', null,
  'an unrecognized origin_module value is still rejected by the CHECK constraint'
);

select lives_ok(
  $$ insert into finance.transactions
       (household_id, account_id, category_id, type, amount_cents, occurred_on,
        created_by_user_id, origin_module, origin_entity_id, idempotency_key)
     values
       ('00000000-0000-0000-0000-0000000120aa', '00000000-0000-0000-0000-0000000120e2',
        '00000000-0000-0000-0000-0000000120f1', 'expense', -1000, current_date,
        '00000000-0000-0000-0000-0000000120a1', 'health',
        '00000000-0000-0000-0000-0000000120f8', 'idem-health-origin-1') $$,
  'origin_module = ''health'' is accepted by the widened CHECK constraint'
);

-- ---------------------------------------------------------------------------
-- Section B — health schema RLS + CHECK constraints (added in the GREEN pass, tasks.md 1.5).
-- Requires migrations 20260804090033 (schema/tables) and 20260804090034 (RLS).
-- ---------------------------------------------------------------------------

insert into health.events (id, household_id, owner_user_id, event_type, title, occurred_on, visibility)
values ('00000000-0000-0000-0000-000000120001', '00000000-0000-0000-0000-0000000120aa',
        '00000000-0000-0000-0000-0000000120a1', 'consultation', 'Chequeo anual', current_date, 'household')
on conflict (id) do nothing;

insert into health.events (id, household_id, owner_user_id, event_type, title, occurred_on, visibility)
values ('00000000-0000-0000-0000-000000120002', '00000000-0000-0000-0000-0000000120aa',
        '00000000-0000-0000-0000-0000000120a1', 'medication', 'Tratamiento privado', current_date, 'private')
on conflict (id) do nothing;

insert into health.vital_readings (id, household_id, owner_user_id, metric, value_numeric, visibility)
values ('00000000-0000-0000-0000-000000120003', '00000000-0000-0000-0000-0000000120aa',
        '00000000-0000-0000-0000-0000000120a1', 'weight_kg', 70.5, 'private')
on conflict (id) do nothing;

insert into health.profile_facts (id, household_id, owner_user_id, fact_type, label, visibility)
values ('00000000-0000-0000-0000-000000120004', '00000000-0000-0000-0000-0000000120aa',
        '00000000-0000-0000-0000-0000000120a1', 'allergy', 'Penicilina', 'private')
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000120c1","role":"authenticated"}';

select is((select count(*) from health.events where id = '00000000-0000-0000-0000-000000120001'), 1::bigint,
  'member C (household visibility) sees A''s household-visible event');

select is((select count(*) from health.events where id = '00000000-0000-0000-0000-000000120002'), 0::bigint,
  'member C does NOT see A''s private health event');

select is((select count(*) from health.vital_readings where id = '00000000-0000-0000-0000-000000120003'), 0::bigint,
  'member C does NOT see A''s private vital reading');

select is((select count(*) from health.profile_facts where id = '00000000-0000-0000-0000-000000120004'), 0::bigint,
  'member C does NOT see A''s private profile fact');

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000120a1","role":"authenticated"}';

select is((select count(*) from health.events where id = '00000000-0000-0000-0000-000000120002'), 1::bigint,
  'owner A still sees her own private health event');

reset role;
reset request.jwt.claims;

-- CHECK constraints on health.events.
select throws_ok(
  $$ insert into health.events (household_id, owner_user_id, event_type, title, occurred_on)
     values ('00000000-0000-0000-0000-0000000120aa', '00000000-0000-0000-0000-0000000120a1',
              'not_a_type', 'x', current_date) $$,
  '23514', null, 'an unrecognized event_type is rejected by the CHECK constraint'
);

select throws_ok(
  $$ insert into health.events (household_id, owner_user_id, event_type, title, occurred_on, amount_cents)
     values ('00000000-0000-0000-0000-0000000120aa', '00000000-0000-0000-0000-0000000120a1',
              'consultation', 'x', current_date, 1000) $$,
  '23514', null, 'amount_cents without account_id/category_id violates the cost all-or-none CHECK'
);

select throws_ok(
  $$ insert into health.events (household_id, owner_user_id, event_type, title, occurred_on, result_summary)
     values ('00000000-0000-0000-0000-0000000120aa', '00000000-0000-0000-0000-0000000120a1',
              'consultation', 'x', current_date, 'not allowed here') $$,
  '23514', null, 'result_summary on a non-study event_type violates the CHECK constraint'
);

select throws_ok(
  $$ insert into health.events (household_id, owner_user_id, event_type, title, occurred_on, dosage)
     values ('00000000-0000-0000-0000-0000000120aa', '00000000-0000-0000-0000-0000000120a1',
              'study', 'x', current_date, '10mg') $$,
  '23514', null, 'dosage on event_type=study violates the CHECK constraint'
);

select throws_ok(
  $$ insert into health.events
       (household_id, owner_user_id, event_type, title, occurred_on, amount_cents, account_id, category_id, visibility)
     values
       ('00000000-0000-0000-0000-0000000120aa', '00000000-0000-0000-0000-0000000120a1',
        'consultation', 'private funding must be private account', current_date, 1000,
        '00000000-0000-0000-0000-0000000120e2', '00000000-0000-0000-0000-0000000120f1', 'private') $$,
  'P0001', null,
  'a private-visibility event funded from a household account is rejected by enforce_private_event_account()'
);

select lives_ok(
  $$ insert into health.events
       (household_id, owner_user_id, event_type, title, occurred_on, amount_cents, account_id, category_id, visibility)
     values
       ('00000000-0000-0000-0000-0000000120aa', '00000000-0000-0000-0000-0000000120a1',
        'consultation', 'private funding from private account is fine', current_date, 1000,
        '00000000-0000-0000-0000-0000000120e1', '00000000-0000-0000-0000-0000000120f1', 'private') $$,
  'a private-visibility event funded from a matching private account is accepted'
);

select * from finish();
rollback;
