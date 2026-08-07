# Finance Categories Specification

## Purpose

Defines the two-level income/expense category taxonomy, Spanish-language seeded defaults, and user customization (create, rename, deactivate).

## Requirements

### Requirement: Two-Level Taxonomy
A category MUST have `kind` of `income` or `expense`, and MAY have a `parent_id` referencing another category of the same `kind`. Nesting MUST be limited to a maximum of one level (a category with a `parent_id` MUST NOT itself be assigned as another category's parent).

#### Scenario: Subcategory of a subcategory is rejected
- GIVEN category B has `parent_id` pointing to category A
- WHEN a user attempts to create category C with `parent_id` pointing to category B
- THEN the creation is rejected

### Requirement: Seeded Spanish Defaults
On provisioning, the system MUST seed a default set of system categories (`is_system = true`, `household_id = null`) with names in Spanish (e.g., "Comida", "Transporte", "Salario"), covering common income and expense kinds.

#### Scenario: Default categories exist in Spanish after seed
- GIVEN the database seed has run
- WHEN system categories are queried
- THEN they have `is_system = true`, `household_id = null`, and Spanish names

### Requirement: User-Created Categories
A user MUST be able to create a custom category scoped to their own household, specifying name, kind, optional parent, and OPTIONAL icon and color. Icon and color MUST NOT be required to complete category creation. If either is omitted, the category MUST render with a neutral default icon and color, never blank or broken.

#### Scenario: User creates a household-scoped category
- GIVEN a user creates a category named "Renta" of kind `expense`
- WHEN saved
- THEN the category has `household_id` set to the user's household and `is_system = false`, and is available only to that household's transactions

#### Scenario: Category created with no icon or color renders the neutral default
- GIVEN a user creates a category and leaves icon and color unset
- WHEN the category is saved and later rendered via `CategoryChip`
- THEN it displays the fallback icon and fallback color token, not a blank or broken chip

#### Scenario: Category created with an explicit icon and color
- GIVEN a user creates a category and selects an icon and a color from the picker
- WHEN saved
- THEN the category stores that icon key and color token, and `CategoryChip` renders them for that category everywhere it appears

### Requirement: Bounded Icon and Color Registry

`icon` and `color` on `finance.categories` and `finance.category_templates` MUST each be constrained to a fixed, curated set of allowed keys, enforced by a database `CHECK` constraint referencing an explicit enum/list. Free-text values, arbitrary Lucide icon names, and raw hex/RGB color values MUST be rejected at the database level, independent of any client-side validation.

#### Scenario: Out-of-registry icon value is rejected by the database
- GIVEN a client attempts to insert or update a category with `icon = 'not-a-real-icon'`
- WHEN the write is submitted directly, bypassing the UI picker
- THEN the database `CHECK` constraint rejects the write and no row is created or modified

#### Scenario: Out-of-registry color value is rejected by the database
- GIVEN a client attempts to insert or update a category with a raw hex value such as `color = '#FF0000'`
- WHEN the write is submitted directly, bypassing the UI picker
- THEN the database `CHECK` constraint rejects the write and no row is created or modified

#### Scenario: UI picker only offers registry values
- GIVEN a user opens the icon or color picker on the category form
- WHEN the picker options are inspected
- THEN only keys present in the curated registry are selectable, with no free-text or hex input available

### Requirement: Household-Scoped Icon and Color

Icon and color MUST be properties of the category row itself, shared by every member of the owning household, not a per-user preference. All members of a household MUST see the same icon and color for a given category. Writes to a category's icon/color MUST be enforced by the same RLS household-membership rules already governing category writes.

#### Scenario: All household members see the same style
- GIVEN a category "Comida" has icon `utensils` and color `warning` set by one household member
- WHEN a different member of the same household views that category
- THEN they see the identical icon and color, with no per-member override

#### Scenario: Non-member cannot restyle another household's category
- GIVEN a user who is not a member of household H
- WHEN that user attempts to update the icon or color of a category belonging to H
- THEN the write is rejected by RLS and no row is modified

### Requirement: Migration Backfills Every Category to a Non-Null Style

The migration that introduces the `color` column (and populates any unset `icon` values) MUST leave zero categories unstyled. Template rows and seeded default categories MUST receive intentional, curated icon+color pairs matched to their meaning. Pre-existing custom categories created by users before the migration MUST receive a deterministic fallback icon+color assignment by the migration itself; none may remain `NULL` after the migration completes.

#### Scenario: Seeded default categories get curated styling
- GIVEN the migration has run
- WHEN a seeded default category (e.g. "Salario", "Transporte") is queried
- THEN it has a non-null, meaning-appropriate icon and color assigned by the migration

#### Scenario: Pre-existing custom category gets a deterministic fallback
- GIVEN a household had a custom category created before this migration, with no icon or color
- WHEN the migration completes
- THEN that category has a non-null icon and a non-null color, assigned deterministically by the migration

#### Scenario: No category remains unstyled after migration
- GIVEN the migration has fully run
- WHEN every row in `finance.categories` and `finance.category_templates` is queried
- THEN no row has a `NULL` icon or a `NULL` color

### Requirement: Categories Management Screen

The application MUST provide an `(app)/categorias/` screen where a user can list categories as a two-level tree, create a category, rename a category, deactivate a category, and pick or change its icon and color. This screen is a required deliverable of this change, not a deferred follow-up.

#### Scenario: Screen lists the two-level category tree
- GIVEN a household has parent and child categories
- WHEN the categorias screen is opened
- THEN categories render as a two-level tree grouped by kind, matching the existing nesting rule

#### Scenario: Screen supports restyling an existing category
- GIVEN a user opens an existing category on the categorias screen
- WHEN the user changes its icon and/or color and saves
- THEN the updated style is persisted and reflected the next time `CategoryChip` renders that category

#### Scenario: Screen enforces existing nesting and kind rules
- GIVEN a user attempts to create a subcategory of a subcategory, or a child of a different kind than its parent, from the categorias screen
- WHEN the save is submitted
- THEN the save is rejected, consistent with the existing one-level-nesting and kind-match rules

### Requirement: Rename Any Category
A user MUST be able to rename **any** category available to them — both categories they created and seeded default categories — without breaking references from existing transactions. A rename MUST affect only the renaming user's own space and MUST NOT change what any other space sees.

#### Scenario: Renaming a custom category preserves transaction links
- GIVEN a user renames their custom category "Renta" to "Alquiler"
- WHEN the rename is saved
- THEN existing transactions referencing that category's id still resolve correctly and display the new name

#### Scenario: Renaming a seeded default category
- GIVEN the seeded default category "Transporte" is available to a user
- WHEN the user renames it to "Auto y viajes"
- THEN the category displays as "Auto y viajes" for that user, existing transactions referencing it still resolve, and no other space's copy of that default is affected

### Requirement: Deactivate Categories Instead of Deleting
A user MUST be able to deactivate a category (their own custom category, or hide a system category from their household's selection) rather than deleting it, because transactions may reference it. A deactivated category MUST be excluded from selection in new transactions but MUST remain valid for existing transaction references.

#### Scenario: Deactivated category hidden from new-entry pickers
- GIVEN a category has been deactivated
- WHEN a user opens the category picker for a new transaction
- THEN the deactivated category does not appear in the list

#### Scenario: Deactivated category still resolves for historical transactions
- GIVEN a transaction references a category that has since been deactivated
- WHEN that transaction is displayed
- THEN the category name still renders correctly

## Resolved Ambiguities

**Renaming seeded default categories** — resolved by the user after this spec was first drafted: seeded defaults are renamable, not just deactivatable. The "Rename Any Category" requirement above reflects this.

### Design note (mechanism left to `sdd-design`)

The original draft modeled seeded defaults as globally shared rows (`is_system = true`, `household_id = null`). A globally shared row cannot be renamed per space, so the design must choose a mechanism that satisfies the requirement. Two viable options:

1. **Seed per space on creation** — when a space is bootstrapped, copy the default taxonomy into it as ordinary household-scoped rows. Rename and deactivate then need no special cases at all, at the cost of duplicated rows per space and a migration path when the default set changes.
2. **Global defaults plus a per-space override table** — keep shared default rows and store per-space name/visibility overrides. No duplication, but every read path must resolve overrides.

Option 1 is the simpler fit for a personal-first product with few spaces; `sdd-design` owns the final call and must justify it.
