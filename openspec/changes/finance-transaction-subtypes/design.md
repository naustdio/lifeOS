# Design: Finance Transactions — Sub-types

> **Size note**: the `sdd-design` skill sets an 800-word budget. As in
> `finance-categories-icon-color/design.md` and `archive/finance-budgets/design.md`, the orchestrator's
> task contract for this change explicitly requires DDL-level schema, exact RPC signatures, a registry
> shape, call-site wiring, and a §-style testing table. The explicit contract wins.
>
> **Inputs**: `proposal.md` (spec not yet written — running ahead of `sdd-spec`). Six owner-confirmed
> decisions are fixed constraints and are not re-litigated: nullable `subtype` with its own CHECK
> validated at the RPC layer; `compra_meses` reserved but never selectable; sub-type always optional;
> no account-type constraint on `pago_tarjeta`; a separate icon-only registry; and an explicit
> clear mechanism on `update_transaction` (resolved in Decision 3 below).
> Conventions inherited verbatim from `20260804090008_finance_api.sql` and
> `src/design-system/tokens/category-style.ts`.

## Technical Approach

One nullable `text` column with a value-set `CHECK`, and one **immutable pairing helper**
(`finance.subtype_matches_type`) called by all three write RPCs. The database is the authority on
*what may be stored*; the helper is the single authority on *which sub-type belongs to which type*;
the icon registry is the authority on *how it renders* and always resolves.

Splitting the two rules is the whole point. The CHECK is a column constraint, so it can never be
type-aware without a trigger — and a trigger would have to be loosened by a migration when change 5b
(`finance-installment-groups`) gives `compra_meses` real semantics. A plpgsql helper called from
`SECURITY DEFINER` functions is equally unbypassable (direct DML on `finance.transactions` is revoked
from `authenticated` in `20260804090006_finance_security.sql` — the RPCs are the only write path) but
is a one-line `create or replace` away from evolving.

## 1. Migration — `supabase/migrations/20260804090018_finance_transaction_subtypes.sql`

One file. No `*_security.sql` companion (no new table, policy, or role) — but this migration **does**
carry a `grant execute`, because dropping a function drops its grants.

```sql
alter table finance.transactions add column subtype text;

alter table finance.transactions add constraint transactions_subtype_whitelist
  check (subtype is null or subtype in
    ('pago','reembolso','devolucion_efectivo','pago_tarjeta','compra_meses'));

-- the type<->subtype pairing, in exactly ONE place
create or replace function finance.subtype_matches_type(p_type text, p_subtype text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_subtype is null                                then true
    when p_subtype = 'pago'                               then p_type = 'expense'
    when p_subtype in ('reembolso','devolucion_efectivo') then p_type = 'income'
    when p_subtype = 'pago_tarjeta'                       then p_type = 'transfer'
    else false      -- 'compra_meses' and any future value: unreachable until 5b opens it
  end $$;
```

`compra_meses` passes the CHECK but fails the helper for **every** type, so no RPC can ever store it.
That is the reservation: representable in the column, unreachable through the seam (proposal Business
Rule 3), and change 5b enables it by editing one `when` branch.

### 1a. `drop function` before `create or replace` — mandatory

**This is the load-bearing migration detail.** In Postgres, `create or replace function` cannot add a
parameter: adding `p_subtype text default null` creates a *new overload*, after which every existing
10-argument call to `finance.record_transaction` raises `42725 function ... is not unique`. Each of the
three functions must therefore be dropped at its exact current signature first:

```sql
drop function finance.record_transaction(uuid,uuid,uuid,text,bigint,date,text,text,text,text);
drop function finance.record_transfer(uuid,uuid,uuid,bigint,date,text,text,text,text);
drop function finance.update_transaction(uuid,uuid,uuid,bigint,date,text);
-- …then create each at its new signature, full body re-emitted…
grant execute on function
  finance.record_transaction(uuid,uuid,uuid,text,bigint,date,text,text,text,text,text),
  finance.record_transfer(uuid,uuid,uuid,bigint,date,text,text,text,text,text),
  finance.update_transaction(uuid,uuid,uuid,bigint,date,text,text,boolean)
  to authenticated;
notify pgrst, 'reload schema';   -- PostgREST caches signatures
```

