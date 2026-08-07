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
import { detectReloadConflicts, type ReloadConflict } from "@/lib/profit-loss/conflicts";
import {
  applyMonthSlice,
  clientDatasets,
  clientEdits,
  consolidatedContributions,
  createClient as createClientRow,
  deleteClient as deleteClientRow,
  deleteYear,
  getActiveClientId,
  getWorkspaceMeta,
  listClientSummaries,
  mergeWorkspaceYears,
  renameClient as renameClientRow,
  replaceClientWorkspace,
  saveCellEdits,
  segmentWorkspace,
  setActiveClient,
  type ClientSummary,
} from "@/lib/profit-loss/db";
import {
  CONSOLIDATED_CLIENT_ID,
  consolidateClients,
  selectContributions,
  type ClientContribution,
  type ConsolidatedWorkspace,
} from "@/lib/profit-loss/consolidate";
import { canSegment, isSegmented, twinWriteFor } from "@/lib/profit-loss/segment";
import {
  allowedFrequencies,
  applyEditsToLeafAccounts,
  FREQUENCY_ORDER,
  mergeCenters,
  storedAdjustment,
  type YearSlice,
} from "@/lib/profit-loss/derive";
import {
  accountOptions,
  collapsedForLevel,
  deepestLevel,
  type AccountOption,
} from "@/lib/profit-loss/filter";
import {
  canEditActiveCenter,
  canEditActiveYear,
  clearFilters as clearAllFilters,
  CONSOLIDADO_ID,
  emptyFilters,
  periodSlots,
  resolveActiveCenterId,
  resolveVisibleYears,
  sanitizeFilters,
  seedCenterIds,
  withCenterToggled,
  withCentersCleared,
  withClientsCleared,
  withClientToggled,
  withCodesCleared,
  withCodeToggled,
  withPeriodsCleared,
  withPeriodToggled,
  withYearsCleared,
  withYearToggled,
  type FilterView,
  type PygFilters,
} from "@/lib/profit-loss/filters";
import type { PeriodSlot } from "@/lib/profit-loss/analytics/types";
import {
  type AccountRow,
  type CellEdit,
  type Frequency,
  type ParsedDataset,
  type PygDataset,
  type WorkspaceMeta,
} from "@/lib/profit-loss/types";
import { applyBatch, type MonthSlice } from "@/lib/profit-loss/upload/batch";
import { LEGACY_SYSTEM } from "@/lib/profit-loss/upload/systems";
import type { BuiltWorkspace } from "@/lib/profit-loss/workspace";
import {
  compareIdentity,
  deriveWorkspaceIdentity,
  type WorkspaceIdentity,
} from "@/lib/profit-loss/workspace-identity";
import { PygAnalyticsProvider } from "./pyg-analytics-provider";

const EMPTY_EDITS: CellEdit[] = [];
const EMPTY_DATASETS: PygDataset[] = [];
const EMPTY_CLIENTS: ClientSummary[] = [];
const EMPTY_COVERAGE: Record<number, number[]> = {};
const EMPTY_SLICES: YearSlice[] = [];
const EMPTY_CONTRIBUTIONS: ClientContribution[] = [];
const EMPTY_CONTRIBUTORS: string[] = [];
const EMPTY_CLIENT_IDS: string[] = [];
const EMPTY_MONTHS: number[] = [];
const EMPTY_WARNINGS: string[] = [];
const CONSOLIDADO_COLOR = "#334155";

export interface MonthlyBatchOutcome {
  datasets: ParsedDataset[];
  /** The workspace's coverage after the batch, per year. */
  loadedMonthsByYear: Record<number, number[]>;
  /** The years the batch brought, ascending — what the summary groups by. */
  years: number[];
  warnings: string[];
  conflicts: ReloadConflict[];
}

/** One entry in the "Centro de costos" filter: Consolidado, a center, or Sin-centro. */
export interface CenterView {
  id: string;
  name: string;
  /**
   * Owner of this view within the consolidated clients. Undefined elsewhere.
   */
  group?: string;
  /**
   * Short name without the client. Used under the group header.
   */
  shortName?: string;
  color?: string;
  role: "consolidado" | "center" | "sin-centro" | "single";
  /**
   * This center across the VISIBLE years, ascending — what Datos lays side by side. Each slice
   * carries its own year's edits, so an adjustment never leaks between years.
   */
  slices: YearSlice[];
  /**
   * The single year charts, exports and the ficha read: the resolved one, or the most recent
   * when several are visible. Opening those to real multi-year series is a later change; until
   * then this is what keeps them behaving exactly as they do with one year loaded.
   */
  dataset: PygDataset;
  editable: boolean;
}

