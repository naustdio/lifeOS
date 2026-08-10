# Health Vitals Specification

## Purpose

Periodic, non-costed vital metrics (e.g., weight, blood pressure, glucose) captured as a time series for trend reading, entirely independent of Finance.

## Requirements

### Requirement: Vital Metrics Never Create a Finance Transaction
Logging a vital metric entry MUST NOT create any `finance.transactions` row, regardless of metric type.

#### Scenario: Logging a vital creates no Finance row
- GIVEN a household member logs a weight, blood-pressure, or glucose reading
- WHEN the entry is saved
- THEN no `finance.transactions` row is created as a result

### Requirement: Vital Entries Form a Time Series
Each vital metric entry MUST be timestamped and stored so that multiple entries of the same metric type accumulate into a queryable time series per household member.

#### Scenario: Multiple entries accumulate
- GIVEN a household member logs three weight entries on three different dates
- WHEN their weight history is queried
- THEN all three entries are returned ordered by date

### Requirement: Vitals Render as a Trend
The system MUST be able to render a metric type's entries as a chronological trend (values over time), not merely a flat list requiring client-side reconstruction.

#### Scenario: Weight entries render as a trend
- GIVEN a household member has logged weight entries across several months
- WHEN the vitals view is opened for that metric
- THEN the entries render in chronological order suitable for trend display

### Requirement: Vitals Are Not Recurring Financial Events
A vital metric entry MUST NOT be schedulable through `finance.recurring_transactions` or any Finance recurrence mechanism; recurrence, where offered for vitals reminders, MUST remain entirely outside the Finance recurring engine.

#### Scenario: Vitals recurrence does not touch Finance
- GIVEN a household member sets up a repeating vital-logging reminder
- WHEN the reminder cadence is inspected
- THEN it has no representation in `finance.recurring_transactions`
