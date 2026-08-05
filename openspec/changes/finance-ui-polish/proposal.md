# Proposal: Finance UI Polish

## Intent

The minimal Finance UI shipped in sub-slice 2C is functional but visually unresolved: transaction rows are re-invented ad hoc on three screens (bare flex rows in some places, individually bordered Cards in others), the budget progress bar exists only as a one-off inline implementation, and the balance hero has no quick-action row. LifeOS is about to add Health, Nutrition and more modules; without a shared visual vocabulary each one will re-invent the same rows and bars. This change polishes every current Finance screen **and** sets the app-wide visual precedent via reusable `design-system/patterns/` components.

Key finding: the existing token architecture (`primitives.css` → `semantic.css` → `globals.css @theme inline`) already expresses the target look. **Zero new raw values are needed** — this is a composition and consistency problem, not a token problem.

## Scope

### In Scope
- Visual polish (hierarchy, typography, spacing, iconography) of Home/balance hero, Cuentas, Movimientos (entry + edit), Presupuestos — **including their empty states** (zero accounts, zero movements, 0%-progress budgets), not just populated screens.
- Micro-interactions: hover/active/entrance states, 150–250ms Tailwind-only transitions, matching the existing `FabMenu.tsx` `transition-transform hover:scale-105` precedent.
- Three net-new shared components in `src/design-system/patterns/`: `TransactionRow`, `ProgressBar`, `QuickActionRow`.
- Token/interaction tuning of `BalanceHero`, `CategoryChip` (as the row's leading avatar slot), `button`, `card`, `chip`, `nav-pill`.
- `QuickActionRow` ships with **real routes only** — new transaction, new account, and any other action that already has a working destination today. No disabled/placeholder buttons for features that don't exist yet.
- New RTL render-test coverage for the three list screens (Home, Cuentas, Movimientos) — closing the gap the exploration flagged, in this same cycle rather than deferred.
- **Light mode is the primary reference for this pass; dark mode is polished to full parity but is the secondary reference** (user correction on the 21 shared mockups: most are light-background white/cream surfaces with black cards and the lime accent — a minority are full dark).

### Out of Scope
- Any data, behavior, or Server Action change; `finance/api` is untouched.
- New color/radius/shadow token values.
- Animation libraries (Framer Motion, GSAP) — Tailwind/CSS keyframes only.
- The generic "trust-blue + profit-green Financial Dashboard" style — explicitly rejected; the lime `--accent` stays.
- Disabled/placeholder quick-action buttons for not-yet-built features (e.g. no dead "Transfer" button unless transfers already have a working entry point).
- Decision deferred to design: wiring the dead `--space-1..12` tokens into `@theme inline` (optional, not required for this cycle's visual target).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `design-system`: adds required shared presentation patterns (transaction row, progress bar, quick-action row) and an interaction-state/motion requirement (Tailwind-only, 150–250ms, no orchestrated sequences).

## Approach

Extract-then-apply. First land the three shared patterns against existing tokens, then replace the ad hoc markup on each screen with them, then add interaction states to base `ui/` components. Restraint over novelty: one type family, tight scale, accent as a spotlight (one primary CTA per screen). Full pattern brief lives in the reference memory note synthesized from the 21 fintech mockups.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/design-system/patterns/` | New | `TransactionRow`, `ProgressBar`, `QuickActionRow` |
| `src/design-system/patterns/BalanceHero.tsx`, `CategoryChip.tsx` | Modified | Token/slot tuning |
| `src/design-system/ui/{button,card,chip,nav-pill}.tsx` | Modified | Missing hover/active states |
| `src/app/(app)/**` (5 screens) | Modified | Markup restyle, consume shared patterns |
| `src/design-system/tokens/semantic.css` | Modified (optional) | Wire `--space-*` if design opts in |
| `finance/api`, `domain`, `data` | Untouched | Presentation-only guarantee |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Restyle silently changes behavior | Low | Presentation-only rule; `finance/api` diff must stay empty |
| Existing form tests break | Low | All four `*-form-render.test.tsx` assert text/label/role only, zero className checks |
| List-screen regressions go unnoticed | Low | Resolved: new RTL coverage for Home/Cuentas/Movimientos ships in this cycle (was a gap, now in scope) |
| Future modules inherit a Finance-shaped abstraction | Med | Components live in `design-system/patterns/`, named domain-neutrally; this reuse is the point, by design |
| Token churn spills into other modules | Low | No new token values; `@theme inline` additions are additive only |

## Rollback Plan

Every change is presentation-layer and additive-or-cosmetic. Revert the PR (or the specific slice commit) — no migration, no data, no API surface to unwind. If only motion is problematic, the transitions are isolated Tailwind utility classes and can be stripped without touching layout. New pattern components are net-new files; deleting them plus reverting the five screens restores 2C exactly.

## Dependencies

- None. Builds entirely on tokens and components already shipped in `lifeos-foundation`.

## Success Criteria

- [ ] All five Finance screens use `TransactionRow`/`ProgressBar` instead of ad hoc markup — zero duplicated row implementations remain.
- [ ] Balance hero has a working quick-action row.
- [ ] No raw hex/RGB literals introduced; no new token values added.
- [ ] `finance/api`, `domain`, and `data` show zero diff.
- [ ] Every interactive element has a visible hover and active state at 150–250ms.
- [ ] `pnpm test` and `pnpm verify` pass; existing form-render tests unchanged.
- [ ] All screens remain usable at 375px.
- [ ] Empty states (zero accounts, zero movements, 0%-progress budget) are polished, not left in their pre-existing unstyled form.
- [ ] `QuickActionRow` contains only buttons that link to a real, already-working destination — no disabled or placeholder actions.
- [ ] New RTL render tests exist for Home, Cuentas, and Movimientos (list view), matching the existing `*-form-render.test.tsx` precedent.
- [ ] Light mode is the primary reviewed theme; dark mode reaches full token parity but is secondary for this pass.
