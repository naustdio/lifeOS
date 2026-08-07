# Tasks: Finance Transactions — Sub-types

> Task IDs use the `T-` prefix (`T-001`..`T-016`). Each task cites the exact spec requirement(s) it
> satisfies via `finance-transaction-subtypes/Requirement Name`. Design section references use
> `design.md §N`. **Strict TDD is `false`** for this project (per prior finance-cycle precedent,
> `finance-categories-icon-color`/`finance-budgets`) — critical-logic focus, not blanket TDD.
> RED-first ordering applies only to the two pure/rendering surfaces the design names as critical
> logic: the total icon resolver (`resolveTransactionSubtypeIcon`) and the per-tab option lists
> (`subtype-options.ts`), plus the `TransactionForm` sub-type Select behavior it drives. Migration,
> pgTAP, seam, and repository tasks are not TDD-gated, matching the `finance-budgets`/
> `finance-categories-icon-color` convention.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~680 (design.md §"PR Slicing": migration ~240, pgTAP ~90, seam ~30, repository ~10, registry+options ~60, forms+actions+pages ~100, unit/RTL tests ~150) |
| 1000-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (fits with ~30% headroom under the 1000-line session budget) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (cached, not invoked — single PR; fallback split documented below if implementation overruns) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
1000-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Sub-type is storable, pairing-guarded, and readable end-to-end (DB + seam), verifiable with zero UI | PR 1 (fallback slice A if overrun) | `supabase test db` (pgTAP) + `pnpm vitest run tests/unit/finance-facade.test.ts` | `supabase db reset` (local stack) | Revert migration down path (design.md §"Migration / Rollout"), revert `api/index.ts`/`transaction-repository.ts` — no UI depends on this slice |
| 2 | Sub-type pickers render in create/edit forms and resolve to row icons | PR 2 (fallback slice B if overrun) | `pnpm vitest run tests/unit/transaction-subtype-registry.test.ts tests/unit/transaction-subtype-options.test.ts tests/unit/transaction-form-subtype.test.tsx` | Manual: `/movimientos` create + edit flows at 375px against local Supabase | Delete `transaction-subtype-style.ts`, `subtype-options.ts`, revert form/action/page edits — PR 1 unaffected |

If the single-PR estimate holds (expected), both units ship together; the split above only activates
on overrun, using the same DB→UI seam boundary this project has used before.

---

## Phase A — Database (Foundation)

- [x] T-001 — Migration: `supabase/migrations/20260804090018_finance_transaction_subtypes.sql`
  - `alter table finance.transactions add column subtype text` + `transactions_subtype_whitelist` CHECK (5-value list, design.md §1).
  - `create or replace function finance.subtype_matches_type(p_type text, p_subtype text)` — immutable sql pairing helper (design.md §1).
  - **Load-bearing step — explicit DROP before CREATE, not `create or replace`:** `drop function finance.record_transaction(uuid,uuid,uuid,text,bigint,date,text,text,text,text)`, `drop function finance.record_transfer(uuid,uuid,uuid,bigint,date,text,text,text,text)`, `drop function finance.update_transaction(uuid,uuid,uuid,bigint,date,text)` at their exact current 10/9/6-arg signatures (design.md §1a — `create or replace` cannot add a parameter without creating an ambiguous overload and breaking old callers with `42725`).
  - Re-create each function at its new signature (design.md §1b: `record_transaction`/`record_transfer` add trailing `p_subtype text default null`; `update_transaction` adds trailing `p_subtype text default null, p_clear_subtype boolean default false`), full body re-emitted, each with its `subtype_matches_type` guard (`raise exception ... errcode = '22023'` on mismatch, mirroring the existing `p_kind` guard).
  - `update_transaction`'s SET clause: `subtype = case when p_clear_subtype then null else coalesce(p_subtype, subtype) end`.
  - `grant execute` on all three new signatures to `authenticated`; `notify pgrst, 'reload schema'`.
  - **Explicit verification before marking this task done** (design.md Open Questions): run `supabase db reset` locally, then confirm via `\df finance.record_transaction`, `\df finance.record_transfer`, `\df finance.update_transaction` that exactly one signature exists per function (no duplicate/ambiguous overload), and via `select conname from pg_constraint where conname = 'transactions_subtype_whitelist'` that the CHECK exists. Confirm `finance.update_origin_transaction`'s positional 6-arg call to `update_transaction` still resolves (design.md §1b Decision 7).
  - Satisfies: `Optional Bounded Transaction Sub-type`, `Sub-type to Type Compatibility, Enforced at the RPC Layer`, `compra_meses Reserved, Not Selectable`, `Sub-type Editable via update_transaction, Set-Only for v1` (superseded by clear support — see T-001 note below), `Transfer Pair Sub-type Symmetry`, `Old Clients Remain Compatible`.
  - Depends on: none. Parallel: sequential (must land before T-002).

