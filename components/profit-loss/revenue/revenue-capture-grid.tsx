"use client";

import { memo, useCallback, type ClipboardEvent } from "react";
import { NumericInput } from "@/components/ui/numeric-input";
import { cn } from "@/lib/cn";
import { MONTHS_FULL_ES } from "@/lib/date";
import { formatCurrency, formatCurrencyOrDash } from "@/lib/format";
import { sumOf } from "@/lib/revenue/derive";
import { parsePastedGrid } from "@/lib/revenue/paste";
import {
  MONTHS_IN_YEAR,
  type RevenueExternalAmounts,
  type RevenueExternalSeries,
} from "@/lib/revenue/types";

/**
 * The four columns, in the order the workbook writes them.
 *
 * «Ventas» comes FIRST because it is the denominator two of the three ratios divide by: a reader
 * checking «qué parte de la venta se cobró con tarjeta» finds the two terms side by side, in the order
 * the question asks them.
 */
const COLUMNS = [
  { key: "manualRevenue", label: "Ventas" },
  { key: "cardRevenue", label: "Cobros TC" },
  { key: "cardFees", label: "Comis. TC" },
  { key: "adSpend", label: "Publicidad" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

interface RevenueCaptureGridProps {
  series: RevenueExternalSeries;
  /** The year's RESOLVED revenue: the estado de resultados where it reaches, what was typed elsewhere. */
  revenue: (number | null)[];
  /** Which months PyG already answers — those are read, never written. */
  coverage: readonly boolean[];
  onCommit: (monthIndex: number, key: ColumnKey, value: number | null) => void;
  /** A pasted block, already resolved to whole months — written in one transaction. */
  onPasteMonths: (
    months: readonly { monthIndex: number; amounts: RevenueExternalAmounts }[],
  ) => void;
}

/**
 * Twelve FIXED rows and four columns. Fixed because the year is the thing being written and a month
 * that has not been reached yet is exactly what the user is about to fill: hiding it would hide the
 * form.
 *
 * **A «Ventas» cell that the estado de resultados answers is drawn as a FIGURE, not as a disabled
 * input.** It is the rule the filter bar already holds up everywhere else —a control that means
 * nothing for the open data renders nothing rather than sitting greyed— and here it also says the
 * right thing: that number is not something the user declined to edit, it is something Datos already
 * knows. The typed column only ever appears where PyG has nothing, which is why no year constant
 * exists anywhere in this module: the boundary moves on its own as months are uploaded.
 *
 * Every figure carries the CURRENCY SYMBOL, cells included. `formatAmount` drops it for a column
 * that already names its unit, and that is not this table: «Ventas», «Cobros TC», «Comis. TC» and
 * «Publicidad» name a concept, so without the symbol four columns of bare numbers sit next to a
 * percentage and a month count with nothing saying which of them are dollars.
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
  coverage,
  onCommit,
  onPasteMonths,
}: RevenueCaptureGridProps) {
  const commit = useCallback(
    (monthIndex: number, key: ColumnKey, value: number | null) => onCommit(monthIndex, key, value),
    [onCommit],
  );

  /**
   * A block copied out of Excel, landing where the cursor is.
   *
   * The handler sits on the `<tbody>` and reads the anchor off the `<td>` under the event rather than
   * living inside `NumericInput`: that primitive is also Rol de Pagos' and Ocupaciones' cell, and a
   * clipboard rule that belongs to ONE grid has no business inside a control three modules share.
   *
   * A single value is left to the browser — pasting one number into a focused input is already what
   * the user expects, and intercepting it would break the draft-and-commit dance `NumericInput` does.
   * Anything larger is this grid's business and the default is prevented.
   */
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTableSectionElement>) => {
      const cell = (event.target as HTMLElement).closest<HTMLTableCellElement>("td[data-month]");
      if (!cell) {
        return;
      }
      const grid = parsePastedGrid(event.clipboardData.getData("text/plain"));
      if (grid.length === 0 || (grid.length === 1 && grid[0].length <= 1)) {
        return;
      }
      event.preventDefault();

      const anchorMonth = Number(cell.dataset.month);
      const anchorColumn = Number(cell.dataset.column);
      const months: { monthIndex: number; amounts: RevenueExternalAmounts }[] = [];

      grid.forEach((row, rowOffset) => {
        const month = anchorMonth + rowOffset;
        if (month >= MONTHS_IN_YEAR) {
          // The block is CLIPPED, never wrapped: a column of fourteen figures pasted into octubre
          // fills octubre to diciembre and drops the rest. Wrapping round to enero would silently
          // rewrite months the user was not looking at.
          return;
        }
        // The whole month travels, because `db.ts` stores a month and not a cell — the columns the
        // paste does not reach have to arrive unchanged or they would be blanked.
        const amounts: RevenueExternalAmounts = {
          manualRevenue: series.manualRevenue[month],
          cardRevenue: series.cardRevenue[month],
          cardFees: series.cardFees[month],
          adSpend: series.adSpend[month],
        };
        let touched = false;
        row.forEach((value, columnOffset) => {
          const column = COLUMNS[anchorColumn + columnOffset];
          // `undefined` is «no pude leer esto» and leaves the cell exactly as it was; `null` is an
          // empty source cell and clears it. A ventas month PyG answers is skipped outright — the
          // stored figure is not what that row reads, so writing it would store a number nobody sees.
          if (!column || value === undefined) {
            return;
          }
          if (column.key === "manualRevenue" && coverage[month]) {
            return;
          }
          amounts[column.key] = value;
          touched = true;
        });
        if (touched) {
          months.push({ monthIndex: month, amounts });
        }
      });

      onPasteMonths(months);
    },
    [series, coverage, onPasteMonths],
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
      <tbody onPaste={handlePaste}>
        {Array.from({ length: MONTHS_IN_YEAR }, (_, month) => {
          // Sold, and nothing external written down: the row that is holding the percentages back.
          const pending =
            revenue[month] !== null &&
            series.cardRevenue[month] === null &&
            series.cardFees[month] === null &&
            series.adSpend[month] === null;
          return (
            <tr key={month} className={cn("border-b border-border-faint", pending && "bg-marked")}>
              <th scope="row" className="px-2 py-1 text-left text-[12px] font-medium text-ink-soft">
                {MONTHS_FULL_ES[month]}
              </th>
              {COLUMNS.map((column, columnIndex) => {
                const fromPyg = column.key === "manualRevenue" && coverage[month];
                return (
                  <td
                    key={column.key}
                    data-month={month}
                    data-column={columnIndex}
                    className="px-2 py-1"
                  >
                    {fromPyg ? (
                      <span
                        title="Viene del estado de resultados"
                        className="block text-right font-mono text-[12px] tabular-nums text-muted"
                      >
                        {formatCurrency(revenue[month] as number, { cents: true })}
                      </span>
                    ) : (
                      <NumericInput
                        value={series[column.key][month]}
                        onCommit={(value) => commit(month, column.key, value)}
                        format="currency"
                        nullable
                        ariaLabel={`${column.label} de ${MONTHS_FULL_ES[month]}`}
                        className="text-[12px]"
                      />
                    )}
                  </td>
                );
              })}
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
                  which is the one distinction this module rests on.

                  Ventas totals the RESOLVED series and not the typed one: the column shows figures
                  from both sources, so a total of only what was typed would not add up to what is
                  above it. */}
              {formatCurrencyOrDash(
                sumOf(column.key === "manualRevenue" ? revenue : series[column.key]),
              )}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
});
