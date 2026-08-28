import { cn } from "@/lib/cn";
import type { ChartTable } from "@/lib/charts/types";
import type { StatementFit } from "@/lib/report/page-fit";

/** Below four columns, the extra width goes to the row's name instead of inflating figures that
 *  already read fine — the same cap as the tables of PyG's report. */
const MAX_COLUMN_PCT = 16;
const BASE_INDENT = 10;

/**
 * The printed table of one section, built from the SAME `ChartTable` the screen already builds —
 * never a second reading of the data.
 *
 * It does not reuse `chart-card.tsx`'s `TableTwin`: that one has SCREEN affordances —a sticky column,
 * `hover`, a fixed 12 px body— that mean nothing on paper, and it does not accept the type size `fit`
 * dictates.
 *
 * It is the SECOND report table with this shape (the other is in `payroll/salaries/report/`), and the
 * real difference between the two is what they do with long rows. When a third one appears, the three
 * should be folded into `components/ui/` instead of keeping three — the same note `modal.tsx` carries
 * about `ConfirmDialog`.
 */
export function SalesReportTable({ table, fit }: { table: ChartTable; fit: StatementFit }) {
  const columnCount = table.columns.length;
  const columnPct = Math.max(
    Math.min(MAX_COLUMN_PCT, 60 / Math.max(columnCount, 1)),
    (fit.columnWidth / fit.sheetWidth) * 100,
  );
  const padX = fit.cellPaddingX / 2;

  return (
    <div className="overflow-hidden rounded-[13px] border border-border bg-surface">
      <table
        className="w-full table-fixed border-collapse"
        style={{ fontSize: `${fit.fontSize}px` }}
      >
        <colgroup>
          <col style={{ width: `${Math.max(20, 100 - columnCount * columnPct)}%` }} />
          {table.columns.map((column) => (
            <col key={column} style={{ width: `${columnPct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-surface-header">
            <th
              className="border-b border-border py-2 text-left text-[9px] font-semibold uppercase tracking-[0.5px] text-muted"
              style={{ paddingLeft: BASE_INDENT, paddingRight: padX }}
            >
              Concepto
            </th>
            {table.columns.map((column, index) => (
              <th
                key={column}
                className={cn(
                  "border-b border-border py-2 text-right text-[9px] font-semibold text-muted",
                  index > 0 && "border-l border-border-soft",
                )}
                style={{ paddingLeft: padX, paddingRight: padX }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.id}>
              <th
                scope="row"
                aria-label={row.label}
                className={cn(
                  "border-b border-border-soft py-1.5 text-left align-top",
                  row.emphasis ? "font-bold text-ink" : "font-medium text-ink-soft",
                )}
                style={{ paddingLeft: BASE_INDENT, paddingRight: padX }}
              >
                <span className="flex items-baseline gap-1.5">
                  {row.color !== undefined && (
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: row.color }}
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{row.label}</span>
                    {row.sublabel && (
                      <span className="block truncate font-mono text-[9px] font-normal text-faint">
                        {row.sublabel}
                      </span>
                    )}
                  </span>
                </span>
              </th>
              {row.values.map((value, index) => (
                <td
                  key={table.columns[index] ?? index}
                  className={cn(
                    "overflow-hidden whitespace-nowrap border-b border-border-soft py-1.5 text-right font-mono tabular-nums",
                    index > 0 && "border-l border-border-soft",
                    row.emphasis ? "font-bold text-ink" : "font-semibold text-ink-soft",
                  )}
                  style={{ paddingLeft: padX, paddingRight: padX }}
                >
                  {/* The DASH of a cell with nothing to say travels ALREADY WRITTEN in the
                      `ChartTable`; a `null` here can only come from a row shorter than its
                      columns. */}
                  {value ?? "–"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
