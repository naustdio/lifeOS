-- `pgtap` was previously installed by hand against the local dev database and was never captured
-- in a tracked migration, so a `supabase db reset` (or a fresh volume) silently lost it and every
-- `supabase/tests/*.sql` pgTAP suite failed with "function plan(integer) does not exist" — found
-- while resetting the local stack for the recipes-module change. Idempotent, additive, no
-- application-facing effect: `pgtap` is a test-only extension, never referenced by app code.
create extension if not exists pgtap;
