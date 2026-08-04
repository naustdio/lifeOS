# Verify Report — lifeos-foundation, Sub-slice 2A (Finance schema, RLS, seam, TS facade)

**Branch**: feat/lifeos-foundation-2a-finance-schema
**Scope**: finance-accounts, finance-categories, finance-transactions, finance-module-api specs. 2C UI (T-036–T-040) intentionally excluded from this verification.
**Verdict**: PASS WITH WARNINGS

## Real execution evidence (all re-run independently, not trusted from apply-progress)

- `supabase status`: local stack up (ports 55321/55322/55323 per config.toml).
- `supabase test db`: 5 files, **69/69 pgTAP assertions PASS**. Confirmed matches apply-progress claim.
- `pnpm test` (vitest): 4 files, **24/24 tests PASS**.
- `pnpm verify` (eslint --max-warnings=0 && tsc --noEmit && check-tokens.mjs && next build): PASS clean.
- Migration files read directly (not just apply-progress prose): `security_invoker = true` present on BOTH `finance.account_balances` (line 216) and `finance.household_summary` (line 228) in 20260804090005_finance_schema.sql.
- All 6 finance.* tables have `enable row level security` (20260804090006_finance_security.sql lines 13-18); accounts/transactions are SELECT-only policies (no INSERT/UPDATE/DELETE policy = deny-by-default); categories has SELECT+INSERT+UPDATE, no DELETE.
- `revoke all on all tables/functions in schema finance from anon, authenticated` + default-privilege revocation (lines 61-64), explicit re-grants only for SELECT (read tables/views) and categories INSERT/UPDATE — matches design.md §5.5 verbatim.
- `tx_idempotency` unique index: `(household_id, origin_module, origin_entity_id, idempotency_key) WHERE idempotency_key IS NOT NULL` — matches design.md §5.3/§3.3 exactly, household-prefixed as required.
- `finance.create_account()` (20260804090008_finance_api.sql): account insert + liability/goal detail insert in one function body (one transaction); detail-block/type mismatch raises 22023 before any insert; positive opening_balance on credit_card/liability raises 22023; class omitted from INSERT (trigger-derived per §3.4, not duplicated).
- Transfer-leg-immovable rule: `finance.update_transaction()` checks `v_tx.type = 'transfer'` and raises 22023 BEFORE the destination-account check, exactly per design.md §5.4 ordering requirement.

## Deviation check: OriginRef gains `householdId`

CONFIRMED REAL. design.md §"Interfaces/Contracts" (line 1205) literally types `OriginRef = { module; entityId }` — no `householdId`. The actual code (`src/modules/finance/api/index.ts` lines 23-27, and the SQL migration header) adds `householdId: z.string().uuid()`. Verified the SQL functions `update_origin_transaction`/`void_origin_transaction`/`find_by_origin` (20260804090008) all take `p_household_id` as an explicit parameter and use it to scope the origin lookup (`where household_id = p_household_id and origin_module = ... and origin_entity_id = ...`) — without it, an `(origin_module, origin_entity_id)` pair is not guaranteed unique across tenants since the uniqueness index itself is household-prefixed. This is a REASONABLE AND NECESSARY correction, consistent with the design's own stated convention ("household_id is a parameter, not session-resolved," §5.6) applied everywhere else in the seam. It is NOT a design inconsistency requiring reconciliation of behavior — but design.md's literal type snippet was never updated to reflect it, which is a real, if minor, documentation-drift gap. WARNING: update design.md §Interfaces/Contracts to match the shipped `OriginRef` shape (housekeeping, not a functional risk).

## "hogar"/"household" UI-text check

Grepped `src/` for `hogar|household` (case-insensitive). Zero matches in user-facing strings. All matches are: (a) `householdId` as a TypeScript identifier/field name (not rendered text), (b) code comments citing the spec requirement itself (`layout.tsx`: "and NOTHING that names or lets the user pick a 'household'/'hogar'"), (c) `mapPgError()` error messages in the facade — checked verbatim, none contain "household" or "hogar" in user-facing message text (e.g. "You are not a member of that space," "That destination account is not valid"). PASS — no leakage.

## pgTAP assertion spot-check (not tautologies)

- **Transfer sum-zero** (`040_finance_money.sql` lines 176-179): `select sum(amount_cents) from finance.transactions where transfer_group_id = ...` computed from real inserted rows via `finance.record_transfer()`, asserted `= 0`. Real invariant check, not hardcoded.
- **security_invoker regression** (lines 244-251): switches JWT claims to household-B non-member user B, queries `finance.account_balances` filtered to household A, asserts `count = 0`. Genuinely exercises RLS-through-view; would fail loudly if `security_invoker` were dropped.
- **Positive-opening-balance rejection** (lines 86-95): calls `finance.create_account(..., 'credit_card', 100)` and `(..., 'liability', 100, ...)`, asserts `throws_ok('22023')`. Real function invocation, not a mock.

