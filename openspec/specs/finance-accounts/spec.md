# Finance Accounts Specification

## Purpose

Defines the eight account types, their type-specific detail data, derived (never stored) balances, and archiving lifecycle.

## Requirements

### Requirement: Eight Account Types
The system MUST support exactly eight account types: `cash`, `checking`, `credit_card`, `savings`, `liability`, `savings_goal`, `investment`, `loaned`. Each account MUST belong to a household, have a name, an `opening_balance_cents` (bigint, integer centavos), and a currency pinned to `MXN` via a database CHECK constraint. `investment` and `loaned` MUST both derive `class = 'asset'`.

#### Scenario: Account created with a valid type
- GIVEN a user creates an account with `type = checking`
- WHEN the account is saved
- THEN the account row is created scoped to the user's household with currency `MXN`

#### Scenario: Non-MXN currency is rejected
- GIVEN an insert attempts `currency != 'MXN'` on an account row
- WHEN the insert executes
- THEN the database CHECK constraint rejects it

#### Scenario: Investment account derives asset class
- GIVEN a user creates an account with `type = investment`
- WHEN the account is read back
- THEN `class = 'asset'`

#### Scenario: Loaned account derives asset class
- GIVEN a user creates an account with `type = loaned`
- WHEN the account is read back
- THEN `class = 'asset'`

#### Scenario: Unknown type rejected at the CHECK constraint
- GIVEN an insert attempts `type = 'crypto'` (or any value outside the eight)
- WHEN the insert executes
- THEN the database CHECK constraint rejects it before any trigger or RPC logic runs

#### Scenario: Unknown type rejected at RPC validation
- GIVEN `finance.create_account()` is called with a `p_type` outside the eight supported values
- WHEN the function executes
- THEN it raises an exception and no `accounts` row is written

### Requirement: Liability Account Detail
Every account of type `liability` MUST have an associated `account_liability_details` row containing `original_amount_cents`, `interest_rate`, `term_months`, `monthly_payment_cents`, and `start_date`.

#### Scenario: Liability account exposes loan detail
- GIVEN a `liability` account is created with its detail
- WHEN the account's detail record is queried
- THEN `original_amount_cents`, `interest_rate`, `term_months`, and `monthly_payment_cents` are all present

### Requirement: Savings-Goal Account Detail
Every account of type `savings_goal` MUST have an associated `account_goal_details` row containing `target_amount_cents` and `target_date`. Goal progress MUST be computed from the account's derived balance (i.e., real posted transfers into the goal account), not from a separate manually-updated counter.

#### Scenario: Goal progress reflects real transfers
- GIVEN a savings-goal account has `target_amount_cents = 50000` and has received posted transfers totaling 20000 centavos
- WHEN goal progress is computed
- THEN progress is derived as balance/target (40%), with no independent progress field to fall out of sync

### Requirement: Derived Balances
An account's balance MUST always be computed as `opening_balance_cents + sum(posted transaction amounts affecting this account)` via a database view (or equivalent read path), and MUST NOT be stored as a mutable column subject to independent updates.

#### Scenario: Balance reflects opening balance plus posted transactions
- GIVEN an account has `opening_balance_cents = 10000` and posted transactions of +500 and -200 centavos
- WHEN the account's balance is queried
- THEN the result is 10300

#### Scenario: Void transaction is excluded from balance
- GIVEN an account has a voided transaction of -300 centavos
- WHEN the account's balance is queried
- THEN the voided transaction is not included in the sum

### Requirement: Account Archiving
An account MUST be archivable (setting `archived_at`) rather than deleted. Archived accounts MUST be excluded from default active-account lists but their historical transactions MUST remain intact and queryable.

#### Scenario: Archived account hidden from active list, history preserved
- GIVEN an account with prior posted transactions is archived
- WHEN the active account list is displayed
- THEN the archived account does not appear, but its past transactions remain visible in transaction history and its balance remains computable

### Requirement: Investment Account Detail
Every account of type `investment` MUST have an associated `account_investment_details` row containing `cost_basis_cents` and `current_value_cents`, with `valued_on` recording the date of the last value entry. `current_value_cents` MUST be manually supplied by the user; the system MUST NOT fetch, infer, or extrapolate it from any external market-data source. When omitted at creation, `current_value_cents` MUST default to `cost_basis_cents` so rendimiento starts at zero, never NULL.

#### Scenario: Investment account created with an initial value
- GIVEN a user creates an `investment` account with `cost_basis_cents = 100000` and `current_value_cents = 105000`
- WHEN the account's detail record is queried
- THEN `cost_basis_cents = 100000` and `current_value_cents = 105000` are both present

#### Scenario: Investment account created without an initial value
- GIVEN a user creates an `investment` account with only `cost_basis_cents = 100000` supplied
- WHEN the account's detail record is queried
- THEN `current_value_cents = 100000` (defaulted to cost basis) and rendimiento computes to zero

#### Scenario: Updating an investment's current value
- GIVEN an existing `investment` account with `current_value_cents = 105000`
- WHEN the household member submits a new current value of `110000`
- THEN `current_value_cents` is updated to `110000`, `valued_on` is updated to the submission date, and no transaction row is created

#### Scenario: Investment value update rejects a non-investment account
- GIVEN an account of any type other than `investment`
- WHEN a current-value update is attempted against that account
- THEN the system rejects the update

### Requirement: Loaned Account Detail
Every account of type `loaned` MUST have an associated `account_loaned_details` row containing a required `counterparty_name`, `original_amount_cents`, and optional `term_months` and `expected_return_date`. A `loaned` account MUST NOT be created without a non-blank `counterparty_name`.

