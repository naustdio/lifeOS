-- `shopping_list.planner_slots` RLS + grants — same direct-RLS discipline as
-- `_shopping_list_security.sql` (no security-definer seam, `core.is_member(household_id)`, full
-- stop).

alter table shopping_list.planner_slots enable row level security;

create policy shopping_list_planner_slots_all on shopping_list.planner_slots
  for all to authenticated
  using (core.is_member(household_id))
  with check (core.is_member(household_id));

revoke all on shopping_list.planner_slots from anon, authenticated;

grant select, insert, update, delete
  on shopping_list.planner_slots
  to authenticated;
