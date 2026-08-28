"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpecCard } from "@/components/ui/chart-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useCollapsedCards } from "@/components/ui/use-collapsed-cards";
import { StatTile } from "@/components/ui/stat-tile";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { buildGraficosCards } from "@/lib/profit-loss/charts/cards";
import { usePygAnalytics } from "../pyg-analytics-provider";
import { usePygData } from "../pyg-data-provider";
import { PygEmptyState } from "../pyg-empty-state";
import { BusinessLineLegend } from "./business-line-legend";
import { SalesCrossLink } from "../sales/sales-cross-link";
import { buildAccountBreakdown } from "@/lib/profit-loss/charts/account-breakdown";
import { OTHERS_CODE } from "@/lib/profit-loss/analytics/structure";
import { amountsOver, childrenOf, compositionQuery } from "@/lib/profit-loss/charts/presets";
import { activeSource, expandSlots } from "@/lib/profit-loss/charts/selection";
import { ExpenseSharePanel, type AccountStep } from "./expense-share-panel";

/**
 * Gráficos answers *how much and of what*: amounts per period, comparisons between accounts
 * and centers, composition of a total. No transformation selector — that is Análisis, and no
 * shape selector either — every card here is always bars (or the pie/ranking shape it owns).
 *
 * With an Excel loaded it shows something useful before the user marks anything, because a
 * blank panel next to a loaded file hands the reader the job of guessing what can be asked. The
 * filter bar's marks feed every card at once: the evolution card draws whatever accounts (and
 * centers) are marked, and falls back to Ingresos contra Costos y Gastos when nothing is.
 *
 * WHAT each card asks lives in `buildGraficosCards`, where it is pure and tested; what is left
 * here is where each one goes on screen. The printable report reads that same list, which is why
 * it cannot come back into this file.
 */
/** The two readings of the same breakdown: the length of a bar or the angle of a slice. */
const ANNEX_SHAPES = [
  { value: "barras" as const, label: "Barras" },
  { value: "pastel" as const, label: "Pastel" },
];

