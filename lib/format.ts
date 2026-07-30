/**
 * App-wide formatting helpers. Every user-facing number should be rendered through
 * these so the whole dashboard speaks one language — Ecuadorian USD, Spanish locale.
 * Reach for these from any module (PyG, Sueldos, Ventas, …) instead of re-formatting
 * locally.
 */

/**
 * Ecuador writes the dollar the way the dollar is written: `,` groups thousands and `.`
 * separates the cents ("$57,961.95"). ICU's `es-EC` disagrees — it applies the Spanish
 * convention and yields "$57.961,95" — so every formatter here is built on `en-US`, which
 * is the separator pair the country actually uses. The Spanish half of the locale (the
 * `%` spacing, the wording) is written by hand below.
 */
const NUMBER_LOCALE = "en-US";

const EC_CURRENCY_WHOLE = new Intl.NumberFormat(NUMBER_LOCALE, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const EC_CURRENCY_CENTS = new Intl.NumberFormat(NUMBER_LOCALE, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Ecuadorian USD currency, sign ahead of the symbol ("$1,234" / "-$1,234"). Whole dollars
 * by default (dense tables read cleaner); pass `{ cents: true }` for two decimals.
 */
export function formatCurrency(value: number, options?: { cents?: boolean }): string {
  const formatter = options?.cents ? EC_CURRENCY_CENTS : EC_CURRENCY_WHOLE;
  const formatted = formatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : formatted;
}

/**
 * The shape the parser accepts, checked BEFORE the separators are stripped: a comma is only
 * a thousands mark if it groups exactly three digits, and a `.` may appear only after them.
 * Stripping first and letting `Number` decide would read the inverted convention
 * ("17.338,85") as 17,33885 — a silent division by a thousand, which is exactly the kind of
 * misread a statement can carry to the client unnoticed. Rejecting it lands on `null`, which
 * every caller already treats as "leave the cell alone".
 */
const AMOUNT_SHAPE = /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;

/**
 * Inverse of the Ecuadorian formatters for editable numeric inputs: parses an amount
 * written with `,` as the thousands separator and `.` as the decimal ("17,338.85" →
 * 17338.85). Returns `null` for blank or unparseable input so callers can tell a cleared
 * field from an unchanged one. Pair the editor's seed with `formatNumber` so the value
 * round-trips.
 */
export function parseCurrency(input: string): number | null {
  const trimmed = input.trim();
  if (!AMOUNT_SHAPE.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

const EC_NUMBER = new Intl.NumberFormat(NUMBER_LOCALE);

/** Plain Ecuadorian-grouped number, no currency symbol ("1,234.5"). */
export function formatNumber(value: number): string {
  return EC_NUMBER.format(value);
}

const EC_AMOUNT = new Intl.NumberFormat(NUMBER_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * An amount under a column that already names its unit: two decimals ALWAYS, padded, and no `$`
 * ("47,609.00"). A column of repeated currency symbols is noise, but a column where 47,609 sits
 * over 56,042.18 reads as two different kinds of figure — the padding is what lets a reader
 * compare it against their own spreadsheet cell by cell.
 */
export function formatAmount(value: number): string {
  return EC_AMOUNT.format(value);
}

/** Percentage with one decimal, Spanish spacing ("12.4 %"). */
export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toLocaleString(NUMBER_LOCALE, {
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
