# Verify Report — lifeos-foundation, sub-slice 1B (Identity Kernel)

**Change**: lifeos-foundation
**Scope**: Sub-slice 1B only.
**Verdict: PASS WITH WARNINGS**

## Command evidence
- `pnpm verify`: **PASS**.
- `supabase --version`: confirmed **not installed** (`command not found`).

## Manual SQL/RLS inspection

```sql
create or replace function core.is_member(p_household_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from core.household_members m
  where m.household_id = p_household_id and m.user_id = (select auth.uid())); $$;
```

**Branch inspected**: `feat/lifeos-foundation-1b-identity` (HEAD 0e63a44, built on `pr/1a-2-design-system-pwa`). Diff vs `pr/1a-2-design-system-pwa`: 27 files changed, 1109 insertions, 59 deletions.

## Task completion (tasks.md)
T-009..T-017 all marked `[x]`. Verified against actual files, not just checkbox claims — all 9 tasks have real corresponding code (see evidence below), none is a stub.

## Spec compliance matrix (identity/spec.md)

| Requirement | Status | Evidence |
|---|---|---|
| Google OAuth Only | SATISFIED (code-verified; SQL/runtime untested) | `src/app/(public)/entrar/page.tsx` offers exactly one CTA, `signInWithOAuth({provider:'google'})`, no other provider/method anywhere in the codebase. |
| Auto-Created Personal Space on First Sign-In | SATISFIED by inspection, NOT proven by execution | `supabase/migrations/20260804090003_core_bootstrap.sql` `core.ensure_personal_space()` and `.../090004_app_bootstrap.sql` `app.bootstrap_user()` match design.md sec6.2/sec6.1 exactly, called from `src/app/auth/callback/route.ts` via `supabase.schema("app").rpc("bootstrap_user")`. Idempotency/race logic is correct on inspection but the pgTAP idempotency test and the true-concurrency script were never run. |
| Household Terminology Hidden From UI | SATISFIED | Search for hogar/household in src/ finds only 3 hits, all inside comments describing the requirement itself — zero occurrences in rendered JSX/strings. tests/unit/no-household-text.test.ts scans the authenticated shell, public sign-in screen, and design-system components with comments stripped and asserts zero offenders — test passed in this session's pnpm test run. No space-selection control exists anywhere in the authenticated shell. |
| Roles Are Owner or Member Only | SATISFIED by inspection only | core.household_members.role text not null check (role in owner/member) in 20260804090001_core_schema.sql line 29 — exact CHECK constraint. Not exercised by a runtime test in this session. |
| RLS Enforced by Household Membership | SATISFIED by inspection only, NOT proven by execution | core.* RLS is deny-by-default, tenant key is household membership (never bare user_id except for self-profile access), correctly avoids recursion. supabase/tests/010_core_rls.sql covers member/non-member/anon/direct-insert-denied cases exactly per design.md sec4.4 but was never executed. |

## Manual SQL/RLS inspection (the security-critical layer — NOT executed, inspection only)

Checked against the four specific correctness traps called out in the task brief:

**(a) core.is_member()/assert_member() are correctly SECURITY DEFINER with pinned search_path** — confirmed in supabase/migrations/20260804090002_core_security.sql. security definer plus set search_path = '' present on is_member, is_owner, and assert_member (plpgsql, raise exception using errcode = '42501'). This is NOT a plain SQL function — it correctly breaks the "infinite recursion detected in policy" trap the task brief warns about, because the definer function reads core.household_members with RLS bypassed rather than being re-evaluated as a policy on the same table it queries. (select auth.uid()) (not bare auth.uid()) is used for InitPlan caching, matching design.md sec4.1.