`finance.update_origin_transaction` calls `finance.update_transaction(v_id, …)` **positionally with 6
arguments** (line 287). plpgsql bodies are not tracked dependencies, so the drop succeeds; after the
re-create the same 6-argument call binds to the new function through its two trailing defaults. It is
left **unchanged on purpose** — origin-addressed callers (recurring) have no sub-type concept.

### 1b. RPC signature changes

| Function | Added parameters | Guard (mirrors the existing `p_kind` guard, `raise … errcode = '22023'`) |
|---|---|---|
| `record_transaction` | `p_subtype text default null` (trailing) | after the `p_kind`/`p_amount_cents` checks: `if not finance.subtype_matches_type(p_kind, p_subtype) then raise exception 'subtype % is not valid for a % transaction', …` |
| `record_transfer` | `p_subtype text default null` (trailing) | after the distinct-accounts check: `finance.subtype_matches_type('transfer', p_subtype)` — in practice admits only `null` or `pago_tarjeta` |
| `update_transaction` | `p_subtype text default null`, `p_clear_subtype boolean default false` | after the void-lock check: `finance.subtype_matches_type(v_tx.type, p_subtype)` — `v_tx.type` is the stored type, which this function never edits |

`record_transfer` writes `p_subtype` into **both** inserts, so a pair is never half-labeled (proposal
edge case). `update_transaction`'s SET clause gains one line:

```sql
subtype = case when p_clear_subtype then null else coalesce(p_subtype, subtype) end,
```

The replayed-transfer early-return path is untouched: an idempotent replay returns the committed
group without re-writing sub-type, which is correct — the first write already set it.

## 2. Seam — `src/modules/finance/api/index.ts`

```ts
// RecordTransactionInputSchema / RecordTransferInputSchema — one line each
subtype: z.string().optional(),          // omitted = no sub-type; DB is the authority on the value

// TransactionPatchSchema — three-state, the only place the tri-state exists
subtype: z.string().nullable().optional(),   // undefined = leave unchanged | null = CLEAR | string = set
```

Forwarding: `p_subtype: i.subtype ?? null` on the two record calls; on `updateTransaction`,
`p_subtype: p.subtype ?? null` plus `p_clear_subtype: p.subtype === null`. The boolean never appears
in the TypeScript contract — `null` means clear, which is what a TS caller already expects.

**Error mapping** (`mapPgError`): a sub-type rejection arrives as `22023` with `context: "generic"`,
which today falls through to `VOID_TRANSACTION_NOT_EDITABLE` — a mislabel. Disambiguate on the raised
message **before** the context branches, using the precedent already in that function (the
`/voided transaction/i` test added for T-032):

```ts
if (code === "22023" && /subtype/i.test(e.message ?? "")) {
  return { code: "INVALID_SUBTYPE_FOR_TYPE", message: "That sub-type is not valid for this movement.", cause: e };
}
```

## 3. Key Decisions

| # | Decision | Rejected alternative | Rationale |
|---|---|---|---|
| 1 | Pairing lives in `finance.subtype_matches_type`, called by 3 RPCs | inline `if` blocks in each RPC; a table `CHECK (type, subtype)`; a `before insert` trigger | Three inline copies drift. A composite CHECK or trigger is exactly what the proposal rules out: change 5b must open `compra_meses` without a constraint migration. One `immutable sql` helper is unbypassable *and* one-line-editable |
| 2 | `drop function` + full re-create for all three RPCs | `create or replace` with a trailing default | Adding a parameter creates an overload; the old 10-arg calls then fail `42725`. Non-obvious and the single most likely way this migration breaks production |
| 3 | **Explicit clear via `p_clear_subtype boolean`**, exposed to TS as `subtype: null` | (a) reserved sentinel string e.g. `'__none__'`; (b) set-only, documented as a v1 gap | (a) puts a magic value inside the column's own domain — one missing guard and the sentinel is *stored*, and it leaks into the zod schema and every caller. (b) fails a real flow: the edit form's Select always submits something, so a user who picks "Sin subtipo" on a mislabeled row **must** be able to clear it, otherwise the only remedy is void-and-re-record — the exact thing this change exists to avoid. A boolean is self-describing, cannot be persisted, and leaves the existing `null = leave unchanged` semantics of all five sibling params intact |
| 4 | Resolver returns `LucideIcon \| undefined`, not a `circle-dashed` fallback | mirror `category-style.ts`'s always-render fallback | Every existing row has `subtype = null`. A visible fallback glyph would change the look of *every* historical row, violating the "renders exactly as today" success criterion. `undefined` re-enters `TransactionRow`'s existing first-letter branch — the fallback *is* today's behavior |
| 5 | Spanish labels + per-tab option lists in `src/app/(app)/movimientos/subtype-options.ts`, not in the registry | put labels in `tokens/transaction-subtype-style.ts` | `category-style.ts` is copy-free, and app pages already own their Spanish maps (`TYPE_LABEL` in `movimientos/page.tsx`). It also gives the "`compra_meses` is never selectable" unit test one concrete file to assert against |
| 6 | `compra_meses` fails the helper for every type | omit it from the CHECK until 5b | Reserving the value now means 5b adds no column constraint migration at all — only a helper branch and a UI option |
| 7 | `update_origin_transaction` left unchanged | thread `p_subtype` through it too | Origin-addressed writes come from the recurring module, which has no sub-type concept. Its positional 6-arg call rebinds through the new defaults |

