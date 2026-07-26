"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { consolidate } from "@/lib/occupancy/consolidate";
import * as occupancyDb from "@/lib/occupancy/db";
import { toAnnualGrid, toOccupancyGrid, type OccupancyGrid } from "@/lib/occupancy/derive";
import {
  clearMarks,
  emptyFilters,
  sanitizeFilters,
  withCenterToggled,
  withCentersCleared,
  withDrillIntoMonth,
  withMetric,
  withDayToggled,
  withDaysCleared,
  withMonthToggled,
  withMonthsCleared,
  withScope,
  withYearToggled,
  withYearsCleared,
  type OccupancyFilters,
} from "@/lib/occupancy/filters";
import type { OccupancyMetricId, Scope } from "@/lib/occupancy/analytics/types";
import { normalize } from "@/lib/occupancy/slug";
import {
  CONSOLIDATED_CENTER_ID,
  type CenterRow,
  type OccupancyDataset,
  type OccupancyParseResult,
} from "@/lib/occupancy/types";

const EMPTY_DATASETS: OccupancyDataset[] = [];

/** Files parsed and waiting on the user to confirm they replace another hotel's workspace. */
interface PendingReplace {
  results: OccupancyParseResult[];
  hotelName: string;
  previousHotel: string;
  centerCount: number;
  errors: string[];
}

interface OccupancyDataValue {
  datasets: OccupancyDataset[];
  /** The sucursales present, alphabetically. */
  centers: CenterRow[];
  hotelName: string | undefined;
  /** Active sucursal, or the reserved consolidated id. */
  activeCenterId: string | undefined;
  activeCenterName: string | undefined;
  isConsolidated: boolean;
  /** Whether a Consolidado view is on offer at all — it needs two sucursales to mean anything. */
  hasConsolidated: boolean;
  setActiveCenter: (centerId: string) => void;
  /** Years of the active sucursal (all years, in the consolidated view), ascending. */
  years: number[];
  /** Every year the workspace holds — the universe the Gráficos filter bar offers. */
  allYears: number[];
  activeYear: number | undefined;
  setActiveYear: (year: number) => void;
  monthIndex: number;
  setMonthIndex: (index: number) => void;
  /** Whether the DATOS grid shows one month by days, or the whole year by months. */
  gridScope: "month" | "year";
  setGridScope: (scope: "month" | "year") => void;
  /** The active view's dataset: a stored sucursal-year, or the consolidated sum. */
  dataset: OccupancyDataset | undefined;
  /** The active month's grid; null while there is nothing to show. */
  grid: OccupancyGrid | null;
  /** False in the consolidated view: it is a calculation, edited in each sucursal. */
  canEdit: boolean;
  /** False only on the very first Dexie read, so the empty state doesn't flash. */
  ready: boolean;
  saveCell: (rowId: string, dayIndex: number, value: number) => Promise<void>;
  saveNights: (nights: number | null) => Promise<void>;
  /** Channels belong to the ACTIVE MONTH, not to the whole year. */
  addChannel: (name: string) => Promise<void>;
  renameChannel: (id: string, name: string) => Promise<void>;
  removeChannel: (id: string) => Promise<void>;
  addYear: (year: number) => Promise<void>;
  deleteYear: (year: number) => Promise<void>;
  deleteCenter: (centerId: string) => Promise<void>;
  /**
   * Every file is parsed BEFORE anything is written, so the workspace-wide check (all files
   * from one hotel) cannot leave the base half-updated.
   */
  importWorkbooks: (files: File[]) => Promise<void>;
  /**
   * Last upload failure, in Spanish. Held here because the upload button lives in the module
   * tab bar while its error banner belongs above the grid.
   */
  importError: string | null;
  importErrorDetails: string[];
  dismissImportError: () => void;
  /**
   * What the Gráficos filter bar has marked. Datos keeps its own three strips: those answer
   * «cuál edito» — a single sucursal-year-month — while these answer «cuáles comparo». The bar
   * falls back to whatever Datos has open, so moving between tabs keeps the context.
   */
  filters: OccupancyFilters;
  setMetric: (metric: OccupancyMetricId) => void;
  setChartScope: (scope: Scope) => void;
  toggleCenterMark: (centerId: string) => void;
  toggleYearMark: (year: number) => void;
  toggleMonthMark: (month: number) => void;
  /** Marking a day narrows the axis to it — and drops «Ver por» to días. */
  toggleDayMark: (day: number) => void;
  clearCenterMarks: () => void;
  clearYearMarks: () => void;
  clearMonthMarks: () => void;
  clearDayMarks: () => void;
  clearAllMarks: () => void;
  /** Clicking a month's bar: narrows to that month and drops the axis to days. */
  drillIntoMonth: (month: number) => void;
}

