# Delta for Finance Recurring

## MODIFIED Requirements

### Requirement: Recurring Definitions Are Expense-Only, One of Four Frequencies, Never Auto-Posting

A recurring definition MUST have a `type` discriminator of either `expense` or `transfer`. An `expense`-type definition MUST reference exactly one expense-kind category and `to_account_id` MUST be `NULL`. A `transfer`-type definition MUST reference a source account and a `to_account_id`, MUST have `category_id = NULL`, and MUST carry a fixed amount configured by the user — never the destination account's live balance. Every definition, regardless of type, MUST have `frequency` set to exactly one of `monthly`, `weekly`, `biweekly`, or `yearly`. Creating a definition MUST NOT insert a transaction, and the arrival of `next_due_date` on its own (without an explicit confirm) MUST NOT insert a transaction.

(Previously: definitions were expense-only with a required `category_id`; no `type` discriminator or transfer shape existed.)

#### Scenario: Creating an expense definition posts nothing
- GIVEN a user creates a new `expense`-type recurring for "Renta" at 12000 centavos monthly
- WHEN the definition is saved
- THEN no `finance.transactions` row is created

#### Scenario: Due date arriving alone posts nothing
- GIVEN a recurring definition's `next_due_date` is today
- WHEN the day passes with no confirm or discard action
- THEN no transaction is created and the definition still shows as due

#### Scenario: Only the four supported frequencies are accepted
- GIVEN a user is creating or editing a recurring definition of either type
- WHEN a frequency other than `monthly`, `weekly`, `biweekly`, or `yearly` is submitted
- THEN the write is rejected

#### Scenario: Creating a transfer-type auto-pay definition with a fixed amount
- GIVEN a user creates a `transfer`-type definition with a checking account as source, a credit-card account as `to_account_id`, and a fixed amount of 300000 centavos, monthly
- WHEN the definition is saved
- THEN it is stored with `category_id = NULL` and no transaction is created

#### Scenario: category_id and to_account_id are mutually exclusive by type
- GIVEN a write attempts `type = 'expense'` with `to_account_id` set, or `type = 'transfer'` with `category_id` set
- WHEN the write is submitted
- THEN the database constraint rejects it

### Requirement: Confirm Atomically Posts and Advances the Cursor

Confirming a due recurring item MUST, within one transactional unit, advance `next_due_date` by exactly one period AND post the definition's type-appropriate result: for `expense` type, exactly one `finance.transactions` row with `recurring_id` set to the definition's id; for `transfer` type, exactly two opposite-signed rows sharing one `transfer_group_id`, both with `recurring_id` set to the definition's id and no category. This MUST NOT be exposed as separate client calls that could partially apply, and for `transfer` type there MUST be no code path that posts only one of the two rows.

(Previously: covered only the single-insert expense case.)

#### Scenario: Confirm posts one expense transaction and advances the cursor together
- GIVEN a monthly `expense`-type definition due today
- WHEN the user confirms it
- THEN exactly one transaction with `recurring_id` set to that definition exists AND `next_due_date` is now one month later

#### Scenario: Confirm posts a balanced transfer pair and advances the cursor together
- GIVEN a monthly `transfer`-type auto-pay definition due today, fixed amount 300000 centavos, from checking to a credit-card account
- WHEN the user confirms it
- THEN exactly two rows exist sharing one `transfer_group_id` — one negative on the source account and one positive on the destination account, each 300000 centavos, both with `recurring_id` set to the definition — AND `next_due_date` is now one month later

#### Scenario: A failure during confirm leaves neither half applied
- GIVEN a confirm call fails partway through its write, for either type
- WHEN the failure occurs
- THEN no transaction row exists for that attempt and `next_due_date` is unchanged

### Requirement: Idempotent Confirmation Per Due Date Never Produces a Half-Transfer

Confirming the same due date for the same definition MUST yield exactly one committed result per definition type, using the `tx_idempotency` mechanism with `origin_module = 'recurring'` and `origin_entity_id` set to the definition id. For `transfer`-type definitions, the idempotency key scheme MUST distinguish the two legs of one occurrence (so both rows can exist under the unique index) while still resolving any replay of that occurrence to the *same* already-posted pair. Under no circumstance — including two concurrent or duplicate confirm calls racing on the same occurrence — MUST the system produce, retain, or expose an unbalanced state where one leg of a transfer is posted and the other is not. If either leg's insert cannot complete, the whole confirm attempt MUST leave zero rows for that occurrence, not one.

(Previously: single-leg idempotency key derived from the due date alone was sufficient because only expense-type, single-row posts existed; a 2-row transfer under the same key scheme and `on conflict do nothing` would silently drop the second leg.)

#### Scenario: Confirming the same expense due date twice yields one transaction
- GIVEN an `expense`-type definition due on a given date is confirmed successfully
- WHEN a retried or duplicate confirm call is made for that same due date
- THEN exactly one transaction exists for that occurrence

#### Scenario: Confirming the same transfer due date twice yields one pair, never a half-transfer
- GIVEN a `transfer`-type auto-pay definition due on a given date is confirmed successfully, producing one balanced pair under one `transfer_group_id`
- WHEN a retried or duplicate confirm call is made for that same due date
- THEN exactly two rows still exist for that occurrence (the same original pair), no new rows are created, `next_due_date` does not advance a second time, and at no point during or after the retry does exactly one row of that pair exist without its counterpart

#### Scenario: Two concurrent confirms of the same transfer occurrence never split the pair
- GIVEN a `transfer`-type auto-pay definition is due today and has not yet been confirmed
- WHEN two confirm calls for the same occurrence are issued concurrently
- THEN exactly one transfer pair (two rows, one `transfer_group_id`) is posted in total, `next_due_date` advances by exactly one period exactly once, and neither call can observe or leave behind a state with only one leg of the pair present

### Requirement: Over-Budget Confirmation Reuses the Existing Mechanism

Confirming a due `expense`-type recurring item that crosses its category's current-month budget limit MUST trigger the same non-blocking over-budget confirmation already used for manual entry (`evaluateBudgetImpact` / `OverBudgetDialog`), not a separate mechanism. Confirming the dialog MUST still post the transaction; cancelling it MUST post nothing. `transfer`-type definitions carry no category and MUST NOT trigger this dialog.

(Previously: applied uniformly since only expense-type definitions existed.)

#### Scenario: Confirming an over-limit expense recurring item shows the existing dialog
- GIVEN an `expense`-type recurring due for a category already at its budget limit
- WHEN the user confirms it
- THEN the existing `OverBudgetDialog` is shown before posting

#### Scenario: Transfer-type confirm never shows the budget dialog
- GIVEN a `transfer`-type auto-pay definition is due
- WHEN the user confirms it
- THEN no `OverBudgetDialog` is shown, regardless of the destination card's balance

## ADDED Requirements

### Requirement: Transfer Auto-Pay Never Auto-Executes

Confirming a `transfer`-type recurring item MUST require the same explicit user confirmation action as any other recurring item. No `transfer`-type definition MUST post automatically on its due date without that confirmation.

#### Scenario: Auto-pay due date arriving alone posts nothing
- GIVEN a `transfer`-type auto-pay definition's `next_due_date` is today
- WHEN the day passes with no confirm action
- THEN no transaction pair is created and the definition still shows as due
