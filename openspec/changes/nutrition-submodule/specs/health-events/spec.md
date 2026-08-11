# Delta for Health Events

## MODIFIED Requirements

### Requirement: Five Costed Event Types

The system MUST support exactly five costed health event types: medical study/exam, medical consultation, medication/treatment, vaccine, and nutrition (nutritionist consultation, labeled "Nutrición"). Logging an event of any of these types MUST post exactly one transaction to `finance.transactions` via the module-api seam with `origin_module = 'health'`. The `nutrition` type MUST be creatable only through `/nutricion`, never through the generic health event form.

(Previously: all five types, including nutrition, were creatable through the generic health event form)

#### Scenario: Each costed type posts a Finance transaction

- GIVEN a household member logs a health event of type medical study, consultation, medication, vaccine, or nutrition, with a cost amount
- WHEN the event is saved
- THEN a `finance.transactions` row exists with `origin_module = 'health'` and an amount matching the logged cost

#### Scenario: A nutritionist visit logs and posts under its own type

- GIVEN a household member logs a health event of type nutrition with a cost and provider name through `/nutricion`
- WHEN the event is saved
- THEN it is stored as a distinct type from consultation, labeled "Nutrición" wherever event types are shown or filtered
- AND exactly one `finance.transactions` row posts with `origin_module = 'health'`

#### Scenario: An unrecognized event type is rejected

- GIVEN a caller attempts to log a health event with a type outside the five costed types (and outside the non-costed vitals/profile records)
- WHEN the write is submitted
- THEN it is rejected before any row is written

#### Scenario: The generic form no longer offers nutrition

- GIVEN a household member opens the generic `/salud` event form
- WHEN they view the event type options
- THEN "Nutrición" is absent, and the other four costed types remain available

### Requirement: Editing or Deleting a Health Event Follows the Source

Editing a costed health event's cost or details MUST update the linked Finance transaction. Deleting a costed health event MUST void, not hard-delete, its linked transaction. Deleting a nutrition event MUST NOT cascade-delete its linked `vital_readings`; instead, each linked reading's `event_id` MUST be set to null, keeping the reading itself intact and visible in `/signos`. Deleting a nutrition event MUST delete its linked visit photos and their storage objects.

(Previously: deletion behavior did not address nutrition's visit-linked readings or photos, since neither existed)

#### Scenario: Editing a logged cost updates the transaction

- GIVEN a costed health event has a linked Finance transaction
- WHEN the household member edits the event's amount
- THEN the linked transaction reflects the new amount under the same origin identity

#### Scenario: Deleting an event voids its transaction

- GIVEN a costed health event has a linked Finance transaction
- WHEN the household member deletes the event
- THEN the linked transaction transitions to void and is never hard-deleted

#### Scenario: Deleting a nutrition visit unlinks its readings instead of deleting them

- GIVEN a nutrition event has linked `vital_readings`
- WHEN the household member deletes the event
- THEN each linked reading's `event_id` becomes null and the reading remains visible in `/signos`

#### Scenario: Deleting a nutrition visit deletes its photos

- GIVEN a nutrition event has linked visit photos
- WHEN the household member deletes the event
- THEN the linked photo rows and their storage objects are deleted

## Key Learnings

1. Deletion semantics diverge by relationship: Finance transactions are voided (soft), vital readings are unlinked (kept), photos are hard-deleted (owner-private data with no reuse case).
