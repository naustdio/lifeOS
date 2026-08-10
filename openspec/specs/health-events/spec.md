# Health Events Specification

## Purpose

Costed health activity — medical studies/exams, consultations, medications/treatments, vaccines — logged as health events that post to Finance through the existing module-api seam, one-off or recurring.

## Requirements

### Requirement: Five Costed Event Types
The system MUST support exactly five costed health event types: medical study/exam, medical consultation, medication/treatment, vaccine, and nutrition (nutritionist consultation, labeled "Nutrición"). Logging an event of any of these types MUST post exactly one transaction to `finance.transactions` via the module-api seam with `origin_module = 'health'`.

#### Scenario: Each costed type posts a Finance transaction
- GIVEN a household member logs a health event of type medical study, consultation, medication, vaccine, or nutrition, with a cost amount
- WHEN the event is saved
- THEN a `finance.transactions` row exists with `origin_module = 'health'` and an amount matching the logged cost

#### Scenario: A nutritionist visit logs and posts under its own type
- GIVEN a household member logs a health event of type nutrition with a cost and provider name
- WHEN the event is saved
- THEN it is stored as a distinct type from consultation, labeled "Nutrición" wherever event types are shown or filtered
- AND exactly one `finance.transactions` row posts with `origin_module = 'health'`

#### Scenario: An unrecognized event type is rejected
- GIVEN a caller attempts to log a health event with a type outside the five costed types (and outside the non-costed vitals/profile records)
- WHEN the write is submitted
- THEN it is rejected before any row is written

### Requirement: Exactly One Resolvable Transaction Per Costed Event
Each costed health event MUST correspond to exactly one Finance transaction, resolvable back to the event via `findByOrigin`. A retried log submission MUST NOT create a second transaction.

#### Scenario: Retried submission creates one transaction
- GIVEN a household member's client retries logging the same health event after a network failure
- WHEN both submissions reach the server
- THEN exactly one Finance transaction exists for that health event

#### Scenario: The event resolves back from Finance
- GIVEN a costed health event has posted a transaction
- WHEN `findByOrigin` is called with that event's origin reference
- THEN it resolves to the linked transaction

### Requirement: Editing or Deleting a Health Event Follows the Source
Editing a costed health event's cost or details MUST update the linked Finance transaction. Deleting a costed health event MUST void, not hard-delete, its linked transaction.

#### Scenario: Editing a logged cost updates the transaction
- GIVEN a costed health event has a linked Finance transaction
- WHEN the household member edits the event's amount
- THEN the linked transaction reflects the new amount under the same origin identity

#### Scenario: Deleting an event voids its transaction
- GIVEN a costed health event has a linked Finance transaction
- WHEN the household member deletes the event
- THEN the linked transaction transitions to void and is never hard-deleted

### Requirement: Unbounded Recurring Costed Events
A costed health event MUST be configurable as unbounded recurring at creation (e.g., an ongoing monthly medication), continuing to post occurrences indefinitely until the household member pauses or stops it, reusing Finance's recurring engine.

#### Scenario: Ongoing medication keeps posting
- GIVEN a household member configures a medication event as unbounded recurring, monthly
- WHEN multiple billing cycles pass without the member stopping it
- THEN a new posted occurrence exists for each elapsed cycle, with no fixed end

### Requirement: Bounded Recurring Costed Events
A costed health event MUST be configurable as bounded recurring at creation with a finite occurrence count (e.g., a 10-day antibiotic course). After its final occurrence posts, the recurrence MUST auto-deactivate and post no further occurrences.

#### Scenario: A 10-day course stops after the last dose
- GIVEN a household member configures a medication event as bounded recurring with 10 occurrences
- WHEN the 10th occurrence posts
- THEN the recurrence auto-deactivates and no 11th occurrence is ever posted

### Requirement: Recurring Occurrences Remain Traceable to the Health Event
Every occurrence posted by a recurring costed health event, bounded or unbounded, MUST remain traceable back to its originating health event through a resolvable reference, regardless of the internal posting path used.

#### Scenario: All occurrences resolve back to the source event
- GIVEN a recurring costed health event has posted several occurrences
- WHEN each resulting transaction is inspected for its originating health event
- THEN each one resolves back to the same source health event, not to an unrelated or generic origin

### Requirement: Household-Shared Costed Events Are Visible to the Household
A costed health event created with household visibility MUST be visible, with its correct amount and category, to every member of the household.

#### Scenario: A household member sees another member's shared event
- GIVEN one household member logs a costed health event with household visibility
- WHEN another household member views health events
- THEN the event appears with its correct amount and category
