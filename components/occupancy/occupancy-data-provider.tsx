"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { CenterLogos, EntityLogo } from "@/lib/workspaces";
import { consolidate } from "@/lib/occupancy/consolidate";
import * as occupancyDb from "@/lib/occupancy/db";
import { toAnnualGrid, toOccupancyGrid, type OccupancyGrid } from "@/lib/occupancy/derive";
import {
  deriveHotelIdentity,
  sameHotelIdentity,
  type HotelIdentity,
} from "@/lib/occupancy/hotel-identity";
import { findHotelForIdentity } from "@/lib/occupancy/hotels";
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
  DEFAULT_CENTER_ID,
  type CenterRow,
  type OccupancyDataset,
  type OccupancyParseResult,
} from "@/lib/occupancy/types";

const EMPTY_DATASETS: OccupancyDataset[] = [];
const EMPTY_HOTELS: occupancyDb.HotelSummary[] = [];

/**
 * What to do with an already parsed upload. `merge` is the normal case —the open hotel is empty or
 * the files are its own—; `clash` is the one that opens the three-exit dialog, and it carries
 * everything that dialog needs to decide its shape without reading a table again.
 */
export type ImportPlan =
  | { kind: "merge" }
  | { kind: "no-hotel" }
  | { kind: "mixed"; hotelNames: string[] }
  | {
      kind: "clash";
      current: HotelIdentity;
      incoming: HotelIdentity;
      /** The hotel that DOES have that identity, or `null`. It is what decides the main exit. */
      matching: occupancyDb.HotelSummary | null;
    };

interface OccupancyDataValue {
  datasets: OccupancyDataset[];
  /** Each hotel with what it holds — the selector's list. */
  hotels: occupancyDb.HotelSummary[];
  activeHotelId: string | null;
  activeHotel: occupancyDb.HotelSummary | undefined;
  /** The name the open hotel's files DECLARE; `undefined` if it has none yet. */
  hotelName: string | undefined;
  createHotel: (name: string) => Promise<string>;
  /** Changes the LABEL — name and logo — and nothing else. */
  updateHotel: (
    hotelId: string,
    name: string,
    logo: EntityLogo | null,
    centerLogos: CenterLogos | undefined,
  ) => Promise<void>;
  deleteHotel: (hotelId: string) => Promise<void>;
  selectHotel: (hotelId: string) => Promise<void>;
  centers: CenterRow[];
  activeCenterId: string | undefined;
  activeCenterName: string | undefined;
  isConsolidated: boolean;
  hasConsolidated: boolean;
  setActiveCenter: (centerId: string) => void;
  /** Years of the ACTIVE center; `allYears` is every year the hotel holds. */
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
  /**
   * What has to be done with an upload, decided BEFORE anything is written. The asker is the upload
   * modal, which is the one that can explain itself; the writers are the three functions below.
   */
  planImport: (results: OccupancyParseResult[]) => ImportPlan;
  /** Loads into the open hotel, or into `hotelId` — which also becomes the active hotel. */
  importParsed: (results: OccupancyParseResult[], hotelId?: string) => Promise<void>;
  /** Creates the hotel with that name and loads there. The only upload that creates a hotel. */
  importIntoNewHotel: (results: OccupancyParseResult[], name: string) => Promise<void>;
  /** Replaces ONLY the open hotel. The others are not touched. */
  replaceActiveHotel: (results: OccupancyParseResult[]) => Promise<void>;
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
  /** «Rango» (one span, with total and evolution) or «Días» (loose dates, one column each). */
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

/** The hotels the files of one upload declare, one per identity. */
function hotelsIn(results: OccupancyParseResult[]): OccupancyParseResult[] {
  return [...new Map(results.map((r) => [normalize(r.dataset.hotelName), r])).values()];
}

/**
 * Mounted in the dashboard layout so the header can name the hotel while the Datos panel
 * renders the grid.
 *
 * Everything it reads is bounded to the OPEN hotel, and always through `db.ts`: with several hotels
 * sharing one table, an unbounded query mixes two companies in silence and nothing below it can
 * tell.
 */
export function OccupancyDataProvider({ children }: { children: ReactNode }) {
  const hotelRows = useLiveQuery(() => occupancyDb.listHotelSummaries(), []);
  const activeHotelId = useLiveQuery(() => occupancyDb.getActiveHotelId(), []) ?? null;
  const stored = useLiveQuery(
    () =>
      activeHotelId
        ? occupancyDb.listDatasets(activeHotelId)
        : Promise.resolve<OccupancyDataset[]>(EMPTY_DATASETS),
    [activeHotelId],
  );
  /**
   * In-session selection; it wins over the persisted one while what it names still exists. It
   * carries its `hotelId` because each hotel remembers its OWN open sucursal-año: switching hotels
   * must not drag the previous selection onto data that does not exist there.
   */
  const [selected, setSelected] = useState<{
    hotelId: string;
    centerId?: string;
    year?: number;
  } | null>(null);
  const [monthIndex, setMonthIndex] = useState(0);
  // The month is kept while looking at the year, so coming back lands where you left.
  const [gridScope, setGridScope] = useState<"month" | "year">("month");
  const [gridFrequency, setRawGridFrequency] = useState<Frequency>("mensual");
  const [importError, setImportError] = useState<string | null>(null);
  const [importErrorDetails, setImportErrorDetails] = useState<string[]>([]);
  const [rawFilters, setRawFilters] = useState<OccupancyFilters>(emptyFilters);

  const hotels = hotelRows ?? EMPTY_HOTELS;
  const datasets = stored ?? EMPTY_DATASETS;
  const ready = hotelRows !== undefined && stored !== undefined;

  const activeHotel = useMemo(
    () => hotels.find((hotel) => hotel.id === activeHotelId),
    [hotels, activeHotelId],
  );
  const ownSelection = selected?.hotelId === activeHotelId ? selected : null;

  const centers = useMemo(() => occupancyDb.centersOf(datasets), [datasets]);
  // One center has nothing to consolidate with: the sum would just be itself.
  const hasConsolidated = centers.length > 1;

  // In-session, then persisted on the hotel, then the first — each only if it still exists, so
  // deleting a center cannot strand the view on nothing.
  const requestedCenter = ownSelection?.centerId ?? activeHotel?.activeCenterId;
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
    years.find((y) => y === ownSelection?.year) ??
    years.find((y) => y === activeHotel?.activeYear) ??
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
      canEdit && activeHotelId !== null && activeCenterId !== undefined && activeYear !== undefined
        ? { hotelId: activeHotelId, centerId: activeCenterId, year: activeYear }
        : undefined,
    [canEdit, activeHotelId, activeCenterId, activeYear],
  );

