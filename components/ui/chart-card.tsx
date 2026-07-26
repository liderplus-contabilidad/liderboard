"use client";

import { BarChart3, FileSpreadsheet, Table2 } from "lucide-react";
import { memo, useState, type ReactNode } from "react";
import { Chart } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import type { ChartOption } from "@/lib/charts/types";
import type { ChartTable } from "@/lib/charts/types";
import { NoticeBanner } from "@/components/ui/notice-banner";

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Built by one of the pure option builders; `null` when there is nothing to draw. */
  option: ChartOption | null;
  /** The same numbers as rows and columns — every card has one. */
  table: ChartTable;
  /** `SeriesBundle.warnings`, shown whole and before the chart. */
  warnings?: string[];
  /** Footnote for what the engine set aside, e.g. a negative slice left out of a pie. */
  note?: string;
  height?: number;
  /** No workspace loaded at all — the tab-wide empty state rather than a card-level one. */
  empty?: boolean;
  /** Passed to the chart: clicking a category is how the reader goes one level down. */
  onSelect?: (dataIndex: number) => void;
  /**
   * Offer the "Ver como tabla" twin. Default true. The account ficha turns it off: its numbers
   * already sit above the chart as metrics, and a single-series bar reads fine on its own.
   */
  tableToggle?: boolean;
  /**
   * Control that acts on THIS card only, rendered in its header beside the table toggle. A
   * control that shapes one chart belongs over that chart: in the module filter bar it would
   * read as applying to every card there.
   */
  headerSlot?: ReactNode;
}

/**
 * One chart, its warnings, and its table twin behind a switch.
 *
 * The twin is not an accessibility afterthought: three of the eight palette slots fall below
 * 3:1 against the white surface — unavoidable in a categorical eight — and a transformed chart
 * (índice 100, variación, YTD) holds numbers that exist nowhere else in the app, least of all
 * in the Datos tab. It costs nothing: the table is built from the same `Series[]`.
 *
 * Memoized because a tab draws several of these and the provider rebuilds its sources on every
 * cell edit; the props are memoized objects, so an unrelated edit re-renders nothing here.
 */
export const ChartCard = memo(function ChartCard({
  title,
  subtitle,
  option,
  table,
  warnings = [],
  note,
  height = 260,
  empty = false,
  tableToggle = true,
  headerSlot,
  onSelect,
}: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);
  const hasSeries = Boolean(option && option.series.length > 0 && table.rows.length > 0);
  const showToggle = hasSeries && tableToggle;

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-[13px] border border-border bg-surface">
      <header className="flex items-start justify-between gap-3 border-b border-border bg-surface-header px-[18px] py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 truncate text-[11.5px] text-muted">{subtitle}</p>}
        </div>
        {(headerSlot || showToggle) && (
          <div className="flex shrink-0 items-center gap-2.5">
            {headerSlot}
            {showToggle && (
              <button
                type="button"
                aria-pressed={asTable}
                onClick={() => setAsTable((value) => !value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
                  asTable
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-border bg-surface text-muted hover:bg-canvas",
                )}
              >
                {asTable ? <BarChart3 size={13} /> : <Table2 size={13} />}
                {asTable ? "Ver como gráfica" : "Ver como tabla"}
              </button>
            )}
          </div>
        )}
      </header>

      <div className="px-[18px] py-3.5">
        {empty ? (
          <EmptyState icon={<FileSpreadsheet size={22} />} className="py-10">
            Carga un Excel para ver el estado de resultados.
          </EmptyState>
        ) : (
          <>
            {warnings.length > 0 && (
              <NoticeBanner className="mb-3">
                {warnings.length === 1 ? (
                  warnings[0]
                ) : (
                  <ul className="space-y-1">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </NoticeBanner>
            )}

            {hasSeries ? (
              asTable ? (
                <TableTwin table={table} />
              ) : (
                <Chart
                  option={option as ChartOption}
                  onSelect={onSelect}
                  height={height}
                  ariaLabel={title}
                />
              )
            ) : (
              // Never an empty plot: the warnings above already say why, and when there are
              // none this line is the explanation. The note below often completes it — a
              // period whose accounts are all at zero has nothing positive to compose.
              <EmptyState className="py-8">
                {warnings.length > 0
                  ? "No se pudo construir ninguna serie con estos datos."
                  : "No hay nada que dibujar en este periodo."}
              </EmptyState>
            )}

            {note && <p className="mt-3 text-[11.5px] leading-snug text-faint">{note}</p>}
          </>
        )}
      </div>
    </section>
  );
});

/** One row per series, one column per period. An uncovered period is blank, never `$0`. */
function TableTwin({ table }: { table: ChartTable }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-border bg-surface px-2 py-1.5 text-left font-semibold text-muted">
              Serie
            </th>
            {table.columns.map((column) => (
              <th
                key={column}
                className="border-b border-border px-2 py-1.5 text-right font-semibold text-muted"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.id} className="hover:bg-surface-muted">
              <th
                scope="row"
                aria-label={row.label}
                className="sticky left-0 z-10 border-b border-border-faint bg-surface px-2 py-1.5 text-left font-medium text-ink"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate">{row.label}</span>
                </span>
              </th>
              {row.values.map((value, index) => (
                <td
                  key={table.columns[index] ?? index}
                  className="border-b border-border-faint px-2 py-1.5 text-right tabular-nums text-ink-soft"
                >
                  {value ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
