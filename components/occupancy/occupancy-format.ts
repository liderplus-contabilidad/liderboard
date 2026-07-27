import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { OccupancyGridRow } from "@/lib/occupancy/derive";

type Format = OccupancyGridRow["format"];

/** Two decimals max: `formatNumber` would otherwise render 680/31 as "21,935". */
function cents(value: number): string {
  return formatNumber(Math.round(value * 100) / 100);
}

/** Past this, "1.095,17" no longer fits a day column and would be clipped mid-number. */
const CENTS_FIT_BELOW = 1000;

/** Occupancy is a small ratio out of few rooms: at zero decimals 9/22 and 10/22 both read "41 %". */
const PERCENT_DECIMALS = 2;

export function formatDayCell(value: number | null, format: Format): string {
  if (value === null) {
    return "—";
  }
  if (format === "percent" || format === "percent-whole") {
    return formatPercent(value * 100, format === "percent" ? PERCENT_DECIMALS : 0);
  }
  // Dropping cents everywhere would cost ADR its precision; keeping them everywhere clips
  // four-figure revenue days. The "Total / prom." column always shows the exact amount.
  return Math.abs(value) >= CENTS_FIT_BELOW ? formatNumber(Math.round(value)) : cents(value);
}

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
 * Seeds an editable cell ON FOCUS with the EXACT value: `formatNumber` (es-EC) is the inverse of
 * `parseCurrency`, so focus-and-blur round-trips. Seeding the compact display form instead would
 * make a stray click commit 1.095 over a stored 1.095,17. A zero seeds blank; committing a blank
 * yields 0 again, so nothing is lost.
 */
export function seedEditValue(value: number | null): string {
  return value === null || value === 0 ? "" : formatNumber(value);
}
