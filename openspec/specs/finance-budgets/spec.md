# Finance Budgets Specification

## Purpose

Defines opt-in monthly spending limits per expense category, derived current-month progress, and non-blocking over-budget confirmation at transaction entry and edit time.

## Requirements

### Requirement: Budgets Are Opt-In and Expense-Only
A budget MUST reference exactly one category and MUST NOT exist until a user explicitly sets a limit for that category. The referenced category MUST have `kind = 'expense'`; this MUST be rejected both by the UI category picker and by a database trigger, so the invariant holds even if the UI is bypassed.

#### Scenario: No budget exists until explicitly set
- GIVEN a category has never had a budget configured
- WHEN the budgets screen is opened
- THEN that category shows as not budgeted, with no limit and no progress bar

#### Scenario: UI hides income categories from the budget picker
- GIVEN a user opens the category picker on the budgets screen
- WHEN the list is rendered
- THEN only categories with `kind = 'expense'` are selectable

#### Scenario: Database trigger rejects a budget on an income category
- GIVEN a client bypasses the UI and issues a direct insert into `finance.budgets` referencing an income-kind category
- WHEN the insert is attempted
- THEN the `BEFORE INSERT` trigger rejects it and no row is created

### Requirement: One Budget Per Category
A household MUST have at most one budget row per category. Setting a new limit on an already-budgeted category MUST update the existing row, not create a second one.

#### Scenario: Second budget attempt on the same category updates instead of duplicating
- GIVEN category "Comida" already has a budget of 5000 centavos
- WHEN the user sets a new limit of 6000 centavos on "Comida"
- THEN the existing budget row is updated to 6000 centavos and no second row exists

### Requirement: Budgets Can Be Removed
A user MUST be able to remove a budget entirely, not only edit its limit. Removing a budget MUST delete the `finance.budgets` row. After removal, the category reverts to its unbudgeted state (no limit, no progress bar) and can be re-budgeted later as a fresh opt-in.

#### Scenario: Removing a budget deletes the row
- GIVEN category "Comida" has a budget of 5000 centavos
- WHEN the user removes the budget for "Comida"
- THEN the `finance.budgets` row for "Comida" no longer exists

#### Scenario: Removed budget category shows as unbudgeted again
- GIVEN the budget for "Comida" was just removed
- WHEN the budgets screen is opened
- THEN "Comida" shows as not budgeted, with no limit and no progress bar, and can be budgeted again

### Requirement: Derived Current-Month Progress, No Rollover
`finance.budget_progress` MUST report spend as the sum of `posted`, non-`transfer`, `expense`-type transactions for that category with `occurred_on` in the current calendar month, computed on read with no stored spent column. On the first day of a new month, progress MUST reflect only that month's transactions, with no explicit reset job and no carry-forward of the prior month's spend.

#### Scenario: Progress reflects only current-month spend
- GIVEN a budgeted category has one posted expense of 2000 centavos this month and one posted expense of 9000 centavos last month
- WHEN `budget_progress` is read for that category
- THEN spend reads 2000 centavos, excluding the prior month's transaction

#### Scenario: Progress resets implicitly on month change
- GIVEN a category was over budget in the previous month
- WHEN the calendar rolls to the 1st of a new month with no new transactions yet
- THEN `budget_progress` for that category reads 0 spent against the same limit

### Requirement: Tenant Isolation on Budgets and Progress
`finance.budgets` MUST enforce RLS via `core.is_member(household_id)` for SELECT/INSERT/UPDATE. `finance.budget_progress` MUST be defined with `security_invoker = true` so it never bypasses the underlying RLS of `finance.budgets` or `finance.transactions`.

#### Scenario: Non-member session sees zero budget rows
- GIVEN a user who is not a member of household H
- WHEN that user's session queries `finance.budgets` filtered to household H
- THEN zero rows are returned

