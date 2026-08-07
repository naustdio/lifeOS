# Finance Recurring Specification

## Purpose

Defines recurring expense definitions — a single `next_due_date` cursor per definition, a reminder-only due/overdue surface, and explicit confirm/discard actions that post through the existing Finance seam. The ledger never contains money the owner did not assert moved: recurring definitions remind, they never auto-post.

## Requirements

### Requirement: Recurring Definitions Are Expense-Only, One of Four Frequencies, Never Auto-Posting
A recurring definition MUST have a `type` discriminator of either `expense` or `transfer`. An `expense`-type definition MUST reference exactly one expense-kind category and `to_account_id` MUST be `NULL`. A `transfer`-type definition MUST reference a source account and a `to_account_id`, MUST have `category_id = NULL`, and MUST carry a fixed amount configured by the user — never the destination account's live balance. Every definition, regardless of type, MUST have `frequency` set to exactly one of `monthly`, `weekly`, `biweekly`, or `yearly`. Creating a definition MUST NOT insert a transaction, and the arrival of `next_due_date` on its own (without an explicit confirm) MUST NOT insert a transaction.

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

### Requirement: Single Next-Due Cursor, Not a Queue
Each recurring definition MUST carry exactly one `next_due_date` cursor. An unconfirmed due date MUST continue to read as overdue by the number of elapsed days, and MUST NOT multiply into multiple pending occurrence rows regardless of how long it remains unconfirmed.

#### Scenario: A long-overdue item reads as one overdue occurrence
- GIVEN a monthly definition's `next_due_date` was 12 days ago and remains unconfirmed
- WHEN the due-items list is read
- THEN exactly one entry is shown for that definition, reading as overdue by 12 days

#### Scenario: No backlog accumulates across multiple missed periods
- GIVEN a monthly definition's `next_due_date` was 3 periods ago and remains unconfirmed
- WHEN the due-items list is read
- THEN exactly one entry is shown for that definition, not three

### Requirement: Confirm Atomically Posts and Advances the Cursor
Confirming a due recurring item MUST, within one transactional unit, advance `next_due_date` by exactly one period AND post the definition's type-appropriate result: for `expense` type, exactly one `finance.transactions` row with `recurring_id` set to the definition's id; for `transfer` type, exactly two opposite-signed rows sharing one `transfer_group_id`, both with `recurring_id` set to the definition's id and no category. This MUST NOT be exposed as separate client calls that could partially apply, and for `transfer` type there MUST be no code path that posts only one of the two rows.

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

### Requirement: Confirm Pre-Fills the Original Due Date, Editable Before Posting
Confirming MUST pre-fill the transaction's date with the definition's overdue `next_due_date` at the time of confirmation, not the current date. Amount, description, and date MUST all remain editable by the user before the transaction posts.

#### Scenario: Confirm defaults to the original due date
- GIVEN a definition was due 12 days ago and remains unconfirmed
- WHEN the user opens the confirm flow
- THEN the transaction date field pre-fills with the original `next_due_date`, not today

#### Scenario: User edits amount, description, and date before posting
- GIVEN the confirm flow is open with pre-filled amount, description, and date
- WHEN the user changes any of those fields and submits
- THEN the posted transaction reflects the edited values

### Requirement: Discard Advances the Cursor Without Posting
Discarding a due recurring item MUST advance `next_due_date` by exactly one period and MUST create zero transactions.

#### Scenario: Discard advances the cursor with no transaction
- GIVEN a monthly definition due today
- WHEN the user discards it
- THEN no transaction is created AND `next_due_date` is now one month later

### Requirement: Idempotent Confirmation Per Due Date Never Produces a Half-Transfer
Confirming the same due date for the same definition MUST yield exactly one committed result per definition type, using the `tx_idempotency` mechanism with `origin_module = 'recurring'` and `origin_entity_id` set to the definition id. For `transfer`-type definitions, the idempotency key scheme MUST distinguish the two legs of one occurrence (so both rows can exist under the unique index) while still resolving any replay of that occurrence to the *same* already-posted pair. Under no circumstance — including two concurrent or duplicate confirm calls racing on the same occurrence — MUST the system produce, retain, or expose an unbalanced state where one leg of a transfer is posted and the other is not. If either leg's insert cannot complete, the whole confirm attempt MUST leave zero rows for that occurrence, not one.

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

#### Scenario: Confirming an over-limit expense recurring item shows the existing dialog
- GIVEN an `expense`-type recurring due for a category already at its budget limit
- WHEN the user confirms it
- THEN the existing `OverBudgetDialog` is shown before posting

#### Scenario: Confirming the dialog posts, cancelling posts nothing
- GIVEN the over-budget dialog is showing for a due recurring item
- WHEN the user confirms the dialog
- THEN the transaction is posted and `next_due_date` advances
- WHEN instead the user cancels the dialog
- THEN no transaction is posted and `next_due_date` does not advance

#### Scenario: Transfer-type confirm never shows the budget dialog
- GIVEN a `transfer`-type auto-pay definition is due
- WHEN the user confirms it
- THEN no `OverBudgetDialog` is shown, regardless of the destination card's balance

