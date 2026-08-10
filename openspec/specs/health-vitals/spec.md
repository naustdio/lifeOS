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

### Requirement: Body-Composition Metrics Are Loggable

The system MUST support logging body-composition vital readings beyond weight: body fat, muscle mass, six skinfold measurements (biceps, triceps, subscapular, iliac crest, supraspinal, abdominal), and four circumference measurements (waist, hip, thigh, contracted arm). Body fat and muscle mass readings MUST support both a percentage value and a kilogram value being recorded, whichever internal metric shape is chosen. Skinfold readings MUST be recorded in millimeters; circumference readings MUST be recorded in centimeters. Each body-composition metric type participates in the existing vitals requirements (time series, trend rendering, no Finance transaction, no Finance recurrence) the same as any other vital metric.

#### Scenario: A body-composition reading accumulates as a time series

- GIVEN a household member logs body fat, muscle mass, a skinfold, or a circumference reading on several different dates
- WHEN that metric's history is queried
- THEN all entries are returned ordered by date, per metric type

#### Scenario: Body fat and muscle mass capture both percentage and mass

- GIVEN a household member records a body-fat or muscle-mass measurement from a source reporting both a percentage and a kilogram value
- WHEN both values are entered for the same reading
- THEN both are captured and individually retrievable, with neither overwriting the other

#### Scenario: Skinfold and circumference values keep their correct unit

- GIVEN a household member logs a skinfold measurement in millimeters or a circumference measurement in centimeters
- WHEN the reading is saved and later retrieved
- THEN its value reflects the unit appropriate to that measurement type, not a mismatched one