## 4. Design System — `src/design-system/tokens/transaction-subtype-style.ts` (Create)

Explicit named imports only (tree-shaking), same shape as `category-style.ts`, **icons only** — no
color map, because a sub-type layers onto an already-colored category chip.

```ts
import { CalendarClock, CreditCard, HandCoins, Receipt, Undo2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const TRANSACTION_SUBTYPE_ICONS = {
  pago: Receipt,
  reembolso: Undo2,
  devolucion_efectivo: HandCoins,
  pago_tarjeta: CreditCard,
  compra_meses: CalendarClock,   // reserved: rendered if present, never producible
} as const;
export type TransactionSubtypeKey = keyof typeof TRANSACTION_SUBTYPE_ICONS;

/** Total: any string, null, or undefined in — a renderable icon or `undefined` out, never a throw. */
export function resolveTransactionSubtypeIcon(key: string | null | undefined): LucideIcon | undefined;
```

## 5. Data Flow

```
TransactionForm / EditTransactionForm  (Select, keyed on `tab`)
        │  FormData "subtype": "pago" | "none"
        ▼
movimientos/actions.ts     "none" ─▶ undefined (record) | null (update)
        ▼
finance/api/index.ts       zod ─▶ p_subtype (+ p_clear_subtype)
        ▼
finance.record_transaction / record_transfer / update_transaction   [SECURITY DEFINER]
        │        └─▶ finance.subtype_matches_type(type, subtype) ── false ─▶ raise 22023
        ▼
finance.transactions.subtype   ── CHECK whitelist
        ▼
transaction-repository ─▶ TransactionListItem.subtype
        ▼
movimientos/page.tsx · app/(app)/page.tsx
        resolveTransactionSubtypeIcon(tx.subtype) ─▶ <TransactionRow icon={…} />   (contract unchanged)
```

## 6. UI Changes

### `TransactionForm.tsx` (Modify)

One `<div>` block per form, placed after Categoría (income/expense) and after Hacia (transfer):

```tsx
const SUBTYPE_OPTIONS = SUBTYPES_BY_TAB[tab];          // expense: [pago] · income: [reembolso, devolucion_efectivo] · transfer: [pago_tarjeta]
<Select key={tab} name="subtype" defaultValue="none">  // keyed on tab, exactly like the categoryId Select
  <SelectItem value="none">Sin subtipo</SelectItem>    // NOT value="" — Radix Select rejects an empty-string value
  {SUBTYPE_OPTIONS.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
</Select>
```

`key={tab}` is the existing remount idiom in this file (see the `categoryId` comment at line 133) and
is what makes "switch tab → selection resets" structural rather than a hoped-for behavior. The
transfer tab is a separate `<form>`, so a stale cross-type value cannot survive there either.

### `EditTransactionForm.tsx` (Modify)

Same block, options chosen from `transaction.type` instead of `tab`;
`defaultValue={transaction.subtype ?? "none"}`. Requires `subtype` on the `transaction` prop (from
`getTransactionById`) and on `updateMovementAction`'s patch:
`patch.subtype = raw === "none" ? null : raw` — the concrete flow Decision 3 exists to serve.

