"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  buildSalesCards,
  type SalesCards,
  type SalesCardsInput,
  type YearMonths,
  type YearReading,
} from "@/lib/sales/cards";
import { monthsForClient, saveMonths } from "@/lib/sales/db";
import {
  byService,
  loadedMonths,
  loadedYears,
  monthlySeries,
  monthlyServiceSeries,
  readSales,
  type MonthPoint,
  type SalesReading,
} from "@/lib/sales/derive";
import {
  describeServiceScope,
  emptyFilters,
  periodLabel,
  sanitizeFilters,
  scopedPeriodLabel,
  selectedMonths,
  withAllYears,
  withMonthsCleared,
  withMonthToggled,
  withServicesCleared,
  withServiceToggled,
  withYearToggled,
  type SalesFilters,
  type SalesUniverse,
} from "@/lib/sales/filters";
import type { ParsedSalesMonth, SalesMonth } from "@/lib/sales/types";
import { usePygData } from "../pyg-data-provider";

/**
 * «Ventas por servicio»' state, mounted INSIDE the view and not in the layout.
 *
 * The house rule is that a provider lives in the layout because the HEADER reads from its same state
 * —that is how `ActiveClient` and the panel share it in PyG and in Ocupaciones—, and the header reads
 * nothing from this subitem: the client is given by `PygDataProvider`, which is already above.
 * Lifting these marks would put something in the layout no other screen reads.
 *
 * What does justify it being a context and not loose `useState` is that three distant consumers need
 * the same thing: the bar, the upload modal and the report button.
 */
interface SalesDataValue {
  /**
   * The PyG client all of this belongs to. `null` with none open **and also in the CROSS-CLIENT
   * CONSOLIDADO**, which is not a client but their sum: writing there would create a phantom
   * partition no screen lists and no deletion reaches, the same defence `assertRealClient` mounts in
   * PyG's database.
   */
  clientId: string | null;
  /** Whether what is open is the consolidado — the empty state says so in other words than «there is
   *  no client». */
  isConsolidated: boolean;
  clientName: string | undefined;
  /** False until the first read from Dexie: it avoids the empty state flickering over a client that
   *  does have months. */
  ready: boolean;
  /** Every month of the client, of every year. */
  months: SalesMonth[];
  universe: SalesUniverse;
  filters: SalesFilters;
  /** The months the reading sums: the marked ones, or every one loaded for the year. */
  period: number[];
  /** What that period is called — what the subtitles and the report say. */
  periodName: string;
  /** The same, with the marked services in front: what the TILES say, so a narrowed total is not
   *  read as the period's whole billing. */
  scopedPeriodName: string;
  reading: SalesReading;
  /**
   * EXACTLY the input `cards` were built with. The provider exposes it so the printable report asks
   * for the same cards with the same arguments instead of recomposing them: two compositions of the
   * same input can drift apart, and whoever receives the PDF no longer has the screen beside them to
   * check against.
   */
  cardsInput: SalesCardsInput;
  cards: SalesCards;
  hideEmptyMonths: boolean;
  toggleEmptyMonths: () => void;
  toggleYear: (year: number) => void;
  selectAllYears: () => void;
  toggleMonth: (monthIndex: number) => void;
  clearMonths: () => void;
  toggleService: (code: string) => void;
  clearServices: () => void;
  /** Writes the already parsed months into the open client, replacing the ones it repeats. */
  importMonths: (parsed: readonly ParsedSalesMonth[]) => Promise<void>;
}

const SalesDataContext = createContext<SalesDataValue | null>(null);

const NO_MONTHS: SalesMonth[] = [];

