# Delta for Design System

## ADDED Requirements

### Requirement: Transaction Sub-type Icon Registry

The design system MUST define, under `src/design-system/tokens/transaction-subtype-style.ts`, a static, icon-only `subtype -> LucideIcon` registry separate from `category-style.ts`, with no color mapping — sub-type icons layer onto an already-colored category chip or transaction row. The registry MUST cover every value in the `finance.transactions.subtype` CHECK whitelist, including the reserved `compra_meses` token, and MUST expose a total resolver function that never throws.

#### Scenario: Icon registry resolves a known sub-type to a component
- GIVEN a transaction has `subtype = 'pago'`
- WHEN the sub-type icon registry is queried for `'pago'`
- THEN it returns the corresponding statically-imported Lucide icon component

#### Scenario: Registry has no color mapping
- GIVEN the sub-type registry module is inspected
- WHEN searched for a color token or semantic class map
- THEN none exists; the registry exports icon keys only

#### Scenario: compra_meses has a defined icon token despite being unselectable
- GIVEN `compra_meses` is a reserved CHECK value
- WHEN the sub-type icon registry is queried for `'compra_meses'`
- THEN it returns a defined icon component, even though no UI path can select it this cycle

### Requirement: Sub-type Resolver Fallback for Unknown or Null Keys

The sub-type icon resolver MUST return a defined neutral fallback icon, never `undefined`, `null`, or a thrown error, when given a `null` subtype or a string not present in the registry (e.g. a retired or unrecognized key). Resolution happens at the call site; the existing `TransactionRow`/`CategoryChip` `icon` prop contract MUST NOT change.

#### Scenario: Null subtype resolves to the fallback
- GIVEN a transaction has `subtype = null`
- WHEN the call site resolves its sub-type icon
- THEN the resolver returns the neutral fallback icon, and no icon overlay is forced onto the row

#### Scenario: Unknown stored value resolves to the fallback
- GIVEN a transaction's stored `subtype` is a string not present in the current registry
- WHEN the call site resolves its sub-type icon
- THEN the resolver returns the neutral fallback icon instead of throwing or rendering a blank icon slot

#### Scenario: Resolved icon is passed through the existing prop contract
- GIVEN a transaction has a resolvable sub-type icon
- WHEN it is rendered in `TransactionRow` or the Home feed
- THEN the resolved `LucideIcon` is passed via the existing `icon?: LucideIcon` prop, with no change to `TransactionRow`'s public contract