#### Scenario: Non-member session sees zero progress rows through the view
- GIVEN a user who is not a member of household H, and H has a budgeted category with spend
- WHEN that user's session queries `finance.budget_progress` for household H
- THEN zero rows are returned, confirming the view does not bypass RLS

### Requirement: Archived Category Leaves Its Budget Row Untouched
When a budgeted category is archived via its existing soft-delete (`archived_at`), the associated `finance.budgets` row MUST NOT be deleted, modified, or flagged. The budget MUST simply stop being offered as an active option in the UI, because the category itself no longer appears in active-category pickers.

#### Scenario: Archiving a budgeted category does not touch the budget row
- GIVEN category "Comida" is budgeted at 5000 centavos
- WHEN "Comida" is archived (`archived_at` set)
- THEN the `finance.budgets` row for "Comida" still exists in the database, unchanged

#### Scenario: Archived category's budget no longer appears as an active option
- GIVEN "Comida" is archived and was previously budgeted
- WHEN the user opens the budgets screen
- THEN "Comida" no longer appears in the list of categories offered for budgeting, consistent with archived categories being excluded from all active-category pickers

### Requirement: Non-Blocking Over-Budget Confirmation on Entry
When recording a new expense transaction whose amount, combined with the category's current-month spend, would meet or exceed that category's budget limit, the entry form MUST show a confirmation before submitting. Confirming MUST record the transaction unchanged; cancelling MUST record nothing. The check MUST NOT block or alter what the ledger accepts.

#### Scenario: Confirmation shown when the new expense crosses the limit
- GIVEN category "Comida" has a 5000-centavo limit and 4000 centavos already spent this month
- WHEN the user enters a new expense of 2000 centavos in "Comida" and submits
- THEN a confirmation is shown before the transaction is recorded

#### Scenario: Confirming records the transaction unchanged
- GIVEN the over-budget confirmation is showing for a 2000-centavo expense
- WHEN the user confirms
- THEN the transaction is recorded with the entered amount and category, unmodified by the check

#### Scenario: Cancelling records nothing
- GIVEN the over-budget confirmation is showing for a 2000-centavo expense
- WHEN the user cancels
- THEN no transaction is recorded

#### Scenario: No confirmation when the expense stays under the limit
- GIVEN category "Comida" has a 5000-centavo limit and 1000 centavos already spent this month
- WHEN the user enters a new expense of 500 centavos in "Comida"
- THEN the transaction is recorded immediately with no confirmation prompt

### Requirement: Over-Budget Check Re-Runs on Edit
Editing an existing transaction's amount or category MUST re-run the same over-budget check against the (possibly new) target category's post-edit spend. The same confirm/cancel behavior applies: confirming saves the edit unchanged, cancelling discards the edit.

#### Scenario: Increasing an amount past the limit on edit triggers confirmation
- GIVEN a posted expense of 1000 centavos in "Comida", which has a 5000-centavo limit and 4500 centavos total spent this month including that transaction
- WHEN the user edits the amount to 2000 centavos
- THEN a confirmation is shown before the edit is saved

#### Scenario: Changing category to a budgeted category past its limit triggers confirmation
- GIVEN an expense currently in an unbudgeted category
- WHEN the user changes its category to a budgeted category whose spend would exceed the limit with this transaction included
- THEN a confirmation is shown before the edit is saved

### Requirement: Voided and Transfer Transactions Excluded From Spend
`finance.budget_progress` MUST exclude transactions with `status = 'void'` and MUST exclude `type = 'transfer'` rows from spend calculations, matching the existing exclusion rules for balances and income/expense reporting.

#### Scenario: Voided expense does not count toward spend
- GIVEN a budgeted category has a posted expense of 3000 centavos this month
- WHEN that transaction is voided
- THEN `budget_progress` for the category no longer includes the 3000 centavos

#### Scenario: Transfer does not count toward spend
- GIVEN a budgeted category is never a transfer target, but a transfer transaction is mistakenly tagged with that category_id
- WHEN `budget_progress` is computed
- THEN the transfer amount is excluded from spend
