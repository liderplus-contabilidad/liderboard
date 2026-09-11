"use client";

import { BarChart3, ChevronDown, FileSpreadsheet, Maximize2, Table2 } from "lucide-react";
import { memo, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Chart } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import type { Chart3DOption, ChartCardSpec, ChartOption, ChartTable } from "@/lib/charts/types";
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
export interface ChartCardProps extends Omit<
  ChartCardSpec<ChartOption | Chart3DOption>,
  "id" | "height"
> {
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
  /**
   * Default false. Offers «Ampliar», which opens the chart ALONE in a window the size of the screen.
   *
   * It is off by default and not on —unlike `tableToggle` and `showGuide`, which the report turns
   * off— because the split is the other way round: one screen wants it and fifteen do not, and the
   * three printable reports least of all, where a button is something nobody can press. Off by
   * default is what makes this card unable to change anything outside the caller that asks for it.
   *
   * The state is held HERE and not by the caller (unlike `collapsed`): collapsing has a «Cerrar
   * todos» that demands a single truth, and enlarging has no equivalent — only one window is open at
   * a time and nobody else needs to know which.
   */
  expandable?: boolean;
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
  expandable = false,
  headerSlot,
  footerSlot,
  onSelect,
}: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const close = useCallback(() => setExpanded(false), []);
  const bodyId = useId();
  const collapsible = onToggleCollapsed !== undefined;
  const hasSeries = Boolean(option && option.series.length > 0 && table.rows.length > 0);
  const isCollapsed = collapsible && collapsed;
  // Collapsed, the controls that act ON the body go with it: choosing «Ver como tabla» for a table
  // that is not on screen is not an option, it is a trap. The guide stays, because it answers what is
  // inside, which is exactly what one asks of a closed card.
  const showToggle = hasSeries && tableToggle && !isCollapsed;
  // The same rule the line above applies, and the one the filter bar applies: a control that means
  // nothing for what is on screen RENDERS NOTHING rather than sitting disabled. Collapsed there is no
  // drawing to enlarge; with no series there is none either; and over the table twin «Ampliar» would
  // promise a big table and hand back a chart.
  const showExpand = expandable && hasSeries && !isCollapsed && !asTable;
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
        {((headerSlot && !isCollapsed) || showToggle || showExpand || helper) && (
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
            {/* Next to «Ver como tabla» and not before the ⓘ: the two are the same kind of control
                —both act on the BODY— and the guide answers what is inside, which is another thing. */}
            {showExpand && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-muted transition-colors hover:bg-canvas"
              >
                <Maximize2 size={13} />
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

            {hasSeries && option ? (
              asTable ? (
                <TableTwin table={table} maxHeight={height} />
              ) : (
                <Chart option={option} onSelect={onSelect} height={height} ariaLabel={title} />
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

      {/* The window carries the CHART and nothing else: no «Ver como», no table twin, no ⓘ. The shape
          is chosen in this header and looked at in there, so what is enlarged is whatever `option`
          the card is drawing at that moment — the solid if it is standing, the skyline if it is.
          Its `Chart` is a SECOND instance and not this one moved: an ECharts instance is bound to the
          node it was initialised on, so moving it would dispose and re-create it anyway, and leave a
          hole in the card. Mounted only while open, and disposed on close by `Chart` itself. */}
      {expandable && (
        <Modal open={expanded} fill title={title} onClose={close}>
          {expanded && option ? <ExpandedChart option={option} title={title} /> : null}
        </Modal>
      )}
    </section>
  );
});

/**
 * The enlarged chart, whose height is MEASURED and never computed from the viewport: `Chart` needs a
 * number, and a formula over `innerHeight` has to guess the window's header and its paddings — two
 * numbers that drift apart the moment somebody touches the CSS. The body already knows how tall it
 * is, and it cannot be pushed by what it measures, because the dialog's flex is what fixes it.
 *
 * Nothing is drawn until the first measurement lands: mounted at `height: 0` the instance would come
 * up in a box of nothing and resize a frame later, which is a flash for free. From there on the
 * `ResizeObserver` inside `Chart` takes over — resizing the browser redraws it without this
 * component doing anything.
 */
function ExpandedChart({ option, title }: { option: ChartOption | Chart3DOption; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const node = box.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.height ?? 0;
      setHeight(Math.round(measured));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} className="h-full w-full">
      {height > 0 && <Chart option={option} height={height} ariaLabel={title} />}
    </div>
  );
}

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
}: { spec: ChartCardSpec<ChartOption | Chart3DOption> } & Omit<
  ChartCardProps,
  keyof ChartCardSpec
>) {
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
