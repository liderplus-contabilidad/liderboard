import { cn } from "@/lib/cn";
import type { ChartTable } from "@/lib/charts/types";
import type { StatementFit } from "@/lib/report/page-fit";

/** The same cap as the tables of PyG's report: below four columns, the extra width goes to the row's
 *  name instead of inflating figures that already read fine. */
const MAX_COLUMN_PCT = 16;
const BASE_INDENT = 10;

/**
 * The printed table of one section of the report, built from the SAME `ChartTable` the screen already
 * builds — never a second reading of the grid.
 *
 * It does not reuse `TableTwin` (in `chart-card.tsx`): that one has screen affordances —a sticky
 * column, `hover`, a fixed 12 px body— that mean nothing on paper, and it does not accept the type
 * size `fit` dictates. The column split and the typography are the same computation
 * `ReportStatement`/`ReportVertical` of PyG do with `statementFit`: `colgroup` fixes the width so no
 * figure is drawn over its neighbour.
 */
export function SalariesReportTable({ table, fit }: { table: ChartTable; fit: StatementFit }) {
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
          <col style={{ width: `${100 - columnCount * columnPct}%` }} />
          {table.columns.map((column) => (
            <col key={column} style={{ width: `${columnPct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-surface-header">
            <th
              className="border-b border-border py-2 text-left text-[9px] font-semibold uppercase tracking-[0.5px] text-muted"
              style={{ paddingLeft: padX, paddingRight: padX }}
            >
              Serie
            </th>
            {table.columns.map((column, index) => (
              <Head key={column} bordered={index > 0} padX={padX}>
                {column}
              </Head>
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
                  "border-b border-border-soft py-1.5 pr-3 text-left align-top",
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
                      <span className="block truncate text-[9px] font-normal text-faint">
                        {row.sublabel}
                      </span>
                    )}
                  </span>
                </span>
              </th>
              {row.values.map((value, index) => (
                <Cell
                  key={table.columns[index] ?? index}
                  bordered={index > 0}
                  bold={Boolean(row.emphasis)}
                  padX={padX}
                >
                  {value ?? "–"}
                </Cell>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Head({
  children,
  bordered,
  padX,
}: {
  children: React.ReactNode;
  bordered?: boolean;
  padX: number;
}) {
  return (
    <th
      className={cn(
        "border-b border-border py-2 text-right text-[9px] font-semibold text-muted",
        bordered && "border-l border-border-soft",
      )}
      style={{ paddingLeft: padX, paddingRight: padX }}
    >
      {children}
    </th>
  );
}

function Cell({
  children,
  bordered,
  bold,
  padX,
}: {
  children: React.ReactNode;
  bordered?: boolean;
  bold?: boolean;
  padX: number;
}) {
  return (
    <td
      className={cn(
        "overflow-hidden whitespace-nowrap border-b border-border-soft py-1.5 text-right font-mono tabular-nums",
        bordered && "border-l border-border-soft",
        bold ? "font-bold text-ink" : "font-semibold text-ink-soft",
      )}
      style={{ paddingLeft: padX, paddingRight: padX }}
    >
      {children}
    </td>
  );
}
