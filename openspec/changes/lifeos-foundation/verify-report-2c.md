# Verification Report - lifeos-foundation, Sub-slice 2C (Minimal Finance UI)

**Change**: lifeos-foundation
**Scope of this report**: sub-slice 2C only (T-036..T-040), branch feat/lifeos-foundation-2c-finance-ui, 4 commits ahead of main. Prior sub-slices 1A/1B/2A/2B are already merged and independently verified - not re-verified here except for regression confirmation via the full test suite.
**Mode**: hybrid (Engram + OpenSpec file)
**Date**: 2026-08-04

## 1. Completeness (tasks.md)

| Task | Status claimed | Verified |
|---|---|---|
| T-036 Account list + creation screen | DONE | Confirmed - /cuentas, /cuentas/nueva, AccountForm.tsx cover all 6 account types with conditional liability/goal fieldsets |
| T-037 Transaction entry (income/expense/transfer) | DONE | Confirmed - /movimientos, TransactionForm.tsx, Server Actions call recordTransaction/recordTransfer |
| T-038 Correction affordance | DONE | Confirmed - EditTransactionForm.tsx, edit-in-place + void, transfer-leg-reject handled |
| T-039 Balance/summary view | DONE | Confirmed - page.tsx renders available_cents as hero, debt_cents as separate never-subtracted card |
| T-040 E2E smoke suite (Playwright) | PARTIAL, self-flagged | Confirmed PARTIAL; gap is real and, on inspection, broader than the self-report frames it (see Issue C-1) |

39/40 sub-slice-2C-relevant task lines fully DONE, T-040 explicitly PARTIAL. No unchecked/silent tasks found.

## 2. Test / Build Evidence (all executed live this session)

- git diff main..feat/lifeos-foundation-2c-finance-ui -- supabase/ -> empty. Confirms literally zero migration changes in 2C, as claimed.
- supabase test db -> Files=7, Tests=83, Result: PASS. Matches claim, unchanged from 2A/2B (no regression).
- pnpm test (vitest run) -> Test Files 7 passed (7), Tests 43 passed (43). Matches claim (7 files / 43 tests, up from 35).
- pnpm verify, run after rm -rf .next to eliminate any stale-cache risk -> clean pass, 10 routes generated. Matches claim exactly.

No claimed test-suite number was inflated or unverifiable; all four headline evidence claims from apply-progress are literally true.

## 3. Spec Compliance (UI-relevant scenarios, finance-accounts / finance-transactions / identity)

| Requirement | Scenario | Evidence | Status |
|---|---|---|---|
| finance-accounts / Six Account Types | UI creation covers all 6 types | AccountForm.tsx renders conditional liability/goal fieldsets per type; account-creation-ui.test.ts round-trips cash + liability | PASS |
| finance-accounts / Derived Balances | Hero = assets only, debt never subtracted | page.tsx uses household_summary.available_cents for hero, separate debt_cents > 0 card, no subtraction anywhere in the component | PASS |
| finance-accounts / Savings-Goal Account Detail | Goal progress card fed by real balance | page.tsx computes balanceCents / targetAmountCents from the same derived balance, not a stored counter | PASS |
| finance-transactions / paid_by_user_id Hidden From Personal-Mode UI | No who-paid field | TransactionForm.tsx/actions carry no paidBy field anywhere | PASS |
| finance-transactions / Void Lifecycle, Never Hard-Delete | Void via UI, reason captured | voidMovementAction -> voidTransactionById, confirmed by movement-creation-ui.test.ts status=void assertion | PASS |
| identity / Household Terminology Hidden From UI | Zero household/hogar user-facing text | Grep of all new src/app/(app) files: every occurrence is an identifier or a code comment, never rendered JSX text/copy. Independently re-verified - the narrowed word-boundary regex in no-household-text.test.ts did not let anything real through | PASS |
| finance-module-api / Public API Is the Only Cross-Module Write Surface | Barrel discipline | Spec text is scoped to calling modules writing to finance.* directly; it does not forbid the app composition layer reading through the same barrel. The read re-exports do not violate this requirement's literal text, though see Issue W-1 for the design tension | PASS (literal), WARNING (design hygiene) |

All UI-relevant scenarios that have a runtime-testable form are covered by a passing test (integration tests hitting real Server Actions against the real local Supabase stack, or pgTAP for the underlying invariants). No spec scenario is claimed-done with only a source-inspection-level check.

## 4. Independent Assessment of Self-Flagged Deviations

