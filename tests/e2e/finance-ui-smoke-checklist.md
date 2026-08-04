# Finance UI End-to-End Smoke Checklist (T-040)

Manual checklist standing in for a full Playwright automation pass, per the
same precedent T-007 already established (`mobile-first-checklist.md`) and
per this sub-slice's explicit scope note ("A full Playwright browser-
automation pass is NOT required"). The scenarios below are exactly the ones
`tasks.md` T-040 lists; each one that can be verified without a browser is
already covered by a real, automated integration test instead (see the
"Automated coverage" column) — this checklist exists for the remainder,
which genuinely needs a rendered browser (visual layout, theme rendering,
DOM text absence).

| # | Scenario (tasks.md T-040) | Automated coverage | Manual check | Done |
|---|---|---|---|---|
| 1 | Sign-in → dashboard with zero ceremony, categories already present | `tests/integration/finance-facade.test.ts` (`app.bootstrap_user()` round trip) | Open `/entrar`, sign in with Google, confirm no space/household picker appears and land directly on `/` | ☐ |
| 2 | Record an expense | `tests/integration/movement-creation-ui.test.ts` (real Server Action + balance view) | Use `/movimientos`, record a real expense, confirm the account balance updates on `/` | ☐ |
| 3 | Correct an expense onto the right account and see both balances update | `supabase/tests/070_finance_corrections.sql` (pgTAP) + `tests/integration/finance-facade.test.ts` | Use `/movimientos/[id]/editar` to change an account, confirm both old and new account balances are correct | ☐ |
| 4 | Record a transfer and confirm it is absent from month income/expense | `tests/integration/movement-creation-ui.test.ts` (both legs post as `type='transfer'`) | Record a transfer via `/movimientos`, confirm the home screen's available-money figure moves correctly and the transfer never appears colored as income/expense in the history list's type label | ☐ |
| 5 | 375px layout | — (visual) | See `mobile-first-checklist.md`, rows for `/cuentas`, `/cuentas/nueva`, `/movimientos`, `/movimientos/[id]/editar` | ☐ |
| 6 | Light and dark render | — (visual) | See `mobile-first-checklist.md` | ☐ |
| 7 | No "household"/"hogar" text anywhere in authenticated UI | `tests/unit/no-household-text.test.ts` (source-level scan, extended in 2C) | Skim `/cuentas`, `/cuentas/nueva`, `/movimientos`, `/movimientos/[id]/editar` for the words "household"/"hogar" in rendered copy | ☐ |

**Auth caveat (unchanged from design.md §9):** Google OAuth is not configured
in this environment this cycle — every automated test above authenticates
against the local stack with a real signed-up/signed-in password user
(`tests/integration/helpers/local-supabase.ts`), never the real Google
consent screen. Row 1's manual check can only be completed once Google OAuth
is configured, per the orchestrator's stated deferral.

**Not automated with Playwright in this sub-slice** (deliberate, per scope):
rows 1, 5, 6, and the rendered-copy half of row 7 require an actual browser
and are left as manual checks; rows 2, 3, 4, and the source-level half of
row 7 have real automated coverage instead, which is the higher-value check
for correctness (Playwright would only re-prove the same server-side
behavior through a slower, flakier path).