const OccupancyDataContext = createContext<OccupancyDataValue | null>(null);

function yearsOf(datasets: OccupancyDataset[]): number[] {
  return [...new Set(datasets.map((d) => d.year))].sort((a, b) => a - b);
}

/**
 * Mounted in the dashboard layout so the header can name the hotel while the Datos panel
 * renders the grid.
 */
export function OccupancyDataProvider({ children }: { children: ReactNode }) {
  const stored = useLiveQuery(() => occupancyDb.listDatasets(), []);
  const meta = useLiveQuery(() => occupancyDb.getMeta(), []);
  /** In-session selection; it wins over the persisted one while what it names still exists. */
  const [selected, setSelected] = useState<{ centerId?: string; year?: number }>({});
  const [monthIndex, setMonthIndex] = useState(0);
  // The month is kept while looking at the year, so coming back lands where you left.
  const [gridScope, setGridScope] = useState<"month" | "year">("month");
  const [importError, setImportError] = useState<string | null>(null);
  const [importErrorDetails, setImportErrorDetails] = useState<string[]>([]);
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | null>(null);
  const [rawFilters, setRawFilters] = useState<OccupancyFilters>(emptyFilters);

  const datasets = stored ?? EMPTY_DATASETS;
  const ready = stored !== undefined;

  const centers = useMemo(() => occupancyDb.centersOf(datasets), [datasets]);
  // One sucursal has nothing to consolidate with: the sum would just be itself.
  const hasConsolidated = centers.length > 1;

  // Prefer the in-session sucursal, then the persisted one, then the first — each only if it
  // still exists, so deleting a sucursal cannot strand the view on nothing.
  const requestedCenter = selected.centerId ?? meta?.activeCenterId;
  const activeCenterId =
    requestedCenter === CONSOLIDATED_CENTER_ID && hasConsolidated
      ? CONSOLIDATED_CENTER_ID
      : (centers.find((c) => c.id === requestedCenter)?.id ?? centers[0]?.id);
  const isConsolidated = activeCenterId === CONSOLIDATED_CENTER_ID;

  const centerDatasets = useMemo(
    () => (isConsolidated ? datasets : datasets.filter((d) => d.centerId === activeCenterId)),
    [datasets, activeCenterId, isConsolidated],
  );
  const years = useMemo(() => yearsOf(centerDatasets), [centerDatasets]);

  // A sucursal need not hold every year: switching to one that lacks the active year lands on
  // its most recent instead of on an empty grid.
  const activeYear =
    years.find((y) => y === selected.year) ??
    years.find((y) => y === meta?.activeYear) ??
    years[years.length - 1];

  const dataset = useMemo(() => {
    if (activeYear === undefined) {
      return undefined;
    }
    const ofYear = centerDatasets.filter((d) => d.year === activeYear);
    return isConsolidated ? (consolidate(ofYear) ?? undefined) : ofYear[0];
  }, [centerDatasets, activeYear, isConsolidated]);

  const activeCenterName = isConsolidated
    ? dataset?.centerName
    : centers.find((c) => c.id === activeCenterId)?.name;

  const allYears = useMemo(
    () => [...new Set(datasets.map((d) => d.year))].sort((a, b) => a - b),
    [datasets],
  );
  // Pruned on read, never in an effect: the marks are never a render behind the workspace.
  const filters = useMemo(
    () => sanitizeFilters(rawFilters, { centerIds: centers.map((c) => c.id), years: allYears }),
    [rawFilters, centers, allYears],
  );

  const grid = useMemo(() => {
    if (!dataset) {
      return null;
    }
    return gridScope === "year" ? toAnnualGrid(dataset) : toOccupancyGrid(dataset, monthIndex);
  }, [dataset, monthIndex, gridScope]);

  // The annual grid aggregates days into months: there is no cell to write back to.
  const canEdit = !isConsolidated && dataset !== undefined && gridScope === "month";
  /** The record every mutation writes to; undefined in the consolidated view. */
  const activeKey = useMemo(
    () =>
      canEdit && activeCenterId !== undefined && activeYear !== undefined
        ? { centerId: activeCenterId, year: activeYear }
        : undefined,
    [canEdit, activeCenterId, activeYear],
  );

  const setActiveCenter = useCallback((centerId: string) => {
    // The year is deliberately left to resolve itself against the new sucursal's own years.
    setSelected((current) => ({ centerId, year: current.year }));
  }, []);

  const setActiveYear = useCallback(
    (year: number) => {
      setSelected((current) => ({ centerId: current.centerId ?? activeCenterId, year }));
      if (activeCenterId !== undefined && !isConsolidated) {
        void occupancyDb.saveActiveView({ centerId: activeCenterId, year });
      }
    },
    [activeCenterId, isConsolidated],
  );

  const saveCell = useCallback(
    async (rowId: string, dayIndex: number, value: number) => {
      if (activeKey) {
        await occupancyDb.saveCell(activeKey, monthIndex, rowId, dayIndex, value);
      }
    },
    [activeKey, monthIndex],
  );

  const saveNights = useCallback(
    async (nights: number | null) => {
      if (activeKey) {
        await occupancyDb.saveNights(activeKey, monthIndex, nights);
      }
    },
    [activeKey, monthIndex],
  );

  const addChannel = useCallback(
    async (name: string) => {
      if (activeKey) {
        await occupancyDb.addChannel(activeKey, monthIndex, name);
      }
    },
    [activeKey, monthIndex],
  );

  const renameChannel = useCallback(
    async (id: string, name: string) => {
      if (activeKey) {
        await occupancyDb.renameChannel(activeKey, id, name);
      }
    },
    [activeKey],
  );

  const removeChannel = useCallback(
    async (id: string) => {
      if (activeKey) {
        await occupancyDb.removeChannel(activeKey, monthIndex, id);
      }
    },
    [activeKey, monthIndex],
  );

  const addYear = useCallback(
    async (year: number) => {
      // The consolidated view owns no year, so a blank one goes to the first sucursal.
      const centerId = isConsolidated ? centers[0]?.id : activeCenterId;
      if (centerId === undefined) {
        return;
      }
      await occupancyDb.addYear({ centerId, year });
      setSelected({ centerId, year });
    },
    [activeCenterId, centers, isConsolidated],
  );

  const deleteYear = useCallback(
    async (year: number) => {
      if (activeCenterId === undefined || isConsolidated) {
        return;
      }
      await occupancyDb.deleteYear({ centerId: activeCenterId, year });
      setSelected({});
    },
    [activeCenterId, isConsolidated],
  );

  const deleteCenter = useCallback(async (centerId: string) => {
    await occupancyDb.deleteCenter(centerId);
    setSelected({});
  }, []);

  const commit = useCallback(async (results: OccupancyParseResult[], replaceHotel?: string) => {
    if (replaceHotel !== undefined) {
      await occupancyDb.replaceAll(results, replaceHotel);
    } else {
      // Sequential, not parallel: each merge runs a Dexie transaction, and two overlapping
      // ones (two files landing the same sucursal-year) would race on the same record.
      for (const parsed of results) {
        await occupancyDb.mergeParsedDataset(parsed);
      }
    }
    const newest = results.reduce<OccupancyParseResult | undefined>(
      (best, parsed) => (!best || parsed.dataset.year >= best.dataset.year ? parsed : best),
      undefined,
    );
    if (newest) {
      setSelected({ centerId: newest.dataset.centerId, year: newest.dataset.year });
      setMonthIndex(newest.parsedMonths[0] ?? 0);
    }
  }, []);

  const report = useCallback((errors: string[]) => {
    if (errors.length === 1) {
      setImportError(errors[0]);
      setImportErrorDetails([]);
    } else if (errors.length > 1) {
      setImportError(`${errors.length} archivos no se pudieron cargar.`);
      setImportErrorDetails(errors);
    }
  }, []);

  const importWorkbooks = useCallback(
    async (files: File[]) => {
      setImportError(null);
      setImportErrorDetails([]);
      // Dynamic import keeps SheetJS out of the initial bundle.
      const { parseOccupancyWorkbook } = await import("@/lib/occupancy/parse");

      const results: OccupancyParseResult[] = [];
      const errors: string[] = [];
      for (const file of files) {
        try {
          results.push(parseOccupancyWorkbook(await file.arrayBuffer(), file.name));
        } catch (error) {
          const reason = error instanceof Error ? error.message : "no se pudo procesar el archivo.";
          errors.push(`${file.name}: ${reason}`);
        }
      }

      if (results.length === 0) {
        report(errors);
        return;
      }

      // Nothing is written until the whole selection is known to belong to ONE hotel: a mixed
      // upload half-applied would leave two companies sharing one set of tabs.
      const hotels = [...new Map(results.map((r) => [normalize(r.dataset.hotelName), r])).values()];
      if (hotels.length > 1) {
        setImportError(
          `Los archivos son de hoteles distintos (${hotels
            .map((r) => r.dataset.hotelName)
            .join(", ")}); cárgalos por separado.`,
        );
        setImportErrorDetails([]);
        return;
      }

      const incoming = results[0].dataset.hotelName;
      const current = meta?.hotelName;
      if (datasets.length > 0 && current && normalize(current) !== normalize(incoming)) {
        setPendingReplace({
          results,
          hotelName: incoming,
          previousHotel: current,
          centerCount: centers.length,
          errors,
        });
        return;
      }

      await commit(results);
      report(errors);
    },
    [centers.length, commit, datasets.length, meta?.hotelName, report],
  );

  const centerUniverse = useMemo(() => centers.map((center) => center.id), [centers]);
  const setMetric = useCallback(
    (metric: OccupancyMetricId) => setRawFilters((f) => withMetric(f, metric)),
    [],
  );
  const setChartScope = useCallback(
    (scope: Scope) => setRawFilters((f) => withScope(f, scope)),
    [],
  );
  const toggleCenterMark = useCallback(
    (centerId: string) => setRawFilters((f) => withCenterToggled(f, centerId, centerUniverse)),
    [centerUniverse],
  );
  const toggleYearMark = useCallback(
    (year: number) => setRawFilters((f) => withYearToggled(f, year, allYears)),
    [allYears],
  );
  const toggleMonthMark = useCallback(
    (month: number) => setRawFilters((f) => withMonthToggled(f, month)),
    [],
  );
  const toggleDayMark = useCallback(
    (day: number) => setRawFilters((f) => withDayToggled(f, day)),
    [],
  );
  const clearCenterMarks = useCallback(() => setRawFilters(withCentersCleared), []);
  const clearYearMarks = useCallback(() => setRawFilters(withYearsCleared), []);
  const clearMonthMarks = useCallback(() => setRawFilters(withMonthsCleared), []);
  const clearDayMarks = useCallback(() => setRawFilters(withDaysCleared), []);
  const clearAllMarks = useCallback(() => setRawFilters(clearMarks), []);
  const drillIntoMonth = useCallback(
    (month: number) => setRawFilters((f) => withDrillIntoMonth(f, month)),
    [],
  );

  const dismissImportError = useCallback(() => {
    setImportError(null);
    setImportErrorDetails([]);
  }, []);

  const value = useMemo<OccupancyDataValue>(
    () => ({
      datasets,
      centers,
      hotelName: meta?.hotelName ?? dataset?.hotelName,
      activeCenterId,
      activeCenterName,
      isConsolidated,
      hasConsolidated,
      setActiveCenter,
      years,
      allYears,
      activeYear,
      setActiveYear,
      monthIndex,
      setMonthIndex,
      gridScope,
      setGridScope,
      dataset,
      grid,
      canEdit,
      ready,
      saveCell,
      saveNights,
      addChannel,
      renameChannel,
      removeChannel,
      addYear,
      deleteYear,
      deleteCenter,
      importWorkbooks,
      importError,
      importErrorDetails,
      dismissImportError,
      filters,
      setMetric,
      setChartScope,
      toggleCenterMark,
      toggleYearMark,
      toggleMonthMark,
      toggleDayMark,
      clearCenterMarks,
      clearYearMarks,
      clearMonthMarks,
      clearDayMarks,
      clearAllMarks,
      drillIntoMonth,
    }),
    [
      datasets,
      centers,
      meta?.hotelName,
      activeCenterId,
      activeCenterName,
      isConsolidated,
      hasConsolidated,
      setActiveCenter,
      years,
      activeYear,
      setActiveYear,
      monthIndex,
      gridScope,
      dataset,
      grid,
      canEdit,
      ready,
      saveCell,
      saveNights,
      addChannel,
      renameChannel,
      removeChannel,
      addYear,
      deleteYear,
      deleteCenter,
      importWorkbooks,
      importError,
      importErrorDetails,
      dismissImportError,
      allYears,
      filters,
      setMetric,
      setChartScope,
      toggleCenterMark,
      toggleYearMark,
      toggleMonthMark,
      toggleDayMark,
      clearCenterMarks,
      clearYearMarks,
      clearMonthMarks,
      clearDayMarks,
      clearAllMarks,
      drillIntoMonth,
    ],
  );

  return (
    <OccupancyDataContext.Provider value={value}>
      {children}
      {/*
        The dialog lives here, not in the Datos panel: the upload button sits in the module tab
        bar, so the question has to be answerable from whichever tab is open.
      */}
      <ConfirmDialog
        open={pendingReplace !== null}
        variant="destructive"
        title={`¿Reemplazar los datos de ${pendingReplace?.previousHotel}?`}
        description={
          pendingReplace
            ? `Los archivos son de ${pendingReplace.hotelName} y este espacio guarda ${pendingReplace.previousHotel}. Continuar borra sus ${pendingReplace.centerCount} ${pendingReplace.centerCount === 1 ? "sucursal" : "sucursales"}, con todos sus años y lo que hayas escrito a mano. No se puede deshacer.`
            : ""
        }
        confirmLabel="Reemplazar"
        onConfirm={() => {
          const pending = pendingReplace;
          setPendingReplace(null);
          if (pending) {
            void commit(pending.results, pending.hotelName).then(() => report(pending.errors));
          }
        }}
        onCancel={() => setPendingReplace(null)}
      />
    </OccupancyDataContext.Provider>
  );
}

export function useOccupancyData(): OccupancyDataValue {
  const context = useContext(OccupancyDataContext);
  if (!context) {
    throw new Error("useOccupancyData debe usarse dentro de <OccupancyDataProvider>.");
  }
  return context;
}
