"use client";

import { memo, useCallback, type ClipboardEvent } from "react";
import { NumericInput } from "@/components/ui/numeric-input";
import { MONTHS_SHORT_ES } from "@/lib/date";
import { formatCurrencyOrDash, formatPercent } from "@/lib/format";
import { parsePastedGrid } from "@/lib/paste";
import {
  EMPTY_LEGACY_AMOUNTS,
  PERSONNEL_LEGACY_COST_ROWS,
  type PersonnelLegacyAmounts,
  type PersonnelLegacyRowId,
  type PersonnelLegacySeries,
} from "@/lib/personnel-cost/legacy";
import { shareOf } from "@/lib/personnel-cost/derive";

interface PersonnelCostCaptureGridProps {
  series: PersonnelLegacySeries;
  /**
   * The months DRAWN, ascending: all twelve, or the ones the bar's «Mes» marks. Totals and shares are
   * of these months only, so the figure at the end of a row is the figure of the columns beside it.
   */
  months: readonly number[];
  /**
   * The year's VENTAS as the app resolves them — raíz 4 where the estado de resultados has the month,
   * «Reportería de ingresos» where it does not. Read and never written here: this table shows the
   * divisor so the percentage beside it can be checked, and typing it in two places is exactly what
   * `resolveMonthlyRevenue` exists to prevent.
   */
  revenue: readonly (number | null)[];
  onCommit: (monthIndex: number, row: PersonnelLegacyRowId, value: number | null) => void;
  /** A pasted block, already resolved to whole months — written in one transaction. */
  onPasteMonths: (
    months: readonly { monthIndex: number; amounts: PersonnelLegacyAmounts }[],
  ) => void;
}

/** The rows a paste can land on, in the order they are DRAWN. */
const ROW_IDS: readonly PersonnelLegacyRowId[] = PERSONNEL_LEGACY_COST_ROWS.map((row) => row.id);

/**
 * The old sheet, as it was: **four fixed rows and a column per month** — twelve, or the ones «Mes» marks.
 *
 * It is TRANSPOSED against `RevenueCaptureGrid` —there the months are the rows— and that is not a
 * style choice: this table exists to be filled by copying out of the workbook it replaces, and that
 * workbook writes a concept per row and a month per column. A reader pasting a line of twelve figures
 * has to find twelve cells lying the way they lie in their own file, or every paste needs transposing
 * by hand first.
 *
 * Fixed rows, and every month of the year unless the bar's «Mes» marks some: the YEAR is the thing
 * being written, and a month nobody has reached yet is exactly the cell the user is about to fill.
 * The mark narrows what is drawn, the way it narrows the comparativo, and it narrows the paste with
 * it — a block never writes into a column that is not on screen.
 *
 * **It saves on leaving the cell**, with no «Guardar» button — Datos' cell editor, Ocupaciones' daily
 * grid and Ingresos' capture, all the same gesture. A save button would be a second truth about
 * whether what is on screen is what is stored.
 *
 * Every cell carries the CURRENCY symbol: the rows name a concept and not a unit, so without it they
 * would be columns of bare numbers with nothing saying they are dollars.
 *
 * **VENTAS is drawn UNDER the four, behind a rule**, and both halves of that matter. Under, because
 * the four are the sheet's own shape and a foreign row on top of them would break the paste: a
 * four-line block copied from the old workbook and dropped on the first row has to land on the four
 * costs. And separated, because it is not a fifth cost — it is the DIVISOR, and it adds into nothing.
 * The «% vs ventas» column beside the total is the whole reason it is typed at all.
 */
