"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { buildAnalyticsSource } from "@/lib/profit-loss/analytics/source";
import { REVENUE_ROOT } from "@/lib/profit-loss/charts/presets";
import { applyEditsToLeafAccounts, mergeCenters } from "@/lib/profit-loss/derive";
import { loadedMonthsFor, type PygDataset } from "@/lib/profit-loss/types";
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
import { familyForClient, saveFamilyMonth } from "@/lib/personnel-cost/db";
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
  grid: PersonnelGrid;
  /** Whether a row that moved nothing anywhere is held back — a control of the GRID's own header. */
  hideEmptyRows: boolean;
  setHideEmptyRows: (hide: boolean) => void;
  markCount: number;
  toggleYear: (year: number) => void;
  selectAllYears: () => void;
  toggleMonth: (monthIndex: number) => void;
  clearMonths: () => void;
  toggleGroup: (id: PersonnelGroupId) => void;
  clearGroups: () => void;
  /** Writes one month of the nómina de familia. `null` clears it. */
  saveFamily: (year: number, monthIndex: number, amount: number | null) => Promise<void>;
}

const PersonnelCostDataContext = createContext<PersonnelCostDataValue | null>(null);

const NO_FAMILY: PersonnelFamilyMonth[] = [];

export function PersonnelCostDataProvider({ children }: { children: ReactNode }) {
  const { activeClientId, isConsolidated, datasets, edits, loadedMonthsByYear, sourceSystemId } =
    usePygData();
  const [rawFilters, setRawFilters] = useState<PersonnelCostFilters>(emptyFilters);
  const [hideEmptyRows, setHideEmptyRows] = useState(false);
  const [evolutionView, setEvolutionView] = useState<EvolutionView>(DEFAULT_EVOLUTION_VIEW);

  const canRead = canReadPersonnelCost({ sourceSystemId, isConsolidated });
  // The capture writes into a REAL client and never into the consolidado, so the partition it uses is
  // the one `canRead` already vouched for.
  const clientId = isConsolidated ? null : activeClientId;

  // The ONLY query, and always bounded by the client: it is what stops two companies' figures mixing
  // in silence.
  const stored = useLiveQuery(() => familyForClient(clientId), [clientId]);
  const family = stored ?? NO_FAMILY;
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
    return result.sort((a, b) => a.year - b.year);
  }, [canRead, datasets, edits, loadedMonthsByYear, familyByYear]);

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
    () => ({ reading, groups: filters.groups, period: periodName, evolutionView }),
    [reading, filters.groups, periodName, evolutionView],
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
    grid,
    hideEmptyRows,
    setHideEmptyRows,
    markCount: activeMarkCount(filters),
    toggleYear,
    selectAllYears,
    toggleMonth,
    clearMonths,
    toggleGroup,
    clearGroups,
    saveFamily,
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
