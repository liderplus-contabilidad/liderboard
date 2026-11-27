"use client";

import { useFilterState } from "@/components/dashboard/filter-state";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  buildSalesCards,
  SCREEN_EVOLUTION_VIEW,
  SCREEN_SOLID_VIEW,
  type EvolutionView,
  type SalesCards,
  type SalesCardsInput,
  type SolidView,
  type YearMonths,
  type YearReading,
} from "@/lib/sales/cards";
import { coverageForClient, monthsForClientYears, saveMonths } from "@/lib/sales/db";
import {
  monthlySeries,
  monthlyTypeSeries,
  readSales,
  type MonthPoint,
  type SalesReading,
} from "@/lib/sales/derive";
import {
  buildSalesUniverse,
  describeScope,
  emptyFilters,
  emptyUniverse,
  narrowLines,
  periodLabel,
  resolveYears,
  sanitizeFilters,
  scopedPeriodLabel,
  selectedMonths,
  withAllYears,
  withAxisCleared,
  withChoiceToggled,
  withMonthsCleared,
  withMonthToggled,
  withYearToggled,
  type SalesAxis,
  type SalesFilters,
  type SalesUniverse,
} from "@/lib/sales/filters";
import type { ParsedSalesMonth, SalesCoverage, SalesLine, SalesMonth } from "@/lib/sales/types";
import { usePygData } from "../pyg-data-provider";

/**
 * «Ventas por servicio»' state, mounted INSIDE the view and not in the layout: the header reads
 * nothing from it. It is a context because the bar, the upload modal and the report need the same
 * thing.
 *
 * It reads the base in TWO steps: the COVERAGE (which years and months exist), then the LINES of
 * the marked years only.
 */
interface SalesDataValue {
  /**
   * The PyG client all of this belongs to. `null` with none open **and also in the CROSS-CLIENT
   * CONSOLIDADO**, which is not a client but their sum: writing there would create a phantom
   * partition no screen lists and no deletion reaches, the same defence `assertRealClient` mounts
   * in PyG's database.
   */
  clientId: string | null;
  /** Whether what is open is the consolidado — the empty state says so in other words than «there
   *  is no client». */
  isConsolidated: boolean;
  clientName: string | undefined;
  /** False until the first read from Dexie: it avoids the empty state flickering over a client
   *  that does have months. */
  ready: boolean;
  /** The client's coverage: one row per loaded month, with no lines in it. */
  coverage: SalesCoverage[];
  /** The loaded months of the MARKED YEARS, with their lines. */
  months: SalesMonth[];
  universe: SalesUniverse;
  filters: SalesFilters;
  /** The months the reading sums: the marked ones, or every one loaded for the marked years. */
  period: number[];
  /** What that period is called — what the subtitles and the report say. */
  periodName: string;
  /** The same, with the marks in front: what the TILES say, so a narrowed total is not read as the
   *  period's whole billing. */
  scopedPeriodName: string;
  reading: SalesReading;
  /**
   * EXACTLY the input `cards` were built with. The provider exposes it so the printable report asks
   * for the same cards with the same arguments instead of recomposing them: two compositions of the
   * same input can drift apart, and whoever receives the PDF no longer has the screen beside them
   * to check against.
   */
  cardsInput: SalesCardsInput;
  cards: SalesCards;
  hideEmptyMonths: boolean;
  toggleEmptyMonths: () => void;
  /**
   * Which shape the broken-down evolution is drawn in. It lives here and not inside the card
   * because the card is rebuilt from `cardsInput` on every read: held locally it would reset to the
   * default on the next mark, and the reader would find the view they chose undone by an unrelated
   * click.
   */
  evolutionView: EvolutionView;
  setEvolutionView: (view: EvolutionView) => void;
  /** Which body the two flat bar cards take, held here for the evolution's same reason. */
  typesView: SolidView;
  setTypesView: (view: SolidView) => void;
  insurersView: SolidView;
  setInsurersView: (view: SolidView) => void;
  toggleYear: (year: number) => void;
  selectAllYears: () => void;
  toggleMonth: (monthIndex: number) => void;
  clearMonths: () => void;
  /** The four id-based axes share one toggle. */
  toggleChoice: (axis: SalesAxis, id: string) => void;
  clearAxis: (axis: SalesAxis) => void;
  clearAllMarks: () => void;
  /** Writes the already parsed months into the open client, replacing the ones they touch. */
  importMonths: (parsed: readonly ParsedSalesMonth[]) => Promise<void>;
}

const SalesDataContext = createContext<SalesDataValue | null>(null);

const NO_COVERAGE: SalesCoverage[] = [];
const NO_MONTHS: SalesMonth[] = [];

