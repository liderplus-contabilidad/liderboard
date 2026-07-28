"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  db,
  getWorkspaceMeta,
  replaceWorkspace,
  saveCellEdits,
  segmentWorkspace,
} from "@/lib/profit-loss/db";
import { canSegment, isSegmented, twinWriteFor } from "@/lib/profit-loss/segment";
import {
  allowedFrequencies,
  applyEditsToLeafAccounts,
  FREQUENCY_ORDER,
  mergeCenters,
} from "@/lib/profit-loss/derive";
import {
  accountOptions,
  collapsedForLevel,
  deepestLevel,
  type AccountOption,
} from "@/lib/profit-loss/filter";
import {
  canEditActiveCenter,
  clearFilters as clearAllFilters,
  CONSOLIDADO_ID,
  emptyFilters,
  resolveActiveCenterId,
  sanitizeFilters,
  seedCenterIds,
  withCenterToggled,
  withCentersCleared,
  withCodesCleared,
  withCodeToggled,
  withPeriodsCleared,
  withPeriodToggled,
  type FilterView,
  type PygFilters,
} from "@/lib/profit-loss/filters";
import { periodsForYear } from "@/lib/profit-loss/analytics/period";
import type { PeriodRef } from "@/lib/profit-loss/analytics/types";
import type { CellEdit, Frequency, PygDataset } from "@/lib/profit-loss/types";
import type { BuiltWorkspace } from "@/lib/profit-loss/workspace";
import { PygAnalyticsProvider } from "./pyg-analytics-provider";

const EMPTY_EDITS: CellEdit[] = [];
const EMPTY_DATASETS: PygDataset[] = [];
const CONSOLIDADO_COLOR = "#334155";

/** One entry in the "Centro de costos" filter: Consolidado, a center, or Sin-centro. */
export interface CenterView {
  id: string;
  name: string;
  color?: string;
  role: "consolidado" | "center" | "sin-centro" | "single";
  dataset: PygDataset;
  editable: boolean;
}

interface PygDataValue {
  dataset: PygDataset | undefined;
  edits: CellEdit[];
  frequency: Frequency;
  allowed: Frequency[];
  setFrequency: (frequency: Frequency) => void;
  /** "single" = a lone statement (no cost-center filter); "multi" = a workspace of centers. */
  mode: "single" | "multi";
  /** Selector entries (Consolidado + centers + Sin-centro); empty in single mode. */
  views: CenterView[];
  /** The resolved center — Consolidado when none or several are marked. */
  activeCenterId: string;
  commitWorkspace: (built: BuiltWorkspace) => Promise<void>;
  /** Whether the workspace already carries the non-operating block. Segmenting is one-way. */
  segmented: boolean;
  /** Whether some dataset still has a 5.2 subtree to split out. */
  segmentable: boolean;
  /** «Segmentar utilidad» — resolves with the datasets it could not segment, by name. */
  segment: () => Promise<string[]>;
  /** Workspace-level cuadre warnings (from meta). */
  warnings: string[];
  saveEdit: (
    code: string,
    monthIndex: number,
    value: number | null | undefined,
    comment: string,
  ) => Promise<void>;
  /** Depth of the deepest movement account across ALL files in the workspace; 0 with no
   * dataset. Bounds the "Nivel" filter options. */
  deepestLevel: number;
  /** Accounts of the resolved view as "Cuenta contable" options; [] with no dataset. */
  accountOptions: AccountOption[];
  /** The filter bar's single selection: marked accounts, centers and periods. */
  filters: PygFilters;
  toggleCode: (code: string) => void;
  toggleCenter: (centerId: string) => void;
  togglePeriod: (period: PeriodRef) => void;
  /** Each dropdown's own "Quitar selección" footer button. */
  clearCodes: () => void;
  /** "Todos (Consolidado)" — clears only the center marks. */
  clearCenters: () => void;
  clearPeriods: () => void;
  /** "Quitar todo" — clears every marked filter. */
  clearFilters: () => void;
  /** Whether Datos can edit the resolved center's values (one editable center marked, monthly
   * view). Datos names WHY not, since several causes can make this false. */
  canEdit: boolean;
  /** Datos tree collapse state; shared so the "Nivel" filter and per-row toggles agree. */
  collapsed: Set<string>;
  toggleCollapsed: (code: string) => void;
  setExpandLevel: (level: number | "all") => void;
}