export const PersonnelCostCaptureGrid = memo(function PersonnelCostCaptureGrid({
  series,
  months,
  revenue: revenueSeries,
  onCommit,
  onPasteMonths,
}: PersonnelCostCaptureGridProps) {
  /**
   * A block copied out of Excel, landing where the cursor is.
   *
   * The handler sits on the `<tbody>` and reads its anchor off the `<td>` under the event rather than
   * living inside `NumericInput`: that primitive is also Rol de Pagos' and Ocupaciones' cell, and a
   * clipboard rule belonging to ONE grid has no business inside a control three modules share.
   *
   * Here a pasted row runs along the MONTHS and a pasted column down the four lines, which is the
   * transpose of Ingresos' grid and the reason the two cannot share this handler even though they
   * share `parsePastedGrid`. A single value is left to the browser: pasting one number into a focused
   * input is already what the user expects, and intercepting it would break `NumericInput`'s
   * draft-and-commit dance.
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
      const anchorRow = Number(cell.dataset.row);
      // The block walks the DRAWN columns from the anchor, not the calendar: with «Mes» marking three
      // months, a row of three figures lands on those three and nothing is written behind the filter.
      const anchorColumn = months.indexOf(anchorMonth);

      // The block is resolved into whole MONTHS because `db.ts` stores a month and not a cell: the
      // lines a paste does not reach have to travel unchanged or they would be blanked.
      const touched = new Map<number, Record<PersonnelLegacyRowId, number | null>>();
      const monthOf = (month: number) => {
        const current = touched.get(month);
        if (current) {
          return current;
        }
        const fresh = Object.fromEntries(ROW_IDS.map((id) => [id, series[id][month]])) as Record<
          PersonnelLegacyRowId,
          number | null
        >;
        touched.set(month, fresh);
        return fresh;
      };

      grid.forEach((line, rowOffset) => {
        const row = ROW_IDS[anchorRow + rowOffset];
        if (!row) {
          // CLIPPED and never wrapped: a block of six lines pasted onto «Factura familia» fills the
          // two under it and drops the rest. Wrapping round to the first line would silently rewrite
          // rows the user was not looking at.
          return;
        }
        line.forEach((value, columnOffset) => {
          const month = months[anchorColumn + columnOffset];
          if (month === undefined || value === undefined) {
            // `undefined` is «no pude leer esto» and leaves the target alone — `parsePastedGrid`'s
            // own rule, which is what stops a stray word blanking the month it lands on.
            return;
          }
          monthOf(month)[row] = value;
        });
      });

      onPasteMonths(
        [...touched.entries()]
          .sort(([a], [b]) => a - b)
          .map(([monthIndex, amounts]) => ({ monthIndex, amounts })),
      );
    },
    [series, months, onPasteMonths],
  );

  const total = (row: PersonnelLegacyRowId) => {
    const values = months
      .map((month) => series[row][month])
      .filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  };

  // The span's denominator, and `shareOf` is the module's ONE definition of a share: `null` where no
  // ventas are known anywhere, which reads «–» and never «0 %» — a zero would claim the cost was
  // nothing.
  const revenue = months.reduce<number>((sum, month) => sum + (revenueSeries[month] ?? 0), 0);
  const share = (row: PersonnelLegacyRowId) => {
    const amount = total(row);
    return amount === null ? null : shareOf(amount, revenue);
  };
  const written = (value: number | null) => (value === null ? "–" : formatPercent(value));

  return (
    <div className="overflow-x-auto rounded-[13px] border border-border-soft">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-surface-header">
            <th className="sticky left-0 z-10 bg-surface-header px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
              Concepto
            </th>
            {months.map((month) => (
              <th
                key={month}
                className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.5px] text-faint"
              >
                {MONTHS_SHORT_ES[month]}
              </th>
            ))}
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
              Total
            </th>
            <th className="whitespace-nowrap px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
              % vs ventas
            </th>
          </tr>
        </thead>
        <tbody onPaste={handlePaste}>
          {PERSONNEL_LEGACY_COST_ROWS.map((row, rowIndex) => (
            <tr key={row.id} className="border-t border-border-faint">
              <th
                scope="row"
                className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-1.5 text-left text-[12px] font-medium text-ink"
              >
                {row.label}
              </th>
              {months.map((month) => (
                <td key={month} className="p-0" data-month={month} data-row={rowIndex}>
                  <NumericInput
                    value={series[row.id][month]}
                    onCommit={(value) => onCommit(month, row.id, value)}
                    format="currency"
                    nullable
                    align="right"
                    ariaLabel={`${row.label}, ${MONTHS_SHORT_ES[month]}`}
                    className="w-[104px] rounded-none border-0 bg-transparent"
                  />
                </td>
              ))}
              <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums text-muted">
                {formatCurrencyOrDash(total(row.id))}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums text-muted">
                {written(share(row.id))}
              </td>
            </tr>
          ))}

          {/* El divisor, separado por una regla más marcada: no es una quinta línea de costo y no entra
              en la suma de arriba. Va en CIFRAS y no en campos porque no se escribe aquí — sale del
              estado de resultados donde lo hay, y de «Reportería de ingresos» donde no. */}
          <tr className="border-t-2 border-border bg-surface-muted">
            <th
              scope="row"
              className="sticky left-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-1.5 text-left text-[12px] font-semibold text-ink"
            >
              Ventas
            </th>
            {months.map((month) => (
              <td
                key={month}
                className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-muted"
              >
                {formatCurrencyOrDash(revenueSeries[month] ?? null)}
              </td>
            ))}
            <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono font-semibold tabular-nums text-ink">
              {revenue === 0 ? "–" : formatCurrencyOrDash(revenue)}
            </td>
            <td className="px-3 py-1.5 text-right font-mono tabular-nums text-faint">
              {revenue === 0 ? "–" : formatPercent(100)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});

export { EMPTY_LEGACY_AMOUNTS };
