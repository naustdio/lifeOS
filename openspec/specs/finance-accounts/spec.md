# Finance Accounts Specification

## Purpose

Defines the six account types, their type-specific detail data, derived (never stored) balances, and archiving lifecycle.

## Requirements

### Requirement: Six Account Types
The system MUST support exactly six account types: `cash`, `checking`, `credit_card`, `savings`, `liability`, `savings_goal`. Each account MUST belong to a household, have a name, an `opening_balance_cents` (bigint, integer centavos), and a currency pinned to `MXN` via a database CHECK constraint.

#### Scenario: Account created with a valid type
- GIVEN a user creates an account with `type = checking`
- WHEN the account is saved
- THEN the account row is created scoped to the user's household with currency `MXN`

#### Scenario: Non-MXN currency is rejected
- GIVEN an insert attempts `currency != 'MXN'` on an account row
- WHEN the insert executes
- THEN the database CHECK constraint rejects it

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
