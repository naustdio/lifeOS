# Delta for Finance Module API

## ADDED Requirements

### Requirement: Origin Module Domain Includes Health
The `origin_module` value accepted by the seam MUST be one of `manual`, `shopping_list`, `car_control`, `recurring`, or `health`. `health` MUST behave identically to any other calling-module origin for uniqueness, soft-reference, and immediate-posting purposes: it is not a special case in the seam's write path.

#### Scenario: A costed health event posts through the seam like any other module
- GIVEN the health module invokes the write path with `origin_module = 'health'` and `origin_entity_id` set to the health event id
- WHEN the call succeeds
- THEN the resulting transaction has `origin_module = 'health'`, `status = posted`, and participates in the same `(origin_module, origin_entity_id, idempotency_key)` uniqueness as any other origin

#### Scenario: An unrecognized origin_module value is still rejected
- GIVEN a write attempts `origin_module` set to a value outside `manual`, `shopping_list`, `car_control`, `recurring`, `health`
- WHEN the write executes
- THEN it is rejected by the database CHECK constraint
