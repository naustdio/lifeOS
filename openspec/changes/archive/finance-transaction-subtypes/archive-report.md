# Archive Report — finance-transaction-subtypes

**Change**: finance-transaction-subtypes
**Archived**: 2026-08-07
**Closure method**: manual (orchestrator-driven), consistent with this project's established precedent

## What was verified (real evidence)

Implemented as a single PR (`feat/finance-transaction-subtypes`), 16/16 tasks, real gates against the local Supabase stack:

| Check | Result |
|---|---|
| pgTAP (`110_finance_subtypes.sql`) | 26/26 (part of the 288/288 full-suite run post-merge) |
| `pnpm verify` | Clean |
| `pnpm test` | 170/171 at apply time (1 pre-existing flaky `boundary-lint.test.ts`, confirmed non-regression in isolation); 270/271 in the final post-merge full-suite run, same known flake |
| RPC signature migration (`record_transaction`/`record_transfer`/`update_transaction`) | Verified via `\df` — exactly one signature each after the mandatory `DROP FUNCTION` + `CREATE` (Postgres `create or replace` cannot add a parameter without creating an ambiguous overload) |

**CRITICAL findings**: none.

**Deviation corrected at archive time**: the spec originally stated sub-type clearing was "not supported in v1, set-only" — but the actual implementation (guided by the design phase, which ran in parallel with the spec phase) added an explicit `p_clear_subtype boolean` parameter to `update_transaction` that does support clearing. The merged main spec's "Sub-type Editable via update_transaction" requirement was corrected to describe the real, more capable behavior before archiving.

## Spec merge

Delta specs for `finance-transactions` (5 ADDED requirements) and `design-system` (2 ADDED requirements) were merged into the main specs. One requirement's wording was corrected against the real implementation (see above); a second correction confirmed the sub-type icon resolver deliberately returns `undefined` rather than a visible fallback (to avoid changing every historical `subtype = null` row's appearance) — the spec text was rewritten to match this real, intentional behavior rather than the original draft's "must never return undefined" wording.

## Outcome

Transaction sub-types are **complete and closed**: Pago, Reembolso, Devolución en efectivo, and Pago de tarjeta are selectable and validated at the RPC layer; `compra_meses` ships as a reserved, invisible CHECK value pending the future installment-grouping change. Merged to `main`.
