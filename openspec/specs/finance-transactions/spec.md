# Finance Transactions Specification

## Purpose

Defines income/expense/transfer entries, linked transfer pairs, and the void (never hard-delete) lifecycle, all in integer centavos.

## Requirements

### Requirement: Transaction Types and Money Representation
A transaction MUST have `type` of `income`, `expense`, or `transfer`, an `amount_cents` stored as a bigint integer (never a float), and `currency` pinned to `MXN` via a CHECK constraint. Each transaction MUST record `occurred_on` (date), `account_id`, `household_id`, and `status` of `posted` or `void`.

#### Scenario: Expense recorded in integer centavos
- GIVEN a user records an expense of 150.00 MXN in category "Comida"
- WHEN saved
- THEN the transaction row has `amount_cents = 15000`, `type = expense`, `status = posted`, `currency = MXN`

### Requirement: Linked Transfer Pairs
A transfer between two accounts MUST be represented as two linked transaction rows (`type = transfer`) sharing the same `transfer_group_id` — one decreasing the source account and one increasing the destination account.

#### Scenario: Transfer creates two linked rows
- GIVEN a user transfers 5000 centavos from checking to savings
- WHEN saved
- THEN two `transfer`-type rows are created, sharing one `transfer_group_id`, one against the checking account and one against the savings account

### Requirement: Transfers Excluded From Income/Expense Reporting
Income and expense aggregations (e.g., month summaries) MUST exclude rows where `type = transfer`, so an internal move between the user's own accounts never appears as income or expense.

#### Scenario: Transfer does not affect month income/expense totals
- GIVEN a month has one expense of 1000 centavos and one transfer of 5000 centavos
- WHEN the month income/expense summary is computed
- THEN the transfer amount is excluded from both the income and expense totals

### Requirement: Void Lifecycle, Never Hard-Delete
A posted transaction MUST be voidable (`status` transitions to `void`) but MUST NEVER be hard-deleted, because origin modules and reports may hold references to it. A voided transaction MUST be excluded from balance and reporting computations while remaining queryable in history.

#### Scenario: Voiding a transaction removes it from balance without deleting the row
- GIVEN a posted expense transaction affects an account's balance
- WHEN the transaction is voided
- THEN the account's derived balance no longer includes that amount, and the row still exists with `status = void`

#### Scenario: Voiding one side of a transfer voids both sides
- GIVEN a transfer pair shares a `transfer_group_id`
- WHEN one side of the pair is voided
- THEN the linked row with the same `transfer_group_id` is also transitioned to `void` in the same operation

### Requirement: paid_by_user_id Hidden From Personal-Mode UI
Every transaction MAY record `paid_by_user_id` and `created_by_user_id`, but the transaction entry and display UI MUST NOT present a "who paid" selector or field in personal-mode.

#### Scenario: No who-paid field shown on the transaction form
- GIVEN a user opens the transaction entry form
- WHEN the form is rendered
- THEN no "who paid" selector is present, even though `paid_by_user_id` is populated internally

### Requirement: Current-Month Aggregation Read Surface
The `finance-transactions` module's public read surface MUST expose current-calendar-month
aggregation reads: total income, total expense, and expense totals grouped by category, all computed
from `posted`, non-`transfer` transactions with `occurred_on` in the current calendar month (day 1
through today). These reads MUST be read-only and MUST NOT introduce any new write function or alter
an existing write function's signature or behavior.

#### Scenario: Aggregation excludes transfers, matching the existing rule
- GIVEN the current month has posted income, posted expense, and posted transfer transactions
- WHEN the current-month income/expense aggregation read is called
- THEN the transfer transactions are excluded from both totals, per the existing
  Transfers-Excluded-From-Reporting rule

#### Scenario: Category breakdown includes only posted, non-transfer expenses
- GIVEN the current month has posted expenses across multiple categories and one voided expense
- WHEN the expense-by-category aggregation read is called
- THEN totals are grouped per category from posted, non-void, non-transfer expense rows only, and the
  voided row is excluded

#### Scenario: Read exports are additive
- GIVEN the `finance/api` barrel before this change
- WHEN the new aggregation reads are added
- THEN they appear as new exports alongside existing reads, and no existing write export changes

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

### Requirement: Sub-type Editable via update_transaction, Including Clearing

`update_transaction` MUST accept an optional `p_subtype` parameter to correct or add a sub-type after creation, applying the same type/subtype compatibility guard used on creation. Because `update_transaction` treats a `null` parameter as "leave unchanged" for every existing sibling parameter, `subtype` cannot reuse that same sentinel to mean "clear" — the RPC MUST instead accept a separate `p_clear_subtype boolean` (default `false`) that, when `true`, clears the transaction's `subtype` to `null` regardless of `p_subtype`.

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
- WHEN `update_transaction` is called without passing `p_subtype` (or passing `null`) and `p_clear_subtype = false`
- THEN the row's `subtype` remains `'reembolso'`, per the existing null-sentinel convention

#### Scenario: Clearing a sub-type via the explicit clear flag
- GIVEN a posted transaction has `subtype = 'pago'`
- WHEN `update_transaction` is called with `p_clear_subtype = true`
- THEN the row's `subtype` becomes `null`, independent of whatever value `p_subtype` carries

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
