# Delta for Finance Transactions

## ADDED Requirements

### Requirement: Optional Bounded Transaction Sub-type

A transaction MAY carry a nullable `subtype text` column, constrained by its own `CHECK` whitelist independent of the `type` CHECK: `pago`, `reembolso`, `devolucion_efectivo`, `pago_tarjeta`, `compra_meses`. `subtype` MUST NOT be trigger-linked to `type`; the value-set constraint lives entirely in the database CHECK. A transaction with no sub-type MUST behave identically to today's plain expense/income/transfer row.

#### Scenario: Transaction recorded without a sub-type is unchanged
- GIVEN a user records an expense with no sub-type selected
- WHEN saved
- THEN the row has `subtype = null` and renders exactly as it did before this change

#### Scenario: Out-of-whitelist value is rejected by the database
- GIVEN a write attempts `subtype = 'not-a-real-subtype'` directly against the RPC or table
- WHEN the write is submitted, bypassing the UI
- THEN the database `CHECK` constraint rejects the write and no row is created or modified

### Requirement: Sub-type to Type Compatibility, Enforced at the RPC Layer

Each selectable sub-type MUST be paired with exactly one `type`: `pago` → `expense`, `reembolso` → `income`, `devolucion_efectivo` → `income`, `pago_tarjeta` → `transfer`. This pairing MUST be validated in plpgsql inside the SECURITY DEFINER write RPCs (`record_transaction`, `record_transfer`, `update_transaction`), mirroring the existing `p_kind` guard pattern — the database CHECK constrains only the value set, not the type/subtype pairing.

#### Scenario: pago recorded on an expense succeeds
- GIVEN a user records an expense of 500 centavos with `subtype = 'pago'`
- WHEN saved
- THEN the row has `type = 'expense'` and `subtype = 'pago'`

#### Scenario: reembolso recorded on an income succeeds
- GIVEN a user records an income with `subtype = 'reembolso'`
- WHEN saved
- THEN the row has `type = 'income'` and `subtype = 'reembolso'`

#### Scenario: devolucion_efectivo recorded on an income succeeds
- GIVEN a user records an income with `subtype = 'devolucion_efectivo'`
- WHEN saved
- THEN the row has `type = 'income'` and `subtype = 'devolucion_efectivo'`

#### Scenario: pago_tarjeta recorded on a transfer succeeds
- GIVEN a user records a transfer with `subtype = 'pago_tarjeta'`
- WHEN saved
- THEN both linked transfer rows carry `type = 'transfer'` and `subtype = 'pago_tarjeta'`, with no requirement that the destination account be a `credit_card` account

#### Scenario: Mismatched sub-type/type pairing is rejected
- GIVEN a client calls the write RPC with `type = 'transfer'` and `subtype = 'pago'` (an expense-only sub-type)
- WHEN the RPC executes
- THEN the plpgsql guard raises an error and no row is created or modified, independent of any client-side validation

### Requirement: compra_meses Reserved, Not Selectable

`compra_meses` MUST exist as a valid CHECK whitelist value and MUST have a design-system icon token defined for it, but no code path in this change may produce it: it MUST NOT appear in any UI selection list this cycle, neither as an active nor a disabled/coming-soon option.

#### Scenario: compra_meses is absent from the sub-type selector
- GIVEN a user opens the sub-type `<Select>` on the transaction form
- WHEN the available options are inspected
- THEN `compra_meses` is not present, whether enabled or disabled

#### Scenario: Direct RPC call with compra_meses still passes the CHECK
- GIVEN a direct RPC call sets `subtype = 'compra_meses'` on an expense
- WHEN the write is submitted
- THEN the database CHECK constraint accepts the value (it is a reserved, valid whitelist member), even though no UI path can produce it

### Requirement: Sub-type Editable via update_transaction, Set-Only for v1

`update_transaction` MUST accept an optional `p_subtype` parameter to correct or add a sub-type after creation, applying the same type/subtype compatibility guard used on creation. Because `update_transaction` treats a `null` parameter as "leave unchanged", this RPC MUST NOT support clearing an already-set `subtype` in this change; setting a sub-type once applied MUST remain a one-way operation for v1, and this limitation MUST be documented.

#### Scenario: Editing a transaction's sub-type
- GIVEN a posted expense transaction currently has `subtype = null`
- WHEN `update_transaction` is called with `p_subtype = 'pago'`
- THEN the row's `subtype` becomes `'pago'`

#### Scenario: Re-labeling an existing sub-type
- GIVEN a posted expense transaction has `subtype = 'pago'`
- WHEN `update_transaction` is called with a different compatible value, e.g. `p_subtype = 'pago'` again or a value valid for the same type
- THEN the row's `subtype` is updated accordingly

#### Scenario: Omitting p_subtype leaves the existing value unchanged
- GIVEN a posted transaction has `subtype = 'reembolso'`
- WHEN `update_transaction` is called without passing `p_subtype` (or passing `null`)
- THEN the row's `subtype` remains `'reembolso'`, per the existing null-sentinel convention

#### Scenario: Clearing a sub-type is not supported in v1
- GIVEN a posted transaction has `subtype = 'pago'`
- WHEN a caller wants to remove the sub-type entirely
- THEN no mechanism in this change achieves that; this is a documented v1 limitation, not a bug

### Requirement: Transfer Pair Sub-type Symmetry

When a sub-type is set on a transfer, both linked rows sharing the `transfer_group_id` MUST carry the same `subtype` value; a half-labeled transfer pair MUST NOT occur.

#### Scenario: Both legs of a pago_tarjeta transfer share the sub-type
- GIVEN a user records a transfer with `subtype = 'pago_tarjeta'`
- WHEN the two linked rows are queried
- THEN both rows have `subtype = 'pago_tarjeta'`

### Requirement: Old Clients Remain Compatible

The write RPCs' new sub-type parameter MUST be trailing and default to `null`, so an existing caller that does not pass it continues to succeed exactly as before this change.

#### Scenario: Pre-change client call still succeeds
- GIVEN a client calls `record_transaction` without a `p_subtype` argument
- WHEN the RPC executes
- THEN the call succeeds and the resulting row has `subtype = null`
