"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { buildAnalyticsSource } from "@/lib/profit-loss/analytics/source";
import { REVENUE_ROOT } from "@/lib/profit-loss/charts/presets";
import { applyEditsToLeafAccounts, mergeCenters } from "@/lib/profit-loss/derive";
import { loadedMonthsFor, type PygDataset } from "@/lib/profit-loss/types";
import type { SolidView } from "@/lib/charts/solid-bars";
import { externalForClient } from "@/lib/revenue/db";
import { resolveMonthlyRevenue } from "@/lib/revenue/derive";
import type { RevenueExternalMonth } from "@/lib/revenue/types";
import type { PersonnelGroupId } from "@/lib/personnel-cost/accounts";
import { PERSONNEL_ACCOUNT_CODES } from "@/lib/personnel-cost/accounts";
import { canReadPersonnelCost } from "@/lib/personnel-cost/availability";
import {
  buildPersonnelCards,
  DEFAULT_EVOLUTION_VIEW,
  type EvolutionView,
  type PersonnelCards,
  type PersonnelCardsInput,
} from "@/lib/personnel-cost/cards";
import {
  deleteLegacyYear,
  familyForClient,
  legacyForClient,
  saveFamilyMonth,
  saveFamilyMonths,
  saveLegacyMonth,
  saveLegacyMonths,
} from "@/lib/personnel-cost/db";
import {
  emptyLegacySeries,
  legacyCoverage,
  PERSONNEL_LEGACY_COST_ROWS,
  type PersonnelLegacyAmounts,
  type PersonnelLegacySeries,
} from "@/lib/personnel-cost/legacy";
import { readPersonnelCost, type PersonnelCostReading } from "@/lib/personnel-cost/derive";
import {
  activeMarkCount,
  describeGroupScope,
  emptyFilters,
  periodLabel,
  sanitizeFilters,
  scopedPeriodLabel,
  selectedMonths,
  withAllYears,
  withGroupsCleared,
  withGroupToggled,
  withMonthsCleared,
  withMonthToggled,
  withYearToggled,
  type PersonnelCostFilters,
  type PersonnelCostUniverse,
} from "@/lib/personnel-cost/filters";
import { buildPersonnelGrid, type PersonnelGrid } from "@/lib/personnel-cost/grid";
import {
  emptyFamilySeries,
  MONTHS_IN_YEAR,
  type PersonnelCostYearInput,
  type PersonnelFamilyMonth,
  type PersonnelLegacyMonth,
} from "@/lib/personnel-cost/types";
import { usePygData } from "../pyg-data-provider";

/**
 * «Análisis costo personal»' state, mounted INSIDE the view and not in the layout.
 *
 * The house rule is that a provider lives in the layout when the HEADER reads from its same state —
 * that is how `ActiveClient` and the panel share it in PyG and in Ocupaciones — and the header reads
 * nothing from this subitem: the client is given by `PygDataProvider`, which is already above.
 *
 * **This is the ONLY place PyG is adapted to `lib/personnel-cost/`.** The pure layer receives a
 * `PersonnelCostYearInput` —a year, its coverage, twenty account series, the raíz 4 and twelve
 * captured slots— and knows nothing of `PygDataset`, `CellEdit` or `WorkspaceMeta`. That boundary is
 * what lets the whole engine be tested without mounting anything, and it is why `derive.test.ts` can
 * reproduce the firm's own workbook from plain objects.
 */
