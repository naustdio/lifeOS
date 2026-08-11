-- pgTAP — nutrition-submodule Phase 1 (design.md Decision 1/2/4, tasks.md 1.1/1.4/1.5).
--
-- RED pass (this file's initial form): run against the PRE-migration schema. `health.events`
-- exists but has no `nutrition_visit_photos` table and `vital_readings` has no `event_id` column
-- yet, so every assertion below fails (either a hard "relation/column does not exist" error, or —
-- for the ones phrased as row-count checks against tables that do exist — a genuine assertion
-- failure). That failure is the RED evidence. After the migration in tasks.md 1.2/1.3 lands, the
-- same file passes unchanged — GREEN (tasks.md 1.4).
--
-- Covers: (a) a household member cannot SELECT another member's nutrition_visit_photos row even
-- when the linked event is visibility='household' — the deliberate divergence from this schema's
-- house household-or-owner pattern (design.md Decision 1); (b) the storage.objects policy rejects
-- a foreign `(storage.foldername(name))[1]`; (c) deleting a health.events row nulls event_id on
-- its linked vital_readings (not delete); (d) deleting a health.events row cascades its linked
-- nutrition_visit_photos rows; (e) the bucket is private (public = false).

begin;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000001400a1', 'nutrition-visit-a@example.com', '{"full_name":"Visit A"}'),
  ('00000000-0000-0000-0000-0000001400c1', 'nutrition-visit-c@example.com', '{"full_name":"Visit C"}')
on conflict (id) do nothing;

insert into core.households (id, name, personal_owner_user_id, created_by)
values ('00000000-0000-0000-0000-0000001400aa', 'personal', '00000000-0000-0000-0000-0000001400a1', '00000000-0000-0000-0000-0000001400a1')
on conflict (id) do nothing;

insert into core.household_members (household_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000001400aa', '00000000-0000-0000-0000-0000001400a1', 'owner'),
  ('00000000-0000-0000-0000-0000001400aa', '00000000-0000-0000-0000-0000001400c1', 'member')
on conflict do nothing;

-- A household-VISIBLE nutrition event owned by A. If the photos table used the ordinary
-- household-or-owner select policy, member C would be able to see A's photo row through this
-- event the same way C can see A's household-visible vital_readings — that is exactly the leak
-- Decision 1 forbids.
insert into health.events (id, household_id, owner_user_id, event_type, title, occurred_on, visibility)
values ('00000000-0000-0000-0000-000000140001', '00000000-0000-0000-0000-0000001400aa',
        '00000000-0000-0000-0000-0000001400a1', 'nutrition', 'Consulta con fotos', current_date, 'household')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- (a) Photo privacy: owner-only, independent of the event's household visibility.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001400a1","role":"authenticated"}';

insert into health.nutrition_visit_photos (id, household_id, event_id, owner_user_id, storage_path)
values ('00000000-0000-0000-0000-000000140002', '00000000-0000-0000-0000-0000001400aa',
        '00000000-0000-0000-0000-000000140001', '00000000-0000-0000-0000-0000001400a1',
        '00000000-0000-0000-0000-0000001400a1/00000000-0000-0000-0000-000000140001/photo1.jpg')
on conflict (id) do nothing;

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001400c1","role":"authenticated"}';

select is(
  (select count(*) from health.events where id = '00000000-0000-0000-0000-000000140001'),
  1::bigint,
  'member C DOES see the household-visible nutrition event itself (sanity check on the fixture)'
);

select is(
  (select count(*) from health.nutrition_visit_photos where id = '00000000-0000-0000-0000-000000140002'),
  0::bigint,
  'member C does NOT see A''s visit photo even though the linked event is visibility=household'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001400a1","role":"authenticated"}';

select is(
  (select count(*) from health.nutrition_visit_photos where id = '00000000-0000-0000-0000-000000140002'),
  1::bigint,
  'owner A still sees her own visit photo'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- (b) Storage object policy — a foreign folder prefix is rejected.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001400c1","role":"authenticated"}';

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('health-nutrition-photos',
             '00000000-0000-0000-0000-0000001400a1/00000000-0000-0000-0000-000000140001/foreign-upload.jpg',
             '00000000-0000-0000-0000-000000140c1') $$,
  null, null,
  'member C cannot upload into a folder prefixed with A''s user id'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000001400a1","role":"authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('health-nutrition-photos',
             '00000000-0000-0000-0000-0000001400a1/00000000-0000-0000-0000-000000140001/own-upload.jpg',
             '00000000-0000-0000-0000-0000001400a1') $$,
  'A CAN upload into a folder prefixed with her own user id'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- (e) Bucket is private.
-- ---------------------------------------------------------------------------

select is(
  (select public from storage.buckets where id = 'health-nutrition-photos'),
  false,
  'the health-nutrition-photos bucket is private (public = false)'
);

-- ---------------------------------------------------------------------------
-- (c)/(d) Delete semantics: readings unlink, photos cascade.
-- ---------------------------------------------------------------------------

insert into health.vital_readings (id, household_id, owner_user_id, event_id, metric, value_numeric)
values ('00000000-0000-0000-0000-000000140003', '00000000-0000-0000-0000-0000001400aa',
        '00000000-0000-0000-0000-0000001400a1', '00000000-0000-0000-0000-000000140001', 'weight_kg', 80.2)
on conflict (id) do nothing;

delete from health.events where id = '00000000-0000-0000-0000-000000140001';

select is(
  (select event_id from health.vital_readings where id = '00000000-0000-0000-0000-000000140003'),
  null::uuid,
  'deleting the linked event nulls event_id on its vital_readings (the reading itself survives)'
);

select is(
  (select count(*) from health.nutrition_visit_photos where event_id = '00000000-0000-0000-0000-000000140001'),
  0::bigint,
  'deleting the linked event cascades its nutrition_visit_photos rows (gone, not orphaned)'
);

select * from finish();
rollback;