export function SalesDataProvider({ children }: { children: ReactNode }) {
  const { activeClientId, activeClient, isConsolidated } = usePygData();
  const [rawFilters, setRawFilters] = useFilterState<SalesFilters>(
    "sales.rawFilters",
    activeClientId,
    emptyFilters,
  );
  const [hideEmptyMonths, setHideEmptyMonths] = useFilterState(
    "sales.hideEmptyMonths",
    activeClientId,
    false,
  );
  // The SCREEN opens in three dimensions; the pure layer's default stays flat so the printed report
  // cannot inherit a canvas by omission. See `SCREEN_EVOLUTION_VIEW`.
  const [evolutionView, setEvolutionView] = useState<EvolutionView>(SCREEN_EVOLUTION_VIEW);
  const [typesView, setTypesView] = useState<SolidView>(SCREEN_SOLID_VIEW);
  const [insurersView, setInsurersView] = useState<SolidView>(SCREEN_SOLID_VIEW);
  const clientId = isConsolidated ? null : activeClientId;

  // Step one: the coverage. No lines in it, so it is cheap to keep live.
  const storedCoverage = useLiveQuery(() => coverageForClient(clientId), [clientId]);
  const coverage = storedCoverage ?? NO_COVERAGE;
  const ready = storedCoverage !== undefined;

  // The years are resolved first: they decide which lines are read.
  const years = useMemo(() => resolveYears(rawFilters, coverage), [rawFilters, coverage]);
  const yearsKey = years.join(",");

  // STEP TWO: the lines of those years, and no others.
  const storedMonths = useLiveQuery(
    () => monthsForClientYears(clientId, years),
    // `yearsKey`, not `years`: the array is rebuilt on every render.
    [clientId, yearsKey],
  );
  const months = storedMonths ?? NO_MONTHS;

  const lines = useMemo<SalesLine[]>(() => months.flatMap((month) => month.lines), [months]);

  // The universe is derived from those lines, never persisted.
  const universe = useMemo<SalesUniverse>(
    () => (ready ? buildSalesUniverse(coverage, lines, years, rawFilters.tipos) : emptyUniverse()),
    [ready, coverage, lines, years, rawFilters.tipos],
  );
  // Pruned on READ and never in an effect: switching client does not leave a render with marks for
  // years this client does not have.
  const filters = useMemo(() => sanitizeFilters(rawFilters, universe), [rawFilters, universe]);

  const period = useMemo(() => selectedMonths(filters, universe), [filters, universe]);
  const periodName = useMemo(() => periodLabel(period, filters.years), [period, filters.years]);
  // The one wording of the narrowing, read by every card.
  const scope = useMemo(() => describeScope(filters, universe), [filters, universe]);
  const scopedPeriodName = useMemo(() => scopedPeriodLabel(scope, periodName), [scope, periodName]);

  /** The months of one year that the period lets through, already narrowed by every mark. */
  const narrowedMonths = useMemo<SalesMonth[]>(() => {
    const inPeriod = new Set(period);
    return months
      .filter((month) => inPeriod.has(month.monthIndex))
      .map((month) => ({ ...month, lines: narrowLines(month.lines, filters) }));
  }, [months, period, filters]);

  const linesOf = useCallback(
    (year: number) =>
      narrowedMonths.filter((month) => month.year === year).flatMap((month) => month.lines),
    [narrowedMonths],
  );

  // A single aggregation for everything the screen says: the tiles, the cards and the report read
  // from here, so they cannot square against different spans.
  const reading = useMemo(
    () => readSales(filters.years.flatMap((year) => linesOf(year))),
    [filters.years, linesOf],
  );

  // And one PER YEAR, which is what the cards compare. They are built here and not in the card so
  // the total sum and the partial ones come out of the same lines.
  const byYear = useMemo<YearReading[]>(
    () => filters.years.map((year) => ({ year, reading: readSales(linesOf(year)) })),
    [filters.years, linesOf],
  );

  /**
   * The evolution's AXIS. With no month marks it is the TWELVE of the exercise —which is what makes
   * a month that never arrived visible, the distinction the module rests on—, and with marks it is
   * exactly what is marked: a mark NARROWS, here as on the other cards.
   */
  const monthlyByYear = useMemo<YearMonths[]>(
    () =>
      filters.years.map((year) => ({
        year,
        points: onAxis(monthlySeries(narrowedMonths, coverage, year), filters.months),
      })),
    [filters.years, filters.months, narrowedMonths, coverage],
  );

  /**
   * The marked year opened up BY SERVICE TYPE — the stack the evolution draws. Only with ONE year
   * marked: comparing several, the reading is a series per year and the colour belongs to the year.
   */
  const typeMonthly = useMemo(
    () =>
      filters.years.length === 1
        ? monthlyTypeSeries(narrowedMonths, coverage, filters.years[0]).map((entry) => ({
            ...entry,
            points: onAxis(entry.points, filters.months),
          }))
        : [],
    [filters.years, filters.months, narrowedMonths, coverage],
  );

  const cardsInput = useMemo<SalesCardsInput>(
    () => ({
      reading,
      byYear,
      period: periodName,
      monthlyByYear,
      typeMonthly,
      ...(scope ? { scope } : {}),
    }),
    [reading, byYear, periodName, monthlyByYear, typeMonthly, scope],
  );

  const cards = useMemo(
    () => buildSalesCards(cardsInput, { hideEmptyMonths, evolutionView, typesView, insurersView }),
    [cardsInput, hideEmptyMonths, evolutionView, typesView, insurersView],
  );
  const toggleEmptyMonths = useCallback(
    () => setHideEmptyMonths((current) => !current),
    [setHideEmptyMonths],
  );

  const toggleYear = useCallback(
    (year: number) => setRawFilters((current) => withYearToggled(current, year, universe.years)),
    [universe.years, setRawFilters],
  );
  const selectAllYears = useCallback(
    () => setRawFilters((current) => withAllYears(current, universe.years)),
    [universe.years, setRawFilters],
  );
  const toggleMonth = useCallback(
    (monthIndex: number) =>
      setRawFilters((current) => withMonthToggled(current, monthIndex, universe.months)),
    [universe.months, setRawFilters],
  );
  const clearMonths = useCallback(() => setRawFilters(withMonthsCleared), [setRawFilters]);
  const toggleChoice = useCallback(
    (axis: SalesAxis, id: string) =>
      setRawFilters((current) => withChoiceToggled(current, axis, id, universe[axis])),
    [universe, setRawFilters],
  );
  const clearAxis = useCallback(
    (axis: SalesAxis) => setRawFilters((current) => withAxisCleared(current, axis)),
    [setRawFilters],
  );
  const clearAllMarks = useCallback(
    () =>
      setRawFilters((current) => ({
        ...current,
        months: [],
        seguros: [],
        tipos: [],
        articles: [],
        vendors: [],
      })),
    [setRawFilters],
  );

  const importMonths = useCallback(
    async (parsed: readonly ParsedSalesMonth[]) => {
      if (!clientId) {
        return;
      }
      await saveMonths(clientId, parsed);
      // It opens on what has just been loaded: it is what the user wants to see, and without this a
      // month of another year would be stored without the screen moving.
      const last = [...parsed].sort(byPeriod).at(-1);
      if (last) {
        setRawFilters({ ...emptyFilters(), years: [last.year] });
      }
    },
    [clientId, setRawFilters],
  );

  const value = useMemo<SalesDataValue>(
    () => ({
      clientId,
      isConsolidated,
      clientName: activeClient?.name,
      ready,
      coverage,
      months,
      universe,
      filters,
      period,
      periodName,
      scopedPeriodName,
      reading,
      cardsInput,
      cards,
      hideEmptyMonths,
      toggleEmptyMonths,
      evolutionView,
      setEvolutionView,
      typesView,
      setTypesView,
      insurersView,
      setInsurersView,
      toggleYear,
      selectAllYears,
      toggleMonth,
      clearMonths,
      toggleChoice,
      clearAxis,
      clearAllMarks,
      importMonths,
    }),
    [
      clientId,
      isConsolidated,
      activeClient?.name,
      ready,
      coverage,
      months,
      universe,
      filters,
      period,
      periodName,
      scopedPeriodName,
      reading,
      cardsInput,
      cards,
      hideEmptyMonths,
      toggleEmptyMonths,
      evolutionView,
      typesView,
      insurersView,
      toggleYear,
      selectAllYears,
      toggleMonth,
      clearMonths,
      toggleChoice,
      clearAxis,
      clearAllMarks,
      importMonths,
    ],
  );

  return <SalesDataContext.Provider value={value}>{children}</SalesDataContext.Provider>;
}

/** The axis a mark of «Mes» leaves: exactly what is marked, or the twelve of the exercise. It is
 *  applied to the total and to every type alike, so the stack and its line share columns. */
function onAxis(points: MonthPoint[], marked: readonly number[]): MonthPoint[] {
  return marked.length === 0 ? points : points.filter((point) => marked.includes(point.monthIndex));
}

function byPeriod(a: ParsedSalesMonth, b: ParsedSalesMonth): number {
  return a.year - b.year || a.monthIndex - b.monthIndex;
}

export function useSalesData(): SalesDataValue {
  const value = useContext(SalesDataContext);
  if (!value) {
    throw new Error("useSalesData debe usarse dentro de SalesDataProvider");
  }
  return value;
}
