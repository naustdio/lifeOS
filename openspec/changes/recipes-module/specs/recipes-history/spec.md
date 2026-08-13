# Recipes History Specification

## Purpose

An auditable change trail for recipe edits and deletions: any household member may edit or soft-delete with a mandatory stated reason, only a household `owner` may permanently hard-delete, and both rules are enforced at the write/RLS layer, not only in the UI.

## Requirements

### Requirement: Mandatory Reason Enforced at the Write Layer

Any edit or soft-delete of a recipe MUST be rejected unless a non-empty reason is supplied, and this rejection MUST occur in the server action / database write path (not solely via client-side UI validation that could be bypassed).

#### Scenario: A UI edit without a reason is blocked

- GIVEN a household member edits a recipe's title in the app
- WHEN they attempt to save without entering a reason
- THEN the save is blocked and no recipe row or history entry is written

#### Scenario: A direct write bypassing the UI is still rejected

- GIVEN a caller invokes the recipe edit/soft-delete server action directly (bypassing the UI form) with an empty or missing reason
- WHEN the action executes
- THEN the write is rejected by the server action's validation and/or the database `NOT NULL` constraint on `recipe_changes.reason`, and no recipe mutation is persisted

#### Scenario: A stated reason allows the write to proceed

- GIVEN a household member edits a recipe and provides a non-empty reason
- WHEN they save
- THEN the recipe row is updated and a `recipe_changes` row is written in the same transaction with that reason

### Requirement: Soft-Delete Excludes a Recipe from Listing and Search While Preserving Its Data

A soft-deleted recipe MUST be excluded from the recipe list and from search/filter results, while its recipe row, ingredients, steps, and full `recipe_changes` history remain in the database, unaltered.

#### Scenario: A soft-deleted recipe disappears from the list

- GIVEN a household member soft-deletes a recipe with a reason
- WHEN any household member opens the recipe list
- THEN the soft-deleted recipe no longer appears

#### Scenario: A soft-deleted recipe's data and history survive

- GIVEN a recipe has been soft-deleted
- WHEN its underlying database rows are inspected
- THEN the recipe row, its ingredients, its steps, and its `recipe_changes` entries are all still present

### Requirement: Owner-Only Hard Delete Enforced in RLS

Permanent hard-delete of a recipe MUST be restricted to household members whose `core.household_members.role = 'owner'`, and this restriction MUST be enforced in the database's RLS DELETE policy, not only in application/UI logic. Hard delete MUST require a distinct, stronger confirmation than soft-delete.

#### Scenario: An owner can hard-delete behind confirmation

- GIVEN a household member with role `owner` selects hard-delete on a recipe
- WHEN they complete the distinct strong-confirmation step
- THEN the recipe and its child rows are permanently removed

#### Scenario: A non-owner is blocked by RLS even bypassing the UI

- GIVEN a household member with role other than `owner` issues a `DELETE` directly against the `recipes` table (bypassing the application UI and server action entirely)
- WHEN the delete statement executes under that member's RLS-scoped session
- THEN the RLS DELETE policy rejects the operation and the recipe row remains, regardless of any UI-layer restriction

#### Scenario: A non-owner does not see a hard-delete option in the UI

- GIVEN a household member with role other than `owner` views a recipe's actions
- WHEN they look for delete options
- THEN only soft-delete is offered; hard-delete is not presented

### Requirement: Collapsed History View with Actor, Timestamp, and Reason

The recipe detail page MUST render a "Historial de cambios" section, collapsed by default, listing each `recipe_changes` entry with its actor, timestamp, and stated reason. Field-level diffs MUST NOT be shown.

#### Scenario: History is collapsed on page load

- GIVEN a recipe has prior edit history
- WHEN its detail page loads
- THEN the "Historial de cambios" section is present but collapsed

#### Scenario: Expanding history shows actor, timestamp, and reason per entry

- GIVEN a recipe has two history entries
- WHEN a household member expands "Historial de cambios"
- THEN both entries display their actor, timestamp, and reason, with no field-level diff shown

## Key Learnings

1. The mandatory-reason rule is proven at the write layer via a direct bypass-the-UI scenario, not only a client-form scenario, since UI validation alone is trivially bypassable.
2. Owner-only hard delete is proven via a direct RLS-session `DELETE` scenario, matching the proposal's explicit risk that UI-only enforcement is insufficient.
