# Design: Health Tracking

## Technical Approach

One `health` schema owning its tables and RLS; Finance stays the single ledger. Health never becomes a scheduler and Finance never becomes health-aware. Health's `data/` layer talks only to `health.*`; the **`app` layer composes** `health/api` + `finance/api`, exactly as `src/app/(app)/recurrentes/actions.ts` already composes `core/api` + `finance/api`.

## Architecture Decisions

### Decision 1: Recurring provenance — accept the two-hop indirection (option a)

**Choice**: Health stores `health.events.recurring_transaction_id uuid null references finance.recurring_transactions(id) on delete set null`. One-off costs use the origin seam (`origin_module='health'`, `origin_entity_id = event.id`, 1:1). Recurring occurrences are found via `finance.transactions.recurring_id`, which `confirm_recurring_transaction` already populates on **both** branches (lines 219/223/265 of `20260804090030`).

| Option | Cost | Verdict |
|---|---|---|
| (a) two-hop via `recurring_id` | Health carries one nullable FK; two lookup paths | **Chosen** |
| (b) `sourcing_module` column threaded through confirm | `create or replace` of the just-rewritten `confirm_recurring_transaction`; four hardcoded `origin_module = 'recurring'` re-select lookups become dynamic; clobber hazard the installment migration already bit us with | Rejected |
| (c) new Finance RPC | Violates proposal "no new Finance RPCs" | Rejected |

**Decisive rationale (not just blast radius)**: `find_by_origin` returns **one** transaction for an origin ref — a 1:1 contract. A recurring series is 1:N over time with the same entity id and different idempotency keys. Option (b) would make `findByOrigin({module:'health'})` *ambiguous*, not correct. `recurring_id` is the semantically right 1:N key and already exists, indexed by FK. Option (a) does not break `findByOrigin` for anyone: existing `recurring`-origin rows are untouched, and Health's own one-off rows remain 1:1.

### Decision 2: One `health.events` table with a type discriminator + typed nullable columns

Not JSONB, not per-type tables. This *is* the project convention: `finance.transactions` carries `subtype` plus nullable `installment_*` columns, and `finance.subtype_matches_type` guards which columns are legal per type. Per-type tables would force `origin_entity_id` to encode `type:uuid` (fragile seam key); the single table keeps one id space. Nutrition adds one CHECK value and at most one column — no redesign.

### Decision 3: Post immediately for one-off; definition-only for recurring