  const setActiveCenter = useCallback(
    (centerId: string) => {
      if (activeHotelId === null) {
        return;
      }
      // The year is deliberately left to resolve itself against the new center's own years.
      setSelected((current) => ({
        hotelId: activeHotelId,
        centerId,
        ...(current?.hotelId === activeHotelId && current.year !== undefined
          ? { year: current.year }
          : {}),
      }));
    },
    [activeHotelId],
  );

  const setActiveYear = useCallback(
    (year: number) => {
      if (activeHotelId === null) {
        return;
      }
      setSelected((current) => {
        const centerId = current?.centerId ?? activeCenterId;
        return { hotelId: activeHotelId, ...(centerId ? { centerId } : {}), year };
      });
      if (activeCenterId !== undefined && !isConsolidated) {
        void occupancyDb.saveActiveView({ hotelId: activeHotelId, centerId: activeCenterId, year });
      }
    },
    [activeHotelId, activeCenterId, isConsolidated],
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
      if (activeHotelId === null) {
        return;
      }
      // The consolidated view owns no year, so a blank one goes to the first center — and a hotel
      // with no sucursal yet gets `principal`, the same one a file with no cost-center line lands in.
      const centerId = isConsolidated ? centers[0]?.id : activeCenterId;
      const target = centerId ?? DEFAULT_CENTER_ID;
      await occupancyDb.addYear({ hotelId: activeHotelId, centerId: target, year });
      setSelected({ hotelId: activeHotelId, centerId: target, year });
    },
    [activeHotelId, activeCenterId, centers, isConsolidated],
  );

  const deleteYear = useCallback(
    async (year: number) => {
      if (activeHotelId === null || activeCenterId === undefined || isConsolidated) {
        return;
      }
      await occupancyDb.deleteYear({ hotelId: activeHotelId, centerId: activeCenterId, year });
      setSelected(null);
    },
    [activeHotelId, activeCenterId, isConsolidated],
  );

  const deleteCenter = useCallback(
    async (centerId: string) => {
      if (activeHotelId === null) {
        return;
      }
      await occupancyDb.deleteCenter(activeHotelId, centerId);
      setSelected(null);
    },
    [activeHotelId],
  );

  const createHotel = useCallback(async (name: string) => {
    const hotel = await occupancyDb.createHotel(name);
    setSelected(null);
    return hotel.id;
  }, []);

  const updateHotel = useCallback(
    (
      hotelId: string,
      name: string,
      logo: EntityLogo | null,
      centerLogos: CenterLogos | undefined,
    ) => occupancyDb.updateHotel(hotelId, name, logo, centerLogos),
    [],
  );

  const deleteHotel = useCallback(async (hotelId: string) => {
    await occupancyDb.deleteHotel(hotelId);
    setSelected(null);
  }, []);

  const selectHotel = useCallback(async (hotelId: string) => {
    await occupancyDb.setActiveHotel(hotelId);
    // Nothing of the previous hotel's selection carries over: it named data this one does not have.
    setSelected(null);
  }, []);

  /**
   * Where a load lands, decided before anything is written. The mixed-batch check is enforced here
   * too and not only in the modal: a half-applied mixed upload would leave two companies sharing one
   * hotel, and THIS is what writes.
   */
  const planImport = useCallback(
    (results: OccupancyParseResult[]): ImportPlan => {
      if (results.length === 0) {
        return { kind: "merge" };
      }
      const declared = hotelsIn(results);
      if (declared.length > 1) {
        return { kind: "mixed", hotelNames: declared.map((r) => r.dataset.hotelName) };
      }
      if (activeHotelId === null) {
        return { kind: "no-hotel" };
      }
      const incoming: HotelIdentity = { hotelName: results[0].dataset.hotelName };
      const current = deriveHotelIdentity(datasets);
      // An empty hotel has no identity: its first upload ADOPTS whatever it brings.
      if (!current || sameHotelIdentity(current, incoming)) {
        return { kind: "merge" };
      }
      const identities = Object.fromEntries(hotels.map((hotel) => [hotel.id, hotel.identity]));
      const match = findHotelForIdentity(hotels, identities, incoming);
      return {
        kind: "clash",
        current,
        incoming,
        matching: match ? (hotels.find((hotel) => hotel.id === match.id) ?? null) : null,
      };
    },
    [activeHotelId, datasets, hotels],
  );

  /** Lands the whole selection and leaves the view on the newest thing it wrote. */
  const commit = useCallback(async (hotelId: string, results: OccupancyParseResult[]) => {
    // Sequential, not parallel: each merge runs a Dexie transaction, and two overlapping ones
    // (two files landing the same center-year) would race on the same record.
    for (const parsed of results) {
      await occupancyDb.mergeParsedDataset(hotelId, parsed);
    }
    const newest = results.reduce<OccupancyParseResult | undefined>(
      (best, parsed) => (!best || parsed.dataset.year >= best.dataset.year ? parsed : best),
      undefined,
    );
    if (newest) {
      setSelected({
        hotelId,
        centerId: newest.dataset.centerId,
        year: newest.dataset.year,
      });
      setMonthIndex(newest.parsedMonths[0] ?? 0);
    }
  }, []);

  const importParsed = useCallback(
    async (results: OccupancyParseResult[], hotelId?: string) => {
      setImportError(null);
      setImportErrorDetails([]);
      if (results.length === 0) {
        return;
      }
      const plan = planImport(results);
      if (plan.kind === "mixed") {
        setImportError(
          `Los archivos son de hoteles distintos (${plan.hotelNames.join(", ")}); cárgalos por separado.`,
        );
        return;
      }
      const target = hotelId ?? activeHotelId;
      if (target === null) {
        setImportError("Crea un hotel antes de cargar un Excel de ocupación.");
        return;
      }
      // A named target is the clash dialog's «Cargar en <hotel>»: nothing is destroyed, the active
      // hotel simply moves to where the files belong.
      if (hotelId && hotelId !== activeHotelId) {
        await occupancyDb.setActiveHotel(hotelId);
      }
      await commit(target, results);
    },
    [activeHotelId, commit, planImport],
  );

  const importIntoNewHotel = useCallback(
    async (results: OccupancyParseResult[], name: string) => {
      setImportError(null);
      setImportErrorDetails([]);
      const hotel = await occupancyDb.createHotel(name);
      await commit(hotel.id, results);
    },
    [commit],
  );

  const replaceActiveHotel = useCallback(
    async (results: OccupancyParseResult[]) => {
      setImportError(null);
      setImportErrorDetails([]);
      if (activeHotelId === null) {
        return;
      }
      await occupancyDb.replaceHotel(activeHotelId, results);
      const newest = results.reduce<OccupancyParseResult | undefined>(
        (best, parsed) => (!best || parsed.dataset.year >= best.dataset.year ? parsed : best),
        undefined,
      );
      if (newest) {
        setSelected({
          hotelId: activeHotelId,
          centerId: newest.dataset.centerId,
          year: newest.dataset.year,
        });
        setMonthIndex(newest.parsedMonths[0] ?? 0);
      }
    },
    [activeHotelId],
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
      hotels,
      activeHotelId,
      activeHotel,
      hotelName: activeHotel?.identity?.hotelName,
      createHotel,
      updateHotel,
      deleteHotel,
      selectHotel,
      centers,
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
      planImport,
      importParsed,
      importIntoNewHotel,
      replaceActiveHotel,
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
      hotels,
      activeHotelId,
      activeHotel,
      createHotel,
      updateHotel,
      deleteHotel,
      selectHotel,
      centers,
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
      planImport,
      importParsed,
      importIntoNewHotel,
      replaceActiveHotel,
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

  return <OccupancyDataContext.Provider value={value}>{children}</OccupancyDataContext.Provider>;
}

export function useOccupancyData(): OccupancyDataValue {
  const context = useContext(OccupancyDataContext);
  if (!context) {
    throw new Error("useOccupancyData debe usarse dentro de <OccupancyDataProvider>.");
  }
  return context;
}
