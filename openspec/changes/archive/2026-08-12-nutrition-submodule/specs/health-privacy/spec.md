# Delta for Health Privacy

## ADDED Requirements

### Requirement: Nutrition Visit Photos Are Always Owner-Private

A nutrition visit photo MUST always be private to its uploading household member, regardless of the linked event's own `visibility` value. Even a photo attached to a `household`-visibility nutrition event MUST NOT be visible or downloadable by any other household member.

#### Scenario: A photo on a household-shared visit stays private

- GIVEN household member A creates a nutrition visit with `visibility = household` and attaches a photo
- WHEN household member B views that visit
- THEN B sees the visit's cost and details but cannot view or download A's photo

#### Scenario: A direct signed-URL request for another member's photo is denied

- GIVEN household member A has a visit photo
- WHEN household member B attempts to obtain a signed URL for that photo's storage path
- THEN the request is denied at the storage-policy layer, not only hidden in the UI

#### Scenario: The owner can always view their own photo

- GIVEN household member A uploaded a visit photo
- WHEN A requests a signed URL for it
- THEN A receives a valid, time-limited URL to the photo

## Key Learnings

1. Photo privacy is independent of the event's `visibility` field — it is always owner-private, which is a stricter default than the per-record visibility choice the rest of health data uses.
2. Enforcement belongs at the storage-policy layer (owner-prefixed paths + RLS-equivalent bucket policy), matching how `health-privacy` already requires DB-layer enforcement over UI-only filtering.
