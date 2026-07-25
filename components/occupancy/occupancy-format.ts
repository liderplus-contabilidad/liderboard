/**
 * Cell rendering rules for the Ocupaciones grid. Day cells stay terse (the columns are
 * ~46px wide); the "Total / prom." column can afford the full currency form.
 */
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { OccupancyGridRow } from "@/lib/occupancy/derive";

type Format = OccupancyGridRow["format"];

/** Two decimals max: `formatNumber` would otherwise render 680/31 as "21,935". */
function cents(value: number): string {
  return formatNumber(Math.round(value * 100) / 100);
}

/** Past this, "1.095,17" no longer fits a day column and would be clipped mid-number. */
const CENTS_FIT_BELOW = 1000;

/**
 * Occupancy is a small ratio out of few rooms, so whole percents lose real information:
 * 9/22 and 10/22 both read "41 %" at zero decimals. Fixed (not trimmed) so the column
 * stays aligned.
 */
const PERCENT_DECIMALS = 2;

/** A day cell. `null` means "not defined" (e.g. ADR with nothing sold), not zero. */
export function formatDayCell(value: number | null, format: Format): string {
  if (value === null) {
    return "—";
  }
  if (format === "percent" || format === "percent-whole") {
    return formatPercent(value * 100, format === "percent" ? PERCENT_DECIMALS : 0);
  }
  // Cents where they fit, whole units where they don't. Dropping them everywhere would
  // cost ADR its precision; keeping them everywhere clips four-figure revenue days. The
  // "Total / prom." column always shows the exact amount.
  return Math.abs(value) >= CENTS_FIT_BELOW ? formatNumber(Math.round(value)) : cents(value);
}

/** The "Total / prom." column. */
export function formatAggregate(value: number | null, format: Format): string {
  if (value === null) {
    return "—";
  }
  if (format === "percent" || format === "percent-whole") {
    return formatPercent(value * 100, format === "percent" ? PERCENT_DECIMALS : 0);
  }
  return format === "currency" ? formatCurrency(value, { cents: true }) : cents(value);
}

/**
 * The string an editable cell is seeded with ON FOCUS. This must be the EXACT value:
 * `formatNumber` (es-EC: "," decimal) is the inverse of `parseCurrency`, so focusing and
 * blurring without typing round-trips to the same number. Seeding the compact display form
 * instead would make a stray click commit 1.095 over a stored 1.095,17.
 *
 * A zero seeds as blank — typing over "0" every time is friction, and committing a blank
 * yields 0 again, so nothing is lost.
 */
export function seedEditValue(value: number | null): string {
  return value === null || value === 0 ? "" : formatNumber(value);
}
