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
import { deleteSalesForClient } from "@/lib/sales/db";
import type { CenterLogos, EntityLogo } from "@/lib/workspaces";
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
  updateClient as updateClientRow,
  replaceClientWorkspace,
  saveCellEdits,
  segmentWorkspace,
  setActiveClient,
  type ClientSummary,
} from "@/lib/profit-loss/db";
import {
  CONSOLIDATED_CLIENT_ID,
  consolidatedCenterId,
  consolidateClients,
  selectContributions,
  type ClientContribution,
  type ConsolidatedWorkspace,
  type SummedDetail,
} from "@/lib/profit-loss/consolidate";
import { canSegment, isSegmented, twinWriteFor } from "@/lib/profit-loss/segment";
import { aggregateCoverage } from "@/lib/profit-loss/analytics/source";
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
  withPresetCleared,
  withPresetSelected,
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
const EMPTY_DETAILS: SummedDetail[] = [];
const EMPTY_CLIENT_IDS: string[] = [];
const EMPTY_MONTHS: number[] = [];
const EMPTY_WARNINGS: string[] = [];
const CONSOLIDADO_COLOR = "#334155";

/**
 * What a preset view declares about itself and this provider needs in order to switch it on: which
 * marks it seeds and at what granularity it is read.
 *
 * It is a MIRROR of `PresetView` without the catalogue, and that duplication is deliberate: the
 * catalogue lives in `charts/`, which this file does not import from —which is what keeps the
 * presentation layer out of the module's state—, so the bar's button, which does know it, is what
 * passes this in.
 */
