# Shopping List Continuous Specification

## Purpose

One continuous, household-shared shopping list: loose manual items, add/check/remove, in-place strike-through, and an explicit "Finalizar compra" clear — no auto-clear, no multiple/named lists.

## Requirements

### Requirement: Single Continuous List Per Household

The system MUST maintain exactly one active shopping list per household, never multiple named or dated lists, and every write MUST be scoped by `core.is_member(household_id)`.

#### Scenario: All items land in the same list

- GIVEN a household has an active shopping list with existing items
- WHEN any household member adds a new item
- THEN the new item appears in that same list, not in a new one

#### Scenario: A non-member cannot see or write the list

- GIVEN a shopping list belongs to household A
- WHEN a member of household B queries or writes to it
- THEN the request is rejected by RLS and no row is returned or persisted

### Requirement: Loose Manual Items

Any household member MUST be able to add a manual item (name, quantity, unit, optional cost) with no recipe origin.

#### Scenario: A loose item is added without any recipe

- GIVEN a household member opens the shopping list
- WHEN they add an item named "Papel higiénico" with a quantity and unit but no recipe reference
- THEN the item is persisted with a null recipe origin and appears on the list

### Requirement: Add, Check, and Remove Without Ownership Restriction

Any household member MUST be able to add, check/uncheck, or remove any item on the list; there MUST NOT be an owner-only restriction or mandatory-reason audit trail.

#### Scenario: A different member checks an item added by someone else

- GIVEN household member A added an item
- WHEN household member B checks it off
- THEN the item is marked checked with no reason required and no ownership error

#### Scenario: Any member can remove an item

- GIVEN a household list has an unchecked item
- WHEN any household member removes it
- THEN the item no longer appears on the list for any household member

### Requirement: In-Place Strike-Through Check-Off

Checking an item MUST strike it through in place; the system MUST NOT move checked items to a separate "purchased" section or reorder the list on check.

#### Scenario: Checking an item does not reorder the list

- GIVEN a list with items in a fixed order
- WHEN a household member checks the second item
- THEN the item renders struck-through in its original position and the list order is unchanged

### Requirement: Explicit Clear via "Finalizar compra"

The list MUST be cleared only by an explicit "Finalizar compra" action; checking every item MUST NOT auto-clear the list.

#### Scenario: Checking all items does not clear the list

- GIVEN every item on the list is checked
- WHEN no explicit clear action has been taken
- THEN the list and its items remain visible and unchanged

#### Scenario: "Finalizar compra" clears the list

- GIVEN a household list has both checked and unchecked items
- WHEN a household member taps "Finalizar compra"
- THEN all items are cleared from the active list, producing a stable identifier for that closed session

### Requirement: Estimated Total Cost

The list MUST display an estimated total computed as the sum of `estimated_unit_cost x quantity` over items that carry a cost value; items without a cost value MUST be excluded from the sum without erroring.

#### Scenario: Total sums only priced items

- GIVEN a list with one item having `estimated_unit_cost` and quantity, and a second loose item with no cost field
- WHEN the list is viewed
- THEN the displayed total equals the first item's `estimated_unit_cost x quantity`, and the second item is excluded without error

## Key Learnings

1. "Finalizar compra" is the sole clear trigger; checking all items must be provably a no-op for clearing.
2. Ownership is deliberately absent from this module — any-member add/check/remove is a first-class scenario, not an oversight.
