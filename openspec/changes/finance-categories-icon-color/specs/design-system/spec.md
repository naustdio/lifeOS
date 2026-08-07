# Delta for Design System

## ADDED Requirements

### Requirement: Category Icon and Color Token Registries

The design system MUST define, under `src/design-system/tokens/`, a static `iconName -> LucideIcon` registry and a `colorToken -> semantic class` registry for category styling. Both registries MUST be curated, bounded sets — no dynamic icon import and no raw hex/RGB literal in either registry.

#### Scenario: Icon registry resolves a known key to a component
- GIVEN a category has `icon = 'utensils'`
- WHEN the icon registry is queried for `'utensils'`
- THEN it returns the corresponding statically-imported Lucide icon component

#### Scenario: Color registry resolves a known key to a semantic class
- GIVEN a category has `color = 'warning'`
- WHEN the color registry is queried for `'warning'`
- THEN it returns a semantic Tailwind class token, not a raw hex value

### Requirement: CategoryChip Resolves Stored Style With Fallback

`CategoryChip` MUST accept a stored `icon` key and `color` token string (rather than only a `LucideIcon` prop) and resolve them through the design-system registries. When `icon` or `color` is missing, `null`, or not present in the registry, `CategoryChip` MUST render a defined neutral fallback icon and fallback color token instead of a blank, broken, or crashing chip.

#### Scenario: Known icon and color render as styled
- GIVEN a category has `icon = 'utensils'` and `color = 'warning'`
- WHEN `CategoryChip` renders that category
- THEN it displays the resolved icon and the resolved color's semantic class

#### Scenario: Missing style renders the neutral fallback
- GIVEN a category has `icon = null` and `color = null`
- WHEN `CategoryChip` renders that category
- THEN it displays the fallback icon and fallback color token, with no blank space or render error

#### Scenario: Unknown stored key renders the neutral fallback
- GIVEN a category's stored `icon` or `color` value is not present in the current registry (e.g. a retired key)
- WHEN `CategoryChip` renders that category
- THEN it displays the fallback icon and/or fallback color token instead of throwing or rendering nothing
