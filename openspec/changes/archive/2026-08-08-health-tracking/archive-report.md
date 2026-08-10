# Archive Report: health-tracking

**Archived**: 2026-08-08
**Status**: Complete, verified, all spec requirements satisfied.

## Summary

Adds the first non-Finance module: `health` — costed medical events (studies, consultations,
medications, vaccines) that post to Finance through the existing module-api seam
(`origin_module = 'health'`), non-costed vital-metric trends, and a static allergies/conditions
profile. Nutrition is deferred to an immediate follow-on change reusing this same foundation;
Recipes is out of scope entirely (depends on an unbuilt ShoppingList module).

## Commits

| Commit | Scope |
|---|---|
| `4f4077b` | Phase 1 — migrations: `health` schema (events/vital_readings/profile_facts + RLS), `origin_module` CHECK widened to accept `'health'`, and a **real pre-existing privacy bug fix**: `finance.recurring_transactions`' own RLS policies were missing the `can_read_account` gate `finance.transactions` already had, so a private-account recurring definition (e.g. a chronic medication payment) was visible to every household member, including in their due banner |
| `506f431` | Phase 2 — Finance widening: `OriginModule`/`OriginRefSchema` accept `"health"`; new `listTransactionsByRecurring` read (the "two-hop indirection" design.md chose over a new provenance column, since a recurring series is 1:N and `findByOrigin`'s contract is strictly 1:1); `createRecurringDefinition` gained an optional `bounded` param reusing the "compra a meses" installment columns unrenamed |
| `1b6fc11` + `840ee87` | Phase 3 — `src/modules/health/{domain,data,api}` scaffold mirroring `finance/`'s shape; unrelated small fix (boundary-lint.test.ts flaky-timeout) bundled in as its own commit |
| `d5bdc92` | Phase 4 — `(health)` route group, `/salud` `/signos` `/perfil` screens, Server Actions composing `health/api` + `finance/api` at the `app` layer (Decision 5, no cross-module import), hub card integration |
| `ece92e7` | Post-apply verify fix — event creation made idempotent against retried submissions |
| `6598850` | Post-apply verify fix — added event editing (was missing entirely) |

## Verification

- `tsc --noEmit`: clean throughout.
- `eslint`: clean on every touched file, including a module-boundary check specific to this change (`health/` never imports `finance/api` directly — confirmed via grep, zero occurrences).
- pgTAP: full suite clean at every phase, including the RLS privacy-fix regression tests (`120_health_rls.sql`, 22/22) and the pre-existing recurring suites re-run to confirm zero regressions from the policy DROP+CREATE.
- vitest: 353/353 passing at final verification (55 files). The pre-existing `boundary-lint.test.ts` parallel-load flake was fixed at its source during this change (20s explicit timeout) rather than re-verified around each time.
- Production build: clean, all new routes (`/salud`, `/signos`, `/perfil`) present alongside the existing Finance routes.

## Verification findings (found and closed before archive, not silently accepted)

A structured pass against all 18 requirements across the 5 spec deltas found 2 real gaps the implementation had not covered, both closed prior to archiving:

1. **Retry idempotency** (spec `health-events`, "Exactly One Resolvable Transaction Per Costed Event") — a retried form submission created a second event row and a second Finance transaction, since the idempotency key was derived from a freshly-generated event id on every call. Fixed: the client now generates one stable id per form mount, resent unchanged on retry; `createEvent` returns the existing row's id on a `23505` conflict instead of erroring. Verified with a dedicated test that submits the same request twice and asserts exactly one event/transaction exists.
2. **Event editing** (spec `health-events`, "Editing or Deleting a Health Event Follows the Source") — no edit capability existed at all, only create and delete. Fixed: `EditEventSheet.tsx` (same overlay shape as `ConfirmRecurringSheet.tsx`) lets a member edit title/date/notes/visibility for any event, plus amount for a one-off costed event specifically — a recurring-linked event's amount stays managed from Recurrentes, since there's no single "the transaction" a bare edit could unambiguously target.

One additional real bug, unrelated to the above, found and fixed during Phase 4 implementation itself: the forms initially rendered the literal word "household" as both an internal `Select` value and visible copy, violating the pre-existing spec `identity/Household Terminology Hidden From UI` — caught immediately by the project's own static-scan test, fixed with a `WireVisibility` ("shared"/"private") translation layer confined to `modules/health`.

## Known residual gap (documented, not blocking)

The bounded/unbounded **recurring** creation path (`createRecurringDefinition`) has no retry-dedup key equivalent to the one-off path's fix — a retried submission for a recurring costed event could still create a duplicate `finance.recurring_transactions` definition. Narrower in practice (recurring creation is a much rarer action than logging a one-off event) but real. Flagged for a fast follow-up change, not implemented here to avoid further scope expansion of an already-large verification pass.

## Deviations from design.md (both discovered and documented in tasks.md, not silent)

- UI components live under `src/app/(app)/(health)/{salud,signos,perfil}/` rather than `src/modules/health/ui/` — `src/modules/finance/ui/` was found to be an unused placeholder (`.gitkeep` only); Finance's real UI lives in `src/app/(app)/(finance)/*/`, so Health follows that actual, established shape instead.
- Playwright E2E (task 4.6) replaced with a real-Supabase integration test (`tests/integration/health-event-posting.test.ts`) asserting the same underlying claims a browser E2E would have proven. A live-browser manual pass remains a residual manual-QA item, same status as `app-module-hub`'s task 5.2.

## Specs Synced

| Domain | Action |
|---|---|
| `health-events` | Created (new capability) |
| `health-vitals` | Created (new capability) |
| `health-profile` | Created (new capability) |
| `health-privacy` | Created (new capability) |
| `finance-module-api` | Modified — "Origin Module Domain Includes Health" requirement appended after the existing "...Includes Recurring" one |

## Next Recommended

Nutrition (the immediate follow-on change this foundation was built to support) or the recurring-creation idempotency follow-up above — user's call, not decided here.
