"use client";

import { BarChart3, ChevronDown, FileSpreadsheet, Table2 } from "lucide-react";
import { memo, useId, useState, type ReactNode } from "react";
import { Chart } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import type { ChartCardSpec, ChartOption, ChartTable } from "@/lib/charts/types";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { ChartGuideTip } from "@/components/ui/chart-guide-tip";

/**
 * What the card DRAWS comes from `ChartCardSpec`, so the pure layer and this component cannot
 * describe a card two ways. What is added here is what only a mounted card has: its own empty
 * state, its click handler and its header controls — none of which a spec can carry.
 *
 * `id` is dropped (it is the key of the list, not a prop) and `height` goes back to optional,
 * so every existing caller keeps its default.
 */
export interface ChartCardProps extends Omit<ChartCardSpec, "id" | "height"> {
  height?: number;
  /** No workspace loaded at all — the tab-wide empty state rather than a card-level one. */
  empty?: boolean;
  /** Passed to the chart: clicking a category is how the reader goes one level down. */
  onSelect?: (dataIndex: number) => void;
  /** Default true. The account ficha turns it off: its numbers already sit above the chart. */
  tableToggle?: boolean;
  /**
   * Default true. The printable report switches it off for the same reason it switches off the table
   * toggle: an ⓘ on paper is a button nobody can press.
   */
  showGuide?: boolean;
  /**
   * The arrow that COLLAPSES the card, the same one as Datos' account tree and for the same reason: a
   * tab with five charts forces you to scroll to the very bottom to read the last one, and collapsing
   * the ones already read is what brings the bottom one back to the first screenful. Here there are
   * no levels to collapse —one card does not contain another—, so the arrow opens and closes ONLY its
   * own body.
   *
   * It is offered exactly when `onToggleCollapsed` arrives, and the state is held by THE CALLER: that
   * is what allows a «Cerrar todos» without there being two truths about whether a card is collapsed.
   * Without that callback there is no arrow — the printable report and the ficha's panel show a card
   * that is read on its own, where collapsing it is a button with no work to do.
   */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** A control that shapes ONE chart: in the module filter bar it would read as feeding all. */
  headerSlot?: ReactNode;
  /**
   * What goes STUCK to the chart and below it: a legend of its own, which is a reading control and
   * not a framing one. It goes here and not in `headerSlot` because it is read next to the bars it
   * names, and it keeps being drawn when there is nothing to draw — a legend that disappeared on
   * switching the last item off would leave nowhere to switch it back on from.
   */
  footerSlot?: ReactNode;
}

/**
 * The table twin is not an afterthought: three of the eight palette slots fall below 3:1 against
 * white, and a transformed chart holds numbers that exist nowhere else in the app. It costs
 * nothing — the table is built from the same `Series[]`.
 *
 * Memoized because a tab draws several of these and the provider rebuilds its sources on every
 * cell edit.
 */
export const ChartCard = memo(function ChartCard({
  title,
  subtitle,
  option,
  table,
  warnings = [],
  note,
  guide,
  height = 260,
  empty = false,
  tableToggle = true,
  showGuide = true,
  collapsed = false,
  onToggleCollapsed,
  headerSlot,
  footerSlot,
  onSelect,
}: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);
  const bodyId = useId();
  const collapsible = onToggleCollapsed !== undefined;
  const hasSeries = Boolean(option && option.series.length > 0 && table.rows.length > 0);
  const isCollapsed = collapsible && collapsed;
  // Collapsed, the controls that act ON the body go with it: choosing «Ver como tabla» for a table
  // that is not on screen is not an option, it is a trap. The guide stays, because it answers what is
  // inside, which is exactly what one asks of a closed card.
  const showToggle = hasSeries && tableToggle && !isCollapsed;
  // The guide is drawn even when there is nothing to draw: an empty card is precisely where the
  // reader asks what they would have to mark to fill it.
  const helper = showGuide ? guide : undefined;

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-[13px] border border-border bg-surface">
      {/* The WHOLE header is the trigger when the card collapses, not just the arrow: a 20 px target
          forces you to aim, and what the reader wants to press is the title. The button's `::after`
          is what stretches it over the entire bar —a `<button>` cannot contain an `<h3>`, so wrapping
          it is not an option—, and the controls on the right sit above it (`z-10`) so they stay
          theirs. */}
      <header
        className={cn(
          "group relative flex items-start justify-between gap-3 bg-surface-header px-[18px] py-3 transition-colors",
          !isCollapsed && "border-b border-border",
          collapsible && "hover:bg-surface-muted",
        )}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          {collapsible && (
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              aria-label={collapsed ? `Mostrar ${title}` : `Ocultar ${title}`}
              onClick={onToggleCollapsed}
              className="mt-px flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent text-faint transition-colors after:absolute after:inset-0 after:content-[''] group-hover:border-border group-hover:bg-surface group-hover:text-brand"
            >
              <ChevronDown
                size={15}
                strokeWidth={2.25}
                className={cn("transition-transform duration-150", collapsed && "-rotate-90")}
              />
            </button>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 truncate text-[11.5px] text-muted">{subtitle}</p>}
          </div>
        </div>
        {((headerSlot && !isCollapsed) || showToggle || helper) && (
          <div className="relative z-10 flex shrink-0 items-center gap-2.5">
            {!isCollapsed && headerSlot}
            {helper && <ChartGuideTip title={title} guide={helper} />}
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

      <div id={bodyId} hidden={isCollapsed} className="px-[18px] py-3.5">
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
                <TableTwin table={table} maxHeight={height} />
              ) : (
                <Chart
                  option={option as ChartOption}
                  onSelect={onSelect}
                  height={height}
                  ariaLabel={title}
                />
              )
            ) : (
              // Never an empty plot: the warnings above say why, and when there are none this
              // line is the explanation.
              <EmptyState className="py-8">
                {warnings.length > 0
                  ? "No se pudo construir ninguna serie con estos datos."
                  : "No hay nada que dibujar en este periodo."}
              </EmptyState>
            )}

            {footerSlot}

            {note && <p className="mt-3 text-[11.5px] leading-snug text-faint">{note}</p>}
          </>
        )}
      </div>
    </section>
  );
});

