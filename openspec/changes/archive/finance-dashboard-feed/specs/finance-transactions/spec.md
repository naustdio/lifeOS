# Delta for Finance Transactions

## ADDED Requirements

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
