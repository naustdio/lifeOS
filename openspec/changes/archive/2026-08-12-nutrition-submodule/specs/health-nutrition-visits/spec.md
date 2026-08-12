# Health Nutrition Visits Specification

## Purpose

A nutrition visit as one composed record — a nutrition-type health event plus its visit-scoped vital readings plus 0..N always-private photos — created and edited only through `/nutricion`.

## Requirements

### Requirement: A Visit Is a Composed Record

The system MUST represent a nutrition visit as one nutrition-type `health.events` row, zero or more `health.vital_readings` rows linked to it via `event_id`, and zero or more `health.nutrition_visit_photos` rows linked to it via `event_id`, saved together from a single `/nutricion` submission.

#### Scenario: Saving a visit produces all three parts atomically

- GIVEN a household member fills the `/nutricion` form with cost/provider details, metric values, and photos
- WHEN they submit
- THEN one nutrition event, its linked metric readings, and its linked photos are all persisted from that single submission

#### Scenario: A visit may be saved with metrics only or photos only

- GIVEN a household member submits a visit with either no photos or no metric values entered
- WHEN the visit is saved
- THEN the event is created and the omitted part (photos or readings) is simply absent, not an error

### Requirement: `/nutricion` Is the Sole Creation Path for Visits

Nutrition visits MUST be creatable only through the `/nutricion` route. No other route or form MAY create a nutrition-type health event.

#### Scenario: The generic health form cannot create a nutrition visit

- GIVEN a household member opens the generic `/salud` event form
- WHEN they view the event type options
- THEN "Nutrición" is not among them

### Requirement: A Visit's Photos Are Editable After Creation

A saved nutrition visit's photos MAY be added or removed after the initial save. (Fast-follow revision, live-testing feedback: metric readings are captured once, at the visit that produced them — a later measurement is a new visit, not an edit to this one. The one exception is completing a legacy pre-`/nutricion` visit with zero readings, covered by its own requirement below.)

#### Scenario: A photo is removed from an existing visit

- GIVEN a saved visit has two photos
- WHEN the household member removes one from the visit's edit view
- THEN one photo remains linked to the visit and the removed photo's storage object is deleted

### Requirement: Photo Attachment Limits

A visit MUST accept at most 6 photos. Each photo MUST be JPG, PNG, or WebP and MUST NOT exceed 10 MB. A submission exceeding either limit MUST be rejected before any photo is stored, with the rest of the visit save unaffected by the rejection.

#### Scenario: A 7th photo is rejected

- GIVEN a visit already has 6 photos
- WHEN the household member attempts to attach a 7th
- THEN the attachment is rejected and the existing 6 remain unchanged

#### Scenario: An oversized or wrong-type file is rejected

- GIVEN a household member attempts to attach a file over 10 MB or not in JPG/PNG/WebP format
- WHEN the upload is submitted
- THEN it is rejected and no partial photo row is created

### Requirement: Legacy Pre-Change Nutrition Events Are Visible as Completable Visits

A nutrition-type `health.events` row created before this change (with no linked readings or photos) MUST appear in `/nutricion`'s visit list as a zero-metric visit that can be opened and completed with readings and photos, not hidden or shown as an error state.

#### Scenario: A legacy event appears in the visit list

- GIVEN a nutrition event exists from before this change, with no linked readings or photos
- WHEN a household member opens `/nutricion`
- THEN it appears in the visit list as a visit with zero metrics

#### Scenario: A legacy visit can be completed

- GIVEN a household member opens a legacy zero-metric visit from `/nutricion`
- WHEN they add metric readings and photos and save
- THEN the readings and photos link to that visit's existing `event_id`

## Key Learnings

1. Modeling the visit as the existing `nutrition` event row (not a new wrapper table) keeps the Finance-posting seam byte-unchanged.
2. Legacy nutrition events must be first-class, completable visits rather than an error state, since `/nutricion` did not exist when they were created.