export interface PresetSeeding {
  seeds?: { centers?: boolean; periods?: boolean };
  frequency?: Frequency;
  /** Whether marking an account NARROWS the view instead of switching it off; only when its lines ARE
   *  from the chart of accounts. */
  narrowedByCodes?: boolean;
}

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
  /**
   * The logo the user uploaded for THIS center, if they uploaded one. It travels in the view and is
   * not resolved on each screen because three read it —the dropdown, the header and the report—, and
   * three resolutions of «which is this center's logo» could drift apart the moment one of them
   * forgot the cross-client consolidado, where the id is composed.
   */
  logo?: EntityLogo;
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
  /**
   * The pieces the consolidado SUMMED —each (client · center) that went in and the whole statement of
   * each single-statement client—, which is what its download writes sheet by sheet. `[]` outside.
   *
   * They arrive from `consolidate.ts` instead of being reassembled in the button: which ones went in
   * was already decided by the filter when summing, and deciding it a second time is how the file
   * ends up with sheets that do not square with its own total.
   */
  consolidatedDetails: SummedDetail[];
  /** The «Cliente» filter's options — every client the consolidado COULD sum. `[]` outside. */
  clientOptions: { id: string; name: string }[];
  /** Creates an EMPTY client and opens it. Rejects nothing: the caller validates the name with
   * `clients.ts` where it can say what is wrong. */
  createClient: (name: string, logo?: EntityLogo) => Promise<string>;
  /** Changes the LABEL — name and logo — and nothing else. */
  updateClient: (
    clientId: string,
    name: string,
    logo: EntityLogo | null,
    centerLogos: CenterLogos | undefined,
  ) => Promise<void>;
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
  /** Marks or unmarks a client of the consolidado. None marked = all of them. */
  toggleClient: (clientId: string) => void;
  toggleYear: (year: number) => void;
  togglePeriod: (period: PeriodSlot) => void;
  /** Picks (or removes, if it was already there) a preset view; picking it clears the account marks. */
  /**
   * `view` is what the view DECLARES about itself (`preset-views.ts`), and it arrives as an argument
   * instead of being read here on purpose: this provider does not import from `charts/` — which is
   * what keeps the presentation layer out of the module's state—, so whoever already knows the
   * catalogue, the bar's button, is what passes it in.
   */
  selectPreset: (id: string, view?: PresetSeeding) => void;
  clearPreset: () => void;
  /** Each dropdown's own "Quitar selección" footer button. */
  clearCodes: () => void;
  clearYears: () => void;
  /** "Todos (Consolidado)" — clears only the center marks. */
  clearCenters: () => void;
  /** «Todos los clientes» — goes back to summing them all. */
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
  // The cross-client consolidado is an ENTRY of the selector, not a row of `clients`. It lives in the
  // same `active` table, which is what gives it survival across a reload with no extra state.
  const isConsolidated = activeClientId === CONSOLIDATED_CLIENT_ID;
  // The open client bounds every read. With the consolidado open there is none, and the three queries
  // stay empty so not a single row of one particular client slips into the sum.
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
  // Whether the open preset view OWNS the account marks. It is remembered instead of deduced because
  // the one that knows is the catalogue, which lives in `charts/` and is not imported from here; it is
  // what decides whether unmarking a line NARROWS the breakdown or switches the whole view off.
  const [presetOwnsCodes, setPresetOwnsCodes] = useState(false);
  const [rawFilters, setRawFilters] = useState<PygFilters>(() => emptyFilters());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hideZeroRows, setHideZeroRows] = useState(false);

  // The only cross-cutting read, and only while the consolidado is open.
  const contributions =
    useLiveQuery(
      () => (isConsolidated ? consolidatedContributions() : Promise.resolve(EMPTY_CONTRIBUTIONS)),
      [isConsolidated],
    ) ?? EMPTY_CONTRIBUTIONS;
  // Which clients the consolidado can sum — the «Cliente» filter's universe, and what `sanitizeFilters`
  // prunes a mark against. `[]` outside the consolidado, which is what keeps the mark from surviving a
  // return to one particular client.
  const consolidatableIds = useMemo(
    () =>
      isConsolidated
        ? contributions.filter((c) => c.datasets.length > 0).map((c) => c.clientId)
        : EMPTY_CLIENT_IDS,
    [isConsolidated, contributions],
  );
  // The filter's options, already carrying the name the user gave each client.
  const clientOptions = useMemo(
    () =>
      consolidatableIds.map((id) => ({
        id,
        name: contributions.find((c) => c.clientId === id)?.name ?? id,
      })),
    [consolidatableIds, contributions],
  );
  // The selection is applied BEFORE summing: the consolidado is what was left inside, not a total that
  // is discounted afterwards. It holds for both marks — clients and (client · center) —, and that is
  // why they arrive RAW: `filters` is sanitized against the views, which is what this produces.
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

  // From here on the consolidado IS the workspace: a read-only single statement, with its years and
  // its coverage. Nothing downstream —Datos, Gráficos, Análisis, the ficha— knows the difference,
  // which is exactly the point.
  const datasets = consolidated?.datasets ?? ownDatasets;
  // Each client's adjustments are already folded into the summed accounts; applying them again here
  // would count them twice.
  const allEdits = consolidated ? EMPTY_EDITS : ownEdits;
  const loadedMonthsByYear =
    consolidated?.loadedMonthsByYear ?? metaRow?.loadedMonthsByYear ?? EMPTY_COVERAGE;
  const workspaceWarnings = consolidated?.warnings ?? metaRow?.warnings ?? EMPTY_WARNINGS;
  // Offerable with two or more clients WITH data: `years` is empty while one is empty, so the
  // selector's list already knows it and no extra query is needed.
  const consolidatable = useMemo(
    () => clients.filter((client) => client.years.length > 0).length >= 2,
    [clients],
  );

  // Every year the workspace holds, read off the datasets rather than the metadata: the datasets
  // ARE the workspace, so the two can never disagree about which years exist.
  //
  // In the consolidado the universe is the CLIENTS' years, not those of the narrowed sum: marking a
  // center that only has 2026 cannot erase 2025 from the year filter nor from the list of centers,
  // which is precisely where it has to be unmarked from to go back.
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

  /**
   * Each center's logo BY VIEW ID. It covers both forms of the id at once —the plain `centerId` of
   * the open client and the composed `<clientId>::<centerId>` of the cross-client consolidado—, which
   * is what leaves `buildViews` and `buildConsolidatedViews` unaware that logos exist.
   */
  const centerLogoById = useMemo(() => {
    const byId = new Map<string, EntityLogo>();
    for (const client of clients) {
      for (const [centerId, logo] of Object.entries(client.centerLogos ?? {})) {
        byId.set(consolidatedCenterId(client.id, centerId), logo);
        if (client.id === activeClientId) {
          byId.set(centerId, logo);
        }
      }
    }
    return byId;
  }, [clients, activeClientId]);

  // buildViews needs every center's edits so the computed Consolidado reflects them.
  const views = useMemo<CenterView[]>(() => {
    const built = consolidated
      ? buildConsolidatedViews(consolidated, visibleYears)
      : buildViews(datasets, allEdits, visibleYears);
    return built.map((view) => {
      const logo = centerLogoById.get(view.id);
      return logo ? { ...view, logo } : view;
    });
  }, [consolidated, datasets, allEdits, visibleYears, centerLogoById]);
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
  // `null` in the consolidado: it does not come from any accounting system —it may come from several
  // at once—, and that is what switches «un mes en crudo» off, which only makes sense over a format.
  const sourceSystemId =
    !isConsolidated && datasets.length > 0 ? (metaRow?.sourceSystemId ?? LEGACY_SYSTEM) : null;

  // The ACTIVE CLIENT's identity, derived exactly as every other client's is
  // (`listClientSummaries` uses the same function) — `null` while the client is empty, which is
  // what makes a first upload adopt instead of clash.
  // `null` in the consolidado: a sum of companies has neither a razón social nor a system of its own,
  // and giving it an identity would make it comparable against a file's — which is exactly what
  // decides where an upload lands.
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

  // Marking an account SWITCHES OFF the open preset view —they are two answers to «what do I draw»—
  // except when the view declares it accepts being narrowed by them: in the expense annex the lines
  // ARE accounts, so marking one narrows the breakdown instead of contradicting it, and switching the
  // whole view off would be the opposite of what marks are for.
  const toggleCode = useCallback(
    (code: string) => {
      setRawFilters(
        withCodeToggled(
          filters,
          code,
          options.map((option) => option.code),
          { keepPreset: presetOwnsCodes },
        ),
      );
    },
    [filters, options, presetOwnsCodes],
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

  // The preset view seeds the WHOLE «Centro de costo» list —the real centers and «Sin centro de
  // costo» too—, without the Consolidado, which is their sum and would open a column repeating the
  // others: what it draws stays marked in the dropdown, so it is visible which ones go in and one is
  // removed by unmarking it. The accounting system's catch-all goes in because those are dollars of
  // the statement, and leaving it out by default took them out of every column at once — the note
  // that said so is still there for whoever unmarks it by hand, which is where that warning is
  // needed.
  //
  // Except in the CROSS-CLIENT CONSOLIDADO, where nothing is seeded: there the centers belong to
  // every client at once and seeding them would open dozens of columns in one go. Whoever enters the
  // consolidado knows how many there are, so choosing which ones to compare is theirs.
  // And it also seeds the covered PERIODS of the open granularity, for the same reason: the months it
  // draws are removed and put back from «Periodo». A month the file never brought is not marked — it
  // would be an empty column asking for room.
  // WHAT each view seeds and at what granularity it is read is declared by the view
  // (`preset-views.ts`), not by this callback: what has to be marked depends on what is drawn, the
  // same reason `isAvailable` lives there. «Ventas» breaks down by establishment and month and that
  // is why it marks them; the expense annex is one column per line over the whole span, so it seeds
  // nothing.
  const selectPreset = useCallback(
    (id: string, view: PresetSeeding = {}) => {
      const turningOn = filters.preset !== id;
      // The granularity is applied on SWITCHING ON and is not undone on switching off: «Ver por» is
      // in plain sight and is restored with one click, unlike the marks, which would leave chips the
      // user did not make.
      if (turningOn && view?.frequency) {
        setFrequency(view.frequency);
      }
      // Coverage is read at the granularity the view is going to use, not at the one that was in
      // place: seeding the twelve months right before jumping to annual would mark periods nobody
      // draws.
      const next = turningOn ? (view?.frequency ?? frequency) : frequency;
      const covered = aggregateCoverage(
        new Set(loadedMonthsByYear[chartYear] ?? EMPTY_MONTHS),
        "mensual",
        next,
      );
      // No view seeds ACCOUNTS —the annex did and it was over a hundred chips—, but its own can still
      // be narrowed by marking them, and the view declares that: without this pass, marking one would
      // switch the view off, which is the general rule and here would be the opposite.
      setPresetOwnsCodes(turningOn && (view.narrowedByCodes ?? false));
      setRawFilters(
        withPresetSelected(
          filters,
          id,
          view?.seeds?.centers && !isConsolidated
            ? views
                .filter((view) => view.role === "center" || view.role === "sin-centro")
                .map((view) => view.id)
            : [],
          view?.seeds?.periods ? periodSlots(next).filter((slot) => covered.has(slot.index)) : [],
        ),
      );
    },
    [filters, views, isConsolidated, loadedMonthsByYear, chartYear, frequency, setFrequency],
  );
  const clearPreset = useCallback(() => setRawFilters(withPresetCleared(filters)), [filters]);

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

  const createClient = useCallback(
    async (name: string, logo?: EntityLogo) => (await createClientRow(name, logo)).id,
    [],
  );
  const updateClient = useCallback(
    (
      clientId: string,
      name: string,
      logo: EntityLogo | null,
      centerLogos: CenterLogos | undefined,
    ) => updateClientRow(clientId, name, logo, centerLogos),
    [],
  );
  // Deleting a client takes EVERYTHING that hangs off it, including the billing «Ventas por servicio»
  // stores in its own database partitioned by this same id. The call goes from here and not from
  // `lib/profit-loss/db.ts` so the dependency points from the new module to the one that already
  // existed and never the other way round; without it, those sales would be left in a partition no
  // screen lists and no deletion reaches.
  const deleteClient = useCallback(async (clientId: string) => {
    await deleteClientRow(clientId);
    await deleteSalesForClient(clientId);
  }, []);
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
  // Segmenting rewrites every dataset of the client: over the consolidado there would be nobody to.
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
      consolidatedDetails: consolidated?.summedDatasets ?? EMPTY_DETAILS,
      clientOptions,
      createClient,
      updateClient,
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
      // The coverage of the year the series read, which is `chartYear` — see the field. Datos does not
      // use this list: each column resolves ITS own year's coverage against the record.
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
      selectPreset,
      clearPreset,
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
      updateClient,
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
      selectPreset,
      clearPreset,
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
