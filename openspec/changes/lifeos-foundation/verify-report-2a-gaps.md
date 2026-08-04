# Verify Report - lifeos-foundation, Sub-slice 2A Gap-Closure (5 follow-up commits)

Branch: feat/lifeos-foundation-2a-finance-schema
Scope: the 5 commits (21480db, 852478d, 923b7e6, cb6e45f, d32504f) that closed WARNINGs 1-6 from verify-report-2a: T-032 (facade integration tests), T-033 (recursion guard), T-034 (cross-space move + edit-voided rejection), T-035 (sibling-name collision), the non-MXN-currency CHECK test, and the design.md OriginRef doc fix. Not a re-verification of the full 2A slice.

VERDICT: PASS - no CRITICAL issues. All gap-closure claims independently confirmed real via re-execution and source inspection.

## Real execution evidence (re-run independently this session)
- supabase test db: Files=7, Tests=83, PASS (confirmed, up from 69).
- pnpm test: 5 files, 35 tests, PASS (confirmed, up from 24); the new tests/integration/finance-facade.test.ts ran 1157ms consistent with real HTTP round trips, not mocks.
- pnpm verify: PASS clean (eslint, tsc, check-tokens, next build - 6 routes + middleware; apply-progress said "8 routes", cosmetic prose mismatch only).

## T-033 recursion guard (060_finance_recursion_guard.sql)
Genuine, not happy-path: targets core.household_members itself (whose own RLS policy calls core.is_member() which queries the same table). Actively swaps is_member() to SECURITY INVOKER inside a rolled-back transaction and proves the identical query now fails with 54001 (stack depth limit exceeded), then restores DEFINER and reconfirms success. Confirmed the 54001-vs-42P17 claim is real (documented and consistent with actual passing test run). WARNING: asserting the specific sqlstate 54001 is engine-version-specific; a Postgres/Supabase bump could change which code fires. Low-risk tech debt, not a defect.

## T-034 corrections (070_finance_corrections.sql)
Genuine: two real separate households (A/B) with a real cross-tenant account; cross-space move asserts real 42501 via finance.update_transaction() and confirms the transaction's household_id stayed unchanged. Edit-voided-transaction case really voids first (lives_ok) then edits and asserts real 22023 - causally correct sequence, not order-independent luck. Follow-up commit cb6e45f added a real same-household move balance-correctness check (asserts exact cents on both source/destination).

## T-035 sibling-name collision (050_finance_categories.sql)
Genuine: an existing category is renamed to "Renombrada" earlier in the fixture setup; new tests insert a case/whitespace variant sibling and rename a distinct second category to the same name, both asserting real 23505 against a real pre-existing sibling - not a self-collision/tautology.

## Currency CHECK test (040_finance_money.sql)
Confirmed the DDL CHECK constraint exists verbatim on both finance.accounts and finance.transactions; new test does direct INSERT with currency='USD' bypassing the seam and asserts real 23514.

## mapPgError bugfix (src/modules/finance/api/index.ts)
Confirmed genuine pre-existing bug via git diff of the pre-fix version: every 22023 from the "move" context (used by both updateTransaction and updateOriginTransaction) was unconditionally mapped to TRANSFER_LEG_NOT_MOVABLE, but the SQL void-lock check ('cannot edit a voided transaction', 22023) fires before the move check regardless of whether a move was attempted - so VOID_TRANSACTION_NOT_EDITABLE was genuinely unreachable dead code. Fix disambiguates via /voided transaction/i regex on the raised message text; verified this substring match is accurate and no other raise exception in the migration collides. WARNING: message-text matching is coupled to exact SQL wording - a future message reword (same sqlstate) would silently break it again with no compile-time signal; tests would only catch a sqlstate change, not a pure reword. Tech debt, not a blocker.

## T-032 facade integration tests (tests/integration/finance-facade.test.ts + helpers/local-supabase.ts)
Confirmed genuinely real, not mocked: local-supabase.ts creates a real confirmed user via service-role admin API, signs in with signInWithPassword against real local GoTrue, returns a real signed-in SupabaseClient. Test file mocks only `server-only` and the createClient() cookie-transport substitution - every RPC call goes out over real HTTP to local PostgREST/Postgres with real RLS/SECURITY DEFINER enforcement. Corroborated by direct DB reads after each facade call and by the 1157ms wall-clock time (vs 8ms for the pure-unit domain test file in the same run).

## Design.md OriginRef fix
Confirmed real: design.md snippet now includes householdId matching the shipped src/modules/finance/api/index.ts type exactly. Documentation-only, no code changed.

## Task completion cross-check
tasks.md diff marks exactly T-032..T-035 as DONE, no scope creep, matches delivered code exactly.

## CRITICAL issues
None.

## WARNING issues
1. Recursion-guard test's specific 54001 sqlstate assertion is Postgres-engine-version-specific (vs accepting 54001 OR 42P17) - low-probability future brittleness, self-flagged by the author.
2. mapPgError's void-vs-move disambiguation via message-text regex is coupled to exact SQL wording, would silently break on a message reword that keeps the same sqlstate.
3. Cosmetic: apply-progress prose said "8 routes generated"; actual next build output lists 6 routes + middleware. Not functional.

## SUGGESTION issues
1. Loosen T-033's sqlstate assertion to accept both 54001 and 42P17.
2. Replace mapPgError's message-text sniffing with a distinct sqlstate/errcode per raise site.

## Final verdict
PASS. Sub-slice 2A (all of it, including this gap-closure follow-up) is ready to be split into PRs and pushed. Nothing found here blocks that. Only remaining open item for lifeos-foundation overall is sub-slice 2C (T-036-T-040, minimal Finance UI), still not started, out of scope.
