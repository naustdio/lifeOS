# Proposal: Finance Transactions — Sub-types

## Intent

`finance.transactions.type` is exactly `income|expense|transfer` (…0005 line 159) and nothing else describes *what kind* of movement a row is. A bill payment, a refund, a cashback return, and a credit-card payment are today indistinguishable from any other expense/income/transfer — the ledger can say "how much" and "which category" but never "what happened". Users must encode intent in the free-text `description`, which is unsearchable, unstyleable, and inconsistent between household members. This change adds an optional, bounded **sub-type** label so those four movements carry a first-class identity, icon, and future reporting handle.

## Scope

### In Scope
- Migration: nullable `subtype text` on `finance.transactions` with its own CHECK whitelist (`pago`, `reembolso`, `devolucion_efectivo`, `pago_tarjeta`, `compra_meses`), **not** trigger-coupled to `type`.
- `record_transaction` gains a trailing optional `p_subtype` (accepts `pago`, `reembolso`, `devolucion_efectivo`); `record_transfer` gains one accepting only `pago_tarjeta`. Type/sub-type compatibility is validated **in plpgsql**, mirroring the existing `p_kind` guard — these are SECURITY DEFINER functions, so the client is never the authority.
- `update_transaction` gains `p_subtype` so a mislabel is correctable without void-and-re-record.
- Zod + seam: optional `subtype` on `RecordTransactionInputSchema` / `RecordTransferInputSchema` / `TransactionPatchSchema`; forwarded to the RPCs.
- Repository: `subtype` selected and mapped in `TransactionListItem` (`getTransactionById`, `listRecentTransactions`).
- New icon-only registry `src/design-system/tokens/transaction-subtype-style.ts` with a total `resolve` function and a DB-parity unit test against the new CHECK.
- UI: one optional sub-type `<Select>` per relevant tab in `TransactionForm` and `EditTransactionForm`; call sites resolve the icon and pass it to the existing `TransactionRow`/`CategoryChip` `icon` prop.

### Out of Scope
- **The real "Compra a meses" mechanic.** `compra_meses` is reserved in the CHECK and given an icon token, but is **not selectable in any form this cycle**. Installment plans (plan table, N generated future rows, parent↔installment linkage, "3 of 12 paid") are deferred to `finance-installment-groups` (change 5b, not yet designed).
- Statement/bank import, BNPL provider integration, credit-card interest or minimum-payment logic.
- Colors for sub-types — icons only; sub-types layer onto an already-colored category chip.
- Reporting, filtering, or grouping *by* sub-type (search, spend-by-sub-type charts) — this change stores and displays the label, nothing consumes it analytically yet.
- Any change to `type`, `tx_sign_matches_type`, `tx_transfer_group`, `tx_category_required`, or `tx_transfer_has_no_category`.
- Backfilling sub-types onto historical rows by parsing `description`.
- New RLS policies — `subtype` is a column on an already-protected table.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `finance-transactions`: transactions gain an optional bounded `subtype`; the DB MUST reject values outside the whitelist and MUST reject a sub-type incompatible with the row's `type`.
- `finance-module-api`: `record_transaction`, `record_transfer`, and `update_transaction` accept an optional sub-type; backward compatibility for existing callers is required.
- `design-system`: a sub-type icon MUST resolve from a stored string with a defined unknown/null fallback, resolved at the call site (the `TransactionRow` contract does not change).

## Approach

**A label column, not a fourth type.** Promoting sub-types into `type` would break every one of the five existing CHECK constraints plus the exhaustive `tab: expense|income|transfer` union across the TS/UI layer. A separate nullable column is fully additive: no existing row, constraint, view, or seam consumer changes.

**Mapping is forced by the constraints, not chosen.** `pago`→`expense`, `reembolso`→`income`, `devolucion_efectivo`→`income`, `pago_tarjeta`→**`transfer`**. A card payment moves money from an asset account to a liability account; modeling it as an expense would double-count the debt *and* trip `tx_category_required` (a transfer is categoryless by `tx_transfer_has_no_category`). Transfer is the only shape that survives the current constraint set.

**Decoupled at the DB, validated at the RPC.** The CHECK constrains the *value set* only; the `type`↔`subtype` pairing is enforced in plpgsql. This is deliberate: change 5b can add installment semantics for `compra_meses` without a migration to loosen a trigger, and it matches the existing `p_kind` validation pattern already in `record_transaction`.

**Separate registry from categories.** `src/design-system/tokens/category-style.ts` is categories-only and its DB-parity test is scoped to `finance.categories`. A `pago_tarjeta` transfer has no category at all, so folding sub-type icons into `CATEGORY_ICONS` would couple two orthogonal concepts and break that test's premise.

## Business Rules