const PygDataContext = createContext<PygDataValue | null>(null);

/**
 * Shared PyG data state: the active Dexie workspace (one or more datasets) + edits (live
 * queries), the selected view frequency, the filter bar's selection (accounts, centers,
 * periods), and the upload pipeline. Mounted in the dashboard layout because the header
 * (ActiveClient) and the module content consume it from different branches.
 *
 * The filter bar's raw state and the resolved center it implies are OWNED here, not in
 * `charts/`, so this provider never has to import from that layer (verified: it doesn't).
 */
export function PygDataProvider({ children }: { children: ReactNode }) {
  // toArray() (NOT orderBy("order")): IndexedDB indexes exclude rows whose key is undefined,
  // so `order`-less single/migrated datasets would vanish from an orderBy. buildViews sorts
  // centers by `order` itself.
  const datasets = useLiveQuery(() => db.datasets.toArray(), []) ?? EMPTY_DATASETS;
  const allEdits = useLiveQuery(() => db.edits.toArray(), []) ?? EMPTY_EDITS;
  const metaRow = useLiveQuery(() => getWorkspaceMeta(), []);

  // buildViews needs every center's edits so the computed Consolidado reflects them.
  const views = useMemo<CenterView[]>(() => buildViews(datasets, allEdits), [datasets, allEdits]);
  const mode: "single" | "multi" =
    views.length <= 1 && views[0]?.role === "single" ? "single" : "multi";

  // Every view's own account codes (parents included) — what `sanitizeFilters` prunes a marked
  // account against, and all this provider needs to stay out of the analytics/charts layers.
  const filterViews = useMemo<FilterView[]>(
    () =>
      views.map((view) => ({
        id: view.id,
        editable: view.editable,
        codes: view.dataset.accounts.map((account) => account.code),
      })),
    [views],
  );

  const [frequency, setFrequencyState] = useState<Frequency>("mensual");
  const [rawFilters, setRawFilters] = useState<PygFilters>(() => emptyFilters());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const workspaceYear = datasets.find((d) => d.year != null)?.year ?? 0;

  // Sanitizing on read rather than in an effect means the filters are NEVER out of step with
  // the workspace, the resolved center or the frequency — not even for the render in between.
  const filterContext = useMemo(
    () => ({ views: filterViews, year: workspaceYear, frequency }),
    [filterViews, workspaceYear, frequency],
  );
  const filters = useMemo(
    () => sanitizeFilters(rawFilters, filterContext),
    [rawFilters, filterContext],
  );

  const resolvedActiveId = resolveActiveCenterId(filters, filterViews);
  const activeView = views.find((v) => v.id === resolvedActiveId) ?? views[0];
  const dataset = activeView?.dataset;
  const canEdit = canEditActiveCenter(filters, filterViews) && frequency === "mensual";

  // Edits of the active view's dataset — for display (comments) and, on editable centers, values.
  // The synthetic Consolidado (id "consolidado") has no stored edits: they are already merged
  // into its accounts by buildViews.
  const datasetId = dataset?.id;
  const edits = useMemo(
    () => (datasetId ? allEdits.filter((e) => e.datasetId === datasetId) : EMPTY_EDITS),
    [allEdits, datasetId],
  );

  const base = dataset?.baseFrequency;
  const accounts = dataset?.accounts;
  const allowed = useMemo(() => (base ? allowedFrequencies(base) : [...FREQUENCY_ORDER]), [base]);

  // A NEW workspace (its set of dataset ids changed) resets to the base frequency; the filters
  // themselves are reset by `commitWorkspace`, which is the only path that changes datasets.
  const workspaceKey = datasets.map((d) => d.id).join("|");
  useEffect(() => {
    if (base) {
      setFrequencyState(base);
    }
  }, [workspaceKey, base]);
  useEffect(() => {
    setCollapsed(new Set());
  }, [workspaceKey]);

  // Switching to a coarser view (e.g. Sin-centro = anual) clamps the frequency into range.
  useEffect(() => {
    setFrequencyState((prev) => (allowed.includes(prev) ? prev : (base ?? prev)));
  }, [resolvedActiveId, allowed, base]);

  // The deepest movement account across ALL files in the workspace (not just the resolved
  // view) — so the Nivel options are stable across center tabs and reflect the deepest Excel.
  const deepest = useMemo(
    () => datasets.reduce((max, d) => Math.max(max, deepestLevel(d.accounts)), 0),
    [datasets],
  );
  const options = useMemo(() => (accounts ? accountOptions(accounts) : []), [accounts]);

  const setFrequency = useCallback(
    (next: Frequency) => {
      if (allowed.includes(next)) {
        setFrequencyState(next);
      }
    },
    [allowed],
  );

  const toggleCode = useCallback(
    (code: string) => {
      setRawFilters(
        withCodeToggled(
          filters,
          code,
          options.map((option) => option.code),
        ),
      );
    },
    [filters, options],
  );

  const toggleCenter = useCallback(
    (centerId: string) => {
      setRawFilters(
        withCenterToggled(
          filters,
          centerId,
          views.map((view) => view.id),
        ),
      );
    },
    [filters, views],
  );

  const togglePeriod = useCallback(
    (period: PeriodRef) => {
      setRawFilters(withPeriodToggled(filters, period, periodsForYear(workspaceYear, frequency)));
    },
    [filters, workspaceYear, frequency],
  );

  const clearCodes = useCallback(() => setRawFilters(withCodesCleared(filters)), [filters]);
  const clearCenters = useCallback(() => setRawFilters(withCentersCleared(filters)), [filters]);
  const clearPeriods = useCallback(() => setRawFilters(withPeriodsCleared(filters)), [filters]);
  const clearFilters = useCallback(() => setRawFilters(clearAllFilters()), []);

  const toggleCollapsed = useCallback((code: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const setExpandLevel = useCallback(
    (level: number | "all") => {
      setCollapsed(level === "all" ? new Set() : collapsedForLevel(accounts ?? [], level));
    },
    [accounts],
  );

  const commitWorkspace = useCallback(async (built: BuiltWorkspace) => {
    await replaceWorkspace(built.datasets, built.meta, built.commentsByDataset);
    // `replaceWorkspace` already persisted `built.meta.activeCenterId`; this only seeds the
    // in-memory filter selection from it (a real center marks it, the Consolidado marks none).
    setRawFilters({ ...emptyFilters(), centerIds: seedCenterIds(built.meta.activeCenterId) });
  }, []);

  const saveEdit = useCallback(
    async (code: string, monthIndex: number, value: number | null | undefined, comment: string) => {
      if (!dataset?.id || !activeView?.editable) {
        return;
      }
      const twin = twinWriteFor(dataset.accounts, edits, code, monthIndex, value);
      await saveCellEdits([
        {
          datasetId: dataset.id,
          code,
          monthIndex,
          ...(value !== undefined ? { value } : {}),
          ...(comment ? { comment } : {}),
        },
        ...(twin ? [{ datasetId: dataset.id, ...twin }] : []),
      ]);
    },
    [dataset?.id, dataset?.accounts, activeView?.editable, edits],
  );

  const segmented = useMemo(() => datasets.some((d) => isSegmented(d.accounts)), [datasets]);
  const segmentable = useMemo(() => datasets.some((d) => canSegment(d.accounts)), [datasets]);
  const segment = useCallback(async () => (await segmentWorkspace()).skipped, []);

  const value = useMemo<PygDataValue>(
    () => ({
      dataset,
      edits,
      frequency,
      allowed,
      setFrequency,
      mode,
      views,
      activeCenterId: resolvedActiveId,
      commitWorkspace,
      segmented,
      segmentable,
      segment,
      warnings: metaRow?.warnings ?? [],
      saveEdit,
      deepestLevel: deepest,
      accountOptions: options,
      filters,
      toggleCode,
      toggleCenter,
      togglePeriod,
      clearCodes,
      clearCenters,
      clearPeriods,
      clearFilters,
      canEdit,
      collapsed,
      toggleCollapsed,
      setExpandLevel,
    }),
    [
      dataset,
      edits,
      frequency,
      allowed,
      setFrequency,
      mode,
      views,
      resolvedActiveId,
      commitWorkspace,
      segmented,
      segmentable,
      segment,
      metaRow?.warnings,
      saveEdit,
      deepest,
      options,
      filters,
      toggleCode,
      toggleCenter,
      togglePeriod,
      clearCodes,
      clearCenters,
      clearPeriods,
      clearFilters,
      canEdit,
      collapsed,
      toggleCollapsed,
      setExpandLevel,
    ],
  );

  // The analytics provider lives in its own file but inside this tree, so the layout keeps a
  // single mount point and the content panel still reads one state for what to draw.
  return (
    <PygDataContext.Provider value={value}>
      <PygAnalyticsProvider allEdits={allEdits}>{children}</PygAnalyticsProvider>
    </PygDataContext.Provider>
  );
}

export function usePygData(): PygDataValue {
  const context = useContext(PygDataContext);
  if (!context) {
    throw new Error("usePygData debe usarse dentro de <PygDataProvider>.");
  }
  return context;
}

/**
 * Builds the selector views: single mode → the lone dataset; multi mode → Consolidado (a
 * computed sum of the monthly centers) + each center + Sin-centro. The Consolidado dataset is
 * synthetic (never persisted): its accounts are the column-wise sum of the centers.
 */
function buildViews(datasets: PygDataset[], allEdits: CellEdit[]): CenterView[] {
  if (datasets.length === 0) {
    return [];
  }
  const single = datasets.find((d) => d.role === "single");
  if (single && datasets.length === 1) {
    return [
      {
        id: single.id,
        name: single.companyName,
        role: "single",
        dataset: single,
        editable: single.baseFrequency !== "anual",
      },
    ];
  }

  const centers = datasets
    .filter((d) => d.role === "center")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const sin = datasets.find((d) => d.role === "sin-centro");
  const views: CenterView[] = [];

  if (centers.length > 0) {
    const merged = mergeCenters(
      centers.map((c) =>
        applyEditsToLeafAccounts(
          c.accounts,
          allEdits.filter((e) => e.datasetId === c.id),
        ),
      ),
    );
    const base = centers[0];
    const consolidated: PygDataset = {
      ...base,
      id: CONSOLIDADO_ID,
      role: "center",
      centerId: CONSOLIDADO_ID,
      costCenterName: undefined,
      accounts: merged.accounts,
      resultFromFile: [],
      warnings: [],
    };
    views.push({
      id: CONSOLIDADO_ID,
      name: "Consolidado",
      color: CONSOLIDADO_COLOR,
      role: "consolidado",
      dataset: consolidated,
      editable: false,
    });
  }

  for (const center of centers) {
    views.push({
      id: center.centerId as string,
      name: center.costCenterName || (center.centerId as string),
      color: center.centerColor,
      role: "center",
      dataset: center,
      editable: center.baseFrequency !== "anual",
    });
  }

  if (sin) {
    views.push({
      id: "sin-centro",
      name: "Sin centro de costo",
      color: sin.centerColor,
      role: "sin-centro",
      dataset: sin,
      editable: false,
    });
  }
  return views;
}