interface PersonnelCostDataValue {
  /** The PyG client this belongs to; `null` with none open or in the consolidado. */
  clientId: string | null;
  isConsolidated: boolean;
  /** Which upload strategy the open workspace came from — what the empty state NAMES. */
  sourceSystemId: string | null;
  /** Whether the open workspace's plan is the one the map was written against. */
  canRead: boolean;
  /** False until the first read from Dexie: it avoids the empty state flickering over a client that
   *  does have figures captured. */
  ready: boolean;
  universe: PersonnelCostUniverse;
  filters: PersonnelCostFilters;
  /** How the reading is NAMED — the one composition the tiles, the grid and the four cards read. */
  periodName: string;
  reading: PersonnelCostReading;
  /** EXACTLY the input the cards were built with, so nothing recomposes it. */
  cardsInput: PersonnelCardsInput;
  cards: PersonnelCards;
  /**
   * «Evolución»'s shape. It lives HERE and not inside the card because the cards are rebuilt from
   * `cardsInput` on every read: held locally it would reset to the default on the next mark, and the
   * reader would find the shape they chose undone by an unrelated click.
   */
  evolutionView: EvolutionView;
  setEvolutionView: (view: EvolutionView) => void;
  /**
   * Which of the other three cards are standing on the stage — held here for the same reason
   * `evolutionView` is: the cards are rebuilt from `cardsInput` on every read, so a shape kept inside
   * one would come undone on the next unrelated mark.
   */
  solidViews: PersonnelCardsInput["solidViews"];
  setSolidView: (
    card: keyof NonNullable<PersonnelCardsInput["solidViews"]>,
    view: SolidView,
  ) => void;
  grid: PersonnelGrid;
  /** Whether a row that moved nothing anywhere is held back — a control of the GRID's own header. */
  hideEmptyRows: boolean;
  setHideEmptyRows: (hide: boolean) => void;
  markCount: number;
  /**
   * Whether anything on screen HAS groups. A span of typed exercises has none, and «Grupo» would then
   * offer three marks that narrow nothing — a control that means nothing for the open data renders
   * nothing rather than sitting disabled, which is the bar's rule everywhere else in the app.
   */
  groupsAvailable: boolean;
  toggleYear: (year: number) => void;
  selectAllYears: () => void;
  toggleMonth: (monthIndex: number) => void;
  clearMonths: () => void;
  toggleGroup: (id: PersonnelGroupId) => void;
  clearGroups: () => void;
  /** Writes one month of the nómina de familia. `null` clears it. */
  saveFamily: (year: number, monthIndex: number, amount: number | null) => Promise<void>;
  /** The same, for a whole row pasted out of Excel — one transaction. */
  saveFamilyBlock: (
    year: number,
    months: readonly { monthIndex: number; amount: number | null }[],
  ) => Promise<void>;

  // ── Ejercicios tipeados ──────────────────────────────────────────────────
  /**
   * The years typed by hand, ascending. They are a SECOND source of exercises, not a fallback: a firm
   * that kept its history in a sheet before MicroPlus has those years here and its recent ones in PyG,
   * and the comparison across the two is the whole reason this exists.
   */
  legacyYears: number[];
  /** Which one the drawer is writing. Its own selection, independent of the bar's marks. */
  captureYear: number;
  setCaptureYear: (year: number) => void;
  /** The four series of `captureYear`, twelve slots each. */
  captureSeries: PersonnelLegacySeries;
  /**
   * The open year's VENTAS as the app resolves them — raíz 4 first, «Reportería de ingresos» after.
   * Shown beside the four lines so the percentage can be checked; never written here.
   */
  captureRevenue: (number | null)[];
  /**
   * Whether the OPEN year comes from the estado de resultados. Then it is not written by hand at all:
   * the card says so instead of offering a form whose figures nothing would read.
   */
  captureFromPyg: boolean;
  addCaptureYear: (year: number) => void;
  removeCaptureYear: (year: number) => Promise<void>;
  /** How many months of a typed year carry something — what the drawer's list shows. */
  typedMonthsIn: (year: number) => number;
  /** Writes ONE month of the open typed year. */
  saveLegacy: (monthIndex: number, amounts: PersonnelLegacyAmounts) => Promise<void>;
  /** Writes a pasted block in one transaction. */
  saveLegacyBlock: (
    months: readonly { monthIndex: number; amounts: PersonnelLegacyAmounts }[],
  ) => Promise<void>;
}

const PersonnelCostDataContext = createContext<PersonnelCostDataValue | null>(null);

const NO_FAMILY: PersonnelFamilyMonth[] = [];
const NO_LEGACY: PersonnelLegacyMonth[] = [];
const NO_EXTERNAL: RevenueExternalMonth[] = [];