### Requirement: Tenant Isolation on Recurring Definitions and Due Items
`finance.recurring_transactions` MUST enforce RLS via `core.is_member(household_id)` for SELECT/INSERT/UPDATE/DELETE. If due items are exposed through a view, that view MUST be defined with `security_invoker = true` so it never bypasses the underlying RLS of `finance.recurring_transactions`.

#### Scenario: Non-member session sees zero recurring definitions
- GIVEN a user who is not a member of household H
- WHEN that user's session queries `finance.recurring_transactions` filtered to household H
- THEN zero rows are returned

#### Scenario: Non-member session sees zero due items through the view
- GIVEN a user who is not a member of household H, and H has at least one overdue recurring definition
- WHEN that user's session queries the due-items view for household H
- THEN zero rows are returned, confirming the view does not bypass RLS

### Requirement: Pause Freezes, Resume Recomputes to the Next Future Occurrence
Pausing a recurring definition (`active = false`) MUST freeze it: it MUST NOT appear as due while paused, and its `next_due_date` MUST NOT advance while paused. Resuming a paused definition MUST recompute `next_due_date` to the next occurrence strictly after today; it MUST NOT surface a backlog of dates accrued while the definition was paused.

#### Scenario: Paused definition never appears as due
- GIVEN a monthly definition is paused with an overdue `next_due_date`
- WHEN the due-items list is read
- THEN the paused definition does not appear

#### Scenario: Resuming sets the cursor to the next future occurrence, not a backlog
- GIVEN a monthly definition was paused for 4 months with an overdue `next_due_date` from before the pause
- WHEN the user resumes it today
- THEN `next_due_date` becomes the next future occurrence date, and no overdue backlog is shown

### Requirement: Delete Hard-Deletes the Definition Without Touching History
Deleting a recurring definition MUST hard-delete its row. Already-posted transactions that reference it via `recurring_id` MUST be unaffected: they remain in transaction history and their `recurring_id` becomes `NULL`. Deletion MUST NOT be blocked by existing transaction references and MUST NOT cascade-delete those transactions.

#### Scenario: Deleting a definition preserves its posted transactions
- GIVEN a recurring definition has two previously posted transactions with `recurring_id` set to it
- WHEN the user deletes the definition
- THEN the definition row no longer exists AND both transactions remain in history with `recurring_id` set to `NULL`

#### Scenario: Deletion is never blocked by existing references
- GIVEN a recurring definition has posted transactions referencing it
- WHEN the user attempts to delete the definition
- THEN the delete succeeds without requiring the referencing transactions to be modified first

### Requirement: Due-Item Reminder Is Visible on Mobile
The Home screen MUST show a due-items banner when one or more recurring items are due or overdue, and the `(app)/recurrentes/` list, editor, and confirm/discard flows MUST remain usable at a 375px viewport width in both light and dark themes.

#### Scenario: Home banner appears when items are due
- GIVEN at least one recurring definition is due or overdue
- WHEN the Home screen is rendered
- THEN a banner reports the due-item count

#### Scenario: Recurring screen usable at minimum supported width
- GIVEN the `(app)/recurrentes/` screen is rendered at a 375px viewport
- WHEN the user views the list, opens the editor, or triggers confirm/discard
- THEN every interactive element is reachable and legible without horizontal scrolling, in both light and dark themes

### Requirement: Transfer Auto-Pay Never Auto-Executes

Confirming a `transfer`-type recurring item MUST require the same explicit user confirmation action as any other recurring item. No `transfer`-type definition MUST post automatically on its due date without that confirmation.

#### Scenario: Auto-pay due date arriving alone posts nothing
- GIVEN a `transfer`-type auto-pay definition's `next_due_date` is today
- WHEN the day passes with no confirm action
- THEN no transaction pair is created and the definition still shows as due

### Requirement: Bounded Multi-Occurrence Projection

The domain layer MUST expose a pure `projectOccurrences(definitions, fromDate, days)` function, distinct from the existing single-occurrence `nextFutureDueDate()`, that rolls each active definition forward from `fromDate` across `days` using the existing `nextDueDate()` cursor logic. It MUST accept a bounded day-range and enforce a hard per-definition iteration ceiling so no definition can generate unbounded occurrences regardless of frequency. It MUST exclude paused (`active = false`) definitions and MUST NOT write or mutate any `next_due_date` value. This projection covers `expense`-type definitions only, per `finance-calendar`'s confirmed v1 scope of projecting recurring outflows, not transfers.

#### Scenario: Function rolls a definition forward within the window
- GIVEN an active monthly recurring definition and a 90-day window
- WHEN `projectOccurrences` is called
- THEN it returns each occurrence date for that definition falling within the window, computed via the existing `nextDueDate()` logic

#### Scenario: Iteration ceiling bounds high-frequency definitions
- GIVEN an active weekly recurring definition and a 90-day window
- WHEN `projectOccurrences` is called
- THEN the number of returned occurrences for that definition does not exceed the explicit per-definition iteration ceiling

#### Scenario: Paused definitions are excluded from projection
- GIVEN a definition with `active = false` and a `next_due_date` inside the window
- WHEN `projectOccurrences` is called with that definition in the input set
- THEN no occurrence is returned for that definition

#### Scenario: Projection never mutates stored state
- GIVEN a set of active recurring definitions
- WHEN `projectOccurrences` is called
- THEN no definition's persisted `next_due_date` is read-modified-written; the function is pure and side-effect free
