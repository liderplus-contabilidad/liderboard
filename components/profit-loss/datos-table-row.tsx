"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/cn";
import type { EditorAnchor } from "./cell-editor";
import type { DatosRow } from "@/lib/profit-loss/datos-types";
import { formatAmount, rowTotal } from "./datos-utils";

const INDENT_STEP = 16;
const BASE_INDENT = 14;

export interface DatosTableRowProps {
  row: DatosRow;
  hasChildren: boolean;
  isCollapsed: boolean;
  /** Real column indices to render, in order — the "Periodo" filter's doing. */
  visibleColumns: number[];
  editable: boolean;
  showTotal: boolean;
  /** Which columns the by-centers workspace has actually loaded; `null` = no restriction
   * (single-statement mode). An unloaded column renders empty and never opens for editing,
   * regardless of `editable` or `row.movement`. */
  loadedColumns: ReadonlySet<number> | null;
  /** Column of THIS row to light up briefly (a reclassified twin), or `null` for none. */
  flashCol: number | null;
  /** The ficha panel is currently showing this row. */
  detailOpen: boolean;
  onToggle: (code: string) => void;
  onEditCell: (code: string, col: number, anchor: EditorAnchor, valueEditable: boolean) => void;
  onOpenDetail: (code: string) => void;
}

/**
 * One account row. Memoized so editing or expanding a *different* row — or opening the
 * editor — never re-renders this one (its props are value-stable between such changes).
 * `content-visibility` lets the browser skip layout/paint for rows scrolled out of view.
 */
function DatosTableRowImpl({
  row,
  hasChildren,
  isCollapsed,
  visibleColumns,
  editable,
  showTotal,
  loadedColumns,
  flashCol,
  detailOpen,
  onToggle,
  onEditCell,
  onOpenDetail,
}: DatosTableRowProps) {
  const emphasized = row.isResult || row.level === 1;
  // Weight by role, not depth: parent (summary) accounts stand out; movement (leaf,
  // editable) accounts stay plain so they read as the detail rows you fill in.
  const nameWeight = row.isResult ? "font-bold" : row.movement ? "font-normal" : "font-semibold";
  const paddingLeft = row.isResult ? BASE_INDENT : BASE_INDENT + (row.level - 1) * INDENT_STEP;

  // The result row is fully derived (no editor). Movement accounts (leaves) edit their
  // value + comment; parent accounts roll up from their movements, so they comment only.
  // `row.movement` comes from the source tree, so a level-capped parent (shown without
  // children) stays comment-only instead of falsely looking editable.
  const openable = editable && !row.isResult;
  const valueEditable = openable && Boolean(row.movement);

  return (
    <tr
      className="group hover:bg-surface-muted"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 39px" }}
    >
      <td
        className={cn(
          "max-w-[380px] border-b border-border-soft p-0",
          row.isResult && "bg-surface-header",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 overflow-hidden whitespace-nowrap py-2 text-[13px]",
            nameWeight,
            emphasized ? "text-brand" : "text-ink-soft",
          )}
          style={{ paddingLeft, paddingRight: 14 }}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={isCollapsed ? "Expandir" : "Colapsar"}
              aria-expanded={!isCollapsed}
              onClick={() => onToggle(row.code)}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-faint transition-colors hover:text-brand"
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )}
          {row.code && (
            <span className="shrink-0 font-mono text-[10.5px] text-faint">{row.code}</span>
          )}
          <span className="overflow-hidden text-ellipsis">{row.name}</span>
        </div>
      </td>

      {visibleColumns.map((col) => {
        const loaded = !loadedColumns || loadedColumns.has(col);
        const cell = loaded ? row.cells[col] : undefined;
        return (
          <DataCell
            key={col}
            value={cell?.value ?? null}
            hasComment={Boolean(cell?.comment)}
            edited={Boolean(cell?.edited)}
            flash={flashCol === col}
            openable={openable && loaded}
            onEdit={(anchor) => onEditCell(row.code, col, anchor, valueEditable)}
          />
        );
      })}

      {showTotal && <TotalCell value={rowTotal(row)} emphasized={Boolean(row.isResult)} />}

      <DetailCell
        code={row.code}
        name={row.name}
        // The result row is derived, not an account of the chart of accounts: it has no ficha.
        available={!row.isResult}
        open={detailOpen}
        onOpen={onOpenDetail}
      />
    </tr>
  );
}

