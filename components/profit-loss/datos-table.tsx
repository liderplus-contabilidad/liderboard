"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Lock,
  MousePointerClick,
  PanelRight,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { columnHeaderLabel } from "@/lib/profit-loss/datos-columns";
import type { EditorAnchor } from "./cell-editor";
import { DatosTableRow } from "./datos-table-row";
import type { DatosGrid, DatosSort, DatosSortKey } from "@/lib/profit-loss/datos-types";
import type { FlatRow } from "./datos-utils";

export interface DatosTableProps {
  grid: DatosGrid;
  rows: FlatRow[];
  /** Positions in `grid.columns` to render, in order — the "Periodo" filter's doing, minus the
   * ones the zero prune took; every position when nothing is marked and it is off. */
  visibleColumns: readonly number[];
  sort: DatosSort | null;
  editable: boolean;
  /** Why editing is off, named for the banner; `null` while `editable` is true. */
  readOnlyReason: string | null;
  /** Which columns the workspace has actually loaded, by position; `null` = no restriction. */
  loadedColumns: ReadonlySet<number> | null;
  /** Cell to light up briefly — the twin a reclassification moved, by column position; `null`
   * when nothing did. */
  flash: { code: string; col: number } | null;
  /** Account whose ficha is open, so its row can stay marked; `null` when none is. */
  openDetailCode: string | null;
  /** Whether «Ocultar cuentas en cero» is on — the same switch the download menu reads. */
  hideZeroRows: boolean;
  /** How many account rows it took out; 0 while it is off. Named in the footer, because a table
   * that quietly drops rows is a table nobody can trust the account count of. */
  hiddenCount: number;
  /** How many period columns went the same way — a hidden month is even easier to miss than a
   * hidden row, since the header simply reads on to the next one. */
  hiddenColumnCount: number;
  onToggleHideZeroRows: () => void;
  onSort: (key: DatosSortKey) => void;
  onToggle: (code: string) => void;
  onEditCell: (code: string, col: number, anchor: EditorAnchor, valueEditable: boolean) => void;
  onOpenDetail: (code: string) => void;
}

/** Two sort keys point at the same column when both are the name sentinel or the same position. */
function sameKey(a: DatosSortKey, b: DatosSortKey): boolean {
  if (typeof a === "object" && typeof b === "object") {
    return a.col === b.col;
  }
  return a === b;
}