1. Sub-type is **always optional**. A movement with no sub-type is a plain expense/income/transfer and behaves exactly as it does today.
2. A sub-type is only valid for its mapped `type`. `pago` on an income, or `pago_tarjeta` on an expense, MUST be rejected by the database, not only by the form.
3. `compra_meses` is a reserved value: storable in principle, but no code path this cycle can produce it.
4. `pago_tarjeta` carries **no** account-type requirement — it is a free label on any transfer, including one whose destination is not a `credit_card` account.
5. Sub-type is a household-shared attribute of the movement, not a per-user annotation; RLS already scopes it.
6. Sub-type is cosmetic/descriptive: it never alters sign, balance math, category requirements, or the transfer pair.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/migrations/` | New | `subtype` column + CHECK whitelist; `create or replace` for the three RPCs |
| `supabase/tests/` | Modified | pgTAP: whitelist rejection, type/sub-type mismatch rejection, null-default backward compat |
| `src/modules/finance/api/index.ts` | Modified | Optional `subtype` on 3 zod schemas; forward `p_subtype` |
| `src/modules/finance/data/transaction-repository.ts` | Modified | Select + map `subtype` into `TransactionListItem` |
| `src/design-system/tokens/transaction-subtype-style.ts` | New | Icon-only registry + total resolver |
| `tests/unit/` | New | DB-parity test for the sub-type registry |
| `src/app/(app)/movimientos/TransactionForm.tsx` | Modified | Optional sub-type `<Select>` per tab |
| `src/app/(app)/movimientos/[id]/editar/EditTransactionForm.tsx` | Modified | Same, for edit |
| `src/app/(app)/movimientos/page.tsx`, Home feed | Modified | Resolve sub-type icon at the call site |
| `src/design-system/patterns/TransactionRow.tsx` | Unchanged | Already accepts `icon?: LucideIcon` |

## Edge Cases

| Case | Expected behavior |
|---|---|
| Existing rows (all `subtype = null`) | Render exactly as today; no backfill, no visual change |
| Unknown/legacy `subtype` string reaches the UI | Total resolver returns the neutral fallback; never a crash or blank row |
| Sub-type set on one transfer leg | Both legs of the pair carry the same sub-type — a half-labeled pair is invalid |
| Clearing a sub-type via `update_transaction` | `update_transaction` uses `null = leave unchanged`; a distinct sentinel (or explicit clear flag) is required so "remove the label" is expressible — see assumption 4 |
| Voiding a sub-typed transaction | No interaction; `status` and `subtype` are independent |
| `pago_tarjeta` in category spend reports | Structurally absent — transfers have no category. Accepted, not a defect |
| Old client calls the RPC without `p_subtype` | Trailing default-null param keeps the call valid |
| Sub-type selected, then the user switches form tab | Selection resets; a stale cross-type sub-type must never post |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `pago_tarjeta` invisible in category breakdowns confuses users | Med | Structural consequence of `tx_transfer_has_no_category`; document in the spec, surface card payments in the transfers view instead |
| Client-only type/sub-type validation bypassed via direct RPC call | Med | plpgsql guard inside both write RPCs, pgTAP-covered |
| `update_transaction`'s null sentinel makes sub-type unclearable | Med | Resolve in design; explicit clear mechanism or documented one-way set |
| Reserved `compra_meses` value leaks into a selectable option | Low | Excluded from the form option list; assert in a unit test |
| Two icon registries diverge visually from `category-style.ts` | Low | Sub-types are monochrome icons only, no color map to diverge |
| 400-line review budget (migration + 3 RPCs + 2 forms + registry) | Med | Flag to `sdd-tasks`: likely stacked slices (DB+RPC → seam+repository → design-system+UI) |

## Rollback Plan

Fully additive and reversible. Down path: `alter table finance.transactions drop column subtype;` then re-run the previous `20260804090008_finance_api.sql` bodies to restore the three RPC signatures. No existing row is mutated, no constraint is altered, and every current caller omits the new trailing param, so reverting the DB alone leaves the app working once the UI commits are reverted. UI rollback is deleting `transaction-subtype-style.ts`, its test, and the sub-type `<Select>` blocks. Zero risk to balances: `subtype` never participates in sign, sum, or transfer-pair logic.

## Dependencies

- `finance.transactions` and the three write RPCs from archived `lifeos-foundation` — present and verified.
- The Radix `select` convention (`src/design-system/ui/select.tsx`) — no raw `<select>`.
- **Not** blocked by `finance-categories-icon-color` (change #1, implemented but unmerged): this change adds a *separate* registry and touches no file that change owns. Merge order is free.

## Proposal Question Round

Written here rather than asked directly — this executor has no user channel. The four defaults below are the exploration's open questions, resolved as documented assumptions. Confirm or correct before `sdd-spec`.

## Assumptions Needing User Confirmation

1. **`compra_meses` is fully hidden**, not shown as a disabled "coming soon" option — a visible-but-dead control reads as a bug, not a roadmap item.
2. **Sub-type is never mandatory**; no sub-type is the default and remains a valid, complete movement.
3. **Sub-type is editable after creation** via `update_transaction`, so a mislabel does not require void-and-re-record.
4. Making it editable requires solving the null-sentinel problem: `update_transaction` treats `null` as "leave unchanged", so *clearing* a sub-type needs an explicit mechanism. If that cost is unacceptable, the fallback is set-only (never clear), documented as a known gap.
5. **`pago_tarjeta` has no destination-account-type requirement** — free label on any transfer; over-constraining a v1 label is worse than a loose one.
6. Sub-type labels ship in **Spanish** in the UI (Pago, Reembolso, Devolución en efectivo, Pago de tarjeta) with **English snake_case** stored values, matching existing conventions.

## Success Criteria

- [ ] A user can record an expense as "Pago", an income as "Reembolso" or "Devolución en efectivo", and a transfer as "Pago de tarjeta", each rendering its own icon in the movements list and Home feed.
- [ ] Recording any movement **without** a sub-type still works and looks identical to today.
- [ ] The database rejects a value outside the whitelist and rejects a sub-type paired with the wrong `type` — verified by pgTAP calling the RPCs directly, not only through the UI.
- [ ] `compra_meses` is not selectable anywhere in the UI, and no code path can produce it.
- [ ] Existing transactions (all null `subtype`) render unchanged; no migration touches a single row's amount, type, or category.
- [ ] A sub-typed transfer carries the same sub-type on both legs.
- [ ] An unknown or null sub-type resolves to the neutral fallback, never a crash.
- [ ] The registry DB-parity unit test fails if the CHECK whitelist and the icon map drift apart.
- [ ] `pnpm verify` passes; balances and dashboard totals show zero diff.
