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