**(b) RLS policies are deny-by-default and keyed on household membership, not bare user_id** — confirmed. All three core.* tables get RLS enabled with zero permissive default. core.households/core.household_members policies use core.is_member(id)/core.is_member(household_id) as the tenant key. The one exception is core.profiles, which correctly uses user_id = (select auth.uid()) for the self-row case (that is what the spec's data model requires — profiles are per-user, not per-household) plus a household-membership OR-clause for future sharing visibility. No INSERT policy exists on households/household_members (bootstrap-function-only, matches design intent), so a direct client INSERT is rejected purely by absence of a policy — the pgTAP test file expects and asserts this with throws_ok(...,'42501',...).

**(c) Bootstrap has the documented unique-index race guarantee, not check-then-insert** — confirmed. core.households.personal_owner_user_id uuid unique (migration 090001) is the real guard. core.ensure_personal_space() (migration 090003) does an INSERT ... ON CONFLICT (personal_owner_user_id) DO NOTHING RETURNING id INTO v_household, then falls back to a SELECT by personal_owner_user_id if v_household is null — this is genuinely the pattern design.md sec6.2 documents as race-free, relying on the unique index to serialize concurrent callers at the Postgres level. It is not a vulnerable check-then-insert. core.household_members insert also uses ON CONFLICT (household_id, user_id) DO NOTHING. This logic is correct by code reading; it has never been exercised by an actual concurrent test run (see Warnings).

**(d) SECURITY DEFINER functions have EXECUTE explicitly revoked from PUBLIC where design requires it** — confirmed for the two functions design.md explicitly calls out: core.ensure_personal_space() has EXECUTE revoked from PUBLIC (migration 090003) and is not granted to authenticated at all — reachable only via app.bootstrap_user(), matching T-013's stated intent. app.bootstrap_user() has EXECUTE revoked from PUBLIC then granted to authenticated (migration 090004). Minor observation (not a spec violation): core.is_member/is_owner/assert_member do not have an explicit revoke from PUBLIC, only a grant to authenticated; design.md never asked for these three to be revoked from PUBLIC (they are broadly callable membership checks with no side effects), so this is consistent with the design, not a gap.

## Correctness table (design.md deviations)

| Area | Deviation from design? | Note |
|---|---|---|
| DDL (sec3.1) | None | core_schema.sql is structurally equivalent to design.md sec3.1. |
| RLS policy strategy (sec4.1/sec4.2) | None | Matches table exactly, incl. grant layering (table GRANT + RLS policy, both needed). |
| Bootstrap composition root (sec6.1/sec6.2) | None | app.bootstrap_user() correctly calls only core.ensure_personal_space() this slice, per the explicit slice-1/slice-2 split; comment correctly flags where the finance step will be added later via CREATE OR REPLACE. |
| supabase/ssr session handling (sec6) | None | Three clients (browser.ts, server.ts, middleware.ts) match the documented shapes; middleware correctly returns the exact response object whose cookies were mutated (the documented trap is explicitly avoided, with an inline comment naming the trap); uses getUser() not getSession() for the authorization decision in src/middleware.ts. |
| Route protection | None | src/middleware.ts redirects unauthenticated users away from any non-/entrar//auth/* path, and redirects authenticated users away from /entrar; (app)/layout.tsx adds a defense-in-depth redirect. Verified this is live code, not dead: the middleware runs on next build's Middleware bundle (92.8kB reported), and its logic was read directly, not inferred. |

## Issues

**CRITICAL**: None found. No spec-claimed-done-but-actually-false code was identified; all 9 sub-slice-1B tasks correspond to real, design-consistent implementation.

**WARNING — DB-layer correctness not proven by execution.** The pgTAP RLS suite (supabase/tests/010_core_rls.sql), the pgTAP idempotency suite (supabase/tests/020_core_bootstrap_idempotency.sql), and the true-concurrency bash script (scripts/test-bootstrap-race.sh) are all written, structurally sound on reading, and cover the exact mandatory cases design.md sec4.4 and the T-012 race trap call for — but none of them has ever been run against a real Postgres instance, in this verify session or the prior apply session (no Supabase CLI available in either environment). This means identity's security-critical logic — RLS enablement actually taking effect, the definer functions actually avoiding recursion at runtime, and the unique-index race guarantee actually holding under genuine concurrent connections — has been checked by careful code reading only, not by execution. Code reading found no defects and the logic is internally consistent with documented Postgres/Supabase semantics, but inspection is not proof: a typo in a CHECK constraint, an unapplied migration ordering issue, or a subtlety in how Supabase's request.jwt.claims GUC interacts with SECURITY DEFINER functions would not be caught by reading alone. Recommendation: run `supabase start && supabase test db` and `./scripts/test-bootstrap-race.sh` against a local stack before merging, since this is the tenancy foundation every other module's RLS depends on.

**SUGGESTION**: None currently — the identified gap is fully covered by the WARNING above; no additional low-priority findings.

## Final Verdict

**PASS WITH WARNINGS.** All 9 sub-slice-1B tasks are genuinely implemented and match design.md; pnpm verify and pnpm test both pass with real command output; static grep plus a passing automated test confirm the "no household/hogar language" requirement holds in what was actually built. The one substantive gap is that the identity kernel's most security-sensitive layer (RLS, SECURITY DEFINER functions, the bootstrap race guarantee) has been verified by careful SQL inspection only, never by execution against a live or local database — this is a known, previously-communicated environment limitation (no Supabase CLI available), not a code defect discovered in this session, but it should weigh into the merge decision: do not treat this sub-slice as "DB-layer proven" until supabase test db and the concurrency script are actually run.