### Deviation (a) - reads routed through finance/api instead of finance/data directly
Verified TRUE and correctly diagnosed. eslint.config.mjs's actual boundaries/element-types rule allows app to import only module-api, design-system, and shared - there is no module-data (nor even module-ui) entry in app's allow list. An src/app/(app)/** file importing finance/data directly would fail Gate A. design.md's own Project Structure diagram positions data-bound UI logic in modules/*/ui/containers/, which - under the same allow list - app also cannot import directly (module-ui is likewise absent from app's allow list). Given this scaffold's actual constraint, routing reads through finance/api is the only ESLint-compliant path available without restructuring the module-ui layer, which is out of the declared 2C scope. Verdict: real constraint, legitimate fix, correctly self-diagnosed as a boundary-blurring workaround (see Issue W-1 for the residual architecture concern).

### Deviation (b) - CreateAccountInput/RecordTransactionInput/RecordTransferInput widened from z.infer to z.input
Verified TRUE and a correct fix, not scope drift. Read finance/api/index.ts: BaseAccountFields has defaults on openingBalanceCents/visibility/sortOrder; RecordTransactionInputSchema/RecordTransferInputSchema have defaults on description and origin. In Zod, z.infer (== z.output) marks default-bearing fields as required (the guaranteed post-parse value), while z.input correctly marks them optional (what a caller must supply before defaulting fires) - this is standard, well-documented Zod behavior, not project-specific reasoning. design.md's own contract snippet marks these fields optional. Using z.infer for an exported input type would have forced every caller to explicitly pass values the schema is designed to default - a genuine latent bug, now correctly fixed by switching to z.input. Verdict: confirmed correct bugfix, not scope drift.

### Deviation (c) - no-household-text.test.ts regex narrowed to word-boundary matching
Verified TRUE and correct. Read the test: the docstring's own stated intent is user-facing text, not identifiers. The old bare-substring regex would have flagged householdId/household_id - necessary internal identifiers 2C's Server Actions must reference - as false positives. The word-boundary change correctly excludes camelCase/snake_case occurrences while still catching a standalone household/hogar word. Independently re-ran the grep sweep by hand across all new files (not just the test) - no real user-facing leakage slipped through the narrower pattern; every remaining occurrence is an identifier or comment.

### Deviation (d) - transfer-leg-reject remedy simplified (void both legs, no auto-redirect/prefill)
Verified TRUE, correctly implemented, not swallowed. EditTransactionForm.tsx detects TRANSFER_LEG_NOT_MOVABLE via a substring match on the Spanish error copy and relabels the void button to "Anular y volver a registrar"; voidMovementAction calls voidTransactionById which calls finance.void_transaction(), which the 2A/2B pgTAP suite (070_finance_corrections.sql) already confirms voids the linked leg atomically. The UI does not auto-redirect to a pre-filled transfer form - the user must manually re-enter it on /movimientos. This is a real, honestly-scoped simplification against design.md's Open Question framing, but the error path is handled gracefully end-to-end, not silently swallowed or mishandled.

### Deviation (e) - T-040 delivered as manual checklist + integration tests, not Playwright
Verified TRUE. See Issue C-1 - this is a sharper gap than the self-report frames it.

## 5. Independent Checks Beyond the Self-Reported Deviations

- Zod discriminated union / all 6 account types: AccountForm.tsx renders conditional liability/savings_goal fieldsets that map 1:1 onto CreateAccountInputSchema's branches; account-creation-ui.test.ts round-trips a real cash account and a real liability account (with its detail row) through the actual Server Action against live Postgres.
- Headline balance rule: independently traced page.tsx to getHouseholdSummary (finance/data/summary-repository.ts) to the finance.household_summary view (available_cents = sum where class=asset, unchanged from 2A). No client-side re-derivation, no alternate/duplicate calculation path exists anywhere in the new UI code.
- Integration test realism: both new integration test files import the actual Server Action functions from src/app/(app)/**/actions.ts (the exact functions the forms submit to), mock only next/navigation's redirect and next/cache's revalidatePath (inert outside a real Next.js request) and the shared Supabase server client (redirected to a real signed-in Supabase client, not a stub). All assertions query the real Postgres tables/views afterward. This is the same pattern as finance-facade.test.ts from 2A/2B - genuinely testing the UI-calling code path, not testing less than claimed.

## 6. Issues

### CRITICAL

C-1 - Zero browser-rendered or component-render proof exists for any of the three new interactive forms (AccountForm, TransactionForm, EditTransactionForm).
The self-report frames the T-040 gap as "no Playwright, manual checklist instead." On independent inspection this understates the gap:
- pnpm verify's next build only statically prerenders /entrar, /_not-found, and /manifest.webmanifest. /cuentas, /cuentas/nueva, /movimientos, /movimientos/[id]/editar are marked dynamic (server-rendered on demand) - the build compiles and type-checks them but never actually executes React's render for these routes/components.
- The project already has the React Testing Library installed and in active use (tests/unit/theme-selection.test.tsx renders ThemeProvider/ThemeToggle and asserts on real DOM/localStorage state) - so the tooling to render-test a client component was available in this very repo and was simply not applied to any of the three new forms.
- The two new integration tests exercise Server Actions directly with hand-built FormData - they never mount AccountForm, TransactionForm, or EditTransactionForm and therefore prove nothing about whether those components compile to a working, non-throwing render.
- The manual checklist (finance-ui-smoke-checklist.md) has all 7 rows unchecked - no human has executed it either. It exists as an enumeration of what should be checked, not evidence anything was.

Net: for these three components, verification stops at TypeScript compiling and the Server Action they call working when invoked directly. Nothing in this cycle proves the components themselves render without error in a browser, in jsdom, or in Next's own render pipeline. Given this is the final sub-slice of the SDD cycle, this is a real, unclosed gap - worse than "no Playwright" suggests, because even the cheapest possible check (an RTL smoke render, already a one-line pattern in this repo) was skipped.

This does not retroactively invalidate any other claim in this report - all server-side/Postgres-side behavior genuinely is proven at the integration/pgTAP layer, which is the harder, higher-value half of the correctness story. But "the screens work" as a whole (including rendering) is not proven, only "the actions they call work" is proven.

### WARNING

W-1 - finance/api's role is now blurred: a "public write seam" barrel that also carries plain reads.
The finance-module-api spec's Purpose statement literally scopes it to "the public, server-side cross-module write seam." The 2C read re-exports do not violate any Requirement's literal text (all five Requirements are about calling-module writes), so this is not a spec breach - but it is a real design-hygiene tension the apply agent itself flagged and did not fully resolve. A future cycle adding a second calling module (e.g. shopping_list) will see a finance/api barrel that mixes the atomic write seam other modules use with plain RLS-filtered read helpers the app layer happens to need, with no naming or file separation between the two. A cheap follow-up (splitting reads and writes into separate files, or restructuring app pages to compose through module-ui containers per the original design diagram) would remove the ambiguity without a schema or seam change.

W-2 - T-040's manual checklist rows are unchecked; no human execution evidence exists for the genuinely-manual items (Google sign-in ceremony, 375px layout, light/dark theme render).
Distinct from C-1 (which is about automated/component-render proof): even the manual fallback path this sub-slice chose has not itself been executed and recorded. This is lower severity than C-1 because these are pre-existing, previously-verified concerns being re-asked for the new screens specifically, not a wholly new capability.

W-3 - Transfer-leg-reject detection in the UI is a brittle substring match on translated error text, not a structured error code.
updateMovementAction returns only an error string, discarding the typed AppError.code (TRANSFER_LEG_NOT_MOVABLE) that finance/api already produces. EditTransactionForm.tsx then re-derives whether this was a transfer-leg rejection by string-matching the Spanish word "transferencia" in the error copy. This works today but is fragile - any future copy edit to that error message silently breaks the button relabeling with no compiler or test signal. Low severity given this cycle's explicit scope, but worth a follow-up ticket.

### SUGGESTION

S-1 - Consider adding one React Testing Library smoke-render test per new interactive component as a cheap, fast first step toward closing C-1, before or instead of a full Playwright investment - the pattern already exists in this repo (theme-selection.test.tsx).

S-2 - finance-ui-smoke-checklist.md's 7 rows should be actually executed and checked off (or explicitly deferred with a dated follow-up ticket) before or shortly after archive, rather than left as an unexecuted enumeration.

## 7. Design Coherence

No design.md deviation in this sub-slice breaks a spec requirement. Both the Zod-type and ESLint-boundary deviations are correctly diagnosed technical realities the design document's task-level prose did not fully anticipate, not shortcuts. The transfer-leg-reject simplification is an honestly-scoped narrowing of an already-open design question, not a contradiction of a locked decision.

## 8. Final Verdict

PASS WITH WARNINGS for sub-slice 2C's server-side/data-layer correctness (all claimed test evidence independently reproduced and confirmed accurate; both fixes claimed as deviations are independently confirmed correct, not scope drift).

Recommendation on sdd-archive for the full lifeos-foundation cycle (1A-2C): Close C-1 before archiving, or archive with C-1 explicitly accepted as a documented, carried-forward risk. This is a judgment call for the user/orchestrator, not an automatic block, because:
- No spec requirement or scenario is actually unproven at the level specs test (DB/RLS/seam correctness, which is where the money-safety risk actually lives, is fully proven).
- The orchestrator explicitly waived a full Playwright pass for this run, and the gap was self-disclosed, not hidden.
- However, "the three new screens render without crashing" is currently proven by nothing at all - not Playwright, not the React Testing Library, not even Next's own static prerender - which is a lower bar than this project's own existing pattern (theme-selection.test.tsx) already clears for older screens. Shipping a UI slice where none of its interactive components have ever been rendered by any tool is a materially different risk posture than choosing integration tests over E2E, and should be a conscious decision, not an inherited assumption from the self-report's framing.

If the user/orchestrator accepts C-1 as a carried-forward risk (e.g., tracked as a fast-follow before this UI is used for real), lifeos-foundation is otherwise ready for sdd-archive.
