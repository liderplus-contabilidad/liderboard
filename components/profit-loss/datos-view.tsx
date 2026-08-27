"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadedColumnPositions, visibleColumnPositions } from "@/lib/profit-loss/datos-columns";
import type { DatosGrid, DatosRow, DatosSort, DatosSortKey } from "@/lib/profit-loss/datos-types";
import { toDatosGridMultiYear } from "@/lib/profit-loss/derive";
import { focusAccounts, movingColumnPositions, pruneEmptyAccounts } from "@/lib/profit-loss/filter";
import { CONSOLIDADO_ID } from "@/lib/profit-loss/filters";
import type { Frequency } from "@/lib/profit-loss/types";
import { CellEditor, type EditorAnchor } from "./cell-editor";
import { flattenSorted } from "./datos-utils";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { DatosTable } from "./datos-table";
import { PygEmptyState } from "./pyg-empty-state";
import { usePygData } from "./pyg-data-provider";
import { SegmentActions } from "./segment-actions";

interface EditingState extends EditorAnchor {
  code: string;
  col: number;
  valueEditable: boolean;
}

/**
 * The ficha is the ONLY thing in Datos that draws a chart, and it mounts on demand — so loading
 * ECharts with the table would mean paying ~700 KB for a panel most readings never open.
 */
const AccountDetailPanel = dynamic(
  () => import("./account-detail-panel").then((mod) => mod.AccountDetailPanel),
  { ssr: false },
);

/** How long the twin cell stays lit. Long enough to find it, short enough not to linger. */
const FLASH_MS = 2200;

const EMPTY_GRID: DatosGrid = {
  id: "default",
  title: "Estado de Resultados",
  columns: [],
  rows: [],
};

/**
 * The Datos tab body: the editable Estado de Resultados grid, fed by the uploaded
 * Excel via PygDataProvider. Cell editing/commenting is MONTHLY-VIEW ONLY (see
 * README, "Edición y frecuencias") — aggregated cells are read-only sums.
 *
 * Which center it shows and whether it can be edited both come from the shared "Centro de
 * costo" filter (`canEdit`, derived: Consolidado and several centers marked are read-only); the
 * "Cuenta contable" filter focuses which rows show and the "Periodo" filter which columns do.
 */
