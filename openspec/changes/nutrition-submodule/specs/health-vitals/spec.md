# Delta for Health Vitals

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Vitals Render as a Trend

The system MUST render a metric type's entries as a real chart over time, not a flat list. By default the chart MUST render the metric's full history; it MUST NOT truncate to a fixed recent time window.

(Previously: entries rendered as a chronological flat list, with trend rendering deferred)

#### Scenario: Weight entries render as a chart

- GIVEN a household member has logged weight entries across several months
- WHEN the vitals view is opened for that metric
- THEN the entries render as a chart, not a list

#### Scenario: The chart defaults to full history

- GIVEN a household member has logged entries for a metric spanning more than a year
- WHEN the trend chart opens for that metric with no filter applied
- THEN every logged entry is represented on the chart, none excluded by a default time window

## Key Learnings

1. The visit-link column is additive and nullable, so every pre-existing standalone reading keeps working unchanged.
2. Defaulting the chart to full history (no time-window truncation) removes a client-side data-loss risk from earlier deferred trend rendering.