#### Scenario: Loaned account created with a counterparty name
- GIVEN a user creates a `loaned` account with `counterparty_name = "Juan"` and `original_amount_cents = 50000`
- WHEN the account's detail record is queried
- THEN `counterparty_name = "Juan"` is present alongside `original_amount_cents = 50000`

#### Scenario: Loaned account without a counterparty name is rejected
- GIVEN a user attempts to create a `loaned` account with no `counterparty_name` or a blank one
- WHEN the creation is submitted
- THEN the system rejects the creation and no account row is written

### Requirement: Loaned Account Balance-Sign Guard
A `loaned` account's `opening_balance_cents` MUST be zero or positive, representing money owed to the household. This guard MUST be the inverse of the existing `credit_card`/`liability` guard, which rejects a positive opening balance; the two guards MUST be enforced as separate, independent rules, and `loaned` MUST NOT be added to the liability guard's type list.

#### Scenario: Positive opening balance accepted for a loaned account
- GIVEN a user creates a `loaned` account with `opening_balance_cents = 50000`
- WHEN the account is saved
- THEN the creation succeeds

#### Scenario: Negative opening balance rejected for a loaned account
- GIVEN a user attempts to create a `loaned` account with `opening_balance_cents = -50000`
- WHEN the creation is submitted
- THEN the database rejects the creation with an error, independent of any client-side form validation

#### Scenario: Liability guard remains unaffected
- GIVEN a user creates a `credit_card` or `liability` account with a positive `opening_balance_cents`
- WHEN the creation is submitted
- THEN the database rejects it, exactly as before this change

### Requirement: Account-Type Knowledge Consistency
Every site in the system that encodes knowledge of the account-type domain (the type CHECK constraint, class-derivation logic, account-creation validation, TypeScript type unions and asset-set membership, API schemas and class computation, form/action branching, and the account read/list path) MUST recognize `investment` and `loaned` identically. No site MAY treat either new type as unknown, misclassify its `class`, or omit its detail data when read back.

#### Scenario: Read path returns detail for both new types
- GIVEN an `investment` account and a `loaned` account both exist
- WHEN the account list/read path is queried
- THEN each account's type-specific detail (cost basis/current value for investment; counterparty/amount for loaned) is present in the result, not silently dropped

#### Scenario: No site treats a new type as unrecognized
- GIVEN any code path that branches on account type (class derivation, RPC validation, TypeScript domain types, API schemas, forms, or the read path)
- WHEN it encounters `investment` or `loaned`
- THEN it handles the type explicitly and does not fall through to an "unknown type" error or a default classification

### Requirement: Balance and Summary Views Unaffected
`household_summary`, `account_balances`, and any other view or read path that derives figures from `class` rather than `type` MUST require no changes and MUST produce identical output for pre-existing accounts after this change is applied.

#### Scenario: Pre-existing account figures unchanged
- GIVEN a household with existing accounts of the original six types and posted transactions against them
- WHEN `household_summary` and `account_balances` are queried after the migration
- THEN the output is identical to the output before the migration

#### Scenario: New-type accounts contribute correctly to summaries
- GIVEN a household has an `investment` account and a `loaned` account, each with a derived balance
- WHEN `household_summary` and `account_balances` are queried
- THEN both accounts' balances are included exactly as any other `asset`-class account, with no view-level change required

### Requirement: Optional Credit Card Account Detail

A `credit_card` account MAY have an associated `account_credit_card_details` row (1:1, distinct from `account_liability_details`) containing `credit_limit_cents`, `statement_day` (int 1-31), `due_day` (int 1-31), and a minimum-payment rule. This table MUST NOT be required to create or edit a `credit_card` account. Absence of a detail row MUST remain valid at all times and MUST render a defined empty state, never a crash or `NaN`.

#### Scenario: Card created without detail remains fully functional
- GIVEN a user creates a `credit_card` account with no card detail
- WHEN the account is saved
- THEN the account lists, balances, and accepts transactions exactly as any other account, and `/cuentas` shows a defined empty state for due day and limit usage

#### Scenario: Card detail can be added after account creation
- GIVEN an existing `credit_card` account with no detail row
- WHEN the user edits it to set `credit_limit_cents`, `statement_day`, and `due_day`
- THEN an `account_credit_card_details` row is created and `/cuentas` now shows next due date and limit usage for that account

#### Scenario: Card detail can be removed
- GIVEN a `credit_card` account with an existing detail row
- WHEN the user removes the card terms
- THEN the detail row is deleted and the account reverts to the defined empty state without affecting its balance or transaction history

#### Scenario: Due day 31 resolves correctly in February
- GIVEN a card detail has `due_day = 31`
- WHEN the next due date is computed for a February cycle
- THEN the result clamps to the last calendar day of February, not an invalid date

### Requirement: Exceeding the Credit Limit Is a Visual Warning, Never a Block

A `credit_card` account whose derived balance exceeds its `credit_limit_cents` MUST surface a visual warning on `/cuentas` and the dashboard. This limit MUST NOT block transaction creation, transfers, or any other write against that account.

#### Scenario: Balance exceeding the limit shows a warning
- GIVEN a card has `credit_limit_cents = 500000` and a derived balance owed of 520000
- WHEN `/cuentas` renders that account
- THEN a visual over-limit warning is shown

#### Scenario: Exceeding the limit does not block a new transaction
- GIVEN a card's balance already exceeds its configured limit
- WHEN the user posts another transaction against that card
- THEN the transaction is accepted and posted with no error or block related to the limit
