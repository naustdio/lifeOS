-- Nutrition visit linkage — design.md Migration section (nutrition-submodule).
-- The nutrition-typed `health.events` row already IS the visit; this migration adds a nullable
-- link column on `vital_readings` and a new photos table, both pointing at it directly, plus this
-- repo's first Supabase Storage bucket.

alter table health.vital_readings
  add column event_id uuid references health.events(id) on delete set null;
create index on health.vital_readings (event_id) where event_id is not null;

create table health.nutrition_visit_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  event_id uuid not null references health.events(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create index on health.nutrition_visit_photos (event_id);

alter table health.nutrition_visit_photos enable row level security;

-- Decision 1 (design.md): OWNER-ONLY select — intentionally NOT the household-or-owner shape
-- used by health.events / vital_readings / profile_facts. A visit's own `visibility='household'`
-- setting must never widen who can see its photos; photos are always private to the owner.
create policy nutrition_visit_photos_select on health.nutrition_visit_photos
  for select to authenticated using (owner_user_id = (select auth.uid()));

create policy nutrition_visit_photos_insert on health.nutrition_visit_photos
  for insert to authenticated
  with check (core.is_member(household_id) and owner_user_id = (select auth.uid()));

create policy nutrition_visit_photos_delete on health.nutrition_visit_photos
  for delete to authenticated using (owner_user_id = (select auth.uid()));
-- No UPDATE policy: a photo row is immutable; "replace" is delete + insert.

revoke all on health.nutrition_visit_photos from anon, authenticated;
grant select, insert, delete on health.nutrition_visit_photos to authenticated;

-- First Supabase Storage bucket in this repo. Private; object path convention
-- `{owner_user_id}/{event_id}/{filename}`, enforced by the object policies below.
insert into storage.buckets (id, name, public)
values ('health-nutrition-photos', 'health-nutrition-photos', false)
on conflict (id) do nothing;

create policy health_nutrition_photos_object_select on storage.objects
  for select to authenticated
  using (bucket_id = 'health-nutrition-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy health_nutrition_photos_object_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'health-nutrition-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy health_nutrition_photos_object_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'health-nutrition-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
