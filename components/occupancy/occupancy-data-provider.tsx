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
  withPickToggled,
  withPicksCleared,
  withMetric,
  withPeriodMode,
  withRangeCleared,
  withRangeEdge,
  withScope,
  type OccupancyFilters,
  type PeriodMode,
} from "@/lib/occupancy/filters";
import type {
  DateRef,
  OccupancyMetricId,
  PeriodPick,
  Scope,
} from "@/lib/occupancy/analytics/types";
import type { Frequency } from "@/lib/period";
import { normalize } from "@/lib/occupancy/slug";
import {
  CONSOLIDATED_CENTER_ID,
  type CenterRow,
  type OccupancyDataset,
  type OccupancyParseResult,
} from "@/lib/occupancy/types";

const EMPTY_DATASETS: OccupancyDataset[] = [];

interface PendingReplace {
  results: OccupancyParseResult[];
  hotelName: string;
  previousHotel: string;
  centerCount: number;
}

interface OccupancyDataValue {
  datasets: OccupancyDataset[];
  centers: CenterRow[];
  hotelName: string | undefined;
  activeCenterId: string | undefined;
  activeCenterName: string | undefined;
  isConsolidated: boolean;
  hasConsolidated: boolean;
  setActiveCenter: (centerId: string) => void;
  /** Years of the ACTIVE center; `allYears` is every year the workspace holds. */
  years: number[];
  allYears: number[];
  activeYear: number | undefined;
  setActiveYear: (year: number) => void;
  monthIndex: number;
  setMonthIndex: (index: number) => void;
  /** Whether the Datos grid shows one month BY DAYS, or the whole year BY PERIODS. */
  gridScope: "month" | "year";
  setGridScope: (scope: "month" | "year") => void;
  gridFrequency: Frequency;
  /** Picks the annual grid's granularity — and switches to it. */
  setGridFrequency: (frequency: Frequency) => void;
  dataset: OccupancyDataset | undefined;
  grid: OccupancyGrid | null;
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
  /** The whole upload, already parsed and checked as one before anything is written. */
  importParsed: (results: OccupancyParseResult[]) => Promise<void>;
  importError: string | null;
  importErrorDetails: string[];
  dismissImportError: () => void;
  /**
   * What the Gráficos filter bar holds. Datos keeps its own three strips: those answer «cuál edito»,
   * these answer «qué periodo veo».
   */
  filters: OccupancyFilters;
  setMetric: (metric: OccupancyMetricId) => void;
  setChartScope: (scope: Scope) => void;
  toggleCenterMark: (centerId: string) => void;
  clearCenterMarks: () => void;
  clearAllMarks: () => void;
  /** «Rango» (un tramo, con total y evolución) o «Días» (fechas sueltas, una columna cada una). */
  setPeriodMode: (mode: PeriodMode) => void;
  /** Moves one end of the span; ends given in reverse are normalized. */
  setRangeEdge: (edge: "from" | "to", ref: DateRef) => void;
  clearRange: () => void;
  /** Adds or removes one day or one whole month from the «comparar» selection. */
  togglePick: (pick: PeriodPick) => void;
  clearPicks: () => void;
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
  const [gridFrequency, setRawGridFrequency] = useState<Frequency>("mensual");
  const [importError, setImportError] = useState<string | null>(null);
  const [importErrorDetails, setImportErrorDetails] = useState<string[]>([]);
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | null>(null);
  const [rawFilters, setRawFilters] = useState<OccupancyFilters>(emptyFilters);

  const datasets = stored ?? EMPTY_DATASETS;
  const ready = stored !== undefined;

  const centers = useMemo(() => occupancyDb.centersOf(datasets), [datasets]);
  // One center has nothing to consolidate with: the sum would just be itself.
  const hasConsolidated = centers.length > 1;

  // In-session, then persisted, then the first — each only if it still exists, so deleting a
  // center cannot strand the view on nothing.
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

  // A center need not hold every year: switching to one that lacks the active year lands on its
  // most recent instead of on an empty grid.
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
  // Pruned AND resolved on read: the default span carries «el año que haya» until the workspace says
  // which years it holds. Never in an effect, so the selection is never a render behind.
  const filters = useMemo(
    () => sanitizeFilters(rawFilters, { centerIds: centers.map((c) => c.id), years: allYears }),
    [rawFilters, centers, allYears],
  );

