# Delta for Finance Recurring

## ADDED Requirements

### Requirement: Bounded Multi-Occurrence Projection

The domain layer MUST expose a pure `projectOccurrences(definitions, fromDate, days)` function, distinct from the existing single-occurrence `nextFutureDueDate()`, that rolls each active definition forward from `fromDate` across `days` using the existing `nextDueDate()` cursor logic. It MUST accept a bounded day-range and enforce a hard per-definition iteration ceiling so no definition can generate unbounded occurrences regardless of frequency. It MUST exclude paused (`active = false`) definitions and MUST NOT write or mutate any `next_due_date` value.

#### Scenario: Function rolls a definition forward within the window
- GIVEN an active monthly recurring definition and a 90-day window
- WHEN `projectOccurrences` is called
- THEN it returns each occurrence date for that definition falling within the window, computed via the existing `nextDueDate()` logic

#### Scenario: Iteration ceiling bounds high-frequency definitions
- GIVEN an active weekly recurring definition and a 90-day window
- WHEN `projectOccurrences` is called
- THEN the number of returned occurrences for that definition does not exceed the explicit per-definition iteration ceiling

#### Scenario: Paused definitions are excluded from projection
- GIVEN a definition with `active = false` and a `next_due_date` inside the window
- WHEN `projectOccurrences` is called with that definition in the input set
- THEN no occurrence is returned for that definition

#### Scenario: Projection never mutates stored state
- GIVEN a set of active recurring definitions
- WHEN `projectOccurrences` is called
- THEN no definition's persisted `next_due_date` is read-modified-written; the function is pure and side-effect free