All three are genuine functional assertions.

## Spec compliance matrix

### finance-accounts
| Requirement | Status | Evidence |
|---|---|---|
| Six Account Types | SATISFIED | Schema CHECK + create_account type dispatch; pgTAP tests all 6 types' class mapping |
| — Non-MXN currency rejected (scenario) | **UNTESTED (WARNING)** | `currency CHECK` constraint exists in DDL (`currency char(3) ... check (currency='MXN')`) on both accounts and transactions, but no pgTAP assertion exercises it. Trivial/low-risk DDL, but genuinely a gap not previously flagged by apply-progress. |
| Liability Account Detail | SATISFIED | atomic detail insert pgTAP-tested, all 5 fields required |
| Savings-Goal Account Detail | SATISFIED | atomic detail insert tested; goal progress is balance/target, no separate counter (schema-level, confirmed no such column exists) |
| Derived Balances | SATISFIED | view formula confirmed; void-exclusion tested (040 lines 151-164) |
| Account Archiving | PARTIAL (WARNING) | `archived_at` column + partial index exist; `account_balances` view does not filter archived accounts (history/balance stays computable — structurally correct); but "excluded from active list" is a read-path/UI concern properly deferred to 2C (out of scope this run) and there is no dedicated pgTAP test for the archived-row-still-computable scenario specifically. Not blocking. |

### finance-categories
| Requirement | Status | Evidence |
|---|---|---|
| Two-Level Taxonomy | SATISFIED | `050_finance_categories.sql` line 80-86: nested-child rejected 22023 |
| Seeded Spanish Defaults | SATISFIED | per-space copy via `ensure_default_categories`, tested via `app.bootstrap_user()` in 050 |
| User-Created Categories | SATISFIED | categories INSERT policy + RLS test (030) |
| Rename Any Category | SATISFIED | 050 lines 50-60: rename isolated per space, tested for both spaces |
| Deactivate Categories Instead of Deleting | PARTIAL (WARNING) | DELETE denied and archive-only is RLS-tested (030 line 112-114); the "deactivated hidden from picker" / "still resolves for historical transactions" scenarios are UI/read-path concerns appropriately deferred to 2C (out of scope). |
| Sibling-name-collision → CATEGORY_NAME_TAKEN (23505) | **UNTESTED — matches apply-progress's own flagged gap** | `categories_unique_name` index exists and is real; facade maps 23505→CATEGORY_NAME_TAKEN in code; but no pgTAP or Vitest test actually triggers the collision path. WARNING for this checkpoint (see judgment below), not CRITICAL. |

### finance-transactions
| Requirement | Status | Evidence |
|---|---|---|
| Transaction Types and Money Representation | SATISFIED | signed amount_cents CHECKs; record_transaction pgTAP-tested |
| Linked Transfer Pairs | SATISFIED | record_transfer inserts both legs atomically, sum-zero tested |
| Transfers Excluded From Income/Expense Reporting | SATISFIED (schema-level) | index `where status='posted' and type<>'transfer'` exists; no dedicated pgTAP aggregate-query test, but the exclusion is structural (any correct SUM/aggregation query using this partial index or a `type<>'transfer'` filter naturally excludes transfers) — reporting UI is 2C/deferred |
| Void Lifecycle, Never Hard-Delete | SATISFIED | void-then-balance-exclusion tested (040); void-both-transfer-legs implemented in `void_transaction` (single UPDATE on `transfer_group_id`) but **not directly pgTAP-asserted** — matches apply-progress's flagged T-034 gap |
| paid_by_user_id Hidden From Personal-Mode UI | N/A this slice | Column exists (`paid_by_user_id uuid`); no UI yet (2C, out of scope) |

### finance-module-api
| Requirement | Status | Evidence |
|---|---|---|
| Public API Is the Only Cross-Module Write Surface | SATISFIED | grants revoked, direct-DML-denied regression tested (030 lines 78-102); facade is the only import path (`server-only` + ESLint) |
| Server-Side, Atomic Execution | SATISFIED | all seam functions are single-transaction PL/pgSQL SECURITY DEFINER with pinned `search_path=''` |
| Idempotent recordTransaction | SATISFIED at DB level (040 lines 204-224: replay returns same row, exactly one row exists) | **NOT tested at facade level** (T-032 gap, confirmed absent — no facade-against-live-stack test file exists under `tests/`) |
| Origin as a Soft Reference | SATISFIED | `origin_entity_id text` no FK; facade never queries other schemas |
| Module-Originated Transactions Post Immediately | SATISFIED | `status default 'posted'`, no queue step anywhere in the seam |
| Update and Void Follow the Source Record | SATISFIED (functions exist, correctly wired) | update/void-origin functions delegate correctly; **cross-space destination rejection and editing-a-voided-transaction rejection are NOT pgTAP-tested** (T-034 gap, confirmed genuinely absent by grep — only same-household transfer-leg-reject is tested in 040) |
| findByOrigin Returns Null, Not an Error, When Absent | SATISFIED (by code inspection; `find_by_origin` returns an empty set, facade maps to `ok(null)`) | not independently pgTAP/Vitest-tested, but the code path is simple and low-risk |

