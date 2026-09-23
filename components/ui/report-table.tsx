import { cn } from "@/lib/cn";
import type { ChartTable, ChartTableRow } from "@/lib/charts/types";
import type { StatementFit } from "@/lib/report/page-fit";

/** Below four columns, the extra width goes to the row's name instead of inflating figures that
 *  already read fine — the same cap as the tables of PyG's report. */
const MAX_COLUMN_PCT = 16;
const BASE_INDENT = 10;

/** A row painted apart: its ground and the ink that REPLACES the default one on every cell. */
export interface ReportRowStyle {
  className: string;
  ink: string;
}

/** A cell painted apart: the ink that replaces the default one, and a glyph written before it. */
export interface ReportCellStyle {
  ink: string;
  glyph?: string;
}

/**
 * The printed table of a report section, built from the SAME `ChartTable` the screen already builds —
 * never a second reading of the data.
 *
 * It does not reuse `chart-card.tsx`'s `TableTwin`: that one has SCREEN affordances —a sticky column,
 * `hover`, a fixed 12 px body— that mean nothing on paper, and it does not accept the type size `fit`
 * dictates.
 *
 * **It lives here because it is the THIRD report that needs it.** It was born inside «Ventas por
 * servicio» with the note that a third copy was the moment to fold them together, and «Reportería de
 * ingresos» is that third: two copies are a coincidence, three are a component. `SalesReportTable`
 * stays as a thin alias so its callers keep reading as they did. Sueldos por Áreas' own table is NOT
 * folded in here yet, and that is deliberate — it differs in what it does with long rows, and
 * flattening that difference is a change to how that report reads, not a move.
 *
 * A report may colour it — `rowStyle` for a heading or a total, `cellStyle` for a figure whose
 * column means something (the flow's urgent) — and one that passes neither prints it plain.
 */
export function ReportTable({
  table,
  fit,
  rowStyle,
  cellStyle,
}: {
  table: ChartTable;
  fit: StatementFit;
  /** Optional: how a report colours its rows (a heading, a total). Absent, every row is plain. */
  rowStyle?: (row: ChartTableRow) => ReportRowStyle | undefined;
  /** Optional: how a report colours a figure by what its column means. Absent, figures are ink. */
  cellStyle?: (
    row: ChartTableRow,
    column: string,
    value: string | null,
  ) => ReportCellStyle | undefined;
}) {
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
          {table.rows.map((row) => {
            const painted = rowStyle?.(row);
            return (
              <tr key={row.id} className={painted?.className}>
                <th
                  scope="row"
                  aria-label={row.label}
                  className={cn(
                    "border-b border-border-soft py-1.5 text-left align-top",
                    painted
                      ? painted.ink
                      : row.emphasis
                        ? "font-bold text-ink"
                        : "font-medium text-ink-soft",
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
                {row.values.map((value, index) => {
                  // A cell's own tone wins over its row's paint: the report decides which cells of a
                  // painted row keep theirs (`cellStyle` returns nothing for the rest).
                  const tone = cellStyle?.(row, table.columns[index] ?? "", value);
                  return (
                    <td
                      key={table.columns[index] ?? index}
                      className={cn(
                        "overflow-hidden whitespace-nowrap border-b border-border-soft py-1.5 text-right font-mono tabular-nums",
                        index > 0 && "border-l border-border-soft",
                        tone
                          ? tone.ink
                          : painted
                            ? painted.ink
                            : row.emphasis
                              ? "font-bold text-ink"
                              : "font-semibold text-ink-soft",
                      )}
                      style={{ paddingLeft: padX, paddingRight: padX }}
                    >
                      {/* The DASH of a cell with nothing to say travels ALREADY WRITTEN in the
                      `ChartTable`; a `null` here can only come from a row shorter than its
                      columns. */}
                      {tone?.glyph && `${tone.glyph} `}
                      {value ?? "–"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
