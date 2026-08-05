# Design: Finance UI Polish

## Technical Approach

Extract-then-apply, presentation-layer only. Three net-new components land in
`src/design-system/patterns/` (`TransactionRow`, `ProgressBar`, `QuickActionRow`), composed
exclusively from the semantic tokens already mapped in `globals.css @theme inline`. The five Finance
screens then delete their ad hoc row/bar markup and consume the patterns. Base `ui/` primitives gain
the missing hover/active states. Every component follows the archived `lifeos-foundation` design §7
contract: `forwardRef`, `cn()` merge, `className` passthrough, semantic tokens only, zero raw hex
(`scripts/check-tokens.mjs` in `pnpm verify` enforces this).

**Light mode is the primary reviewed theme.** The existing `:root` values already produce the
reference look: `--background: --neutral-050` (near-white page), `--card/--surface: --neutral-000`
(white), `--nav-pill: --ink-950` (the black hero/contrast card), `--primary: --lime-400` (spotlight
accent). `.dark` overrides the same names, so parity is automatic — no dark-specific branches.

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| 1 | `TransactionRow` is **borderless**, separated by whitespace inside one `Card` container | Keep one `Card` per transaction (current `movimientos/page.tsx:58`) | Reference language: rows are never individually bordered; a per-row card multiplies the 22px radius and shadow into visual noise at 375px |
| 2 | `TransactionRow` leading slot is a bare **icon-in-circle**, not `CategoryChip` | Reuse `CategoryChip` whole as the avatar | `CategoryChip` is a text pill (`chip.tsx`: `px-3 py-1.5` + label). The row needs a fixed 40px circle. `CategoryChip` stays for the *inline category tag*, and its `bg-background` circle markup is the visual source for the new `RowAvatar` internal |
| 3 | `ProgressBar` takes `valueCents`/`limitCents` (not a precomputed %) | Pass `percent` | Both call sites (`BudgetForm`, savings-goal cards on Home/Cuentas) currently duplicate the identical `Math.min(100, Math.round(a / b * 100))` expression; centralizing it removes the duplication and the divide-by-zero edge |
| 4 | `QuickActionRow` = circular neutral icon buttons + label underneath | Lime primary pill + outline secondaries | Accent is a spotlight and the lime FAB already occupies `NavPill`. A second lime cluster directly under the black hero would make two competing focal points on the same fold |
| 5 | `QuickActionRow` ships **3** actions: `/movimientos`, `/cuentas/nueva`, `/presupuestos` | Add "Transferencia" | Transfer has no route: it is a client-state tab inside `TransactionForm` (`tab === "transfer"`). Deep-linking it requires a query-param → `useState` seam = behavior change, out of scope. No placeholder buttons |
| 6 | **Do not** wire `--space-1..12` into `@theme inline` | Wire them as `--spacing-*` | Tailwind v4 already derives `p-4`/`gap-6` from its numeric `--spacing` base. Mapping `--space-4` onto that namespace either collides or introduces a second parallel scale nobody consumes. The tokens stay dead-but-harmless; deleting or wiring them is a separate token-hygiene change |
| 7 | Motion = Tailwind utilities only, `duration-200 ease-out` | Framer Motion; CSS keyframe entrance sequences | Matches `FabMenu.tsx:22` (`transition-transform hover:scale-105`). This is Operate-mode product UI — motion confirms input, it does not perform |
| 8 | `Card` drops its hard `border border-border` in favor of `shadow-soft` alone | Keep the border | Reference: "soft/no visible border in light mode… never a hard 1px border as the primary separator". `--border` remains correct for *dividers* (`BudgetForm`'s `border-b`), just not as a card outline |

## Component Contracts

### `patterns/TransactionRow.tsx`

```tsx
export interface TransactionRowProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;          // leading circle glyph; falls back to initial of `title`
  title: string;              // account or merchant name
  subtitle?: string;          // "Gasto · 2026-08-05" / account type label
  formattedAmount: string;    // pre-formatted es-MX MXN string
  kind: "income" | "expense"; // drives MoneyAmount token
  muted?: boolean;            // voided rows
  trailing?: React.ReactNode; // e.g. the "Editar" link
}
```

Root: `group flex items-center gap-3 py-3 transition-colors duration-200 ease-out hover:bg-accent/60 -mx-2 px-2 rounded-card` plus `opacity-50` when `muted`.
Avatar: `flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-secondary text-secondary-foreground` with `<Icon className="h-4 w-4" aria-hidden />`.
Text stack: `min-w-0 flex-1 flex-col` → title `truncate text-sm font-medium`, subtitle `truncate text-xs text-muted-foreground`.
Trailing: `flex shrink-0 items-center gap-3` wrapping `<MoneyAmount />` + `trailing`.

Replaces three duplications read in the current source:
`page.tsx:56-65` (bare `flex items-center justify-between` account row),
`cuentas/page.tsx:43-53` (one `Card` + `CardHeader` per account),
`movimientos/page.tsx:58-85` (one `Card` + `CardContent` per transaction).
Callers render `<Card><CardContent className="divide-y divide-border/60 py-2">` and map rows inside.

### `patterns/ProgressBar.tsx`

```tsx
export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  valueCents: number;
  limitCents: number;
  label?: string;            // "1,200.00 / 3,000.00 MXN"
  "aria-label"?: string;
}
```

Computes `pct = limitCents > 0 ? Math.min(100, Math.round(valueCents / limitCents * 100)) : 0` and
`atOrOver = limitCents > 0 && valueCents >= limitCents`.
Track: `h-2 w-full overflow-hidden rounded-pill bg-secondary`.
Fill: `h-full rounded-pill transition-[width] duration-200 ease-out` + `bg-expense | bg-primary`, `style={{ width: `${pct}%` }}`.
Wrapper carries `role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}`.
Label: `text-xs` + `text-expense | text-muted-foreground`.
Extracted verbatim-in-spirit from `BudgetForm.tsx:64-72`; also replaces the plain-text percentage
strings at `page.tsx:77-80` and `cuentas/page.tsx:62-67`.

### `patterns/QuickActionRow.tsx`

```tsx
export interface QuickAction { label: string; icon: LucideIcon; href: string }
export interface QuickActionRowProps extends React.HTMLAttributes<HTMLDivElement> {
  actions: QuickAction[];   // 2-4; every href must resolve to a real route
}
```

Root: `flex items-start justify-around gap-2`.
Each item: `<Link>` → `flex w-16 flex-col items-center gap-2 text-center`; circle
`flex h-12 w-12 items-center justify-center rounded-pill bg-secondary text-secondary-foreground shadow-soft transition-transform duration-200 ease-out hover:scale-105 active:scale-95`; label `text-xs text-muted-foreground`.
Placed in `page.tsx` immediately below `<BalanceHero />`, above the debt card.
Default set: `ArrowDownLeft`→`/movimientos` "Nueva transacción", `Plus`→`/cuentas/nueva` "Nueva cuenta", `Target`→`/presupuestos` "Presupuestos".

### Interaction states on base `ui/`

| File | Addition |
|---|---|
| `button.tsx` | base string: `transition-colors` → `transition-all duration-200 ease-out active:scale-95`; `ghost` gains `active:bg-accent` |
| `card.tsx` | drop `border border-border`; add optional interactivity via caller `className` only (no new variant) |
| `chip.tsx` | `transition-colors duration-200 ease-out` (hover handled by the parent row) |
| `nav-pill.tsx` | container unchanged; nav `<Link>`s in `(app)/layout.tsx` get `rounded-pill px-3 py-1.5 transition-colors duration-200 ease-out hover:bg-nav-pill-foreground/10` |

### Empty states

One shared shape, illustration-free (icon + heading + one muted line + one primary CTA), rendered as
`<Card><CardContent className="flex flex-col items-center gap-3 py-10 text-center">`:

| Screen | Icon | Heading | CTA |
|---|---|---|---|
| Home (no accounts) | `Wallet` | "Empieza por tu primera cuenta" | `Button asChild` → `/cuentas/nueva` |
| Cuentas | `Wallet` | "Todavía no tienes cuentas" | → `/cuentas/nueva` (replaces the bare `<p>` at `cuentas/page.tsx:37-39`) |
| Movimientos | `Receipt` | "Aún no hay movimientos" | ghost CTA scrolling to the entry form (replaces `movimientos/page.tsx:54-56`) |
| Presupuestos | `Target` | "Aún no hay categorías de gasto" | ghost → `/movimientos` (replaces `BudgetForm.tsx:31-33`) |

A budgeted category at 0% is **not** an empty state: `ProgressBar` renders a full-width track with a
zero-width fill and the `0.00 / N MXN` label.

## Data Flow

```
Server Component (page.tsx / cuentas / movimientos)
  └─ finance/api  ──(unchanged)──▶ plain view models
        └─ TransactionRow / ProgressBar / QuickActionRow   (props only, no state)
              └─ MoneyAmount ──▶ --income / --expense
              └─ semantic tokens ──▶ @theme inline ──▶ Tailwind utilities
```

No component reads data, holds state, or calls an action. `QuickActionRow` emits `next/link`
navigations only.

## Light-Mode Token Check

| Reference requirement | Existing light value | Verdict |
|---|---|---|
| White/cream page | `--background: --neutral-050` | OK |
| Black hero card on light page | `--nav-pill: --ink-950`, used by `BalanceHero` | OK |
| Lime spotlight accent | `--primary: --lime-400` | OK |
| Light-gray progress track | `--secondary: --neutral-100` | OK |
| Muted secondary text | `--muted-foreground: --neutral-500` on white ≈ 4.7:1 | OK (AA body) |
| Soft elevation, no hard outline | `--shadow-soft` present; `--border: --neutral-200` | OK — the hard outline is `card.tsx`'s class, not a token value |

**Result: zero token VALUE changes required, zero new tokens.** The only mismatch is a component
class (Decision 8).

## File Changes

| File | Action | Description |
|---|---|---|
| `src/design-system/patterns/TransactionRow.tsx` | Create | Shared borderless list row |
| `src/design-system/patterns/ProgressBar.tsx` | Create | Pill progress track + fill + label |
| `src/design-system/patterns/QuickActionRow.tsx` | Create | Circular icon actions under the hero |
| `src/design-system/patterns/EmptyState.tsx` | Create | Shared icon/heading/CTA empty block |
| `src/design-system/patterns/BalanceHero.tsx` | Modify | Tighter label tracking; optional `footer` slot for `QuickActionRow` adjacency |
| `src/design-system/patterns/CategoryChip.tsx` | Modify | Add transition; keep as inline tag only |
| `src/design-system/ui/{button,card,chip,nav-pill}.tsx` | Modify | Hover/active states; card border removal |
| `src/app/(app)/layout.tsx` | Modify | Nav link hover affordance |
| `src/app/(app)/page.tsx` | Modify | `QuickActionRow`, `TransactionRow`, `ProgressBar`, empty state |
| `src/app/(app)/cuentas/page.tsx` | Modify | `TransactionRow` + `ProgressBar` + `EmptyState` |
| `src/app/(app)/movimientos/page.tsx` | Modify | `TransactionRow` + `EmptyState` |
| `src/app/(app)/movimientos/TransactionForm.tsx` | Modify | Segmented tab pill polish + transitions |
| `src/app/(app)/movimientos/[id]/editar/EditTransactionForm.tsx` | Modify | Spacing/heading polish only |
| `src/app/(app)/presupuestos/BudgetForm.tsx` | Modify | Consume `ProgressBar`; `EmptyState` |
| `tests/unit/home-page-render.test.tsx` | Create | RTL render, populated + empty |
| `tests/unit/accounts-page-render.test.tsx` | Create | RTL render, populated + empty |
| `tests/unit/movements-list-render.test.tsx` | Create | RTL render, populated + empty |
| `src/modules/finance/**` | Untouched | Presentation-only guarantee |

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit (pattern) | `ProgressBar` clamps to 100%, flags at/over limit, survives `limitCents === 0` | Vitest + RTL, assert `aria-valuenow` and label text |
| Unit (pattern) | `TransactionRow` renders title/subtitle/amount and the `trailing` slot | RTL text/role assertions |
| Unit (pattern) | `QuickActionRow` renders one link per action with the expected `href` | RTL `getByRole("link", { name })` |
| Unit (screen) | Home / Cuentas / Movimientos render populated **and** empty | New `*-render.test.tsx`, mirroring `tests/unit/account-form-render.test.tsx` exactly: `vi.mock("server-only")`, `next/cache`, `next/navigation`, `@/shared/supabase/server`; presentational subtree extracted or the async page invoked and its element rendered; **text/label/role assertions only, zero className assertions** |
| Regression | Existing 4 `*-form-render.test.tsx` | No changes needed — verified all four assert only `getByLabelText`/`getByText`/`getByRole`; none reference a class |
| Static | No raw hex; no new token values | `pnpm verify` (`scripts/check-tokens.mjs`, ESLint boundaries, `tsc --noEmit`) |
| Manual | 375px light (primary) and dark (parity) on all five screens | Browser check per success criteria |

## Threat Matrix

N/A — no routing logic, shell, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary. `QuickActionRow` emits static `next/link` hrefs to routes that already
exist in `src/app/(app)/`; it introduces no dynamic or user-supplied destination.

## Migration / Rollout

No migration. No data, schema, Server Action, or `finance/api` change — `git diff` on
`src/modules/finance/**` must be empty at apply time and is the presentation-only gate.

Rollout order (also the natural PR-slice order): (1) new pattern components + their unit tests,
(2) base `ui/` interaction states, (3) screen adoption + empty states, (4) the three screen RTL
tests. Slices 1-2 are additive and inert until slice 3 consumes them.

Rollback: revert the PR, or a single slice commit. Deleting the four new `patterns/` files plus
reverting the five screens restores sub-slice 2C byte-for-byte. If only motion regresses, the
transitions are isolated Tailwind utilities on identified lines and can be stripped without touching
layout or tokens.

## Open Questions

- None blocking. Decisions 5 (no transfer quick action) and 6 (`--space-*` stays unwired) are
  resolved here rather than deferred.