/**
 * A `ChartCardSpec` mounted. `id` is the key of the list that holds the spec, not something the
 * card draws, so it is the one field that does not travel through.
 *
 * Whatever a spec cannot carry — the click handler, the header slot, whether the table toggle is
 * offered — is passed alongside it: the printable report turns the toggle off, because a control
 * on paper is a button nobody can press.
 */
export function SpecCard({
  spec,
  ...rest
}: { spec: ChartCardSpec } & Omit<ChartCardProps, keyof ChartCardSpec>) {
  return (
    <ChartCard
      title={spec.title}
      subtitle={spec.subtitle}
      option={spec.option}
      table={spec.table}
      warnings={spec.warnings}
      note={spec.note}
      guide={spec.guide}
      height={spec.height}
      {...rest}
    />
  );
}

/**
 * One row per series, one column per period. An uncovered period is blank, never `$0`.
 *
 * Two optional fields shape a row: `sublabel` hangs under the name (the role beside an employee),
 * and `emphasis` gives it the weight a TOTAL needs to stop reading as one more entity. A table
 * whose rows declare neither renders exactly as it did before they existed.
 *
 * **The box is capped at the CHART's own height and scrolls inside itself.** Some twins are short
 * (five services) and some are not: Ventas' concentración lists 956 pagadores, and uncapped it
 * pushed the rest of the page a screenful away, so getting back to the card below meant scrolling
 * past a thousand rows. Capping at `height` — rather than at some number of its own — buys the
 * property that matters: **the card does not change size when you toggle**, so «Ver como tabla»
 * stops moving everything under it. A table shorter than the cap is untouched, which is why this
 * changes nothing for the twins that already fit.
 *
 * Both edges of the header STICK, and that is what makes the cap usable rather than merely tidy: a
 * column of figures scrolled away from «2024 · 2025 · 2026 · Total» is a column of numbers that
 * mean nothing. The separator is an inset shadow and not a `border`, because a border on a sticky
 * cell of a `border-collapse` table is painted by the row and scrolls away with it.
 */
function TableTwin({ table, maxHeight }: { table: ChartTable; maxHeight: number }) {
  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            {/* The corner sits above the two sticky bands it crosses. */}
            <th className="sticky left-0 top-0 z-30 bg-surface px-2 py-1.5 text-left font-semibold text-muted shadow-[inset_0_-1px_0_var(--color-border)]">
              Serie
            </th>
            {table.columns.map((column) => (
              <th
                key={column}
                className="sticky top-0 z-20 bg-surface px-2 py-1.5 text-right font-semibold text-muted shadow-[inset_0_-1px_0_var(--color-border)]"
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
                className={cn(
                  "sticky left-0 z-10 border-b border-border-faint bg-surface px-2 py-1.5 text-left text-ink",
                  row.emphasis ? "font-bold" : "font-medium",
                )}
              >
                <span className="flex items-center gap-2">
                  {row.color === undefined ? null : (
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: row.color }}
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{row.label}</span>
                    {row.sublabel && (
                      <span className="block truncate text-[11px] font-normal text-faint">
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
                    "border-b border-border-faint px-2 py-1.5 text-right tabular-nums",
                    row.emphasis ? "font-bold text-ink" : "text-ink-soft",
                  )}
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