export function GraficosView() {
  const { dataset, filters, frequency } = usePygData();
  const { context, runQuery } = usePygAnalytics();
  /**
   * The months of the axis in which the statement moved nothing —the ones the file never brought and
   * the ones it brought at zero, which on screen are the same empty column—. It is local state of this
   * screen and not a `PygFilters`: the five cards here read it and none of Datos or Análisis does, so
   * it is not stored, it produces no chip and the printable report —which calls `buildGraficosCards`
   * on its own— still puts out the whole axis.
   */
  const [hideEmptyPeriods, setHideEmptyPeriods] = useState(false);
  /**
   * The business lines switched off in their card's legend. It is local state for the same reason as
   * the switch above: ONE card reads it and none of Datos or Análisis does, so it is not stored, it
   * produces no chip and the printable report —which calls `buildGraficosCards` on its own— still puts
   * out all of them. A mark from a chart of accounts that is no longer open is ignored on read, so
   * switching client leaves nothing hanging.
   */
  const [hiddenLines, setHiddenLines] = useState<readonly string[]>([]);
  const { periodName, tiles, cards, annex, annexResidualCodes, annexShapes, emptyPeriods, lines } =
    useMemo(
      () => buildGraficosCards(context, filters, { hideEmptyPeriods, hiddenLines }),
      [context, filters, hideEmptyPeriods, hiddenLines],
    );
  const toggleLine = useCallback((id: string) => {
    setHiddenLines((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }, []);
  // It only shows up in MONTHLY —a covered quarter aggregates three months and is not «a month at 0»—
  // and only if there is something to hide: a control that can do nothing teaches you not to read the
  // one next to it. `emptyPeriods` is counted over the unpruned axis, so the button does not vanish
  // on being pressed.
  const canHideEmptyPeriods = frequency === "mensual" && emptyPeriods > 0;

  // Which cards are collapsed, and the «all» that moves them at once. It is local state of this
  // screen, like the two switches above: it is not stored, it produces no chip and the printable
  // report still puts out every card whole.
  /**
   * In which SHAPE the annex is read. Its two cards draw the same breakdown —one single reduction,
   * the same rows, the same cut— and showing them at once is saying the same thing twice, the rule
   * Ocupaciones already applies to its «Ver como». It opens in BARS because they are what withstands
   * eighteen lines: the pie at that size writes its labels outside, with guide lines piled up on one
   * edge and the legend paginated, which is exactly what made «Composición de los ingresos» stop being
   * a pie. It is local state, like the two switches above: it is not stored, it leaves no chip, and
   * the printable report —which calls `buildGraficosCards` on its own— still puts out BOTH, because a
   * printed control is a button nobody can press.
   */
  const [annexShape, setAnnexShape] = useState<"barras" | "pastel">("barras");
  // The annex card being read, and `null` outside that view. It is an ID and not a position because
  // on changing shape the list is reordered: with the pie in place, the first card is no longer the
  // annex's, and a click tied to index 0 would open the window from another one.
  const visibleAnnexId = annexShapes
    ? annexShape === "barras"
      ? annexShapes.barras
      : annexShapes.pastel
    : null;
  // The shape that is NOT being read drops off the list; with the annex off there is none to remove
  // and this is the whole list.
  const visibleCards = useMemo(() => {
    if (!annexShapes) {
      return cards;
    }
    const hidden = annexShape === "barras" ? annexShapes.pastel : annexShapes.barras;
    return cards.filter((card) => card.id !== hidden);
  }, [cards, annexShapes, annexShape]);
  const cardIds = useMemo(() => visibleCards.map((card) => card.id), [visibleCards]);
  const { isCollapsed, toggle, allCollapsed, toggleAll } = useCollapsedCards(cardIds);

  /**
   * The line whose weight is being looked at, by its position in the breakdown. It is an INDEX and not
   * a code because it is what the chart hands over on click, and resolving it here against the same
   * list that drew it is what stops the window talking about a line other than the one clicked.
   */
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const openCategory = openIndex === null ? undefined : annex?.categories[openIndex];
  /**
   * The path opened inside that account, from the line inwards. It is a STACK and not a loose code
   * because the plan goes down several levels —`5.5.01.02` hangs twenty-seven sections and each one
   * its accounts— and the window's breadcrumb needs to know where it came from. It is emptied on
   * closing and on switching line, so it never talks about an account that is not open.
   */
  const [drill, setDrill] = useState<readonly AccountStep[]>([]);
  const path = useMemo<AccountStep[]>(
    () =>
      openCategory
        ? [
            { code: openCategory.code, label: openCategory.label, value: openCategory.value },
            ...drill,
          ]
        : [],
    [openCategory, drill],
  );
  /**
   * The last leg's breakdown. It comes out of the SAME query the cards draw —same center, year,
   * frequency and marked periods—, which is what makes the children add up to exactly the bar that was
   * clicked; asking for it through another door could square against a different span.
   */
  const breakdown = useMemo(() => {
    const current = path[path.length - 1];
    if (!current) {
      return null;
    }
    const source = activeSource(context);
    // «Otros» is the one leg with no code of its own: it is the residual the annex SUBTRACTS, so
    // there is nothing to ask for its children and the list comes resolved from the pure layer.
    // Only the FIRST leg can be it — anything reached by going down is a real account.
    const residual = current.code === OTHERS_CODE && path.length === 1;
    const children = residual ? annexResidualCodes : childrenOf(source, current.code);
    if (children.length === 0 && !residual) {
      return null;
    }
    const periods = expandSlots(filters.periods, [context.year]);
    const bundle = runQuery(compositionQuery(children, context, { periods }));
    // `total` stays the amount of the bar that was clicked, which for «Otros» is the subtracted
    // residual: the breakdown then CHECKS what it enumerated against it and says so if they
    // disagree, instead of quietly showing a list that does not add up to its own bar.
    return buildAccountBreakdown(amountsOver(bundle), {
      total: current.value,
      hasChildren: (code) => childrenOf(source, code).length > 0,
    });
  }, [path, context, filters.periods, runQuery, annexResidualCodes]);

  if (!dataset) {
    return <PygEmptyState />;
  }

  return (
    <div className="flex flex-col gap-4 px-7 py-5">
      <div className="flex gap-4">
        {tiles.map((tile) => (
          <StatTile
            key={tile.id}
            label={tile.label}
            value={tile.value === null ? null : formatCurrency(tile.value, { cents: true })}
            hint={periodName}
            sign={tile.sign}
          />
        ))}
      </div>

      {/* This tab's two reading switches. They go here and not in the filter bar because the cards of
          THIS tab read them and none of the other two do: in the bar they would be dead controls in
          Datos and in Análisis. The collapse one goes on the LEFT, over the corner of the cards where
          the arrows it moves are; the months-at-0 one stays on the right with the look of the Datos
          card's, so they read as the same gesture. */}
      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={toggleAll}
          icon={allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
          className="font-medium"
        >
          {allCollapsed ? "Desplegar todos" : "Cerrar todos"}
        </Button>

        {canHideEmptyPeriods && (
          <Button
            size="sm"
            variant="secondary"
            aria-pressed={hideEmptyPeriods}
            onClick={() => setHideEmptyPeriods((current) => !current)}
            icon={hideEmptyPeriods ? <Eye size={14} /> : <EyeOff size={14} />}
            className={cn(
              "font-medium",
              hideEmptyPeriods && "border-brand/40 bg-brand-soft text-brand hover:bg-brand-soft",
            )}
          >
            {/* Switched on it carries the COUNT of what it removed: there is no table footer here to
                put it in, so without it the axis would shrink without saying by how much. */}
            {hideEmptyPeriods
              ? `Mostrar ${emptyPeriods} ${emptyPeriods === 1 ? "mes" : "meses"} en 0`
              : "Ocultar meses en 0"}
          </Button>
        )}
      </div>

      {/* The order is declared by `buildGraficosCards`; this view only lays it out, and the five go at
          the SAME width: a half-built grid left a narrow card next to a gap, which reads as though
          something failed to load. The ranking also NEEDS it — with fifteen accounts the label channel
          is a fixed 150 px, and at half screen almost every name is truncated.

          The ONLY one that responds to a click is the annex's, and only while that view is in place:
          on the others a bar has no «inside» to go into, and a chart that sometimes reacts and
          sometimes does not teaches you not to click it. */}
      {/* The line legend hangs off the FIRST card, the only one that draws them, and renders nothing
          outside that view: `lines` arrives empty and there is nothing to offer.

          The header is decided in ONE single expression and not in two spreads: the annex's card and
          `composicion` are never the same one, so today they cannot coincide, but two loose
          `headerSlot`s would silently overwrite each other the day that changes. The cross-link to
          Ventas por servicio is mounted here and does not travel in the `ChartCardSpec` because the
          printable report reads that same list, and a link on paper is a button nobody can press. */}
      {visibleCards.map((card, index) => (
        <SpecCard
          key={card.id}
          spec={card}
          collapsed={isCollapsed(card.id)}
          onToggleCollapsed={() => toggle(card.id)}
          {...(annex && (visibleAnnexId ? card.id === visibleAnnexId : index === 0)
            ? {
                onSelect: (next: number) => {
                  setOpenIndex(next);
                  setDrill([]);
                },
              }
            : {})}
          {...(card.id === visibleAnnexId
            ? {
                headerSlot: (
                  <span className="flex items-center gap-2">
                    <span className="text-[11.5px] font-semibold text-faint">Ver como</span>
                    <SegmentedControl
                      value={annexShape}
                      options={ANNEX_SHAPES}
                      onChange={setAnnexShape}
                      ariaLabel="Ver como"
                    />
                  </span>
                ),
              }
            : card.id === "composicion"
              ? { headerSlot: <SalesCrossLink /> }
              : {})}
          {...(index === 0 && lines.length > 0
            ? {
                footerSlot: (
                  <BusinessLineLegend lines={lines} hidden={hiddenLines} onToggle={toggleLine} />
                ),
              }
            : {})}
        />
      ))}

      {annex && path.length > 0 && (
        <ExpenseSharePanel
          path={path}
          breakdown={breakdown}
          totalExpenses={annex.totalExpenses}
          totalRevenue={annex.totalRevenue}
          periodName={periodName}
          onOpen={(step) => setDrill((current) => [...current, step])}
          onBack={(depth) => setDrill((current) => current.slice(0, depth - 1))}
          onClose={() => {
            setOpenIndex(null);
            setDrill([]);
          }}
        />
      )}
    </div>
  );
}
