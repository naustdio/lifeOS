-- `shopping_list.planner_slots` — weekly planner (design.md Open Question: planner scoping,
-- tasks.md 6.2). Producer-only: assigns at most one recipe per (household, day, meal_slot) — the
-- composite primary key enforces that directly. Deliberately carries NO item/checked/state
-- column; "Agregar a mi lista" writes into the SAME `shopping_list.items`/`lists` machinery via
-- the app-layer composition action (design.md Decision 3), never a second list system.
-- `recipe_id` is NOT an FK, mirroring `items.origin_recipe_id` — `recipes` stays off-limits to
-- this schema, and a deleted recipe must not cascade away a planned assignment.

create table shopping_list.planner_slots (
  household_id uuid not null references core.households(id) on delete cascade,
  day text not null check (day in ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo')),
  meal_slot text not null check (meal_slot in ('desayuno', 'comida', 'cena')),
  recipe_id uuid not null,
  primary key (household_id, day, meal_slot)
);
