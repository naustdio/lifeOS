# Delta for Finance Accounts

## ADDED Requirements

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
