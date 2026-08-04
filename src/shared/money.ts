// Centavos <-> es-MX MXN display, and the calendar-month boundary helper. Pure, no imports
// beyond the platform Intl API — this is the layer the pgTAP suites deliberately do not
// duplicate (design.md §9 "Unit (pure, no DB)").

const MXN_FORMATTER = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  currencyDisplay: "symbol",
});

/** Centavos (signed) -> a formatted es-MX MXN string, e.g. -150000 -> "-$1,500.00". */
export function formatCentsAsMXN(cents: number): string {
  return MXN_FORMATTER.format(cents / 100);
}

/** Centavos -> the plain decimal amount (pesos), no currency symbol. */
export function centsToPesos(cents: number): number {
  return cents / 100;
}

/** Pesos -> integer centavos, rounded to the nearest centavo to avoid float drift. */
export function pesosToCents(pesos: number): number {
  return Math.round(pesos * 100);
}

/** The first and last calendar day (inclusive) of the month containing `date`. */
export function calendarMonthBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
}