/** One editable Estado de Resultados grid — for the whole company or a cost center. */
export function DatosTable({
  grid,
  rows,
  visibleColumns,
  sort,
  editable,
  readOnlyReason,
  loadedColumns,
  flash,
  openDetailCode,
  hideZeroRows,
  hiddenCount,
  hiddenColumnCount,
  onToggleHideZeroRows,
  onSort,
  onToggle,
  onEditCell,
  onOpenDetail,
}: DatosTableProps) {
  const accountCount = rows.filter((flat) => !flat.row.isResult).length;
  const trimmed = visibleColumns.length < grid.columns.length;

  return (
    <div className="mb-4 overflow-hidden rounded-[13px] border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-header px-[18px] py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {grid.dotColor && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: grid.dotColor }}
            />
          )}
          <span className="truncate text-sm font-semibold text-ink">{grid.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {/* Lives here and not in the filter bar: it reads a single card, like Ocupaciones'
              «Ver por». What it also reaches is the download, which mounts right above. Absent
              with no statement, where there is nothing to hide and the empty state does the
              talking. */}
          {grid.rows.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              aria-pressed={hideZeroRows}
              onClick={onToggleHideZeroRows}
              icon={hideZeroRows ? <Eye size={14} /> : <EyeOff size={14} />}
              className={cn(
                "font-medium",
                hideZeroRows && "border-brand/40 bg-brand-soft text-brand hover:bg-brand-soft",
              )}
            >
              {hideZeroRows ? "Mostrar ceros" : "Ocultar ceros"}
            </Button>
          )}
          {grid.utilidad && (
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11.5px] font-semibold tabular-nums",
                grid.utilidad.positive
                  ? "bg-positive/10 text-positive"
                  : "bg-negative/10 text-negative",
              )}
            >
              {grid.utilidad.label}
            </span>
          )}
        </div>
      </header>

      {grid.rows.length === 0 ? (
        <EmptyState icon={<FileSpreadsheet size={22} />} className="py-14">
          Carga un Excel para ver el estado de resultados.
        </EmptyState>
      ) : (
        <>
          <div className="max-h-[62vh] min-h-[180px] overflow-auto">
            <table className="w-full min-w-[960px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <SortableTh
                    align="left"
                    active={sort ? sameKey(sort.key, "name") : false}
                    dir={sort?.dir}
                    onClick={() => onSort("name")}
                    className="min-w-[300px]"
                  >
                    Cuenta
                  </SortableTh>
                  {visibleColumns.map((col) => {
                    const column = grid.columns[col];
                    return (
                      <SortableTh
                        key={col}
                        align="right"
                        active={sort ? sameKey(sort.key, { col }) : false}
                        dir={sort?.dir}
                        onClick={() => onSort({ col })}
                        // The rule that closes a year's block, and the one that opens the next.
                        className={column.kind === "total" ? "border-l border-border" : undefined}
                      >
                        {columnHeaderLabel(column, trimmed)}
                      </SortableTh>
                    );
                  })}
                  {/* Pinned above AND to the right, so it stacks over the other sticky headers. */}
                  <th className="sticky right-0 top-0 z-[3] w-[62px] border-b border-l border-border bg-surface-header px-2 py-2.5">
                    <span className="sr-only">Ficha</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((flat) => (
                  <DatosTableRow
                    key={flat.row.code || flat.row.resultKind}
                    row={flat.row}
                    hasChildren={flat.hasChildren}
                    isCollapsed={flat.isCollapsed}
                    columns={grid.columns}
                    visibleColumns={visibleColumns}
                    editable={editable}
                    loadedColumns={loadedColumns}
                    flashCol={flash?.code === flat.row.code ? flash.col : null}
                    detailOpen={openDetailCode === flat.row.code}
                    onToggle={onToggle}
                    onEditCell={onEditCell}
                    onOpenDetail={onOpenDetail}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <footer className="flex flex-wrap items-center gap-4 border-t border-border bg-surface-header px-[18px] py-2.5 text-[11.5px] text-faint">
            <LegendItem>
              <span className="h-[9px] w-[9px] rounded-[2px] bg-negative" />
              Negativos en rojo
            </LegendItem>
            <LegendItem>
              <span
                className="h-0 w-0"
                style={{
                  borderTop: "9px solid var(--color-warning)",
                  borderLeft: "9px solid transparent",
                }}
              />
              Celda con comentario
            </LegendItem>
            <LegendItem>
              <span className="h-[11px] w-[14px] rounded-[2px] bg-marked" />
              Celda con ajuste de valor
            </LegendItem>
            {editable ? (
              <LegendItem>
                <MousePointerClick size={13} />
                Clic en una celda para editar o comentar
              </LegendItem>
            ) : (
              readOnlyReason && (
                <LegendItem>
                  <Lock size={13} />
                  Solo lectura — {readOnlyReason}
                </LegendItem>
              )
            )}
            <LegendItem>
              <PanelRight size={13} />
              «ficha» abre el rendimiento de la cuenta
            </LegendItem>
            <span className="ml-auto font-mono">
              {accountCount} cuentas
              {hiddenCount > 0 &&
                ` · ${hiddenCount} en cero ${hiddenCount === 1 ? "oculta" : "ocultas"}`}
              {hiddenColumnCount > 0 &&
                ` · ${hiddenColumnCount} ${hiddenColumnCount === 1 ? "periodo oculto" : "periodos ocultos"}`}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}

function SortableTh({
  align,
  active,
  dir,
  onClick,
  className,
  children,
}: {
  align: "left" | "right";
  active: boolean;
  dir?: "asc" | "desc";
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <th
      onClick={onClick}
      className={cn(
        "sticky top-0 z-[2] cursor-pointer select-none whitespace-nowrap border-b border-border bg-surface-header px-4 py-2.5 text-[11px] font-semibold transition-colors",
        active ? "text-brand" : "text-muted hover:text-ink",
        align === "left" ? "text-left uppercase tracking-[0.5px]" : "text-right",
        className,
      )}
    >
      <span
        className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}
      >
        {children}
        {active ? (
          dir === "asc" ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )
        ) : (
          <ChevronsUpDown size={12} className="text-faintest" />
        )}
      </span>
    </th>
  );
}

function LegendItem({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-1.5">{children}</span>;
}