export function PersonnelCostDataProvider({ children }: { children: ReactNode }) {
  const { activeClientId, isConsolidated, datasets, edits, loadedMonthsByYear, sourceSystemId } =
    usePygData();
  const [rawFilters, setRawFilters] = useState<PersonnelCostFilters>(emptyFilters);
  const [hideEmptyRows, setHideEmptyRows] = useState(false);
  const [evolutionView, setEvolutionView] = useState<EvolutionView>(DEFAULT_EVOLUTION_VIEW);
  const [solidViews, setSolidViews] = useState<PersonnelCardsInput["solidViews"]>({});
  const setSolidView = useCallback(
    (card: keyof NonNullable<PersonnelCardsInput["solidViews"]>, view: SolidView) =>
      setSolidViews((current) => ({ ...current, [card]: view })),
    [],
  );

  const canRead = canReadPersonnelCost({ sourceSystemId, isConsolidated });
  // The capture writes into a REAL client and never into the consolidado, so the partition it uses is
  // the one `canRead` already vouched for.
  const clientId = isConsolidated ? null : activeClientId;

  // The ONLY query, and always bounded by the client: it is what stops two companies' figures mixing
  // in silence.
  const stored = useLiveQuery(() => familyForClient(clientId), [clientId]);
  const family = stored ?? NO_FAMILY;
  const storedLegacy = useLiveQuery(() => legacyForClient(clientId), [clientId]);
  const legacyMonths = storedLegacy ?? NO_LEGACY;

  /**
   * The VENTAS «Reportería de ingresos» holds for this client, by year.
   *
   * This module does not store ventas of its own: the app already has ONE place where the sales of a
   * year with no estado de resultados are written, and a second would be a second answer to «cuánto se
   * vendió en marzo de 2019». Reading them rather than copying them is also what keeps the two screens
   * from drifting the day one of the figures is corrected.
   */
  const storedRevenue = useLiveQuery(() => externalForClient(clientId), [clientId]);
  const manualRevenueByYear = useMemo(() => {
    const byYear = new Map<number, (number | null)[]>();
    for (const month of storedRevenue ?? NO_EXTERNAL) {
      const series = byYear.get(month.year) ?? Array.from({ length: MONTHS_IN_YEAR }, () => null);
      series[month.monthIndex] = month.manualRevenue;
      byYear.set(month.year, series);
    }
    return byYear;
  }, [storedRevenue]);

  /** The typed months folded into one series per line, by year. */
  const legacyByYear = useMemo(() => {
    const byYear = new Map<number, PersonnelLegacySeries>();
    for (const month of legacyMonths) {
      const series = byYear.get(month.year) ?? emptyLegacySeries();
      for (const row of PERSONNEL_LEGACY_COST_ROWS) {
        series[row.id][month.monthIndex] = month.amounts[row.id] ?? null;
      }
      byYear.set(month.year, series);
    }
    return byYear;
  }, [legacyMonths]);
  const ready = stored !== undefined;

  /** The captured figures indexed by year, as twelve slots each. */
  const familyByYear = useMemo(() => {
    const byYear = new Map<number, (number | null)[]>();
    for (const row of family) {
      const series = byYear.get(row.year) ?? emptyFamilySeries();
      series[row.monthIndex] = row.amount;
      byYear.set(row.year, series);
    }
    return byYear;
  }, [family]);

  /**
   * One `PersonnelCostYearInput` per year the workspace declares.
   *
   * It walks the same path PyG's own Consolidado por centros does: fold the edits into the leaves,
   * `mergeCenters` the year's datasets into one, and read the analytics source off the synthetic
   * dataset. The reading is of the COMPANY and not of a marked center, like the workbook it replaces —
   * MicroPlus has no cost centers anyway.
   *
   * The SIGN is deliberately not touched: the MicroPlus strategy already negated branch 5 at import,
   * so what `valuesByCode` answers for `5.2.04.01.01` is a positive cost. Applying `rootSign` here
   * would be an operation that does nothing while looking like it does something.
   */
  const inputs = useMemo<PersonnelCostYearInput[]>(() => {
    if (!canRead) {
      return [];
    }
    const byYear = new Map<number, PygDataset[]>();
    for (const dataset of datasets) {
      byYear.set(dataset.year, [...(byYear.get(dataset.year) ?? []), dataset]);
    }

    const result: PersonnelCostYearInput[] = [];
    for (const [year, ofYear] of byYear) {
      const coverage = loadedMonthsFor({ loadedMonthsByYear }, year);
      if (coverage.length === 0) {
        // A year with no declared coverage is a year the workspace does not have: it is not a year of
        // zeros, and it does not enter the universe.
        continue;
      }
      const merged = mergeCenters(
        ofYear.map((dataset) =>
          applyEditsToLeafAccounts(
            dataset.accounts,
            edits.filter((edit) => edit.datasetId === dataset.id),
          ),
        ),
      );
      const source = buildAnalyticsSource(
        { ...ofYear[0], accounts: merged.accounts, warnings: [], resultFromFile: [] },
        // The edits are already folded into the merged accounts; applying them again would count
        // them twice — `buildViews`' same rule for the synthetic Consolidado.
        [],
        new Set(coverage),
      );

      // Only the codes the map asks for. A code this plan does not have is left OUT of the map rather
      // than written as twelve zeros, which is what lets `derive.ts` tell «no existe» from «no movió».
      const accounts = new Map<string, readonly number[]>();
      for (const code of PERSONNEL_ACCOUNT_CODES) {
        const values = source.valuesByCode.get(code);
        if (values) {
          accounts.set(code, values);
        }
      }

      result.push({
        year,
        coverage,
        accounts,
        revenue:
          source.valuesByCode.get(REVENUE_ROOT) ?? Array.from({ length: MONTHS_IN_YEAR }, () => 0),
        family: familyByYear.get(year) ?? emptyFamilySeries(),
      });
    }
    // The TYPED exercises, and only where PyG has nothing to say about that year: an estado de
    // resultados is the stronger claim of the two, so a year that gets uploaded stops being read off
    // the sheet — the drawer says so rather than letting two answers to one year coexist in silence.
    for (const [year, legacy] of legacyByYear) {
      if (byYear.has(year) || legacyCoverage(legacy).length === 0) {
        continue;
      }
      // The denominator: the estado de resultados has nothing for this year by construction, so what
      // is left is what Ingresos holds. `resolveMonthlyRevenue` is that module's own rule and the one
      // place the two sources meet — a fallback and never an override.
      const manual = manualRevenueByYear.get(year) ?? [];
      result.push({
        year,
        // Its coverage is what was TYPED — see `legacyCoverage`, where that inference is argued.
        coverage: legacyCoverage(legacy),
        accounts: new Map(),
        revenue: resolveMonthlyRevenue([], manual).map((value) => value ?? 0),
        family: emptyFamilySeries(),
        legacy,
      });
    }

    return result.sort((a, b) => a.year - b.year);
  }, [
    canRead,
    datasets,
    edits,
    loadedMonthsByYear,
    familyByYear,
    legacyByYear,
    manualRevenueByYear,
  ]);

  const years = useMemo(() => inputs.map((input) => input.year), [inputs]);

  // The YEARS resolve first, because the universe of months is that of the marked years: without that
  // order, marking a year could not open the months only it brings.
  const yearsOnly = useMemo(
    () => sanitizeFilters(rawFilters, { years, months: [] }),
    [rawFilters, years],
  );
  const universe = useMemo<PersonnelCostUniverse>(() => {
    const marked = new Set(yearsOnly.years);
    const months = new Set<number>();
    for (const input of inputs) {
      if (!marked.has(input.year)) {
        continue;
      }
      for (const month of input.coverage) {
        months.add(month);
      }
    }
    return { years, months: [...months].sort((a, b) => a - b) };
  }, [years, yearsOnly.years, inputs]);

  // Pruned on READ and never in an effect: switching client cannot leave a render marking a year this
  // client does not have.
  const filters = useMemo(() => sanitizeFilters(rawFilters, universe), [rawFilters, universe]);
  const months = useMemo(() => selectedMonths(filters, universe), [filters, universe]);

  /**
   * The RESOLVED span and not the marks: with no month marked the reading still covers a tramo —every
   * covered month of the marked years— and a subtitle that named only «2025, 2026» left the reader to
   * guess which months the figures under it were measured over.
   */
  const periodName = useMemo(
    () => scopedPeriodLabel(describeGroupScope(filters), periodLabel(months, filters.years)),
    [filters, months],
  );

  const reading = useMemo(() => {
    const marked = new Set(filters.years);
    return readPersonnelCost(
      inputs.filter((input) => marked.has(input.year)),
      months,
    );
  }, [inputs, filters.years, months]);

  const cardsInput = useMemo<PersonnelCardsInput>(
    () => ({ reading, groups: filters.groups, period: periodName, evolutionView, solidViews }),
    [reading, filters.groups, periodName, evolutionView, solidViews],
  );
  const cards = useMemo(() => buildPersonnelCards(cardsInput), [cardsInput]);
  const grid = useMemo(
    () => buildPersonnelGrid(reading, { groups: filters.groups, hideEmptyRows }),
    [reading, filters.groups, hideEmptyRows],
  );

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
  const toggleGroup = useCallback(
    (id: PersonnelGroupId) => setRawFilters((current) => withGroupToggled(current, id)),
    [],
  );
  const clearGroups = useCallback(() => setRawFilters(withGroupsCleared), []);

  const saveFamily = useCallback(
    async (year: number, monthIndex: number, amount: number | null) => {
      // Guarded here and not only in the grid: `canRead` is what vouches for the partition, and a
      // write that slipped past it would land in a client whose plan this map does not describe.
      if (!clientId || !canRead) {
        return;
      }
      await saveFamilyMonth(clientId, year, monthIndex, amount);
    },
    [clientId, canRead],
  );

  const saveFamilyBlock = useCallback(
    async (year: number, months: readonly { monthIndex: number; amount: number | null }[]) => {
      if (!clientId || !canRead) {
        return;
      }
      await saveFamilyMonths(clientId, year, months);
    },
    [clientId, canRead],
  );

  // ── The drawer ───────────────────────────────────────────────────────────
  const legacyYears = useMemo(() => [...legacyByYear.keys()].sort((a, b) => a - b), [legacyByYear]);
  const pygYears = useMemo(
    () => new Set(inputs.filter((input) => !input.legacy).map((input) => input.year)),
    [inputs],
  );
  const [captureYearRaw, setCaptureYear] = useState<number | null>(null);
  /**
   * Which year the drawer writes: the one picked, and otherwise the LAST typed one — or the year
   * before the earliest exercise there is, which is where somebody filling in history starts.
   */
  const captureYear = useMemo(() => {
    if (captureYearRaw !== null) {
      return captureYearRaw;
    }
    if (legacyYears.length > 0) {
      return legacyYears[legacyYears.length - 1];
    }
    const earliest = inputs[0]?.year;
    return earliest ? earliest - 1 : new Date().getFullYear() - 1;
  }, [captureYearRaw, legacyYears, inputs]);

  const captureSeries = useMemo(
    () => legacyByYear.get(captureYear) ?? emptyLegacySeries(),
    [legacyByYear, captureYear],
  );
  const captureRevenue = useMemo(() => {
    const fromPyg = inputs.find((input) => input.year === captureYear && !input.legacy)?.revenue;
    return resolveMonthlyRevenue(
      fromPyg ? [...fromPyg] : [],
      manualRevenueByYear.get(captureYear) ?? [],
    );
  }, [inputs, captureYear, manualRevenueByYear]);

  const typedMonthsIn = useCallback(
    (year: number) => legacyCoverage(legacyByYear.get(year) ?? emptyLegacySeries()).length,
    [legacyByYear],
  );

  const saveLegacy = useCallback(
    async (monthIndex: number, amounts: PersonnelLegacyAmounts) => {
      if (!clientId) {
        return;
      }
      await saveLegacyMonth(clientId, captureYear, monthIndex, amounts);
    },
    [clientId, captureYear],
  );
  const saveLegacyBlock = useCallback(
    async (months: readonly { monthIndex: number; amounts: PersonnelLegacyAmounts }[]) => {
      if (!clientId) {
        return;
      }
      await saveLegacyMonths(clientId, captureYear, months);
    },
    [clientId, captureYear],
  );
  const removeCaptureYear = useCallback(
    async (year: number) => {
      if (!clientId) {
        return;
      }
      await deleteLegacyYear(clientId, year);
      setCaptureYear(null);
    },
    [clientId],
  );

  const value: PersonnelCostDataValue = {
    clientId,
    isConsolidated,
    sourceSystemId,
    canRead,
    ready,
    universe,
    filters,
    periodName,
    reading,
    cardsInput,
    cards,
    evolutionView,
    setEvolutionView,
    solidViews,
    setSolidView,
    grid,
    hideEmptyRows,
    setHideEmptyRows,
    markCount: activeMarkCount(filters),
    groupsAvailable: reading.years.some((year) => year.groups.length > 0),
    toggleYear,
    selectAllYears,
    toggleMonth,
    clearMonths,
    toggleGroup,
    clearGroups,
    saveFamily,
    saveFamilyBlock,
    legacyYears,
    captureYear,
    setCaptureYear: (year: number) => setCaptureYear(year),
    captureSeries,
    captureRevenue,
    captureFromPyg: pygYears.has(captureYear),
    addCaptureYear: (year: number) => setCaptureYear(year),
    removeCaptureYear,
    typedMonthsIn,
    saveLegacy,
    saveLegacyBlock,
  };

  return (
    <PersonnelCostDataContext.Provider value={value}>{children}</PersonnelCostDataContext.Provider>
  );
}

export function usePersonnelCostData(): PersonnelCostDataValue {
  const context = useContext(PersonnelCostDataContext);
  if (!context) {
    throw new Error("usePersonnelCostData debe usarse dentro de PersonnelCostDataProvider");
  }
  return context;
}
