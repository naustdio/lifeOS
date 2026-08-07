# Delta for Finance Module API

## ADDED Requirements

### Requirement: createAccount Supports Investment and Loaned Branches
`createAccount()` MUST accept two additional discriminated-union input branches, `investment` and `loaned`, alongside the six existing types. Each branch MUST require its type-specific detail fields (`investment`: `cost_basis_cents`, optional `current_value_cents`; `loaned`: required `counterparty_name`, `original_amount_cents`, optional `term_months`/`expected_return_date`) and MUST reject a call whose detail fields do not match its declared type.

#### Scenario: createAccount accepts a well-formed investment input
- GIVEN a caller invokes `createAccount()` with `type = investment` and a valid `cost_basis_cents`
- WHEN the call completes
- THEN the account and its `account_investment_details` row are created and the response reports `class = 'asset'`

#### Scenario: createAccount accepts a well-formed loaned input
- GIVEN a caller invokes `createAccount()` with `type = loaned`, a `counterparty_name`, and a non-negative `opening_balance_cents`
- WHEN the call completes
- THEN the account and its `account_loaned_details` row are created and the response reports `class = 'asset'`

#### Scenario: createAccount rejects an unrecognized type at the RPC layer
- GIVEN a caller invokes `createAccount()` with a `type` value outside the eight supported types
- WHEN the call is submitted, bypassing client-side validation
- THEN the RPC/database layer rejects the call independent of any Zod or UI validation

#### Scenario: createAccount rejects loaned input missing counterparty_name
- GIVEN a caller invokes `createAccount()` with `type = loaned` and no `counterparty_name`
- WHEN the call is submitted
- THEN it is rejected before any row is written

### Requirement: Investment Current-Value Update Seam
The Finance API MUST expose a seam function that updates only `current_value_cents` (and `valued_on`) on an `investment` account's detail row. This seam MUST NOT accept or write to any other account field, MUST NOT create a transaction or posted movement, and MUST NOT be usable against any account whose type is not `investment`.

#### Scenario: Updating current value does not post a transaction
- GIVEN an `investment` account exists
- WHEN its current value is updated via the seam
- THEN `current_value_cents` and `valued_on` change, and no row is added to `finance.transactions`

#### Scenario: Seam rejects non-investment accounts
- GIVEN a `savings` account exists
- WHEN the current-value-update seam is called against that account's id
- THEN the call is rejected because the account is not of type `investment`
