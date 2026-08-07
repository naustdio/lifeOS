# Finance Calendar Specification

## Purpose

Defines a read-only, 100% client-computed day-by-day projection of the household's available balance, driven exclusively by active recurring expense definitions. It answers "will I run out before payday" without introducing any write path, migration, or income model. It MUST NOT be presented as a full cashflow or balance forecast.

## Requirements

### Requirement: Day-0 Anchor Is the Current Available Balance
The projection MUST anchor day 0 to `household_summary.available_cents` as returned by the existing `getHouseholdSummary()` read. No other starting balance source MUST be used.

#### Scenario: Calendar opens anchored to current balance
- GIVEN a household has an `available_cents` of a known value
- WHEN the calendar screen is opened
- THEN day 0's balance equals `household_summary.available_cents`, unmodified

### Requirement: Only Active Recurring Expense Definitions Are Projected
The projection MUST include only recurring definitions with `active = true`. Paused definitions (`active = false`) MUST be excluded from every day cell in the window, and no manual future-dated transaction MUST ever be included.

#### Scenario: Household has active recurring expenses
- GIVEN a household has two active recurring expense definitions with different due dates within the window
- WHEN the calendar is rendered
- THEN both definitions appear as subtractions on their respective projected due-date cells

#### Scenario: Paused definition is excluded
- GIVEN a recurring definition is paused (`active = false`) with a `next_due_date` inside the window
- WHEN the calendar is rendered
- THEN that definition never appears in any day cell and never reduces any day's projected balance

### Requirement: An Item Due Today Reduces Day 0's Closing Balance
A recurring definition whose `next_due_date` equals today MUST be counted in today's cell and MUST reduce today's closing (end-of-day) balance, even though it is unposted.

#### Scenario: Item due today is subtracted from day 0
- GIVEN a recurring expense definition has `next_due_date` equal to today
- WHEN the calendar is rendered
- THEN today's cell shows that charge and today's closing balance equals the anchor minus that charge's amount

### Requirement: Overdue Items Fold Into Day 0
A recurring definition whose `next_due_date` is strictly before today (overdue) MUST be folded into day 0's projection rather than ignored, so the projection is never optimistic.

#### Scenario: Overdue definition still reduces the projection
- GIVEN a recurring definition's `next_due_date` is 5 days in the past and remains active and unconfirmed
- WHEN the calendar is rendered
- THEN that definition's amount is subtracted starting at day 0, not silently dropped

### Requirement: Projection Window Is 90 Days With a Hard Iteration Cap
The projection MUST cover exactly 90 days forward from today, inclusive of day 0. Occurrence generation per definition MUST be bounded by an explicit iteration ceiling that prevents unbounded loops regardless of frequency.

#### Scenario: Window stops at day 90
- GIVEN a weekly recurring definition with no end date
- WHEN the projection is computed
- THEN no occurrence for that definition appears beyond day 90 of the window, and generation terminates without exceeding the iteration ceiling

#### Scenario: High-frequency definition cannot cause a runaway loop
- GIVEN a recurring definition with the shortest supported frequency
- WHEN the projection is computed for the full 90-day window
- THEN the number of generated occurrences for that definition stays within the per-definition iteration ceiling

### Requirement: UI Labels the Projection as Outflows Only, Never a Full Forecast
Because this data model has no recurring-income concept, the UI MUST label the projection as "projected outflows" (or an equivalent phrase making the expense-only, non-income scope explicit) and MUST NOT use language implying a complete cashflow or balance forecast.

#### Scenario: Screen copy avoids forecast framing
- GIVEN the calendar screen is rendered
- WHEN its heading and explanatory copy are inspected
- THEN they describe projected outflows/expenses only and do not claim to forecast total balance or income

### Requirement: Empty State Shows a Flat Line, Not an Error
A household with zero active recurring definitions MUST render a flat projection at today's balance for the full window, never an error state or a blank grid.

#### Scenario: No active recurring items
- GIVEN a household has zero active recurring expense definitions
- WHEN the calendar is rendered
- THEN every day in the 90-day window shows the same balance as day 0, and no error or empty/blank grid is shown

### Requirement: First Negative Day Is Visually Surfaced
The first day on which the projected running balance goes below zero MUST be distinguishable from other day cells.

#### Scenario: Balance dips negative mid-window
- GIVEN the cumulative projected outflows exceed the day-0 anchor by day 22
- WHEN the calendar is rendered
- THEN day 22 is visually marked as the first day the projected balance is negative