Spanish labels: Pago · Reembolso · Devolución en efectivo · Pago de tarjeta. `compra_meses` appears in
no option list.

## 7. File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/20260804090018_finance_transaction_subtypes.sql` | Create | §1: column, CHECK, `subtype_matches_type`, drop + re-create 3 RPCs, grants, `notify pgrst` |
| `supabase/tests/0xx_finance_subtypes.sql` | Create | pgTAP per §8 |
| `src/modules/finance/api/index.ts` | Modify | 3 zod fields, 3 RPC forwards, `INVALID_SUBTYPE_FOR_TYPE` mapping |
| `src/modules/finance/data/transaction-repository.ts` | Modify | `subtype` in both selects + `TransactionListItem` + both mappers |
| `src/design-system/tokens/transaction-subtype-style.ts` | Create | Icon registry + total resolver |
| `src/app/(app)/movimientos/subtype-options.ts` | Create | Spanish labels + per-tab/per-type option lists |
| `src/app/(app)/movimientos/TransactionForm.tsx` | Modify | Sub-type Select ×2 forms, keyed on `tab` |
| `src/app/(app)/movimientos/[id]/editar/EditTransactionForm.tsx` | Modify | Sub-type Select + `subtype` on the `transaction` prop |
| `src/app/(app)/movimientos/[id]/editar/page.tsx` | Modify | Pass `subtype` through |
| `src/app/(app)/movimientos/actions.ts` | Modify | `"none"` ↔ `undefined`/`null` mapping in 3 actions |
| `src/app/(app)/movimientos/page.tsx` | Modify | `icon={resolveTransactionSubtypeIcon(tx.subtype)}` |
| `src/app/(app)/page.tsx` | Modify | Same, on the recent-movements feed only (the accounts list keeps its own rows) |
| `src/design-system/patterns/TransactionRow.tsx` | **Unchanged** | Already `icon?: LucideIcon` |
| `tests/unit/transaction-subtype-registry.test.ts` | Create | Resolver totality + DB parity |
| `tests/unit/transaction-subtype-options.test.ts` | Create | Per-tab option lists; `compra_meses` absent everywhere |
| `tests/unit/transaction-form-subtype.test.tsx` | Create | RTL: options per tab, reset on switch, default "none" |

## 8. Testing Strategy

