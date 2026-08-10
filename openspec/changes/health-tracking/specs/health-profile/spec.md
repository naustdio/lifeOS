# Health Profile Specification

## Purpose

Static, non-date-stamped reference facts — allergies, chronic conditions, blood type — that describe a household member's current health state rather than a dated event.

## Requirements

### Requirement: Profile Facts Are Not Date-Stamped Events
Allergies, chronic conditions, and blood type MUST be stored and presented as current-state reference data, not as date-stamped events in a log.

#### Scenario: Adding an allergy is not an event
- GIVEN a household member adds an allergy to their profile
- WHEN the profile is viewed
- THEN the allergy appears as a current fact, not as a dated log entry

### Requirement: Profile Facts Never Create a Finance Transaction
Creating, editing, or removing a profile fact (allergy, condition, blood type) MUST NOT create any `finance.transactions` row.

#### Scenario: Editing blood type creates no Finance row
- GIVEN a household member sets or updates their blood type
- WHEN the change is saved
- THEN no `finance.transactions` row is created as a result

### Requirement: Profile Reflects Current State
Querying a household member's profile MUST return the current value of each fact (e.g., the current list of active allergies, the current blood type), without requiring the caller to reconstruct state from a history.

#### Scenario: Current allergies list is directly retrievable
- GIVEN a household member has added and later removed one allergy, and currently has two active allergies
- WHEN their profile is queried
- THEN exactly the two currently active allergies are returned

### Requirement: Profile Structure Does Not Foreclose Nutrition
The set of trackable record/event types MUST remain open and extensible; it MUST NOT be encoded as a closed, medical-only enumeration that would require a schema redesign to add a future Nutrition-domain record type.

#### Scenario: A future record type can be added without redesign
- GIVEN the health record/event type domain as shipped by this change
- WHEN a Nutrition-domain record type is proposed in a later change
- THEN it can be added by extension, without altering the shape of existing health records
