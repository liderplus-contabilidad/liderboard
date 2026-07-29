/**
 * App-wide formatting helpers. Every user-facing number should be rendered through
 * these so the whole dashboard speaks one language — Ecuadorian USD, Spanish locale.
 * Reach for these from any module (PyG, Sueldos, Ventas, …) instead of re-formatting
 * locally.
 */

const EC_CURRENCY_WHOLE = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const EC_CURRENCY_CENTS = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Ecuadorian USD currency, sign ahead of the symbol ("$1.234" / "-$1.234"). Ecuador
 * uses the US dollar, so `es-EC` yields `.` grouping and a `$` symbol. Whole dollars by
 * default (dense tables read cleaner); pass `{ cents: true }` for two decimals.
 */
export function formatCurrency(value: number, options?: { cents?: boolean }): string {
  const formatter = options?.cents ? EC_CURRENCY_CENTS : EC_CURRENCY_WHOLE;
  const formatted = formatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : formatted;
}

/**
 * Inverse of the Ecuadorian formatters for editable numeric inputs: parses an amount
 * written with `.` as the thousands separator and `,` as the decimal ("17.338,85" →
 * 17338.85). Returns `null` for blank or unparseable input so callers can tell a
 * cleared field from an unchanged one. Pair the editor's seed with `formatNumber` so
 * the value round-trips without inflation.
 */
export function parseCurrency(input: string): number | null {
  const normalized = input.trim().replace(/\./g, "").replace(",", ".");
  if (normalized === "") {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const EC_NUMBER = new Intl.NumberFormat("es-EC");

/** Plain Ecuadorian-grouped number, no currency symbol ("1.234,5"). */
export function formatNumber(value: number): string {
  return EC_NUMBER.format(value);
}

/** Percentage with one decimal, Spanish spacing ("12,4 %"). */
export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toLocaleString("es-EC", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} %`;
}

/** A list read as a Spanish sentence: "A", "A y B", "A, B y C". */
export function formatList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** A count with its noun, singular or plural: `3 centros` / `1 centro`. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
