"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MONTHS_SHORT_ES } from "@/lib/date";
import type { DatosGrid, DatosRow, DatosSort, DatosSortKey } from "@/lib/profit-loss/datos-types";
import { toDatosGrid } from "@/lib/profit-loss/derive";
import { focusAccounts } from "@/lib/profit-loss/filter";
import { CONSOLIDADO_ID } from "@/lib/profit-loss/filters";
import type { Frequency } from "@/lib/profit-loss/types";
import { AccountDetailPanel } from "./account-detail-panel";
import { CellEditor, type EditorAnchor } from "./cell-editor";
import { flattenSorted } from "./datos-utils";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { DatosTable } from "./datos-table";
import { usePygData } from "./pyg-data-provider";

interface EditingState extends EditorAnchor {
  code: string;
  col: number;
  valueEditable: boolean;
}

const EMPTY_GRID: DatosGrid = {
  id: "default",
  title: "Estado de Resultados",
  months: [...MONTHS_SHORT_ES],
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
    dataset,
    edits,
    frequency,
    allowed,
    saveEdit,
    activeCenterId,
    canEdit,
    filters,
    warnings,
    collapsed,
    toggleCollapsed,
  } = usePygData();

  const [sort, setSort] = useState<DatosSort | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [warningsDismissed, setWarningsDismissed] = useState(false);
  // Which account's ficha is open. Memory only, like the analytics selection: it means nothing
  // without the workspace that produced it.
  const [detailCode, setDetailCode] = useState<string | null>(null);

  // A newly loaded dataset can be coarser than the current view (its base floors the
  // options), but the provider resets `frequency` to the base one render later. Until it
  // does, fall back to the base so we never ask toDatosGrid to disaggregate (it throws).
  const effectiveFrequency = allowed.includes(frequency)
    ? frequency
    : (dataset?.baseFrequency ?? frequency);

  const grid = useMemo(
    () => (dataset ? toDatosGrid(dataset, edits, effectiveFrequency) : EMPTY_GRID),
    [dataset, edits, effectiveFrequency],
  );
  const markedCodes = useMemo(() => new Set(filters.codes), [filters.codes]);
  // Account focus decides which rows show; amounts (and Utilidad) are untouched. Depth is
  // handled by the collapse state (`collapsed`, from the "Nivel" filter + per-row toggles).
  const filteredRows = useMemo(
    () => focusAccounts(grid.rows, markedCodes),
    [grid.rows, markedCodes],
  );
  const visibleRows = useMemo(
    () => flattenSorted(filteredRows, collapsed, sort),
    [filteredRows, collapsed, sort],
  );
  // The "Periodo" filter bounds which columns render; the real index travels through so
  // editing still writes to the right month. No periods marked shows the whole axis.
  const visibleColumns = useMemo(() => {
    if (filters.periods.length === 0) {
      return grid.months.map((_, index) => index);
    }
    return filters.periods.map((period) => period.index).sort((a, b) => a - b);
  }, [filters.periods, grid.months]);

  // A newly loaded workspace should surface its own warnings even if the previous banner
  // was dismissed.
  useEffect(() => {
    setWarningsDismissed(false);
  }, [warnings]);

  // Aggregating to fewer columns (e.g. Mensual → Trimestral) can strand a month-column
  // sort on a column that no longer exists; clear it so the grid isn't "sorted" by nothing.
  useEffect(() => {
    setSort((prev) =>
      prev && typeof prev.key === "object" && prev.key.col >= grid.months.length ? null : prev,
    );
  }, [grid.months.length]);

  // Value edits/comments only make sense on an editable center in the concrete monthly view;
  // `canEdit` already covers the center half, this adds the frequency half (see `PygDataProvider`
  // for why both matter — a newly loaded coarser file floors the options one render early).
  const editable = canEdit && effectiveFrequency === "mensual";
  const readOnlyReason = editable
    ? null
    : readOnlyReasonFor(filters.centerIds.length, activeCenterId, effectiveFrequency);
  const showTotal = effectiveFrequency !== "anual";

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
      if (editing) {
        void saveEdit(
          editing.code,
          editing.col,
          editing.valueEditable ? value : undefined,
          comment,
        );
      }
      setEditing(null);
    },
    [editing, saveEdit],
  );

  const editingRow = editing ? findRow(grid.rows, editing.code) : null;

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
        sort={sort}
        editable={editable}
        readOnlyReason={readOnlyReason}
        showTotal={showTotal}
        openDetailCode={detailCode}
        onSort={onSort}
        onToggle={toggleCollapsed}
        onEditCell={onEditCell}
        onOpenDetail={onOpenDetail}
      />

      {detailCode !== null && <AccountDetailPanel code={detailCode} onClose={onCloseDetail} />}

      {editing && editingRow && (
        <CellEditor
          anchor={editing}
          title={editingRow.name}
          subtitle={`${grid.months[editing.col] ?? ""} · ${grid.title}`}
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
): string {
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