/**
 * The ficha trigger, in its own column pinned to the right edge of the scroller. Pinned because
 * the grid is wider than the viewport almost always: an ordinary last column would sit off
 * screen exactly when the reader is looking at January. The link is always visible — it is a
 * primary way into an account, not a secondary hover affordance — and only darkens on hover.
 */
function DetailCell({
  code,
  name,
  available,
  open,
  onOpen,
}: {
  code: string;
  name: string;
  available: boolean;
  open: boolean;
  onOpen: (code: string) => void;
}) {
  return (
    <td
      className={cn(
        // Its own opaque background: a pinned cell scrolls OVER the amounts, so it cannot let
        // them show through, and it has to follow the row's hover state by hand.
        "sticky right-0 z-[1] w-[62px] border-b border-l border-border-soft bg-surface p-0 text-center transition-colors group-hover:bg-surface-muted",
        open && "bg-brand-soft group-hover:bg-brand-soft",
      )}
    >
      {available && (
        <button
          type="button"
          onClick={() => onOpen(code)}
          aria-label={`Ver ficha de ${name}`}
          className="rounded px-2 py-1 text-[11.5px] font-semibold text-brand underline decoration-brand/30 underline-offset-2 transition-colors hover:decoration-brand"
        >
          ficha
        </button>
      )}
    </td>
  );
}

/**
 * Represents a single month cell with specific styles for negatives, zero/empty values, and comments.
 * Highlights include persistent `edited` styling for adjustments and temporary `flash` for recent changes.
 */
function DataCell({
  value,
  hasComment,
  edited,
  flash,
  openable,
  onEdit,
}: {
  value: number | null;
  hasComment: boolean;
  edited: boolean;
  flash: boolean;
  openable: boolean;
  onEdit: (anchor: EditorAnchor) => void;
}) {
  const tone =
    value !== null && value < 0
      ? "text-negative"
      : value === null || value === 0
        ? "text-zero"
        : "text-ink-soft";
  const mark = hasComment ? (
    <span
      aria-label="Con comentario"
      className="absolute right-0 top-0"
      style={{ borderTop: "8px solid var(--color-warning)", borderLeft: "8px solid transparent" }}
    />
  ) : null;
  const amount = <span>{formatAmount(value)}</span>;
  // Paint stays, ring fades — see the note above on why they are two marks and not one.
  const marks = cn(
    "transition-[background-color,box-shadow] duration-500",
    edited && "bg-marked",
    flash && "shadow-[inset_0_0_0_2px_var(--color-marked-strong)]",
  );

  if (!openable) {
    return (
      <td
        className={cn(
          "relative border-b border-border-soft px-4 py-2.5 text-right text-[13px] font-semibold tabular-nums",
          tone,
          marks,
        )}
      >
        {mark}
        {amount}
      </td>
    );
  }

  return (
    <td className="relative border-b border-border-soft p-0">
      {mark}
      <button
        type="button"
        onClick={(event) => onEdit(anchorOf(event.currentTarget))}
        className={cn(
          "h-full w-full px-4 py-2.5 text-right text-[13px] font-semibold tabular-nums hover:bg-brand-soft",
          tone,
          marks,
        )}
      >
        {amount}
      </button>
    </td>
  );
}

/** The read-only total column: derived, so it is never editable; bold on the result row. */
function TotalCell({ value, emphasized }: { value: number; emphasized: boolean }) {
  const tone = value < 0 ? "text-negative" : emphasized ? "text-brand" : "text-ink";
  return (
    <td
      className={cn(
        "border-b border-l border-border-soft px-4 py-2.5 text-right text-[13px] tabular-nums",
        emphasized ? "font-bold" : "font-semibold",
        tone,
      )}
    >
      {formatAmount(value)}
    </td>
  );
}

function anchorOf(el: HTMLElement): EditorAnchor {
  const rect = el.getBoundingClientRect();
  return { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right };
}

export const DatosTableRow = memo(DatosTableRowImpl);