export function DatosView() {
  const {
    activeClientId,
    dataset,
    frequency,
    allowed,
    saveEdit,
    activeCenterId,
    canEdit,
    filters,
    warnings,
    collapsed,
    toggleCollapsed,
    mode,
    loadedMonthsByYear,
    visibleYears,
    activeSlices,
    hideZeroRows,
    toggleHideZeroRows,
  } = usePygData();

  const [sort, setSort] = useState<DatosSort | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [warningsDismissed, setWarningsDismissed] = useState(false);
  // Which account's ficha is open. Memory only, like the analytics selection: it means nothing
  // without the workspace that produced it.
  const [detailCode, setDetailCode] = useState<string | null>(null);
  // The twin cell a reclassification just moved, flashed briefly so the change doesn't happen
  // out of sight. Held as a COLUMN POSITION, which is what the table renders against. Memory
  // only — it means nothing after the edit that produced it.
  const [flash, setFlash] = useState<{ code: string; col: number } | null>(null);

  // A newly loaded dataset can be coarser than the current view (its base floors the
  // options), but the provider resets `frequency` to the base one render later. Until it
  // does, fall back to the base so we never ask toDatosGrid to disaggregate (it throws).
  const effectiveFrequency = allowed.includes(frequency)
    ? frequency
    : (dataset?.baseFrequency ?? frequency);

  // The grid this one replaces, so `toDatosGrid` can hand back the rows that did not change
  // (see its doc): editing one cell then re-renders that row and its ancestors instead of all
  // ~500. Written during render on purpose — it is a cache of the last computed value, and the
  // sharing is an optimization, so a render React throws away can only cost us the reuse, never
  // correctness.
  const previousGrid = useRef<DatosGrid | undefined>(undefined);
  const grid = useMemo(() => {
    const next =
      activeSlices.length > 0
        ? toDatosGridMultiYear(activeSlices, effectiveFrequency, previousGrid.current)
        : EMPTY_GRID;
    previousGrid.current = next;
    return next;
  }, [activeSlices, effectiveFrequency]);
  // The by-centers workspace declares which periods it loaded; a single-statement workspace
  // has no such restriction (its whole year always arrives in one file). Coverage is expressed
  // in COLUMN POSITIONS, not period indices, because the Total columns sit in the same list.
  const loadedColumns = useMemo(() => {
    if (mode !== "multi" || !dataset) {
      return null;
    }
    return loadedColumnPositions({
      columns: grid.columns,
      loadedMonthsByYear,
      baseFrequency: dataset.baseFrequency,
      frequency: effectiveFrequency,
    });
  }, [mode, dataset, loadedMonthsByYear, effectiveFrequency, grid.columns]);
  const markedCodes = useMemo(() => new Set(filters.codes), [filters.codes]);

  const periodColumns = useMemo(
    () => visibleColumnPositions(grid.columns, filters.periods),
    [filters.periods, grid.columns],
  );
  // Account focus decides which rows show; amounts (and Utilidad) are untouched. Depth is
  // handled by the collapse state (`collapsed`, from the "Nivel" filter + per-row toggles).
  const filteredRows = useMemo(
    () => focusAccounts(grid.rows, markedCodes),
    [grid.rows, markedCodes],
  );
  // Rows and columns are judged against the SAME table — the rows over every filtered column, the
  // columns over every focused row — rather than one after the other, so neither can hide the
  // other's evidence (see `movingColumnPositions`).
  const shownRows = useMemo(
    () => (hideZeroRows ? pruneEmptyAccounts(filteredRows, periodColumns) : filteredRows),
    [hideZeroRows, filteredRows, periodColumns],
  );
  const visibleColumns = useMemo(
    () => (hideZeroRows ? movingColumnPositions(filteredRows, periodColumns) : periodColumns),
    [hideZeroRows, filteredRows, periodColumns],
  );
  const hiddenColumnCount = periodColumns.length - visibleColumns.length;

  const hiddenCount = useMemo(
    () => (shownRows === filteredRows ? 0 : countAccounts(filteredRows) - countAccounts(shownRows)),
    [filteredRows, shownRows],
  );

  const effectiveSort = useMemo(
    () =>
      sort && typeof sort.key === "object" && !visibleColumns.includes(sort.key.col) ? null : sort,
    [sort, visibleColumns],
  );
  const visibleRows = useMemo(
    () => flattenSorted(shownRows, collapsed, effectiveSort),
    [shownRows, collapsed, effectiveSort],
  );

  // A newly loaded workspace should surface its own warnings even if the previous banner
  // was dismissed.
  useEffect(() => {
    setWarningsDismissed(false);
  }, [warnings]);

  // The flash is a pointer, not a state of the data: it fades on its own so the table doesn't
  // end up with several cells marked from edits the reader already saw.
  useEffect(() => {
    if (!flash) {
      return;
    }
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  // Aggregating to fewer columns (e.g. Mensual → Trimestral) can strand a column sort on a
  // column that no longer exists; clear it so the grid isn't "sorted" by nothing.
  useEffect(() => {
    setSort((prev) =>
      prev && typeof prev.key === "object" && prev.key.col >= grid.columns.length ? null : prev,
    );
  }, [grid.columns.length]);

  // Value edits/comments only make sense on an editable center in the concrete monthly view;
  // `canEdit` already covers the center half, this adds the frequency half (see `PygDataProvider`
  // for why both matter — a newly loaded coarser file floors the options one render early).
  const editable = canEdit && effectiveFrequency === "mensual";
  const readOnlyReason = editable
    ? null
    : readOnlyReasonFor(
        filters.centerIds.length,
        activeCenterId,
        effectiveFrequency,
        visibleYears.length,
      );

  const onSort = useCallback((key: DatosSortKey) => {
    setSort((prev) => nextSort(prev, key));
  }, []);

  const onEditCell = useCallback(
    (code: string, col: number, anchor: EditorAnchor, valueEditable: boolean) => {
      setEditing({ code, col, valueEditable, ...anchor });
    },
    [],
  );

  const onOpenDetail = useCallback((code: string) => setDetailCode(code), []);
  const onCloseDetail = useCallback(() => setDetailCode(null), []);

  const onSaveEdit = useCallback(
    (value: number | null, comment: string) => {
      // The persist call is a side effect, so it must live OUTSIDE the state updater:
      // React StrictMode double-invokes updaters, which would fire two concurrent writes
      // for the same cell and collide on the unique [datasetId+code+monthIndex] index.
      const column = editing ? grid.columns[editing.col] : undefined;
      if (editing && column?.kind === "period") {
        void saveEdit(
          editing.code,
          column.index,
          editing.valueEditable ? value : undefined,
          comment,
        ).then((twin) => {
          // The twin comes back keyed by period index; the table renders positions.
          const col = twin
            ? grid.columns.findIndex(
                (candidate) => candidate.kind === "period" && candidate.index === twin.monthIndex,
              )
            : -1;
          setFlash(twin && col >= 0 ? { code: twin.code, col } : null);
        });
      }
      setEditing(null);
    },
    [editing, grid.columns, saveEdit],
  );

  const editingRow = editing ? findRow(grid.rows, editing.code) : null;

  // With no client there is no table to render empty: the empty state names the missing step and
  // offers it.
  if (activeClientId === null) {
    return <PygEmptyState />;
  }

  return (
    <div className="px-7 py-5">
      {warnings.length > 0 && !warningsDismissed && (
        <NoticeBanner
          onDismiss={() => setWarningsDismissed(true)}
          details={warnings}
          className="mb-3.5"
        >
          El espacio de trabajo tiene {warnings.length} {warnings.length === 1 ? "aviso" : "avisos"}{" "}
          de cuadre; se muestran los valores tal cual.
        </NoticeBanner>
      )}

      <DatosTable
        grid={grid}
        rows={visibleRows}
        visibleColumns={visibleColumns}
        sort={effectiveSort}
        editable={editable}
        readOnlyReason={readOnlyReason}
        flash={flash}
        loadedColumns={loadedColumns}
        openDetailCode={detailCode}
        hideZeroRows={hideZeroRows}
        hiddenCount={hiddenCount}
        hiddenColumnCount={hiddenColumnCount}
        onToggleHideZeroRows={toggleHideZeroRows}
        onSort={onSort}
        onToggle={toggleCollapsed}
        onEditCell={onEditCell}
        onOpenDetail={onOpenDetail}
      />

      <SegmentActions />

      {detailCode !== null && <AccountDetailPanel code={detailCode} onClose={onCloseDetail} />}

      {editing && editingRow && (
        <CellEditor
          anchor={editing}
          title={editingRow.name}
          subtitle={`${grid.columns[editing.col]?.label ?? ""} · ${grid.title}`}
          valueEditable={editing.valueEditable}
          initialValue={editingRow.cells[editing.col]?.value ?? null}
          initialComment={editingRow.cells[editing.col]?.comment ?? ""}
          onSave={onSaveEdit}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * Names why Datos is read-only, so the banner says more than "no puedes editar". Checked in the
 * same order `resolveActiveCenterId` would: several centers marked wins over which one got
 * resolved, since that is the more informative reason ("hay 2 marcados" beats "es Consolidado").
 */
function readOnlyReasonFor(
  markedCenterCount: number,
  activeCenterId: string,
  effectiveFrequency: Frequency,
  visibleYearCount: number,
): string {
  // The year comes first: with two years on screen the table is read-only whatever the center
  // resolves to, and "hay 2 años" is the reason the reader can act on.
  if (visibleYearCount >= 2) {
    return "hay varios años a la vista: marca uno solo para editarlo";
  }
  if (markedCenterCount >= 2) {
    return "hay varios centros de costo marcados: se muestra el Consolidado";
  }
  if (activeCenterId === CONSOLIDADO_ID) {
    return "el Consolidado es de solo lectura";
  }
  if (effectiveFrequency !== "mensual") {
    return "la vista no es mensual";
  }
  return "este centro es de solo lectura";
}

/** Cycle a column through asc → desc → unsorted; switching columns starts at asc. */
function nextSort(prev: DatosSort | null, key: DatosSortKey): DatosSort | null {
  const same =
    prev &&
    (typeof prev.key === "object" && typeof key === "object"
      ? prev.key.col === key.col
      : prev.key === key);
  if (!same) {
    return { key, dir: "asc" };
  }
  if (prev?.dir === "asc") {
    return { key, dir: "desc" };
  }
  return null;
}

/** Account rows in a tree, summaries excluded — the two sides of "cuántas se ocultaron". */
function countAccounts(rows: DatosRow[]): number {
  return rows.reduce(
    (total, row) => total + (row.isResult ? 0 : 1) + countAccounts(row.children ?? []),
    0,
  );
}

/** Depth-first lookup of a row by account code. */
function findRow(rows: DatosRow[], code: string): DatosRow | null {
  for (const row of rows) {
    if (row.code === code) {
      return row;
    }
    if (row.children) {
      const found = findRow(row.children, code);
      if (found) {
        return found;
      }
    }
  }
  return null;
}