## Confirmed-absent test coverage (apply-progress's own "NOT done" list — verified genuinely absent by direct search, not just trusted)

Grepped `supabase/tests/` and `tests/` directories directly:
- **T-032** (facade contract tests against live Supabase): confirmed absent — only `tests/unit/{no-household-text,finance-domain,theme-selection,boundary-lint}.test.ts` exist; no facade/contract test file exists anywhere in the repo.
- **T-033** (standalone SECURITY DEFINER recursion-guard test): confirmed absent — no match for "recursion" in `supabase/tests/`.
- **T-034** (cross-space account-move rejection test, edit-voided-transaction rejection test): confirmed absent — no match for "voided transaction" rejection or "cross-space" in the test SQL beyond the transfer-leg-reject case.
- **T-035** (sibling-category-name-collision test): confirmed absent — no match for "23505"/"CATEGORY_NAME_TAKEN" anywhere in `supabase/tests/`.

All four are genuinely missing, exactly as apply-progress self-reported — not secretly done and mislabeled.

## Judgment: CRITICAL vs WARNING on the missing test coverage

None of T-032–T-035 gaps are rated CRITICAL for this checkpoint:
- The underlying mechanisms they would test (idempotency, RLS-bypass denial, cross-space guard, void-locks-edit, name-collision constraint) are all **implemented in the reviewed SQL/TS source** and were spot-checked directly above to be correct — this is source-level verification, not just "trust the apply report."
- The 69 pgTAP + 24 Vitest tests that DO exist and DO pass already exercise the highest-risk money-correctness surface (balance math, transfer sum-zero, idempotency-at-DB-level, security_invoker/RLS regression, atomic account creation, positive-opening-balance rejection) — the missing tests are for secondary/defensive-regression scenarios (recursion never observed across 69 assertions; sibling-collision is a straightforward unique-index behavior; cross-space rejection duplicates a pattern already proven correct for the analogous archived-account check).
- This is a personal-project checkpoint, not a production financial institution; the missing coverage is real technical debt that should close before the next slice touches these code paths again, but does not indicate the shipped 2A code is currently wrong.

**Verdict: WARNING, not CRITICAL.** Recommend closing T-032–T-035 in the immediately-next apply run before starting 2C, since 2C's UI work will exercise exactly these code paths (createAccount error surfacing, transaction correction UI, category rename) without a safety net otherwise.

## CRITICAL issues found

**None.** All four spec files' core requirements are satisfied with real, re-executed runtime evidence. No spec-claimed-done-but-not-actually-true findings.

## WARNING issues (full list)

1. design.md §"Interfaces/Contracts" `OriginRef` type is stale — does not reflect the shipped (and necessary) `householdId` field. Documentation-only fix.
2. T-032 (facade contract tests against live Supabase) genuinely not done — confirmed absent.
3. T-033 (recursion-guard regression test) genuinely not done — confirmed absent.
4. T-034 (cross-space move rejection test, edit-voided-transaction rejection test) genuinely not done — confirmed absent. Void-both-transfer-legs is implemented but not directly asserted either.
5. T-035 (sibling-name-collision test) genuinely not done — confirmed absent.
6. Non-MXN-currency-rejected CHECK constraint scenario (finance-accounts, finance-transactions) has no dedicated pgTAP test — a new finding, not in apply-progress's list, low risk (trivial DDL).
7. Account Archiving / Category Deactivation "hidden from active/picker list" scenarios are UI/read-path concerns correctly deferred to 2C — flagged here only for traceability, not counted against this slice.

## SUGGESTION issues

1. Reconcile design.md's `OriginRef` type snippet in a small follow-up commit alongside closing T-032–T-035, so the design doc and code stay in sync going forward.
2. Consider adding a one-line pgTAP assertion for the currency CHECK constraint since it is cheap and closes a literal spec scenario ("Non-MXN currency is rejected").

## Task completion cross-check

tasks.md: T-001–T-031 marked `[x] DONE` (31/40). T-032–T-040 correctly unmarked (no `[x]` prefix) — matches actual code state exactly, no mislabeling found. 2C (T-036–T-040) not started, consistent with out-of-scope instruction for this verification.

## Commands run (real, this session)

- `supabase status` → stack up, ports 55321/55322/55323
- `supabase test db` → `Files=5, Tests=69` all PASS
- `pnpm test` → `Test Files 4 passed (4)`, `Tests 24 passed (24)`
- `pnpm verify` → eslint clean, tsc clean, check-tokens OK, `next build` succeeded