- [x] T-002 — pgTAP: `supabase/tests/0xx_finance_subtypes.sql` (create)
  - Whitelist: `subtype = 'not-real'` rejected by CHECK; each of the 5 values accepted at column level; `null` accepted.
  - Pairing: `record_transaction(kind=>'income', p_subtype=>'pago')` raises `22023`; `kind=>'expense'` + `'reembolso'` raises; `record_transfer` + `'pago'` raises; `compra_meses` raises on all three RPCs (asserts Decision 6's reservation); valid pairs succeed for all four selectable sub-types.
  - Backward compat: every RPC called with the old argument count still succeeds, stores `subtype = null` (regression for the DROP+CREATE overload hazard in T-001).
  - Transfer pair: `pago_tarjeta` transfer — both legs share `transfer_group_id` and `subtype`; idempotent replay does not alter it.
  - Update semantics: `p_subtype => null, p_clear_subtype => false` leaves value unchanged; `p_clear_subtype => true` clears to `null`; mismatched `p_subtype` raises `22023`; a voided row still rejects the edit (void-lock runs first).
  - Origin path: `update_origin_transaction` still resolves and patches post drop/re-create.
  - Satisfies: all Domain: finance-transactions requirements (DB-layer scenarios).
  - Depends on: T-001. Parallel: sequential.

## Phase B — Seam

- [x] T-003 — `src/modules/finance/api/index.ts` (modify)
  - `RecordTransactionInputSchema`/`RecordTransferInputSchema`: add `subtype: z.string().optional()`.
  - `TransactionPatchSchema`: add `subtype: z.string().nullable().optional()` (tri-state: undefined=leave unchanged, null=clear, string=set).
  - Forward `p_subtype: i.subtype ?? null` on both record calls; on `updateTransaction`, `p_subtype: p.subtype ?? null` + `p_clear_subtype: p.subtype === null`.
  - `mapPgError`: disambiguate `22023` + `/subtype/i.test(e.message)` to `INVALID_SUBTYPE_FOR_TYPE` **before** the existing context branches (mirrors the `/voided transaction/i` precedent).
  - Satisfies: `Sub-type to Type Compatibility, Enforced at the RPC Layer`, `Sub-type Editable via update_transaction, Set-Only for v1` (clear path), `Old Clients Remain Compatible`.
  - Depends on: T-001. Parallel: yes, independent of T-002.

- [x] T-004 — `src/modules/finance/data/transaction-repository.ts` (modify)
  - Add `subtype` to both `select` column lists and to `TransactionListItem`; thread through both row mappers.
  - Depends on: T-001. Parallel: yes, independent of T-003.

## Phase C — Design System (Pure Logic, RED-first)

- [x] T-005 [RED] — `tests/unit/transaction-subtype-registry.test.ts` (create)
  - Asserts `resolveTransactionSubtypeIcon` is total: each of the 5 keys (`pago`, `reembolso`, `devolucion_efectivo`, `pago_tarjeta`, `compra_meses`) resolves to its statically-imported icon; `null`/`undefined`/`""`/`"garbage"` resolves to `undefined`, never a throw.
  - Parity assertion: registry keys ≡ migration's CHECK list (fixture copied from `20260804090018_finance_transaction_subtypes.sql`) — the drift guard.
  - Fails: `transaction-subtype-style.ts` does not exist yet.
  - Satisfies (drives): `Transaction Sub-type Icon Registry` (all 3 scenarios), `Sub-type Resolver Fallback for Unknown or Null Keys` (all 3 scenarios).
  - Depends on: T-001 (CHECK list fixture source). Parallel: sequential.

- [x] T-006 [GREEN] — `src/design-system/tokens/transaction-subtype-style.ts` (create)
  - `TRANSACTION_SUBTYPE_ICONS` (explicit named Lucide imports: `Receipt`, `Undo2`, `HandCoins`, `CreditCard`, `CalendarClock`), `TransactionSubtypeKey` type, `resolveTransactionSubtypeIcon` returning `LucideIcon | undefined` — implemented to satisfy T-005. No color map.
  - Depends on: T-005. Parallel: sequential.

- [x] T-007 [RED] — `tests/unit/transaction-subtype-options.test.ts` (create)
  - Every tab (`expense`/`income`/`transfer`)/type maps to its exact option set (`pago` | `reembolso`,`devolucion_efectivo` | `pago_tarjeta`); union of all option lists excludes `compra_meses`; every option key is a registry key (T-006).
  - Fails: `subtype-options.ts` does not exist yet.
  - Satisfies (drives): `compra_meses Reserved, Not Selectable` (selector-absence scenario).
  - Depends on: T-006. Parallel: sequential.

- [x] T-008 [GREEN] — `src/app/(app)/movimientos/subtype-options.ts` (create)
  - Spanish labels (Pago · Reembolso · Devolución en efectivo · Pago de tarjeta) + per-tab/per-type option lists — implemented to satisfy T-007.
  - Depends on: T-007. Parallel: sequential.

## Phase D — UI Wiring

- [x] T-009 [RED] — `tests/unit/transaction-form-subtype.test.tsx` (create)
  - `TransactionForm`: expense tab shows exactly "Sin subtipo" + Pago; switching tabs resets selection to "Sin subtipo" and shows the new tab's options; no native `<select>`.
  - `EditTransactionForm`: pre-selects the stored `subtype` value; choosing "Sin subtipo" submits a clear.
  - Fails: neither form renders a sub-type `<Select>` yet.
  - Satisfies (drives): `Sub-type Editable via update_transaction, Set-Only for v1` (edit scenario), `compra_meses Reserved, Not Selectable` (UI scenario).
  - Depends on: T-008. Parallel: sequential.

- [x] T-010 [GREEN] — `src/app/(app)/movimientos/TransactionForm.tsx` (modify)
  - Add sub-type `<Select key={tab} name="subtype" defaultValue="none">` block after Categoría (income/expense forms) and after Hacia (transfer form), options from `subtype-options.ts` keyed on `tab` — implemented to satisfy T-009.
  - Depends on: T-009. Parallel: yes, parallel with T-011.

- [x] T-011 — `src/app/(app)/movimientos/[id]/editar/EditTransactionForm.tsx` + `.../page.tsx` (modify)
  - Same Select block, options from `transaction.type`, `defaultValue={transaction.subtype ?? "none"}`. Add `subtype` to the `transaction` prop, sourced from `getTransactionById` in `page.tsx` — implemented to satisfy T-009.
  - Depends on: T-009, T-004 (repository exposes `subtype`). Parallel: yes, parallel with T-010.

- [x] T-012 — `src/app/(app)/movimientos/actions.ts` (modify)
  - `"none"` ↔ `undefined` (record actions) / `null` (update action) mapping in the three server actions; `patch.subtype = raw === "none" ? null : raw`.
  - Depends on: T-010, T-011, T-003. Parallel: sequential.

- [x] T-013 — `src/app/(app)/movimientos/page.tsx` (modify)
  - `icon={resolveTransactionSubtypeIcon(tx.subtype)}` on `<TransactionRow>`.
  - Depends on: T-006, T-004. Parallel: yes, parallel with T-014.

- [x] T-014 — `src/app/(app)/page.tsx` (modify)
  - Same wiring, recent-movements feed only (accounts list keeps its own rows).
  - Depends on: T-006, T-004. Parallel: yes, parallel with T-013.

## Phase E — Integration & Verification

- [x] T-015 — `tests/unit/finance-facade.test.ts` (modify)
  - `INVALID_SUBTYPE_FOR_TYPE` returned for a bad pair; `VOID_TRANSACTION_NOT_EDITABLE` still returned for a voided-row edit (named regression for the shared `22023` disambiguation in T-003).
  - Depends on: T-003. Parallel: yes, independent of Phase D.

- [x] T-016 — Run `pnpm verify` (ESLint boundaries, `tsc --noEmit`, `check-tokens.mjs`, `next build`) and `supabase test db` (full pgTAP suite including T-002).
  - Depends on: T-012, T-013, T-014, T-015. Parallel: sequential (final gate).

---

## Dependency Summary (critical path)

```
T-001 (migration, DROP+CREATE) → T-002 (pgTAP)
T-001 → T-003 (seam)              [parallel with T-004]
T-001 → T-004 (repository)        [parallel with T-003]
T-001 → T-005 [RED] → T-006 [GREEN] (registry)
T-006 → T-007 [RED] → T-008 [GREEN] (options)
T-008 → T-009 [RED] → T-010, T-011 [GREEN] (forms, parallel)
T-010, T-011, T-003 → T-012 (actions.ts)
T-006, T-004 → T-013, T-014 (page wiring, parallel)
T-003 → T-015 (facade integration test, parallel with Phase D)
T-012, T-013, T-014, T-015 → T-016 (pnpm verify + pgTAP, final gate)
```

T-002 is not a TDD gate for app-code tasks — it accompanies T-001, matching the `finance-budgets`
precedent. T-005, T-007, T-009 ARE explicit RED-first gates: they cover the design's named
critical-logic surfaces (total icon resolver, per-tab option lists, sub-type Select behavior) and
must fail before their GREEN implementation task lands.
