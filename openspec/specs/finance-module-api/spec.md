# Finance Module API Specification

## Purpose

Defines the public, server-side cross-module write seam (`recordTransaction`, `updateOriginTransaction`, `voidTransaction`, `findByOrigin`) that other modules use to post money movements atomically and idempotently, without touching `finance.*` tables directly.

## Requirements

### Requirement: Public API Is the Only Cross-Module Write Surface
Calling modules MUST interact with Finance exclusively through `modules/finance/api` (`recordTransaction`, `updateOriginTransaction`, `voidTransaction`, `findByOrigin`). Calling modules MUST NOT write to `finance.*` tables directly, and database write grants on `finance.*` for the `anon`/`authenticated` Postgres roles MUST be revoked so only the server-side seam can write.

#### Scenario: Direct write to finance tables is rejected
- GIVEN a calling module attempts a direct PostgREST/`supabase-js` insert into `finance.transactions`
- WHEN the write executes
- THEN it is rejected because `anon`/`authenticated` roles have no direct write grant on `finance.*`

### Requirement: Server-Side, Atomic Execution
`recordTransaction`, `updateOriginTransaction`, and `voidTransaction` MUST execute server-side (Server Action, Route Handler, or a `SECURITY DEFINER` Postgres function with a pinned `search_path`), performing all writes for a single call within one Postgres transaction.

#### Scenario: Partial failure leaves no partial state
- GIVEN a call to `recordTransaction` fails partway through its write
- WHEN the failure occurs
- THEN no partial transaction row is left behind (the write is all-or-nothing)

### Requirement: Idempotent recordTransaction
`recordTransaction` MUST enforce uniqueness on `(origin_module, origin_entity_id, idempotency_key)`. A retried call with the same tuple MUST NOT create a second transaction.

#### Scenario: Retried call creates exactly one transaction
- GIVEN a calling module invokes `recordTransaction` twice with the same `origin`, `entityId`, and `idempotencyKey` (e.g., after a network retry)
- WHEN both calls complete
- THEN exactly one transaction exists for that `(origin_module, origin_entity_id, idempotency_key)` tuple

### Requirement: Origin as a Soft Reference
`origin_entity_id` MUST be stored as a soft reference (no foreign key into a calling module's schema). Finance MUST NOT read a calling module's tables directly.

#### Scenario: Finance never queries the calling module's schema
- GIVEN a transaction originated from `shopping_list`
- WHEN Finance code processes that transaction
- THEN it accesses only `origin_module` and `origin_entity_id` as opaque values, never querying `shopping_list.*` tables

### Requirement: Module-Originated Transactions Post Immediately
A transaction created via `recordTransaction` from a calling module MUST be created with `status = posted` immediately; there MUST be no approval/review queue step in this cycle.

#### Scenario: Module-originated transaction is posted, not pending
- GIVEN a calling module invokes `recordTransaction`
- WHEN the call succeeds
- THEN the resulting transaction has `status = posted`

### Requirement: Update and Void Follow the Source Record
Editing a source record in a calling module MUST call `updateOriginTransaction` with the origin reference and a patch. Deleting a source record MUST call `voidTransaction` with the origin reference and a reason; this MUST follow the same never-hard-delete rule as manual transactions.

#### Scenario: Editing the source record updates the linked transaction
- GIVEN a `shopping_list` checkout previously recorded a Finance transaction
- WHEN the source checkout record is edited and `updateOriginTransaction` is called
- THEN the linked Finance transaction reflects the patch while keeping the same origin identity

#### Scenario: Deleting the source record voids, not deletes, the linked transaction
- GIVEN a `shopping_list` checkout previously recorded a Finance transaction
- WHEN the source record is deleted and `voidTransaction` is called
- THEN the linked Finance transaction transitions to `status = void` and is never hard-deleted

### Requirement: Origin Module Domain Includes Recurring
The `origin_module` value accepted by the seam MUST be one of `manual`, `shopping_list`, `car_control`, or `recurring`. `recurring` MUST behave identically to any other calling-module origin for uniqueness, soft-reference, and immediate-posting purposes: it is not a special case in the seam's write path.

#### Scenario: Recurring confirmation posts through the seam like any other module
- GIVEN the recurring confirm flow invokes the write path with `origin_module = 'recurring'` and `origin_entity_id` set to the definition id
- WHEN the call succeeds
- THEN the resulting transaction has `origin_module = 'recurring'`, `status = posted`, and participates in the same `(origin_module, origin_entity_id, idempotency_key)` uniqueness as any other origin

#### Scenario: An unrecognized origin_module value is still rejected
- GIVEN a write attempts `origin_module` set to a value outside `manual`, `shopping_list`, `car_control`, `recurring`
- WHEN the write executes
- THEN it is rejected by the database CHECK constraint

### Requirement: findByOrigin Returns Null, Not an Error, When Absent
`findByOrigin` MUST return `null` when no transaction matches the given origin reference, rather than throwing.

#### Scenario: No matching transaction returns null
- GIVEN an origin reference with no recorded transaction
- WHEN `findByOrigin` is called
- THEN it resolves to `null`

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
