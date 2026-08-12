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

### Requirement: A Vital Reading May Carry an Optional Visit Link

A `health.vital_readings` row MAY carry an optional `event_id` referencing a `health.events` row, linking the reading to the nutrition visit it was captured during. A reading with no visit link MUST behave identically to today: it remains a standalone time-series entry.

#### Scenario: A reading is linked to the visit that captured it
- GIVEN a household member records a weight reading as part of a `/nutricion` visit
- WHEN the reading is saved
- THEN its `event_id` matches that visit's event id

#### Scenario: A standalone reading has no visit link
- GIVEN a household member logs a weight reading outside any visit (e.g., via `/signos`)
- WHEN the reading is saved
- THEN its `event_id` is null and it appears in the metric's time series exactly as before

#### Scenario: Unlinking a reading does not remove it from its time series
- GIVEN a reading's `event_id` is set to null (e.g., after its source visit is deleted)
- WHEN that metric's history is queried
- THEN the reading still appears, ordered correctly among the other entries

### Requirement: Vitals Render as a Trend
The system MUST render a metric type's entries as a real chart over time, not a flat list. By default the chart MUST render the metric's full history; it MUST NOT truncate to a fixed recent time window.

#### Scenario: Weight entries render as a chart
- GIVEN a household member has logged weight entries across several months
- WHEN the vitals view is opened for that metric
- THEN the entries render as a chart, not a list

#### Scenario: The chart defaults to full history
- GIVEN a household member has logged entries for a metric spanning more than a year
- WHEN the trend chart opens for that metric with no filter applied
- THEN every logged entry is represented on the chart, none excluded by a default time window

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