| Layer | What is tested | Tooling |
|---|---|---|
| Unit — registry | `resolveTransactionSubtypeIcon` is **total**: each of the 5 keys → its icon; `null`/`undefined`/`""`/`"garbage"` → `undefined`, never a throw. **Parity**: registry keys ≡ the migration's CHECK list (fixture copied from the migration) — the drift guard | Vitest |
| Unit — options | Every tab/type maps to its exact option set; the union of all option lists **excludes `compra_meses`**; every option key is a registry key | Vitest |
| DB — whitelist | `subtype = 'not-real'` rejected by CHECK; each of the 5 values accepted at column level; `null` accepted | pgTAP |
| DB — pairing | `record_transaction(kind=>'income', p_subtype=>'pago')` raises `22023`; `kind=>'expense'` + `'reembolso'` raises; `record_transfer` + `'pago'` raises; **`compra_meses` raises on all three RPCs** (Decision 6's reservation, asserted, not assumed); valid pairs succeed | pgTAP |
| DB — backward compat | Every RPC called with the **old argument count** still succeeds and stores `subtype = null` — the regression test for Decision 2's overload hazard | pgTAP |
| DB — transfer pair | A `pago_tarjeta` transfer: both legs share the same `transfer_group_id` **and** the same `subtype`; an idempotent replay does not alter it | pgTAP |
| DB — update semantics | `p_subtype => null, p_clear_subtype => false` leaves the value unchanged; `p_clear_subtype => true` sets it to `null`; a mismatched `p_subtype` raises `22023`; a voided row still rejects the edit (void-lock runs first) | pgTAP |
| DB — origin path | `update_origin_transaction` still resolves and patches after the drop/re-create (the positional-rebind check for Decision 7) | pgTAP |
| Integration — seam | `INVALID_SUBTYPE_FOR_TYPE` is returned for a bad pair and **`VOID_TRANSACTION_NOT_EDITABLE` is still returned for a voided-row edit** — the named regression for the shared `22023` disambiguation | Vitest (`finance-facade.test.ts`) |
| RTL | `TransactionForm`: expense tab shows exactly "Sin subtipo" + Pago; switching to income resets to "Sin subtipo" and shows the two income options; no native `<select>`. `EditTransactionForm`: pre-selects the stored value, and choosing "Sin subtipo" submits a clear | Vitest + Testing Library |
| Static gates | `pnpm verify` — ESLint boundaries, `tsc --noEmit`, `check-tokens.mjs` (trivially satisfied: no color values added), `next build` | `pnpm verify` |
| E2E | Not required | — |

## Threat Matrix

**N/A** — no routing, shell command, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary. The real adversarial surface is application-level and is covered
explicitly: a direct PostgREST RPC call with a mismatched pair (§1b helper, pgTAP), a hostile stored
string reaching the renderer (§4 total resolver, unit-tested), and a client forging `compra_meses`
(helper returns false for every type, pgTAP). Icons are statically imported, so no user-controlled
string reaches a dynamic `import()` or component lookup.

## Migration / Rollout

Additive and reversible. Deploy **migration first, then app** — a pre-migration app ignores `subtype`,
but a post-migration app against an un-migrated DB breaks its `select`. Between the two deploys the
old app calls the old argument counts, which still resolve (the trailing-defaults compatibility test
above is what makes that claim checkable).

Down path: restore the three RPC bodies from `20260804090008_finance_api.sql` at their original
signatures (drop the new ones first, same overload reason), `drop function finance.subtype_matches_type`,
then `alter table finance.transactions drop constraint transactions_subtype_whitelist, drop column subtype`.
No row's amount, type, category, status, or transfer pair is touched; `subtype` never participates in
sign, sum, or balance math.

### PR Slicing — 1000-line review budget

Estimated **~680 authored lines** (migration ~240 — three full RPC bodies re-emitted dominate it;
pgTAP ~90; seam ~30; repository ~10; registry + options ~60; forms + actions + pages ~100; unit/RTL
tests ~150). That fits a single PR under this session's 1000-line budget with ~30% headroom, so —
unlike `finance-categories-icon-color` (~1,050, two stacked slices) — **no stacking is proposed**.

If implementation overruns, the split line is already clean and is the same DB→UI seam that change
this project used before (PR #1 → feature branch, PR #2 → PR #1):

| Slice | Contents | Est. lines | Standalone value |
|---|---|---|---|
| **A — DB + seam** | Migration, pgTAP, `api/index.ts`, `transaction-repository.ts`, facade integration test | ~400 | Sub-types are storable, guarded, and readable end-to-end; verifiable with zero UI |
| **B — design system + UI** | Registry, options, both forms, actions, both call sites, unit + RTL tests | ~280 | The pickers and row icons, on a seam that already accepts them |

`Decision needed before apply: No` · `Chained PRs recommended: No` · `1000-line budget risk: Low`

## Open Questions

None blocking. Two implementation-time verifications (not assumptions to design around):

- [x] Confirm `drop function` on the three RPCs raises no unexpected dependency error in the local
      Supabase stack (expected clean — plpgsql bodies are untracked, and no view or generated column
      references them). Verify with a real `supabase db reset`, not by inspection. **Verified**:
      `supabase db reset --local` itself failed with a pre-existing, unrelated
      `LegacyDbBootstrapError` (missing `supabase-go` binary) on this machine — worked around by
      applying the migration directly via `docker exec supabase_db_LIFE_OS psql`, which ran the
      full `drop function` + re-create + grant + notify sequence with zero errors, then confirmed
      via `\df` that each of the three RPCs has exactly one signature.
- [x] Confirm the five chosen Lucide glyphs (`Receipt`, `Undo2`, `HandCoins`, `CreditCard`,
      `CalendarClock`) read distinctly at 16px against the existing category icons; swap in
      `transaction-subtype-style.ts` only if two collide visually. **Verified**: all five are
      structurally distinct silhouettes (document, curved arrow, open hand + coin, card,
      clock-with-calendar) with no shape overlap against each other or the existing
      `category-style.ts` set; no swap needed.
