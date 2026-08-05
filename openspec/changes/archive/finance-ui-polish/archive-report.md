# Archive Report — finance-ui-polish

**Change**: finance-ui-polish
**Archived**: 2026-08-05
**Closure method**: manual (orchestrator-driven), not via `gentle-ai review`/`sdd-archive` native gate

## Why manual closure

Same root cause as `lifeos-foundation` and `finance-budgets`: the `review-*` subagents in this
session's Claude Code project have no `Bash` tool, so `gentle-ai review inspect-candidate`
(required to inspect the frozen Git trees) can never run. See
`openspec/changes/archive/lifeos-foundation/archive-report.md` for the original detailed writeup.

## What shipped

Presentation-only polish of all five Finance screens (Home, Cuentas, Movimientos entry+edit,
Presupuestos), grounded in 21 user-shared fintech reference mockups and three design skills
(`frontend-design`, `impeccable`, `ui-ux-pro-max`). Delivered as 4 stacked-to-main PRs (#14–#17),
all merged to `main` in order.

- **New shared `design-system/patterns/` components**: `TransactionRow`, `ProgressBar`,
  `QuickActionRow`, `EmptyState` — replacing ad hoc duplicated markup across three screens.
- **Interaction states**: hover/active on `button`/`card`/`chip`/`nav-pill`, Tailwind-only,
  150–250ms, matching the existing `FabMenu` precedent. No animation library added.
- **Empty states**: zero-accounts, zero-movements, and 0%-progress-budget states are now styled,
  not left as bare placeholders.
- **Light mode is the primary reference theme** (corrected mid-cycle from an initial "dark-first"
  assumption — most of the 21 reference mockups are light-background; the user corrected this
  explicitly), dark mode reaches full token parity as the secondary reference.
- **Zero new raw token values** — the existing `primitives.css`/`semantic.css`/`@theme inline`
  pipeline already expressed the target look; confirmed by a light-mode token audit in
  `design.md` and enforced by `check-tokens.mjs`.
- **`finance/api`, `domain`, `data` layers: confirmed zero diff** — presentation-only boundary
  held for the entire cycle.

## Post-verify fixes found during the user's live browser review (not in original scope)

Two real gaps were found and fixed after the initial 4-PR apply, during the user's own manual
review of the running app — same precedent as `finance-budgets`' post-verify nav-link fix:

1. **Styled `Select` component** (`src/design-system/ui/select.tsx`, built on
   `@radix-ui/react-select`): every native `<select>` in `AccountForm`/`TransactionForm`/
   `EditTransactionForm` (7 total) rendered with unstyled OS/browser chrome — a jarring visual
   mismatch the user caught immediately from a screenshot (default option-list colors, chevron
   icon with no padding against the trigger edge). This is now a **standing, app-wide convention**
   for any future dropdown, not Finance-specific — confirmed explicitly by the user
   ("de ahora en adelante todos los drop down que se creen con ese estilo y reglas") and captured
   in the new "Styled Select Component for Every Dropdown" spec requirement above.
2. **Icon-only bottom nav**: `Inicio`/`Cuentas`/`Presupuestos` were plain text labels in the
   `NavPill`; every reference mockup uses icon-only or icon+label bottom nav. Replaced with
   lucide-react icons (Home/Wallet/Target) plus `aria-label` for accessibility.

**Operational note for future sessions**: both fixes were initially committed to the PR #17 tip
branch but never `git push`ed before `gh pr merge` ran — the merge silently used whatever was
already on the remote, dropping both fixes from `main`. Caught immediately after merge via
`git branch -vv` showing the local branch "ahead 2" of its remote-tracking branch. Recovered by
cherry-picking both commits directly onto `main` (`d0a0ae3`, `22b53f9`) and pushing. See
`sdd_workflow_preferences` project memory for the durable lesson: always `git push` before
`gh pr merge` on the same branch.

## Verification

Per `verify-report.md` (sdd-verify agent, 2026-08-05): **PASS WITH WARNINGS**, 0 CRITICAL.

- `pnpm verify`: clean PASS (eslint, tsc, `check-tokens.mjs`, `next build`, 12 routes)
- `pnpm test`: 91/91 pass (one known pre-existing ESLint-subprocess flake, confirmed passing in
  isolation, not a regression)
- `git diff main -- src/modules/finance/`: 0 lines
- 22/22 tasks (P-001..P-022) complete
- 7/7 spec requirements PASS, each independently cross-checked against source, not trusted from
  claims
- Both post-verify follow-up commits independently re-verified: Select preserves Server Action
  `FormData` submission via Radix's hidden native `<select>`, RTL tests updated to the correct
  listbox/option interaction pattern (not just made to pass), icon nav has correct `aria-label`
  accessibility compensation

**WARNINGs** (minor, none blocking): no RTL test for the icon-nav `aria-label`s; follow-up
commits postdate `design.md`/`tasks.md` by design (documented precedent); all 4 PRs were open
at verify time (resolved after verify — merged in order).

## Spec merge

The 7 delta requirements from `specs/design-system/spec.md` were merged into the existing main
spec `openspec/specs/design-system/spec.md` (a MODIFIED capability, not new — appended before its
"Resolved Ambiguities" section). One additional requirement, "Styled Select Component for Every
Dropdown," was added beyond the original delta spec to capture the post-verify Select convention
as a durable, testable requirement for future work.

## Outcome

Change `finance-ui-polish` is **complete and closed**. All four PRs merged to `main` in stacked
order; the two live-review fixes are on `main` as direct commits. This is now the visual baseline
future modules (Health, Nutrition, etc.) inherit from `design-system/patterns/` and
`design-system/ui/select.tsx`.

This folder moves to `openspec/changes/archive/finance-ui-polish/` as the closure record.
