# Archive Report — finance-account-types-expansion

**Change**: finance-account-types-expansion
**Archived**: 2026-08-07
**Closure method**: manual (orchestrator-driven), consistent with this project's established precedent

## What was verified (real evidence)

Implemented across 2 stacked PRs (`feat/finance-account-types-expansion-1-db-contracts`, `feat/finance-account-types-expansion-2-ui`), 15/15 tasks:

| Check | Result |
|---|---|
| Slice A (DB + all 7 type-knowledge sites) | pgTAP full suite, all files green including the dedicated inverted-sign-guard regression for `loaned`; `pnpm verify` clean; 163/164 vitest (1 known pre-existing flake) |
| Slice B (UI) | `pnpm verify` clean twice; 167/168 vitest twice (same known flake); 2 new real-stack integration tests against live local Supabase proving the read path end-to-end under RLS |
| Post-merge integration (all 5 changes combined on `main`) | pgTAP `040_finance_money.sql` 50/50 (part of 288/288 full-suite), `pnpm verify` clean |

**CRITICAL findings**: none. During implementation, the Slice A agent found an 8th duplication site the design doc had missed (a stray Zod-branch test mismatch), documented and corrected before commit.

## Spec merge

Delta specs for `finance-accounts` (1 MODIFIED "Six Account Types" → "Eight Account Types", 5 ADDED) and `finance-module-api` (2 ADDED) were merged into the main specs. No conflicts.

## Outcome

Investment and Prestado (loaned) account types are **complete and closed**: manual cost-basis/current-value tracking for investments (explicitly no market-data integration), counterparty-tracked loaned accounts with an inverted balance-sign guard verified independent of the liability guard, and all 7 places in the codebase that encode account-type knowledge updated atomically. Merged to `main`.
