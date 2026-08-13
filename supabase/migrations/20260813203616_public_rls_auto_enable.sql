-- Captured from the remote-linked project's live state (applied directly, not via a tracked
-- migration file — found as drift while closing out recipes-module and reconciling before
-- `db push`). This file documents what already exists on remote so migration history matches
-- reality; it does not change remote behavior.
--
-- Global guardrail: any new table created in the `public` schema automatically gets RLS enabled
-- via an event trigger, closing the "forgot to enable RLS on a new table" failure mode at the
-- platform level rather than relying on every migration remembering to do it by hand.

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

grant all on function public.rls_auto_enable() to anon;
grant all on function public.rls_auto_enable() to authenticated;
grant all on function public.rls_auto_enable() to service_role;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();
