// Signed-amount normalization + balance arithmetic. Pure, no DB/Supabase imports — mirrors the
// server-side rule (design.md §3.3 Key Decision #2) so the client can preview a value before
// the seam derives the authoritative signed row.

export type TransactionKind = "income" | "expense";

/** Positive UI input (magnitude) + kind -> the SIGNED amount stored on the row. */
export function toSignedAmountCents(kind: TransactionKind, magnitudeCents: number): number {
  if (magnitudeCents <= 0) {
    throw new RangeError("magnitudeCents must be a positive integer number of centavos");
  }
  return kind === "income" ? Math.abs(magnitudeCents) : -Math.abs(magnitudeCents);
}

/** opening balance + posted transaction amounts (already signed) -> the derived balance. */
export function computeBalanceCents(openingBalanceCents: number, postedAmountsCents: number[]): number {
  return postedAmountsCents.reduce((sum, cents) => sum + cents, 0) + openingBalanceCents;
}
