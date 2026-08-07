-- pgTAP — CC-010 single overload guard. Post-migration assertion: exactly ONE
-- confirm_recurring_transaction overload exists, and its signature is
-- (uuid, bigint, date, text) returns uuid. The 42725 guard from the sibling changes
-- (finance-account-types-expansion, finance-transaction-subtypes). Resolves design.md Open
-- Question #2.

begin;
select plan(2);

select is(
  (select count(*)::int from pg_proc
    where proname = 'confirm_recurring_transaction' and pronamespace = 'finance'::regnamespace),
  1, 'exactly ONE finance.confirm_recurring_transaction overload exists after the migration'
);

select is(
  (select pg_get_function_identity_arguments(oid) from pg_proc
    where proname = 'confirm_recurring_transaction' and pronamespace = 'finance'::regnamespace),
  'p_recurring_id uuid, p_amount_cents bigint, p_occurred_on date, p_description text',
  'the single overload has the unchanged (uuid, bigint, date, text) signature'
);

select * from finish();
rollback;
