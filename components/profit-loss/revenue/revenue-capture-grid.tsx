"use client";

import { memo, useCallback } from "react";
import { NumericInput } from "@/components/ui/numeric-input";
import { cn } from "@/lib/cn";
import { MONTHS_FULL_ES } from "@/lib/date";
import { formatCurrencyOrDash } from "@/lib/format";
import { sumOf } from "@/lib/revenue/derive";
import { MONTHS_IN_YEAR, type RevenueExternalSeries } from "@/lib/revenue/types";

/** The three columns, in the order the workbook writes them. */
const COLUMNS = [
  { key: "cardRevenue", label: "Cobros TC" },
  { key: "cardFees", label: "Comis. TC" },
  { key: "adSpend", label: "Facebook" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

interface RevenueCaptureGridProps {
  series: RevenueExternalSeries;
  /** The year's revenue, so a month with sales and nothing captured can be pointed at. */
  revenue: (number | null)[];
  onCommit: (monthIndex: number, key: ColumnKey, value: number | null) => void;
}

/**
 * Twelve FIXED rows and three editable columns. Fixed because the year is the thing being written and
 * a month that has not been reached yet is exactly what the user is about to fill: hiding it would
 * hide the form.
 *
 * Every figure carries the CURRENCY SYMBOL, cells included. `formatAmount` drops it for a column
 * that already names its unit, and that is not this table: «Cobros TC», «Comis. TC» and «Facebook»
 * name a concept, so without the symbol three columns of bare numbers sit next to a percentage and a
 * month count with nothing saying which of them are dollars.
 *
 * **It saves on leaving the cell** (`onCommit`), with no «Guardar» button — the same gesture as
 * Datos' cell editor and Ocupaciones' daily grid. A save button here would be a second truth about
 * whether what is on screen is what is stored.
 *
 * A month with SALES loaded and nothing captured is highlighted in `--color-marked`: it is rule (d)
 * made visible exactly where it can be fixed, because that month is the one falling out of the three
 * percentages until somebody writes it.
 */
export const RevenueCaptureGrid = memo(function RevenueCaptureGrid({
  series,
  revenue,
  onCommit,
}: RevenueCaptureGridProps) {
  const commit = useCallback(
    (monthIndex: number, key: ColumnKey, value: number | null) => onCommit(monthIndex, key, value),
    [onCommit],
  );

  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr>
          <th className="px-2 py-1.5 text-left font-semibold text-muted">Mes</th>
          {COLUMNS.map((column) => (
            <th key={column.key} className="px-2 py-1.5 text-right font-semibold text-muted">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: MONTHS_IN_YEAR }, (_, month) => {
          // Sold, and nothing written down: the row that is holding the percentages back.
          const pending =
            revenue[month] !== null &&
            COLUMNS.every((column) => series[column.key][month] === null);
          return (
            <tr key={month} className={cn("border-b border-border-faint", pending && "bg-marked")}>
              <th scope="row" className="px-2 py-1 text-left text-[12px] font-medium text-ink-soft">
                {MONTHS_FULL_ES[month]}
              </th>
              {COLUMNS.map((column) => (
                <td key={column.key} className="px-2 py-1">
                  <NumericInput
                    value={series[column.key][month]}
                    onCommit={(value) => commit(month, column.key, value)}
                    format="currency"
                    nullable
                    ariaLabel={`${column.label} de ${MONTHS_FULL_ES[month]}`}
                    className="text-[12px]"
                  />
                </td>
              ))}
            </tr>
          );
        })}
        <tr className="bg-surface-sunken">
          <th scope="row" className="px-2 py-1.5 text-left text-[12px] font-bold text-ink">
            Total
          </th>
          {COLUMNS.map((column) => (
            <td
              key={column.key}
              className="px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums text-ink"
            >
              {/* A column with nothing captured totals a real `0`, and in a grid a zero is painted
                  as ABSENCE: `$0.00` under twelve empty cells reads as «se registró y fue cero»,
                  which is the one distinction this module rests on. */}
              {formatCurrencyOrDash(sumOf(series[column.key]))}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
});
