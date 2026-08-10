# Health Privacy Specification

## Purpose

Per-record visibility for health data (events, vitals, profile facts), where `private` is a first-class, commonly-chosen value rather than an edge case, mirroring the shape of `finance.accounts.visibility`.

## Requirements

### Requirement: Per-Record Visibility Choice
Every health record (costed event, vital entry, profile fact) MUST support a `visibility` value of `household` or `private`, chosen explicitly at creation time by the household member who creates it.

#### Scenario: Creator chooses visibility at creation
- GIVEN a household member creates a health record of any type
- WHEN they submit the creation form
- THEN the record is saved with the `visibility` value they explicitly selected, `household` or `private`

#### Scenario: Visibility is changeable before save
- GIVEN a household member is creating a health record
- WHEN they change the visibility selection before saving
- THEN the final saved record reflects the last selection, not a default that was silently applied

### Requirement: Private Records Are Invisible to Other Household Members
A health record with `visibility = private` MUST be invisible to every household member other than its creator, across every read path, enforced at the database (RLS) layer rather than only in the UI.

#### Scenario: Another member's list view excludes the private record
- GIVEN household member A creates a private health record
- WHEN household member B lists health records
- THEN member A's private record does not appear

#### Scenario: A direct query bypassing the UI still returns nothing
- GIVEN household member A has a private health record
- WHEN household member B issues a direct data query for that record's id
- THEN no row is returned, because the restriction is enforced at the database layer, not only by UI filtering

### Requirement: A Private Costed Event Does Not Leak Identifying Detail Through Finance
A costed health event created with `visibility = private` MUST NOT expose health-identifying detail (event type, description, or other health-specific fields) to a household member who cannot see the source private event, through the Finance transaction it creates or through any Finance-side read path.

#### Scenario: A household member without access sees no identifying detail in Finance
- GIVEN household member A logs a private costed health event
- WHEN household member B, who cannot see the private event, views the Finance transaction list
- THEN no health-identifying detail from member A's private event is exposed to member B through that transaction or any Finance-side view
