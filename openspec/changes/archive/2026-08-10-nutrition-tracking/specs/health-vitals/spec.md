# Delta for Health Vitals

## ADDED Requirements

### Requirement: Body-Composition Metrics Are Loggable

The system MUST support logging body-composition vital readings beyond weight: body fat, muscle mass, six skinfold measurements (biceps, triceps, subscapular, iliac crest, supraspinal, abdominal), and four circumference measurements (waist, hip, thigh, contracted arm). Body fat and muscle mass readings MUST support both a percentage value and a kilogram value being recorded, whichever internal metric shape is chosen. Skinfold readings MUST be recorded in millimeters; circumference readings MUST be recorded in centimeters. Each body-composition metric type participates in the existing vitals requirements (time series, trend rendering, no Finance transaction, no Finance recurrence) the same as any other vital metric.

#### Scenario: A body-composition reading accumulates as a time series

- GIVEN a household member logs body fat, muscle mass, a skinfold, or a circumference reading on several different dates
- WHEN that metric's history is queried
- THEN all entries are returned ordered by date, per metric type

#### Scenario: Body fat and muscle mass capture both percentage and mass

- GIVEN a household member records a body-fat or muscle-mass measurement from a source reporting both a percentage and a kilogram value
- WHEN both values are entered for the same reading
- THEN both are captured and individually retrievable, with neither overwriting the other

#### Scenario: Skinfold and circumference values keep their correct unit

- GIVEN a household member logs a skinfold measurement in millimeters or a circumference measurement in centimeters
- WHEN the reading is saved and later retrieved
- THEN its value reflects the unit appropriate to that measurement type, not a mismatched one
