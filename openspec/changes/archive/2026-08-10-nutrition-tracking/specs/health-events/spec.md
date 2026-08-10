# Delta for Health Events

## RENAMED Requirements

### Requirement: Four Costed Event Types → Five Costed Event Types

(Reason: a fifth costed event type, `nutrition`, is added — the requirement's stated count and scenarios must reflect five, not four)
(Migration: None — existing `study`/`consultation`/`medication`/`vaccine` events and their Finance links are unaffected)

## MODIFIED Requirements

### Requirement: Five Costed Event Types

The system MUST support exactly five costed health event types: medical study/exam, medical consultation, medication/treatment, vaccine, and nutrition (nutritionist consultation, labeled "Nutrición"). Logging an event of any of these types MUST post exactly one transaction to `finance.transactions` via the module-api seam with `origin_module = 'health'`.

(Previously: exactly four costed types, without nutrition)

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