interface PygDataValue {
  /** Every client, by name, with what each one holds — the selector's list. */
  clients: ClientSummary[];
  /** The open client, or `null` with none (a new install, or the last one just deleted). */
  activeClientId: string | null;
  /** The open client's entry, for whoever needs its name without looking it up. `undefined` on the
   * consolidado, which is not a client. */
  activeClient: ClientSummary | undefined;
  /**
   * Whether what is open is the CONSOLIDADO ENTRE CLIENTES — the sum of every client, derived on
   * read and never stored. Everything that writes is off while it is; everything that reads works
   * unchanged, because it arrives as an ordinary read-only single statement.
   */
  isConsolidated: boolean;
  /** Whether the consolidado can be offered at all: two or more clients WITH data. */
  consolidatable: boolean;
  /** The clients the consolidado is summing, by name; `[]` outside it. */
  contributors: string[];
  /** Las opciones del filtro «Cliente» — todos los que el consolidado PODRÍA sumar. `[]` fuera. */
  clientOptions: { id: string; name: string }[];
  /** Creates an EMPTY client and opens it. Rejects nothing: the caller validates the name with
   * `clients.ts` where it can say what is wrong. */
  createClient: (name: string) => Promise<string>;
  renameClient: (clientId: string, name: string) => Promise<void>;
  /** Deletes a client with everything it holds; the first remaining one BY NAME takes over. */
  deleteClient: (clientId: string) => Promise<void>;
  selectClient: (clientId: string) => Promise<void>;
  dataset: PygDataset | undefined;
  /** Every dataset in the current workspace — what a monthly batch merges onto. */
  datasets: PygDataset[];
  edits: CellEdit[];
  frequency: Frequency;
  allowed: Frequency[];
  setFrequency: (frequency: Frequency) => void;
  /** "single" = a lone statement (no cost-center filter); "multi" = a workspace of centers. */
  mode: "single" | "multi";
  /** Selector entries (Consolidado + centers + Sin-centro); empty in single mode. */
  views: CenterView[];
  /** The resolved view across the visible years — what Datos lays side by side. */
  activeSlices: YearSlice[];
  /** The resolved center — Consolidado when none or several are marked. */
  activeCenterId: string;
  /** Every year the workspace holds, ascending. */
  loadedYears: number[];
  /** The years Datos lays side by side: the marked ones, or all of them when none is marked. */
  visibleYears: number[];
  /** The single year charts, exports and the ficha read — the most recent visible one. */
  chartYear: number;
  /**
   * Declared coverage of `chartYear` — the year the analytics sources are built for, since a
   * `CenterView.dataset` is `latestOf(slices)`. It is NOT `visibleYears[0]`: with 2025 and 2026
   * both on screen, that is 2025, and handing 2025's twelve months to 2026's numbers marks
   * julio–diciembre as covered there. The engine then reads them as loaded-and-zero instead of
   * never-loaded, which is the one distinction the whole module rests on: `lastCoveredIndex`
   * lands on «Dic», and every tile and card of Gráficos and Análisis speaks about a month with
   * nothing in it. `[]` in single mode.
   */
  loadedMonths: number[];
  /** Declared coverage of every year, for the export and the upload summary. */
  loadedMonthsByYear: Record<number, number[]>;
  /** The loaded workspace's (sistema, empresa, modo) — `null` when empty. What a dropped batch's
   * own identity is compared against (`compareIdentity`) before the modal decides whether to
   * merge it in directly or ask for a replace confirmation first. The YEAR is not part of it:
   * another year merges in without asking. */
  workspaceIdentity: WorkspaceIdentity | null;
  /** The system the workspace came from (`upload/systems.ts`) — what decides whether the app can
   * write its raw format back. `null` with no workspace loaded. */
  sourceSystemId: string | null;
  commitWorkspace: (built: BuiltWorkspace) => Promise<void>;
  /** Whether the workspace already carries the non-operating block. Segmenting is one-way. */
  segmented: boolean;
  /** Whether some dataset still has a 5.2 subtree to split out. */
  segmentable: boolean;
  /** «Segmentar gastos» — resolves with the datasets it could not segment, by name. */
  segment: () => Promise<string[]>;
  /**
   * Merges a validated month-slice batch (either mode) onto the CURRENT workspace — one write,
   * edits untouched. A batch may span several years; each lands on its own. Throws if the batch
   * repeats a `(año, mes)` pair, or if its identity (sistema, empresa, modo) doesn't match what's
   * already loaded (the caller must confirm and use `replaceMonthlyWorkspace` instead — see the
   * modal, which owns that confirmation).
   */
  commitMonthlyBatch: (slices: MonthSlice[]) => Promise<MonthlyBatchOutcome>;
  /** Deletes a year — its datasets, its adjustments and its coverage. Resolves with how many
   * adjustments went with it. */
  removeYear: (year: number) => Promise<number>;
  /** Starts a brand-new workspace (either mode) for a different identity in the ACTIVE CLIENT,
   * discarding its statement and its adjustments — the destructive path the clash dialog gates
   * behind an explicit confirmation, and now its SECONDARY action. No other client is touched. */
  replaceMonthlyWorkspace: (
    slices: MonthSlice[],
  ) => Promise<Omit<MonthlyBatchOutcome, "conflicts">>;
  /** «Crear cliente y cargar» — the clash dialog's primary action when no client matches. */
  createClientWithBatch: (
    name: string,
    slices: MonthSlice[],
  ) => Promise<Omit<MonthlyBatchOutcome, "conflicts">>;
  /** «Cargar en \<cliente\>» — the clash dialog's primary action when one does. */
  commitBatchIntoClient: (
    clientId: string,
    slices: MonthSlice[],
  ) => Promise<Omit<MonthlyBatchOutcome, "conflicts">>;
  /** Workspace-level cuadre warnings (from meta). */
  warnings: string[];
  /**
   * Saves a cell. Resolves with the TWIN cell a reclassification also moved (inside 5.2), so
   * the table can point at what changed out of sight; `null` when the edit moved nothing else.
   */
  saveEdit: (
    code: string,
    monthIndex: number,
    value: number | null | undefined,
    comment: string,
  ) => Promise<{ code: string; monthIndex: number } | null>;
  /** Depth of the deepest movement account across ALL files in the workspace; 0 with no
   * dataset. Bounds the "Nivel" filter options. */
  deepestLevel: number;
  /** Accounts of the resolved view as "Cuenta contable" options; [] with no dataset. */
  accountOptions: AccountOption[];
  /** The filter bar's single selection: marked accounts, centers, years and periods. */
  filters: PygFilters;
  toggleCode: (code: string) => void;
  toggleCenter: (centerId: string) => void;
  /** Marca o desmarca un cliente del consolidado. Ninguno marcado = todos. */
  toggleClient: (clientId: string) => void;
  toggleYear: (year: number) => void;
  togglePeriod: (period: PeriodSlot) => void;
  /** Each dropdown's own "Quitar selección" footer button. */
  clearCodes: () => void;
  clearYears: () => void;
  /** "Todos (Consolidado)" — clears only the center marks. */
  clearCenters: () => void;
  /** «Todos los clientes» — vuelve a sumarlos todos. */
  clearClients: () => void;
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
  hideZeroRows: boolean;
  toggleHideZeroRows: () => void;
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
  // Every read is bounded by the open client. `db.ts` owns the queries — a `toArray()` here
  // would return every client's rows at once, and nothing downstream could tell.
  const clients = useLiveQuery(() => listClientSummaries(), []) ?? EMPTY_CLIENTS;
  const activeClientId = useLiveQuery(() => getActiveClientId(), []) ?? null;
  // El consolidado entre clientes es una ENTRADA del selector, no una fila de `clients`. Vive en
  // la misma tabla `active`, que es lo que le da sobrevivir al reload sin ningún estado extra.
  const isConsolidated = activeClientId === CONSOLIDATED_CLIENT_ID;
  // El cliente abierto acota cada lectura. Con el consolidado abierto no hay ninguno, y las tres
  // consultas quedan vacías para que ni una fila de un cliente concreto se cuele en la suma.
  const openClientId = isConsolidated ? null : activeClientId;
  const ownDatasets =
    useLiveQuery(
      () => (openClientId ? clientDatasets(openClientId) : Promise.resolve(EMPTY_DATASETS)),
      [openClientId],
    ) ?? EMPTY_DATASETS;
  const ownEdits =
    useLiveQuery(
      () => (openClientId ? clientEdits(openClientId) : Promise.resolve(EMPTY_EDITS)),
      [openClientId],
    ) ?? EMPTY_EDITS;
  const metaRow = useLiveQuery(
    () => (openClientId ? getWorkspaceMeta(openClientId) : Promise.resolve(undefined)),
    [openClientId],
  );
  const [frequency, setFrequencyState] = useState<Frequency>("mensual");
  const [rawFilters, setRawFilters] = useState<PygFilters>(() => emptyFilters());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hideZeroRows, setHideZeroRows] = useState(false);

  // La única lectura cruzada, y solo mientras el consolidado está abierto.
  const contributions =
    useLiveQuery(
      () => (isConsolidated ? consolidatedContributions() : Promise.resolve(EMPTY_CONTRIBUTIONS)),
      [isConsolidated],
    ) ?? EMPTY_CONTRIBUTIONS;
  // Qué clientes puede sumar el consolidado — el universo del filtro «Cliente», y contra lo que
  // `sanitizeFilters` poda una marca. `[]` fuera del consolidado, que es lo que hace que la marca
  // no sobreviva a volver a un cliente concreto.
  const consolidatableIds = useMemo(
    () =>
      isConsolidated
        ? contributions.filter((c) => c.datasets.length > 0).map((c) => c.clientId)
        : EMPTY_CLIENT_IDS,
    [isConsolidated, contributions],
  );
  // Las opciones del filtro, ya con el nombre que el usuario le puso a cada cliente.
  const clientOptions = useMemo(
    () =>
      consolidatableIds.map((id) => ({
        id,
        name: contributions.find((c) => c.clientId === id)?.name ?? id,
      })),
    [consolidatableIds, contributions],
  );
  // La selección se aplica ANTES de sumar: el consolidado es lo que quedó dentro, no un total al
  // que después se le descuenta. Vale para las dos marcas — clientes y (cliente · centro) —, y por
  // eso llegan las CRUDAS: `filters` se sanea contra las vistas, que es lo que esto produce.
  const consolidated = useMemo<ConsolidatedWorkspace | null>(
    () =>
      isConsolidated
        ? consolidateClients(
            selectContributions(contributions, rawFilters.clientIds),
            rawFilters.centerIds,
          )
        : null,
    [isConsolidated, contributions, rawFilters.clientIds, rawFilters.centerIds],
  );

  // A partir de aquí el consolidado ES el workspace: un estado único de solo lectura, con sus
  // años y su cobertura. Nada aguas abajo —Datos, Gráficos, Análisis, la ficha— sabe la
  // diferencia, que es exactamente el punto.
  const datasets = consolidated?.datasets ?? ownDatasets;
  // Los ajustes de cada cliente ya están plegados en las cuentas sumadas; volver a aplicarlos
  // aquí los contaría dos veces.
  const allEdits = consolidated ? EMPTY_EDITS : ownEdits;
  const loadedMonthsByYear =
    consolidated?.loadedMonthsByYear ?? metaRow?.loadedMonthsByYear ?? EMPTY_COVERAGE;
  const workspaceWarnings = consolidated?.warnings ?? metaRow?.warnings ?? EMPTY_WARNINGS;
  // Ofrecible con dos o más clientes CON datos: `years` está vacío mientras uno esté vacío, así
  // que la lista del selector ya lo sabe y no hace falta una consulta más.
  const consolidatable = useMemo(
    () => clients.filter((client) => client.years.length > 0).length >= 2,
    [clients],
  );

  // Every year the workspace holds, read off the datasets rather than the metadata: the datasets
  // ARE the workspace, so the two can never disagree about which years exist.
  //
  // En el consolidado el universo son los años de los CLIENTES, no los de la suma acotada: marcar
  // un centro que solo tiene 2026 no puede borrar 2025 del filtro de años ni de la lista de
  // centros, que es justamente de donde hay que desmarcarlo para volver.
  const loadedYears = useMemo(() => {
    const years = new Set(datasets.map((d) => d.year));
    for (const dataset of consolidated?.centerDatasets ?? EMPTY_DATASETS) {
      years.add(dataset.year);
    }
    return [...years].sort((a, b) => a - b);
  }, [datasets, consolidated]);
  // Resolved before the views, because which years are on screen decides which datasets they
  // span. `resolveVisibleYears` prunes marks against `loadedYears` itself, so this never lags a
  // deleted year.
  const visibleYears = useMemo(
    () => resolveVisibleYears(rawFilters, loadedYears),
    [rawFilters, loadedYears],
  );

  // buildViews needs every center's edits so the computed Consolidado reflects them.
  const views = useMemo<CenterView[]>(() => {
    if (consolidated) {
      return buildConsolidatedViews(consolidated, visibleYears);
    }
    return buildViews(datasets, allEdits, visibleYears);
  }, [consolidated, datasets, allEdits, visibleYears]);
  const mode: "single" | "multi" =
    views.length <= 1 && views[0]?.role === "single" ? "single" : "multi";

  // Every view's account codes (parents included), UNIONED over the visible years — what
  // `sanitizeFilters` prunes a marked account against. The union is what lets a cuenta that only
  // 2025 reports survive while 2025 is on screen.
  const filterViews = useMemo<FilterView[]>(
    () =>
      views.map((view) => ({
        id: view.id,
        editable: view.editable,
        codes: [
          ...new Set(view.slices.flatMap((slice) => slice.dataset.accounts.map((a) => a.code))),
        ],
      })),
    [views],
  );

  // The single year charts, exports and the ficha read (decision 12): the resolved one, or the
  // most recent when several are visible.
  const chartYear = visibleYears[visibleYears.length - 1] ?? 0;

  // A workspace's mode is never mixed (centers-mode and single-mode datasets never coexist —
  // every write path that could mix them is rejected before it writes), so which role is
  // present decides it.
  // `null` en el consolidado: no viene de ningún sistema contable —puede venir de varios a la
  // vez—, y eso es lo que apaga «un mes en crudo», que solo tiene sentido sobre un formato.
  const sourceSystemId =
    !isConsolidated && datasets.length > 0 ? (metaRow?.sourceSystemId ?? LEGACY_SYSTEM) : null;

  // The ACTIVE CLIENT's identity, derived exactly as every other client's is
  // (`listClientSummaries` uses the same function) — `null` while the client is empty, which is
  // what makes a first upload adopt instead of clash.
  // `null` en el consolidado: una suma de empresas no tiene razón social ni sistema propios, y
  // dejarle una identidad la haría comparable contra la de un archivo — que es justo lo que
  // decide dónde aterriza una carga.
  const workspaceIdentity: WorkspaceIdentity | null = useMemo(
    () => (isConsolidated ? null : deriveWorkspaceIdentity(datasets, metaRow)),
    [isConsolidated, datasets, metaRow],
  );

  // Sanitizing on read rather than in an effect means the filters are NEVER out of step with
  // the workspace, the resolved center or the frequency — not even for the render in between.
  const filterContext = useMemo(
    () => ({ views: filterViews, loadedYears, clients: consolidatableIds, frequency }),
    [filterViews, loadedYears, consolidatableIds, frequency],
  );
  const filters = useMemo(
    () => sanitizeFilters(rawFilters, filterContext),
    [rawFilters, filterContext],
  );

  const resolvedActiveId = resolveActiveCenterId(filters, filterViews);
  const activeView = views.find((v) => v.id === resolvedActiveId) ?? views[0];
  const dataset = activeView?.dataset;
  // Editing needs all three: one editable center, one year on screen, and the concrete monthly
  // view. Each is a different way for a cell to be ambiguous, so each is checked on its own and
  // Datos names whichever one is failing.
  const canEdit =
    !isConsolidated &&
    canEditActiveCenter(filters, filterViews) &&
    canEditActiveYear(filters, loadedYears) &&
    frequency === "mensual";

  // Edits of the active view's dataset — for display (comments) and, on editable centers, values.
  // The synthetic Consolidado (id "consolidado") has no stored edits: they are already merged
  // into its accounts by buildViews.
  const datasetId = dataset?.id;
  const edits = useMemo(
    () => (datasetId ? allEdits.filter((e) => e.datasetId === datasetId) : EMPTY_EDITS),
    [allEdits, datasetId],
  );

  const base = dataset?.baseFrequency;
  // The "Cuenta contable" universe is the union over the visible years, so an account that only
  // one of them reports is still offerable while that year is on screen.
  const accounts = useMemo(() => {
    if (!activeView) {
      return undefined;
    }
    const byCode = new Map<string, AccountRow>();
    for (const slice of activeView.slices) {
      for (const account of slice.dataset.accounts) {
        if (!byCode.has(account.code)) {
          byCode.set(account.code, account);
        }
      }
    }
    return [...byCode.values()];
  }, [activeView]);
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

  const toggleClient = useCallback(
    (clientId: string) => {
      setRawFilters(withClientToggled(filters, clientId, consolidatableIds));
    },
    [filters, consolidatableIds],
  );

  const toggleYear = useCallback(
    (year: number) => {
      setRawFilters(withYearToggled(filters, year, loadedYears));
    },
    [filters, loadedYears],
  );

  const togglePeriod = useCallback(
    (period: PeriodSlot) => {
      setRawFilters(withPeriodToggled(filters, period, periodSlots(frequency)));
    },
    [filters, frequency],
  );

  const clearCodes = useCallback(() => setRawFilters(withCodesCleared(filters)), [filters]);
  const clearCenters = useCallback(() => setRawFilters(withCentersCleared(filters)), [filters]);
  const clearClients = useCallback(() => setRawFilters(withClientsCleared(filters)), [filters]);
  const clearYears = useCallback(() => setRawFilters(withYearsCleared(filters)), [filters]);
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

  const toggleHideZeroRows = useCallback(() => setHideZeroRows((prev) => !prev), []);

  const commitWorkspace = useCallback(
    async (built: BuiltWorkspace) => {
      if (!openClientId) {
        return;
      }
      // MERGES by year rather than replacing, INTO THE OPEN CLIENT: the years this file does not
      // carry survive, and no other client is reachable from here whatever the file's metadata
      // sheet declares.
      await mergeWorkspaceYears(openClientId, built.datasets, built.meta, built.commentsByDataset);
      // The write already persisted `built.meta.activeCenterId`; this only seeds the in-memory
      // filter selection from it (a real center marks it, the Consolidado marks none).
      setRawFilters({
        ...emptyFilters(),
        centerIds: seedCenterIds(built.meta.activeCenterId),
        // Same rule as a monthly batch: what just arrived is what the reader wants to look at.
        years: [...new Set(built.datasets.map((dataset) => dataset.year))].sort((a, b) => a - b),
      });
    },
    [openClientId],
  );

  const commitMonthlyBatch = useCallback(
    async (slices: MonthSlice[]): Promise<MonthlyBatchOutcome> => {
      if (!openClientId) {
        throw new Error("Crea un cliente antes de cargar datos.");
      }
      const batchMode = slices[0]?.mode;
      const relevant = datasets.filter((d) =>
        batchMode === "single"
          ? d.role === "single"
          : d.role === "center" || d.role === "sin-centro",
      );
      const batchIdentity: WorkspaceIdentity | null =
        slices[0] && batchMode
          ? {
              system: slices[0].system,
              companyName: slices[0].companyName,
              mode: batchMode,
            }
          : null;
      if (
        workspaceIdentity &&
        batchIdentity &&
        compareIdentity(workspaceIdentity, batchIdentity).length > 0
      ) {
        // The modal is expected to have already routed a mismatched batch through
        // `replaceMonthlyWorkspace` after an explicit confirmation — this only guards against
        // ever silently mixing identities into the same workspace.
        throw new Error("El archivo no coincide con la identidad del workspace cargado.");
      }
      const result = applyBatch(relevant, metaRow?.loadedMonthsByYear ?? EMPTY_COVERAGE, slices);
      const batchYears = [...new Set(slices.map((s) => s.year))].sort((a, b) => a - b);
      const conflicts = detectReloadConflicts(
        relevant,
        result.datasets,
        slices.map((s) => ({ year: s.year, month: s.month })),
        allEdits,
      );
      const nextMeta: WorkspaceMeta = {
        companyName: result.datasets[0]?.companyName || metaRow?.companyName || "",
        warnings: result.warnings,
        activeCenterId:
          batchMode === "single"
            ? (result.datasets[0]?.id ?? CONSOLIDADO_ID)
            : (metaRow?.activeCenterId ?? CONSOLIDADO_ID),
        loadedMonthsByYear: result.loadedMonthsByYear,
        // Identity was just checked, so the batch's system IS the workspace's.
        sourceSystemId: slices[0]?.system ?? metaRow?.sourceSystemId ?? LEGACY_SYSTEM,
      };
      await applyMonthSlice(openClientId, result.datasets, nextMeta);
      // Marking what just arrived: loading a month is the clearest statement of which year the
      // user wants to look at, and without this a second year would land the table in read-only
      // right after the action that asked to edit it.
      setRawFilters((prev) => ({ ...prev, years: batchYears }));
      return {
        datasets: result.datasets,
        loadedMonthsByYear: result.loadedMonthsByYear,
        years: batchYears,
        warnings: result.warnings,
        conflicts,
      };
    },
    [openClientId, datasets, metaRow, allEdits, workspaceIdentity],
  );

  const replaceMonthlyWorkspace = useCallback(
    async (slices: MonthSlice[], clientId: string = openClientId ?? "") => {
      if (!clientId) {
        throw new Error("Crea un cliente antes de cargar datos.");
      }
      const result = applyBatch([], {}, slices);
      const batchYears = [...new Set(slices.map((s) => s.year))].sort((a, b) => a - b);
      const meta: WorkspaceMeta = {
        companyName: result.datasets[0]?.companyName || "",
        warnings: result.warnings,
        activeCenterId:
          slices[0]?.mode === "single" ? (result.datasets[0]?.id ?? "") : CONSOLIDADO_ID,
        loadedMonthsByYear: result.loadedMonthsByYear,
        sourceSystemId: slices[0]?.system ?? LEGACY_SYSTEM,
      };
      // Only THIS client is emptied. Its comments survive on the accounts the new file also
      // brings — see `replaceClientWorkspace`.
      await replaceClientWorkspace(clientId, result.datasets, meta);
      setRawFilters({ ...emptyFilters(), years: batchYears });
      return {
        datasets: result.datasets,
        loadedMonthsByYear: result.loadedMonthsByYear,
        years: batchYears,
        warnings: result.warnings,
      };
    },
    [openClientId],
  );

  /**
   * Creates a client, opens it and loads the batch there — the clash dialog's «Crear cliente y
   * cargar». The client is born empty, so the load ADOPTS the file's identity and nothing can
   * clash; the client that was open is not touched.
   */
  const createClientWithBatch = useCallback(
    async (name: string, slices: MonthSlice[]) => {
      const client = await createClientRow(name);
      return replaceMonthlyWorkspace(slices, client.id);
    },
    [replaceMonthlyWorkspace],
  );

  /** «Cargar en \<cliente\>» — opens the client that DOES match and loads there, merging onto
   * whatever it already holds. Nothing is replaced: the identities agree by construction. */
  const commitBatchIntoClient = useCallback(async (clientId: string, slices: MonthSlice[]) => {
    const [existing, meta] = await Promise.all([
      clientDatasets(clientId),
      getWorkspaceMeta(clientId),
    ]);
    const batchMode = slices[0]?.mode;
    const relevant = existing.filter((d) =>
      batchMode === "single" ? d.role === "single" : d.role === "center" || d.role === "sin-centro",
    );
    const result = applyBatch(relevant, meta?.loadedMonthsByYear ?? EMPTY_COVERAGE, slices);
    const batchYears = [...new Set(slices.map((s) => s.year))].sort((a, b) => a - b);
    await applyMonthSlice(clientId, result.datasets, {
      companyName: result.datasets[0]?.companyName || meta?.companyName || "",
      warnings: result.warnings,
      activeCenterId:
        batchMode === "single"
          ? (result.datasets[0]?.id ?? CONSOLIDADO_ID)
          : (meta?.activeCenterId ?? CONSOLIDADO_ID),
      loadedMonthsByYear: result.loadedMonthsByYear,
      sourceSystemId: slices[0]?.system ?? meta?.sourceSystemId ?? LEGACY_SYSTEM,
    });
    await setActiveClient(clientId);
    setRawFilters({ ...emptyFilters(), years: batchYears });
    return {
      datasets: result.datasets,
      loadedMonthsByYear: result.loadedMonthsByYear,
      years: batchYears,
      warnings: result.warnings,
    };
  }, []);

  const removeYear = useCallback(
    async (year: number) => {
      if (!openClientId) {
        return 0;
      }
      const { deletedEdits } = await deleteYear(openClientId, year);
      setRawFilters((prev) => ({ ...prev, years: prev.years.filter((y) => y !== year) }));
      return deletedEdits;
    },
    [openClientId],
  );

  const createClient = useCallback(async (name: string) => (await createClientRow(name)).id, []);
  const renameClient = useCallback(
    (clientId: string, name: string) => renameClientRow(clientId, name),
    [],
  );
  const deleteClient = useCallback((clientId: string) => deleteClientRow(clientId), []);
  const selectClient = useCallback((clientId: string) => setActiveClient(clientId), []);

  const saveEdit = useCallback(
    async (code: string, monthIndex: number, value: number | null | undefined, comment: string) => {
      if (!dataset?.id || !activeView?.editable) {
        return null;
      }
      const twin = twinWriteFor(dataset.accounts, edits, code, monthIndex, value);
      const adjustment = storedAdjustment(dataset.accounts, code, monthIndex, value);
      const twinAdjustment = twin
        ? storedAdjustment(dataset.accounts, twin.code, twin.monthIndex, twin.value)
        : undefined;
      await saveCellEdits([
        {
          datasetId: dataset.id,
          code,
          monthIndex,
          ...(adjustment !== undefined ? { value: adjustment } : {}),
          ...(comment ? { comment } : {}),
        },
        ...(twin
          ? [
              {
                datasetId: dataset.id,
                code: twin.code,
                monthIndex: twin.monthIndex,
                ...(twinAdjustment !== undefined ? { value: twinAdjustment } : {}),
                ...(twin.comment ? { comment: twin.comment } : {}),
              },
            ]
          : []),
      ]);
      return twin && { code: twin.code, monthIndex: twin.monthIndex };
    },
    [dataset?.id, dataset?.accounts, activeView?.editable, edits],
  );

  const segmented = useMemo(() => datasets.some((d) => isSegmented(d.accounts)), [datasets]);
  // Segmentar reescribe cada dataset del cliente: sobre el consolidado no habría a quién.
  const segmentable = useMemo(
    () => !isConsolidated && datasets.some((d) => canSegment(d.accounts)),
    [isConsolidated, datasets],
  );
  const segment = useCallback(
    async () => (openClientId ? (await segmentWorkspace(openClientId)).skipped : []),
    [openClientId],
  );

  const activeClient = useMemo(
    () => clients.find((client) => client.id === activeClientId),
    [clients, activeClientId],
  );

  const value = useMemo<PygDataValue>(
    () => ({
      clients,
      activeClientId,
      activeClient,
      isConsolidated,
      consolidatable,
      contributors: consolidated?.contributors ?? EMPTY_CONTRIBUTORS,
      clientOptions,
      createClient,
      renameClient,
      deleteClient,
      selectClient,
      dataset,
      datasets,
      edits,
      frequency,
      allowed,
      setFrequency,
      mode,
      views,
      activeSlices: activeView?.slices ?? EMPTY_SLICES,
      activeCenterId: resolvedActiveId,
      loadedYears,
      visibleYears,
      chartYear,
      // La cobertura del año que leen las series, que es `chartYear` — ver el campo. Datos no
      // usa esta lista: cada columna resuelve la cobertura de SU año contra el registro.
      loadedMonths: loadedMonthsByYear[chartYear] ?? EMPTY_MONTHS,
      loadedMonthsByYear,
      workspaceIdentity,
      sourceSystemId,
      commitWorkspace,
      segmented,
      segmentable,
      segment,
      commitMonthlyBatch,
      replaceMonthlyWorkspace,
      createClientWithBatch,
      commitBatchIntoClient,
      removeYear,
      warnings: workspaceWarnings,
      saveEdit,
      deepestLevel: deepest,
      accountOptions: options,
      filters,
      toggleCode,
      toggleCenter,
      toggleClient,
      toggleYear,
      togglePeriod,
      clearCodes,
      clearCenters,
      clearClients,
      clearYears,
      clearPeriods,
      clearFilters,
      canEdit,
      collapsed,
      toggleCollapsed,
      setExpandLevel,
      hideZeroRows,
      toggleHideZeroRows,
    }),
    [
      clients,
      activeClientId,
      activeClient,
      isConsolidated,
      consolidatable,
      consolidated,
      clientOptions,
      createClient,
      renameClient,
      deleteClient,
      selectClient,
      dataset,
      datasets,
      edits,
      frequency,
      allowed,
      setFrequency,
      mode,
      views,
      activeView,
      resolvedActiveId,
      loadedYears,
      visibleYears,
      chartYear,
      loadedMonthsByYear,
      workspaceWarnings,
      workspaceIdentity,
      sourceSystemId,
      commitWorkspace,
      segmented,
      segmentable,
      segment,
      commitMonthlyBatch,
      replaceMonthlyWorkspace,
      createClientWithBatch,
      commitBatchIntoClient,
      removeYear,
      saveEdit,
      deepest,
      options,
      filters,
      toggleCode,
      toggleCenter,
      toggleClient,
      toggleYear,
      togglePeriod,
      clearCodes,
      clearCenters,
      clearClients,
      clearYears,
      clearPeriods,
      clearFilters,
      canEdit,
      collapsed,
      toggleCollapsed,
      setExpandLevel,
      hideZeroRows,
      toggleHideZeroRows,
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
 * Builds the selector views over the VISIBLE years: single mode → the lone statement; multi mode
 * → Consolidado (a computed sum of the monthly centers) + each center + Sin-centro. A view spans
 * every visible year, one `YearSlice` each; the Consolidado's per-year dataset is synthetic
 * (never persisted): its accounts are the column-wise sum of that year's centers.
 *
 * The center list is the UNION across the visible years, so a center that only 2026 reports still
 * appears while 2026 is on screen — its 2025 slice is simply absent, and Datos renders that
 * year's columns empty rather than zero.
 */
function buildViews(
  datasets: PygDataset[],
  allEdits: CellEdit[],
  visibleYears: number[],
): CenterView[] {
  const visible = datasets.filter((d) => visibleYears.includes(d.year));
  if (visible.length === 0) {
    return [];
  }
  const editsOf = (id: string) => allEdits.filter((e) => e.datasetId === id);
  const years = [...visibleYears].sort((a, b) => a - b);

  const singles = visible.filter((d) => d.role === "single");
  if (singles.length > 0 && singles.length === visible.length) {
    const slices = slicesByYear(singles, years, editsOf);
    return [
      {
        id: singles[0].id,
        name: singles[0].companyName,
        role: "single",
        slices,
        dataset: latestOf(slices),
        editable: singles.every((d) => d.baseFrequency !== "anual"),
      },
    ];
  }

  // "Sin centro de costo" is an ordinary monthly, editable center — its `role` tag survives only
  // for its distinct color and its position at the end of the list, so it joins the same
  // sort/merge/editable treatment as every other center.
  const centers = visible.filter((d) => d.role === "center" || d.role === "sin-centro");
  if (centers.length === 0) {
    return [];
  }
  const views: CenterView[] = [];

  // One Consolidado slice per year: summing across years would be a figure nobody asked for.
  const consolidatedSlices: YearSlice[] = years.flatMap((year) => {
    const ofYear = centers.filter((c) => c.year === year);
    if (ofYear.length === 0) {
      return [];
    }
    const merged = mergeCenters(
      ofYear.map((c) => applyEditsToLeafAccounts(c.accounts, editsOf(c.id))),
    );
    const dataset: PygDataset = {
      ...ofYear[0],
      id: `${CONSOLIDADO_ID}-${year}`,
      role: "center",
      centerId: CONSOLIDADO_ID,
      costCenterName: undefined,
      accounts: merged.accounts,
      resultFromFile: [],
      warnings: [],
    };
    // The synthetic Consolidado has no stored edits: `mergeCenters` already folded them in.
    return [{ dataset, edits: [] }];
  });

  views.push({
    id: CONSOLIDADO_ID,
    name: "Consolidado",
    color: CONSOLIDADO_COLOR,
    role: "consolidado",
    slices: consolidatedSlices,
    dataset: latestOf(consolidatedSlices),
    editable: false,
  });

  // Ordered by the workspace-wide slot (`assignCenterSlots`), which is the same in every year.
  const byCenterId = new Map<string, PygDataset[]>();
  for (const center of centers) {
    byCenterId.set(center.centerId as string, [
      ...(byCenterId.get(center.centerId as string) ?? []),
      center,
    ]);
  }
  const ordered = [...byCenterId.entries()].sort(
    ([, a], [, b]) => (a[0].order ?? 0) - (b[0].order ?? 0),
  );

  for (const [centerId, ofCenter] of ordered) {
    const slices = slicesByYear(ofCenter, years, editsOf);
    const newest = ofCenter.reduce((best, d) => (d.year > best.year ? d : best), ofCenter[0]);
    views.push({
      id: centerId,
      name: newest.costCenterName || centerId,
      color: newest.centerColor,
      role: newest.role === "sin-centro" ? "sin-centro" : "center",
      slices,
      dataset: latestOf(slices),
      editable: ofCenter.every((d) => d.baseFrequency !== "anual"),
    });
  }
  return views;
}

/**
 * Builds views for the CONSOLIDATED CLIENTS: the total at the top and individual (client · center)
 * entries below. These are listed in the "Centro de costo" filter and compared in charts.
 *
 * If no centers are present (all clients are single-state), it returns the usual single-state view.
 * None of these views are editable as they are derived data.
 */
function buildConsolidatedViews(
  consolidated: ConsolidatedWorkspace,
  visibleYears: number[],
): CenterView[] {
  if (consolidated.centerDatasets.length === 0) {
    return buildViews(consolidated.datasets, EMPTY_EDITS, visibleYears).map((view) => ({
      ...view,
      editable: false,
    }));
  }

  const years = [...visibleYears].sort((a, b) => a - b);
  const slicesOf = (group: readonly PygDataset[]): YearSlice[] =>
    years.flatMap((year) => {
      const dataset = group.find((candidate) => candidate.year === year);
      return dataset ? [{ dataset, edits: EMPTY_EDITS }] : [];
    });

  const total = slicesOf(consolidated.datasets);
  if (total.length === 0) {
    return [];
  }
  const views: CenterView[] = [
    {
      id: CONSOLIDADO_ID,
      name: "Consolidated",
      color: CONSOLIDADO_COLOR,
      role: "consolidado",
      slices: total,
      dataset: latestOf(total),
      editable: false,
    },
  ];

  const byCenterId = new Map<string, PygDataset[]>();
  for (const dataset of consolidated.centerDatasets) {
    const id = dataset.centerId as string;
    byCenterId.set(id, [...(byCenterId.get(id) ?? []), dataset]);
  }
  const ordered = [...byCenterId.entries()].sort(
    ([, a], [, b]) => (a[0].order ?? 0) - (b[0].order ?? 0),
  );
  for (const [centerId, group] of ordered) {
    const slices = slicesOf(group);
    if (slices.length === 0) {
      continue;
    }
    const newest = latestOf(slices);
    const center = newest.costCenterName || centerId;
    views.push({
      id: centerId,
      name: `${center} · ${newest.companyName}`,
      group: newest.companyName,
      shortName: center,
      color: newest.centerColor,
      role: newest.role === "sin-centro" ? "sin-centro" : "center",
      slices,
      dataset: newest,
      editable: false,
    });
  }
  return views;
}

/** One slice per visible year the group actually has, ascending. */
function slicesByYear(
  group: PygDataset[],
  years: number[],
  editsOf: (id: string) => CellEdit[],
): YearSlice[] {
  return years.flatMap((year) => {
    const dataset = group.find((d) => d.year === year);
    return dataset ? [{ dataset, edits: editsOf(dataset.id) }] : [];
  });
}

/** The most recent slice's dataset — what charts, exports and the ficha read (decision 12). */
function latestOf(slices: YearSlice[]): PygDataset {
  return slices[slices.length - 1].dataset;
}