export function SalesDataProvider({ children }: { children: ReactNode }) {
  const { activeClientId, activeClient, isConsolidated } = usePygData();
  const [rawFilters, setRawFilters] = useState<SalesFilters>(emptyFilters);
  const [hideEmptyMonths, setHideEmptyMonths] = useState(false);
  const clientId = isConsolidated ? null : activeClientId;

  // The ONLY query, and always bounded by the client: it is what stops the billing of two companies
  // mixing in silence.
  const stored = useLiveQuery(() => monthsForClient(clientId), [clientId]);
  const months = stored ?? NO_MONTHS;
  const ready = stored !== undefined;

  const years = useMemo(() => loadedYears(months), [months]);
  // The YEARS are resolved first, because the universe of months is that of the marked years: without
  // that order, marking a year could not open the months only it brings.
  const yearsOnly = useMemo(
    () => sanitizeFilters(rawFilters, { years, months: [], services: [] }),
    [rawFilters, years],
  );
  const universe = useMemo<SalesUniverse>(
    () => ({
      years,
      // The UNION of the months of the marked years, not the intersection: a month only one of them
      // has is still a month you can look at, and the comparison will say the other one lacks it.
      months: [...new Set(yearsOnly.years.flatMap((year) => loadedMonths(months, year)))].sort(
        (a, b) => a - b,
      ),
      // Read off ALL the loaded months of the marked years, never off the span «Mes» narrows to:
      // marking a month a service did not sell must not erase it from the list you unmark it from.
      services: byService(
        months
          .filter((month) => yearsOnly.years.includes(month.year))
          .flatMap((month) => month.lines),
      ).map((service) => ({ code: service.code, name: service.name })),
    }),
    [years, yearsOnly.years, months],
  );
  // Pruned on READ and never in an effect: switching client does not leave a render with marks for
  // years this client does not have.
  const filters = useMemo(() => sanitizeFilters(rawFilters, universe), [rawFilters, universe]);

  const period = useMemo(() => selectedMonths(filters, universe), [filters, universe]);
  const periodName = useMemo(() => periodLabel(period, filters.years), [period, filters.years]);
  // The ONE wording of the service narrowing: the subtitles and the notes of the three cards read it
  // from here, so none of them names a different slice from the one beside it.
  const scope = useMemo(() => describeServiceScope(filters, universe), [filters, universe]);
  const scopedPeriodName = useMemo(() => scopedPeriodLabel(scope, periodName), [scope, periodName]);

  /** One year's lines, bounded by the period's months AND by the marked services: a mark narrows the
   *  whole screen —the tiles, the three cards and their denominators—, not one card. */
  const linesOf = useCallback(
    (year: number) => {
      const inPeriod = new Set(period);
      const marked = new Set(filters.services);
      return months
        .filter((month) => month.year === year && inPeriod.has(month.monthIndex))
        .flatMap((month) => month.lines)
        .filter((line) => marked.size === 0 || marked.has(line.serviceCode));
    },
    [months, period, filters.services],
  );

  // A single aggregation for everything the screen says: the tiles, the cards and the report read
  // from here, so they cannot square against different spans.
  const reading = useMemo(
    () => readSales(filters.years.flatMap((year) => linesOf(year))),
    [filters.years, linesOf],
  );

  // And one PER YEAR, which is what the cards compare. They are built here and not in the card so the
  // total sum and the partial ones come out of the same lines.
  const byYear = useMemo<YearReading[]>(
    () => filters.years.map((year) => ({ year, reading: readSales(linesOf(year)) })),
    [filters.years, linesOf],
  );

  /**
   * The evolution's AXIS. With no month marks it is the TWELVE of the exercise —which is what makes a
   * month that never arrived visible, the distinction the module rests on—, and with marks it is
   * exactly what is marked: a mark NARROWS, here as on the other two cards, and an axis that ignored
   * the mark would leave the subtitle saying «Ene–Feb» over twelve columns.
   */
  const monthlyByYear = useMemo<YearMonths[]>(
    () =>
      filters.years.map((year) => ({
        year,
        points: onAxis(monthlySeries(months, year, filters.services), filters.months),
      })),
    [filters.years, filters.months, filters.services, months],
  );

  /**
   * The marked year opened up BY SERVICE — the stack the evolution draws. Only with ONE year marked:
   * comparing several, the reading is a series per year and the colour belongs to the year.
   */
  const serviceMonthly = useMemo(
    () =>
      filters.years.length === 1
        ? monthlyServiceSeries(months, filters.years[0], filters.services).map((entry) => ({
            ...entry,
            points: onAxis(entry.points, filters.months),
          }))
        : [],
    [filters.years, filters.months, filters.services, months],
  );

  const cardsInput = useMemo<SalesCardsInput>(
    () => ({
      reading,
      byYear,
      period: periodName,
      monthlyByYear,
      serviceMonthly,
      ...(scope ? { scope } : {}),
    }),
    [reading, byYear, periodName, monthlyByYear, serviceMonthly, scope],
  );

  const cards = useMemo(
    () => buildSalesCards(cardsInput, { hideEmptyMonths }),
    [cardsInput, hideEmptyMonths],
  );
  const toggleEmptyMonths = useCallback(() => setHideEmptyMonths((current) => !current), []);

  const toggleYear = useCallback(
    (year: number) => setRawFilters((current) => withYearToggled(current, year, years)),
    [years],
  );
  const selectAllYears = useCallback(
    () => setRawFilters((current) => withAllYears(current, years)),
    [years],
  );
  const toggleMonth = useCallback(
    (monthIndex: number) =>
      setRawFilters((current) => withMonthToggled(current, monthIndex, universe.months)),
    [universe.months],
  );
  const clearMonths = useCallback(() => setRawFilters(withMonthsCleared), []);
  const serviceCodes = useMemo(
    () => universe.services.map((service) => service.code),
    [universe.services],
  );
  const toggleService = useCallback(
    (code: string) => setRawFilters((current) => withServiceToggled(current, code, serviceCodes)),
    [serviceCodes],
  );
  const clearServices = useCallback(() => setRawFilters(withServicesCleared), []);

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
        setRawFilters({ years: [last.year], months: [], services: [] });
      }
    },
    [clientId],
  );

  const value = useMemo<SalesDataValue>(
    () => ({
      clientId,
      isConsolidated,
      clientName: activeClient?.name,
      ready,
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
      toggleYear,
      selectAllYears,
      toggleMonth,
      clearMonths,
      toggleService,
      clearServices,
      importMonths,
    }),
    [
      clientId,
      isConsolidated,
      activeClient?.name,
      ready,
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
      toggleYear,
      selectAllYears,
      toggleMonth,
      clearMonths,
      toggleService,
      clearServices,
      importMonths,
    ],
  );

  return <SalesDataContext.Provider value={value}>{children}</SalesDataContext.Provider>;
}

/** The axis a mark of «Mes» leaves: exactly what is marked, or the twelve of the exercise. It is
 *  applied to the total and to every service alike, so the stack and its line share columns. */
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