  const grid = useMemo(() => {
    if (!dataset) {
      return null;
    }
    return gridScope === "year"
      ? toAnnualGrid(dataset, gridFrequency)
      : toOccupancyGrid(dataset, monthIndex);
  }, [dataset, monthIndex, gridScope, gridFrequency]);

  const setGridFrequency = useCallback((frequency: Frequency) => {
    setRawGridFrequency(frequency);
    setGridScope("year");
  }, []);

  // The annual grid aggregates days into periods: there is no cell to write back to.
  const canEdit = !isConsolidated && dataset !== undefined && gridScope === "month";
  const activeKey = useMemo(
    () =>
      canEdit && activeCenterId !== undefined && activeYear !== undefined
        ? { centerId: activeCenterId, year: activeYear }
        : undefined,
    [canEdit, activeCenterId, activeYear],
  );

  const setActiveCenter = useCallback((centerId: string) => {
    // The year is deliberately left to resolve itself against the new center's own years.
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
      // The consolidated view owns no year, so a blank one goes to the first center.
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
      // Sequential, not parallel: each merge runs a Dexie transaction, and two overlapping ones
      // (two files landing the same center-year) would race on the same record.
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

  const importParsed = useCallback(
    async (results: OccupancyParseResult[]) => {
      setImportError(null);
      setImportErrorDetails([]);
      if (results.length === 0) {
        return;
      }

      // Nothing is written until the whole selection is known to belong to ONE hotel: a mixed
      // upload half-applied would leave two companies sharing one set of tabs. The modal blocks
      // this earlier; the check stays because THIS is what writes.
      const hotels = [...new Map(results.map((r) => [normalize(r.dataset.hotelName), r])).values()];
      if (hotels.length > 1) {
        setImportError(
          `Los archivos son de hoteles distintos (${hotels
            .map((r) => r.dataset.hotelName)
            .join(", ")}); cárgalos por separado.`,
        );
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
        });
        return;
      }

      await commit(results);
    },
    [centers.length, commit, datasets.length, meta?.hotelName],
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
  const clearCenterMarks = useCallback(() => setRawFilters(withCentersCleared), []);
  const clearAllMarks = useCallback(() => setRawFilters(clearMarks), []);
  const setPeriodMode = useCallback(
    (mode: PeriodMode) => setRawFilters((f) => withPeriodMode(f, mode)),
    [],
  );
  const setRangeEdge = useCallback(
    (edge: "from" | "to", ref: DateRef) => setRawFilters((f) => withRangeEdge(f, edge, ref)),
    [],
  );
  const clearRange = useCallback(() => setRawFilters(withRangeCleared), []);
  const togglePick = useCallback(
    (pick: PeriodPick) => setRawFilters((f) => withPickToggled(f, pick)),
    [],
  );
  const clearPicks = useCallback(() => setRawFilters(withPicksCleared), []);

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
      gridFrequency,
      setGridFrequency,
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
      importParsed,
      importError,
      importErrorDetails,
      dismissImportError,
      filters,
      setMetric,
      setChartScope,
      toggleCenterMark,
      clearCenterMarks,
      clearAllMarks,
      setPeriodMode,
      setRangeEdge,
      clearRange,
      togglePick,
      clearPicks,
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
      allYears,
      activeYear,
      setActiveYear,
      monthIndex,
      setMonthIndex,
      gridScope,
      setGridScope,
      gridFrequency,
      setGridFrequency,
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
      importParsed,
      importError,
      importErrorDetails,
      dismissImportError,
      filters,
      setMetric,
      setChartScope,
      toggleCenterMark,
      clearCenterMarks,
      clearAllMarks,
      setPeriodMode,
      setRangeEdge,
      clearRange,
      togglePick,
      clearPicks,
    ],
  );

  return (
    <OccupancyDataContext.Provider value={value}>
      {children}
      {/* Here, not in the Datos panel: the upload button sits in the tab bar, outside it. */}
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
            void commit(pending.results, pending.hotelName);
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