A logged health event is a **past fact**; `recordTransaction` is the precedent (`recordInstallmentPurchase` likewise posts #1 immediately). The confirm/discard seam exists to decide whether a *predicted future* occurrence happened — so a recurring health event creates only the definition and inherits `/recurrentes`' confirm/discard/pause/resume.

The two writes (health row, then Finance post) are not one transaction. Ordering: insert the event first, then post with `idempotencyKey = event.id`. A failed post leaves an event with no cost row; retry is idempotent via `tx_idempotency`. **No `transaction_id` column on `health.events`** — `findByOrigin` is the single truth for "is the cost posted", so there is nothing to drift.

### Decision 4: Privacy — private events MUST fund from a private account, plus one Finance RLS fix

Verified in `20260804090006_finance_security.sql`:
- `transactions_select` = `core.is_member(household_id) and finance.can_read_account(account_id)`. A transaction on a **household** account **is** fully readable (amount, date, description, category) by every member. Account visibility therefore covers transaction leakage **only if** the cost posts to a `private` account. It is *not* automatic.
- **Second, verified leak, not covered by accounts at all**: `recurring_transactions_select` (`20260804090013`) is `core.is_member(household_id)` with **no** `can_read_account` gate — and `finance.recurring_due` is `security_invoker`, so it inherits that. A chronic-medication definition on a private account is today visible to every member, including in their due banner.

**Resolution**:
1. `health.events.visibility = 'private'` ⇒ trigger `health.enforce_private_event_account()` (BEFORE INSERT/UPDATE, `security definer`, `set search_path=''`) requires the funding account to have `visibility='private'` **and** `owner_user_id = new.owner_user_id`. Mirrored by a Zod pre-check and by filtering the UI account picker.
2. Health RLS mirrors `accounts_select` byte-for-byte: `core.is_member(household_id) and (visibility='household' or owner_user_id = (select auth.uid()))` on all three health tables.
3. Tighten `finance.recurring_transactions` SELECT/UPDATE/DELETE policies with `and finance.can_read_account(account_id)` (DROP + CREATE POLICY; backward compatible — every household-account definition is unaffected).
4. Only `title` ever reaches the transaction description; clinical `notes`/`result_summary` never leave `health.*`.

**Residual, accepted**: `confirm_recurring_transaction` is SECURITY DEFINER and checks only `core.assert_member`, so a member holding a leaked definition uuid could still advance a private cursor. Unreachable through any UI once (3) lands. Follow-up change `finance-private-recurring-rls`; deliberately out of scope to avoid re-emitting that function.

### Decision 5: No new ESLint boundary — compose in `app`

Health follows the `finance`→`core` pattern: never import the other module, take `accountId`/`categoryId`/`householdId` as explicit parameters. The Server Action calls `health/api` then `finance/api`. Rejected alternative: adding `"module-api"` to the `from: "module-api"` allow-list in `eslint.config.mjs` — `eslint-plugin-boundaries` has no *negated* `${from.module}` matcher, so that rule would legalise **every** module-api ↔ module-api pair in both directions, permitting import cycles the current `default: "disallow"` prevents for free. `eslint.config.mjs` is therefore **unchanged**, and the proposal's conditional `module-architecture` capability delta is **not** taken.

### Decision 6: Bounded recurrence reuses the installment columns unrenamed

`installment_group_id / installment_anchor_date / installments_remaining / installment_total` are used as-is. Renaming would require re-emitting `record_installment_purchase`, `confirm_recurring_transaction`, `discard_recurring_occurrence` **and** `recurring_due` (a view that cannot reorder columns) plus the repository and UI — large risk, cosmetic gain.

Two verified consequences, both accepted in writing:
- The bounded cursor **ignores `frequency`** and always advances by clamped months. So bounded health series are **monthly-cadence only** (3-dose vaccine series, 6 monthly follow-ups). A 10-day antibiotic course is modelled as a **single one-off cost** — which is also the truthful financial model: you buy the box once.
- `confirm_recurring_transaction` hardcodes `v_subtype := 'compra_meses'` whenever `installment_group_id is not null`, so health series occurrences will carry that subtype. Accepted, reversible mislabel; backfillable later via `recurring_id`. Follow-up: `finance-recurring-occurrence-subtype`.

## Schema Design

```sql
create schema health;

create table health.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  event_type text not null check (event_type in ('study','consultation','medication','vaccine')),
  title text not null check (length(btrim(title)) between 1 and 120),
  occurred_on date not null,
  notes text not null default '',
  visibility text not null default 'household' check (visibility in ('household','private')),
  -- cost block: all-or-nothing
  amount_cents bigint check (amount_cents > 0),
  account_id  uuid references finance.accounts(id)   on delete restrict,
  category_id uuid references finance.categories(id) on delete restrict,
  -- recurrence (Decision 1)
  recurring_transaction_id uuid references finance.recurring_transactions(id) on delete set null,
  -- type-specific typed columns (Decision 2)
  provider_name  text,   -- consultation | study
  result_summary text,   -- study
  dosage         text,   -- medication | vaccine
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_cost_all_or_none check (
    (amount_cents is null) = (account_id is null)
    and (amount_cents is null) = (category_id is null)),
  constraint events_result_only_study check (
    result_summary is null or event_type = 'study'),
  constraint events_dosage_only_meds check (
    dosage is null or event_type in ('medication','vaccine')),
  constraint events_recurring_needs_cost check (
    recurring_transaction_id is null or amount_cents is not null)
);
create index on health.events (household_id, occurred_on desc);
create index on health.events (recurring_transaction_id) where recurring_transaction_id is not null;

create table health.vital_readings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  metric text not null check (metric in ('weight_kg','systolic_bp','diastolic_bp','glucose_mgdl','heart_rate')),
  value_numeric numeric(10,2) not null,
  measured_at timestamptz not null default now(),
  notes text not null default '',
  visibility text not null default 'household' check (visibility in ('household','private')),
  created_at timestamptz not null default now()
);
create index on health.vital_readings (household_id, metric, measured_at desc);

create table health.profile_facts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references core.households(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  fact_type text not null check (fact_type in ('blood_type','allergy','condition')),
  label text not null check (length(btrim(label)) between 1 and 80),
  detail text not null default '',
  severity text check (severity in ('low','medium','high')),
  active boolean not null default true,
  visibility text not null default 'household' check (visibility in ('household','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_severity_only_allergy check (severity is null or fact_type = 'allergy')
);
create unique index profile_one_blood_type on health.profile_facts (owner_user_id)
  where fact_type = 'blood_type';
```

`metric`/`event_type`/`fact_type` are open CHECK lists, never PG enums — widening is a DROP+ADD, matching the `origin_module` precedent.

## Migration Sequence

| # | File | Contents |
|---|---|---|
| 1 | `20260804090031_finance_health_seam.sql` | Re-verify `transactions_origin_module_check` name against `pg_constraint` (documented caution), DROP + ADD with `'health'`; DROP + CREATE the three `recurring_transactions` policies adding `and finance.can_read_account(account_id)` (Decision 4.3) |
| 2 | `20260804090032_health_schema.sql` | `create schema health`, the three tables, `core.touch_updated_at` triggers, `health.enforce_private_event_account()` trigger |
| 3 | `20260804090033_health_security.sql` | `enable row level security` on all three; SELECT/INSERT/UPDATE/DELETE policies gated on `core.is_member(household_id) and (visibility='household' or owner_user_id = (select auth.uid()))`; `revoke all` + explicit `grant usage on schema health` / table grants, mirroring `20260804090006` |

Migration 1 must land before 2 (the health trigger reads `finance.accounts`; the CHECK must admit `'health'` before any post).

## Data Flow

    /salud form ──▶ Server Action (app layer, composes)
                      │
                      ├─▶ health/api  createHealthEvent()  ──▶ health.events (id)
                      │
                      ├─ one-off ──▶ finance/api recordTransaction({origin:{module:'health',entityId:id},
                      │                                            idempotencyKey:id})
                      │
                      └─ recurring ─▶ finance/api createRecurringDefinition({... bounded?})
                                        └─▶ health/api attachRecurring(eventId, recurringId)
    read: one-off cost  → finance/api findByOrigin({module:'health', entityId})
          series costs  → finance/api listTransactionsByRecurring(recurringId)

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/20260804090031..33_*.sql` | Create | Above |
| `src/modules/health/domain/{event,vital,profile}.ts` | Create | Pure predicates: `requiresPrivateAccount()`, `isCosted()`, metric units, type/column legality mirroring the DB CHECKs |
| `src/modules/health/data/{event,vital,profile}-repository.ts`, `data/index.ts` | Create | Client-direct RLS CRUD in the `recurring-repository.ts` shape (`Number()` every bigint, degrade to `[]`/`null`) |
| `src/modules/health/api/index.ts` | Create | `server-only` barrel; re-exports `../data` + `../domain` (Gate A) |
| `src/modules/health/ui/**` | Create | `EventList`, `EventForm`, `VitalTrend`, `ProfileCard`, `PrivacyToggle` |
| `src/app/(app)/salud/{page,actions}.tsx/.ts` + `signos/`, `perfil/` | Create | Routes + Server Actions, patterned on `recurrentes/` and `cuentas/` |
| `src/modules/finance/api/index.ts` | Modify | `OriginModule` += `"health"`; `OriginRefSchema.module` enum += `"health"`; re-export `listTransactionsByRecurring` |
| `src/modules/finance/data/recurring-repository.ts` | Modify | `createRecurringDefinition` gains an optional `bounded?: { totalOccurrences: number; anchorDate: string }` → `installment_*` columns |
| `src/modules/finance/data/transaction-repository.ts` | Modify | New `listTransactionsByRecurring(supabase, householdId, recurringId)` — plain RLS SELECT, **no new RPC** |
| `eslint.config.mjs` | **Unchanged** | Decision 5 |

**Spec delta note**: the proposal's criterion "`finance/api`'s diff is limited to the two `origin_module` widenings" must relax to "**no new Finance RPCs and no change to any SQL seam function**" — the two repository additions above are plain-RLS reads/widenings in the documented budgets/recurring/credit-cards exception lineage.

## Interfaces / Contracts

```ts
export const CreateHealthEventInputSchema = z.object({
  householdId: z.string().uuid(),
  eventType: z.enum(["study", "consultation", "medication", "vaccine"]),
  title: z.string().trim().min(1).max(120),
  occurredOn: z.string(),
  notes: z.string().default(""),
  visibility: z.enum(["household", "private"]).default("household"),
  cost: z.object({
    amountCents: z.number().int().positive(),
    accountId: z.string().uuid(),
    categoryId: z.string().uuid(),
  }).optional(),
  recurrence: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("none") }),
    z.object({ mode: z.literal("unbounded"), frequency: z.enum(["monthly","weekly","biweekly","yearly"]) }),
    // bounded is monthly-only by construction — Decision 6
    z.object({ mode: z.literal("bounded"), totalOccurrences: z.number().int().min(2).max(60) }),
  ]).default({ mode: "none" }),
  provider: z.string().optional(),
  resultSummary: z.string().optional(),
  dosage: z.string().optional(),
});
```

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | `requiresPrivateAccount`, type/column legality, bounded-occurrence math | Vitest, pure domain |
| Integration | One post per costed event with `origin_module='health'`; bounded series auto-deactivates at zero and unbounded does not; retry is idempotent | Supabase local, `tests/integration/` |
| RLS (highest priority) | Member B cannot read a private event, its vitals, its profile fact, **its transaction**, **or its recurring definition** — one assertion per read path incl. `recurring_due` and `account_balances` | Two authenticated clients against local stack |
| E2E | Log each of the 4 types; verify the movement appears in `/movimientos` and the trend renders | Playwright |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The security surface is RLS/tenancy, covered by the RLS row above.

## Migration / Rollout

Additive, no data migration, no feature flag. Rollback: `drop schema health cascade`; revert the `origin_module` CHECK (zero health rows first); restore the three original recurring policies verbatim from `20260804090013`; revert the four TS files.

## Open Questions

None blocking. Two deferred, each with a named follow-up change: `finance-private-recurring-rls` (definer confirm bypass) and `finance-recurring-occurrence-subtype` (`compra_meses` mislabel on health series).
