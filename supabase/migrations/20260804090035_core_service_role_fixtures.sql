-- `service_role` (the trusted, backend-only admin key — never exposed to any client, used here
-- only for test-fixture setup) had no grants at all on `core`, including schema USAGE. Every
-- other role's access to `core` was explicitly granted per-migration
-- (20260804090002_core_security.sql), but `service_role` was never included since nothing needed
-- it until the health-tracking test suite required adding a second household member without an
-- invite/join RPC (none exists in this schema). This is a pure grant widening — `service_role`
-- already bypasses RLS by design; this only adds the table-level grant PostgREST's role-switch
-- requires before RLS is even evaluated. No production code path is affected: this key is never
-- used outside trusted backend/test contexts.
grant usage on schema core to service_role;
grant select, insert, update, delete on core.household_members to service_role;
