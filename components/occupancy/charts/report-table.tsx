"use client";

import { cn } from "@/lib/cn";
import type { MonthlyFigures } from "@/lib/occupancy/analytics/breakdown";
import type { OccupancySeriesKey } from "@/lib/occupancy/analytics/types";
import { formatMonthlyFigure, MONTHLY_COLUMNS } from "@/lib/occupancy/charts/option";
import type { ReportRow, ReportTable as TableData } from "@/lib/occupancy/charts/report-table";

export interface ReportTablesProps {
  /** One per marked sucursal, in the order the query names them. */
  tables: TableData[];
  colorOf: (key: OccupancySeriesKey) => string;
  /** The period the figures cover, in words — from `periodPhrase`. */
  period: string;
  /** What the rows are, in words: «mes a mes», «día a día». */
  axisLabel: string;
  /**
   * The micro-bar's colour, by the row's place in the period — the SAME slot the bar of that period
   * takes in the charts, so a row and its bar recognise each other.
   */
  occupancyColorAt: (index: number) => string;
}

const HEAD_CELL =
  "border-b border-border px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint";
const CELL = "border-b border-border-faint px-4 py-[7px] font-mono text-[12.5px] tabular-nums";
const FOOT_CELL =
  "border-t-2 border-brand/15 bg-surface-header px-4 py-2.5 font-mono text-[12.5px] font-semibold tabular-nums text-ink";

/**
 * The accountant's own summary sheet, in the app's own hand: venta, ocupación, tarifa promedio y
 * RevPAR read DOWN the period, closed by «Total».
 *
 * One of the two readings of the reporte — «Ver como» picks it or the four charts. It gives the EXACT
 * figure, which is what gets compared against the Excel cell by cell; the charts give the shape.
 *
 * Deliberately NOT the grid of the source workbook: once every column is right-aligned, a
 * spreadsheet's vertical rules carry no information, so only the horizontal separators survive.
 */
export function ReportTables({
  tables,
  colorOf,
  period,
  axisLabel,
  occupancyColorAt,
}: ReportTablesProps) {
  if (tables.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[13px] border border-border bg-surface">
      {tables.map((table, index) => (
        <div
          key={table.key.centerId}
          className={cn("px-[18px] py-3.5", index > 0 && "border-t border-border")}
        >
          <p className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: colorOf(table.key) }}
              />
              {table.label}
            </span>
            <span className="font-normal normal-case tracking-normal text-faintest">
              {axisLabel} · {period}
            </span>
          </p>
          <div className="overflow-x-auto">
            <ReportGrid rows={table.rows} total={table.total} colorAt={occupancyColorAt} />
          </div>
        </div>
      ))}

      <p className="border-t border-border bg-surface-header px-[18px] py-3 text-[11.5px] leading-relaxed text-faint">
        Tarifa Prom = ingresos ÷ habitaciones vendidas · RevPAR = ingresos ÷ habitaciones
        disponibles. El total es ratio de sumas, no el promedio de las filas; un periodo sin ventas
        queda vacío.
      </p>
    </section>
  );
}

function ReportGrid({
  rows,
  total,
  colorAt,
}: {
  rows: ReportRow[];
  total: MonthlyFigures;
  colorAt: (index: number) => string;
}) {
  return (
    <table className="w-full border-separate border-spacing-0">
      <thead>
        <tr>
          <th scope="col" className={cn(HEAD_CELL, "pl-0 text-left")}>
            Periodo
          </th>
          {MONTHLY_COLUMNS.map((column, index) => (
            <th
              key={column.id}
              scope="col"
              className={cn(
                HEAD_CELL,
                "text-right",
                index === MONTHLY_COLUMNS.length - 1 && "pr-0",
              )}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={row.label} className="transition-colors hover:bg-canvas">
            <th
              scope="row"
              className={cn(
                "border-b border-border-faint py-[7px] pl-0 pr-4 text-left text-[12.5px] font-semibold",
                row.covered ? "text-ink" : "text-faint",
              )}
            >
              {row.label}
            </th>
            {MONTHLY_COLUMNS.map((column, index) =>
              column.id === "occupancy" ? (
                <OccupancyCell
                  key={column.id}
                  value={row.figures.occupancy}
                  // The ROW's index (the period), not the column's: `index` here is the column.
                  color={colorAt(rowIndex)}
                />
              ) : (
                <td
                  key={column.id}
                  className={cn(
                    CELL,
                    "text-right",
                    index === MONTHLY_COLUMNS.length - 1 && "pr-0",
                    row.covered ? "text-ink-soft" : "text-zero",
                  )}
                >
                  {formatMonthlyFigure(row.figures[column.id], column.unit)}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th
            scope="row"
            className={cn(
              FOOT_CELL,
              "pl-0 text-left font-sans text-[11.5px] uppercase tracking-[0.4px]",
            )}
          >
            Total
          </th>
          {MONTHLY_COLUMNS.map((column, index) => (
            <td
              key={column.id}
              className={cn(
                FOOT_CELL,
                "text-right",
                index === MONTHLY_COLUMNS.length - 1 && "pr-0",
                total[column.id] === null && "text-zero",
              )}
            >
              {formatMonthlyFigure(total[column.id], column.unit)}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

/**
 * The occupancy cell carries a bar on a FIXED 0–100 % scale — scaled to the best row instead, a flat
 * period would paint a full bar and read as a full hotel — and it takes the SAME slot colour the bar of
 * that period has in the charts, so a row and its bar recognise each other.
 */
function OccupancyCell({ value, color }: { value: number | null; color: string }) {
  const filled = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100;

  return (
    <td className="border-b border-border-faint px-4 py-[7px]">
      <div className="flex items-center justify-end gap-2.5">
        {value !== null && (
          <span
            aria-hidden
            className="h-[5px] w-14 shrink-0 overflow-hidden rounded-full bg-surface-sunken"
          >
            <span
              className="block h-full rounded-full"
              style={{ width: `${filled}%`, backgroundColor: color }}
            />
          </span>
        )}
        <span
          className={cn(
            "font-mono text-[12.5px] tabular-nums",
            value === null ? "text-zero" : "text-ink-soft",
          )}
        >
          {formatMonthlyFigure(value, "percent")}
        </span>
      </div>
    </td>
  );
}
