# Dashboard Home Specification

## Purpose

Defines Home's month-scoped Finance feed cards: month summary, spending-by-category, and recent
movements preview. Supersedes the unimplemented `dashboard-feed` capability from `lifeos-foundation`.
Home composes these via direct typed calls into `finance/api` — there is no card-provider registry;
see the Architecture Note below.

## Requirements

### Requirement: Month Summary Card
The month summary card MUST show total income and total expense for the current calendar month
(day 1 through today), computed only from `posted`, non-`transfer` transactions, per the
`finance-transactions` exclusion rule.

#### Scenario: Totals match a hand count of posted non-transfer transactions
- GIVEN the household has posted income and expense transactions this month, plus one transfer and
  one later-voided expense
- WHEN the month summary card renders
- THEN income and expense totals match a hand count of the posted, non-transfer, non-void rows

### Requirement: Spending-by-Category List
The spending-by-category card MUST render a CSS-only ranked bar list of expense totals per category
for the current calendar month, using only `posted`, non-`transfer`, `expense`-type transactions. It
MUST NOT introduce a charting dependency and MUST NOT rely on a `categories.color` schema column.
Each category row MUST be visually distinguishable via a deterministic client-side color assignment
keyed by category id or index, so the same category renders the same color across reloads.

#### Scenario: Categories ranked by spend, highest first
- GIVEN three expense categories have different posted spend totals this month
- WHEN the spending-by-category card renders
- THEN the categories appear ordered highest to lowest spend, each as a CSS bar sized relative to the
  top category, with no chart library involved

#### Scenario: Category color is stable across renders
- GIVEN category "Comida" appears in the spending-by-category list
- WHEN the card re-renders (e.g., after navigation and return)
- THEN "Comida" is assigned the same color both times, without reading a `color` column

### Requirement: Recent Movements Preview
The recent movements card MUST show 3 to 5 of the most recent `posted` transactions (by
`occurred_on`, most recent first) and MUST include a link to `/movimientos`. This card MUST remain a
bounded preview: it MUST NOT duplicate or replace `/movimientos`'s full list, and MUST NOT page,
filter, or paginate beyond the fixed preview count.

#### Scenario: Preview shows a bounded recent set with a link out
- GIVEN the household has more than 5 posted transactions
- WHEN the recent movements card renders
- THEN 3 to 5 of the most recent posted transactions are shown, with a link to `/movimientos`

#### Scenario: Transfers appear as movement entries but never in totals
- GIVEN the household's most recent posted transactions include a transfer
- WHEN the recent movements card renders
- THEN the transfer MAY appear as a preview row (transfers are real movements), but it MUST NOT
  contribute to the month summary's totals or to any spending-by-category total

### Requirement: Explicit Empty States
When the current calendar month has zero qualifying transactions, each affected card MUST render an
explicit empty state using the shipped `EmptyState` pattern. No card MUST ever render `NaN`, a
`0%`-with-no-context artifact, or a blank/broken layout.

#### Scenario: Zero transactions this month renders empty states, not NaN
- GIVEN a household has no posted transactions dated this month
- WHEN Home renders
- THEN all three cards each show an `EmptyState`, and none renders `NaN`, an unexplained `0%`, or a
  blank card

#### Scenario: Partial month data still renders correctly per card
- GIVEN the household has transactions this month but zero fall into any expense category (e.g.,
  income only)
- WHEN Home renders
- THEN the month summary card shows real totals while the spending-by-category card shows its own
  `EmptyState`, independent of the other cards

### Requirement: Mobile-First, Light and Dark
All three cards MUST be usable at a 375px viewport width and MUST render correctly in both light and
dark theme, consistent with the project's design-token driven styling.

#### Scenario: Cards remain usable at 375px in both themes
- GIVEN a 375px viewport with populated data in all three cards
- WHEN Home renders in light theme and again in dark theme
- THEN each card's content stays readable with no horizontal overflow or clipped text, using semantic
  tokens legible in both themes

### Requirement: No Write-Path Change
This capability MUST NOT alter any Finance write path. `src/modules/finance/**` write functions
(domain/data write logic, `finance/api` write exports) MUST show zero diff as a result of this change.

#### Scenario: Finance write exports are unchanged
- GIVEN this capability is implemented
- WHEN the `finance/api` barrel is diffed against its pre-change state
- THEN only new read exports are added; no existing write export's signature or behavior changes

## Architecture Note: No Card-Provider Registry

Home composes these three cards via direct typed calls into `finance/api`, not through a
card-provider registry (the `getFeedCards(period)` pattern proposed in `lifeos-foundation`). LifeOS
has exactly one module with real screens; a single-provider registry is speculative abstraction. This
is a deliberate scope decision, not a missing requirement — revisit only when a second module ships
real Home-eligible screens.
