# Delta for Dashboard Home

## ADDED Requirements

### Requirement: Canonical Route Is `/finance`
The Finance dashboard's canonical route MUST be `/finance`, not `/`. The dashboard's three cards
(month summary, spending-by-category, recent movements) and all their existing requirements and
scenarios remain unchanged — only the address at which they are served changes.

#### Scenario: `/` no longer renders the dashboard
- GIVEN this change is applied
- WHEN a user visits `/`
- THEN the neutral module hub renders, not the Finance dashboard

#### Scenario: `/finance` renders the dashboard with unchanged content
- GIVEN this change is applied
- WHEN a user visits `/finance`
- THEN the month summary, spending-by-category, and recent movements cards render exactly as they
  did at `/` before this change
