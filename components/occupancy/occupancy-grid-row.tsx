"use client";

import { X } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { parseCurrency } from "@/lib/format";
import type { OccupancyGridRow as GridRow } from "@/lib/occupancy/derive";
import { formatAggregate, formatDayCell, seedEditValue } from "./occupancy-format";

export interface OccupancyRowProps {
  row: GridRow;
  /** Navigation row index among editable rows (for arrow-key focus); undefined if read-only. */
  navRow?: number;
  /** Days flagged by the cuadre checks — tinted on the two TOTAL rows only. */
  mismatch: Set<number>;
  /** True in the consolidated view: every row renders as text, nothing accepts input. */
  readOnly?: boolean;
  onSaveCell: (rowId: string, dayIndex: number, value: number) => void;
  /** Present on channel rows only. */
  onRemoveChannel?: (id: string) => void;
}

/**
 * The blue tint means exactly one thing: THIS ROW IS COMPUTED. No other signal shares it.
 *
 * Memoised because a month can be 25 rows × 31 cells and one keystroke must not re-render it all.
 */
export const OccupancyRow = memo(function OccupancyRow({
  row,
  navRow,
  mismatch,
  readOnly = false,
  onSaveCell,
  onRemoveChannel,
}: OccupancyRowProps) {
  const isSection = row.kind === "section";
  const isDerived = row.kind === "derived";
  // Text, not disabled inputs: a greyed-out field invites a fight, a figure reads as a figure.
  const editable = row.editable && !readOnly;
  const flagsMismatch = row.id === "totalChannels" || row.id === "totalRooms";

  if (isSection) {
    return (
      <tr>
        <th
          scope="colgroup"
          colSpan={row.cells.length + 2}
          className="sticky left-0 z-[1] border-y-2 border-brand/15 bg-brand-soft px-[14px] py-2 text-left text-[11px] font-bold uppercase tracking-[0.7px] text-brand"
        >
          {row.label}
          {row.hint && (
            <span className="ml-2 font-medium normal-case tracking-normal text-muted">
              · {row.hint}
            </span>
          )}
        </th>
      </tr>
    );
  }

  return (
    <tr className="group/row">
      <th
        scope="row"
        className={cn(
          "sticky left-0 z-[1] border-b border-r border-border-soft px-[14px] py-1.5 text-left align-middle",
          isDerived ? "bg-surface-calc-strong" : "bg-surface",
        )}
      >
        <div className="flex items-center gap-1.5">
          {isDerived && (
            <span
              aria-hidden
              title="Calculado automáticamente"
              className="inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded border border-chip-border bg-surface font-mono text-[10px] font-bold italic text-brand"
            >
              f
            </span>
          )}
          <span
            className={cn("text-[12.5px] font-semibold", isDerived ? "text-brand" : "text-ink")}
          >
            {row.label}
          </span>
          {onRemoveChannel && (
            <button
              type="button"
              aria-label={`Quitar el canal ${row.label}`}
              onClick={() => onRemoveChannel(row.id.replace("channel:", ""))}
              className="ml-auto shrink-0 rounded p-0.5 text-faintest opacity-0 transition-opacity hover:text-negative focus-visible:opacity-100 group-hover/row:opacity-100"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {row.hint && (
          <div
            className={cn(
              "text-[10.5px] leading-tight",
              isDerived ? "text-brand/60" : "text-faint",
            )}
          >
            {row.hint}
          </div>
        )}
      </th>

      {row.cells.map((value, day) => (
        <DayCell
          key={day}
          rowId={row.id}
          day={day}
          navRow={navRow}
          value={value}
          format={row.format}
          editable={editable}
          derived={isDerived}
          mismatch={flagsMismatch && mismatch.has(day)}
          onSave={onSaveCell}
        />
      ))}

      <td
        className={cn(
          "sticky right-0 z-[1] border-b border-l border-border px-[14px] py-1.5 text-right text-[12.5px] font-bold tabular-nums",
          isDerived ? "bg-surface-calc-strong text-brand" : "bg-surface-header text-ink",
        )}
      >
        {formatAggregate(row.agg, row.format)}
      </td>
    </tr>
  );
});

interface DayCellProps {
  rowId: string;
  day: number;
  /** This cell's row index within the editable rows; used for arrow-key focus moves. */
  navRow?: number;
  value: number | null;
  format: GridRow["format"];
  editable: boolean;
  /** Computed row — carries the blue "calculated" fill. */
  derived: boolean;
  mismatch: boolean;
  onSave: (rowId: string, dayIndex: number, value: number) => void;
}

/** Moves focus to the editable cell at (navRow, day), if one exists. */
function focusCell(navRow: number, day: number): void {
  const target = document.querySelector<HTMLInputElement>(`input[data-nav="${navRow}-${day}"]`);
  if (target) {
    target.focus();
    target.select();
  }
}

/**
 * While focused the input holds a local DRAFT, so the live query re-rendering mid-typing cannot
 * yank the caret; it commits on blur or Enter and is dropped on Escape.
 *
 * Left/Right jump columns only when the caret is already at the field's edge, so they still move
 * within the text otherwise.
 */
function DayCell({
  rowId,
  day,
  navRow,
  value,
  format,
  editable,
  derived,
  mismatch,
  onSave,
}: DayCellProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = useCallback(
    (text: string) => {
      const parsed = parseCurrency(text);
      const next = parsed ?? 0;
      if (next !== (value ?? 0)) {
        onSave(rowId, day, next);
      }
    },
    [onSave, rowId, day, value],
  );

  // A failed cuadre outranks the calculated tint.
  const background = mismatch ? "bg-negative/10" : derived ? "bg-surface-calc" : undefined;

  if (!editable) {
    return (
      <td
        className={cn(
          // nowrap: "40,91 %" would otherwise break after the number and double the row height.
          "whitespace-nowrap border-b border-l border-border-faint px-2 py-1.5 text-right text-[11.5px] tabular-nums",
          derived
            ? "font-semibold text-brand"
            : value === null || value === 0
              ? "text-zero"
              : "text-ink-soft",
          background,
        )}
      >
        {formatDayCell(value, format)}
      </td>
    );
  }

  return (
    <td className={cn("border-b border-l border-border-faint p-0", background)}>
      <input
        inputMode="decimal"
        aria-label={`${rowId} día ${day + 1}`}
        {...(navRow !== undefined ? { "data-nav": `${navRow}-${day}` } : {})}
        // Idle shows the compact display form; focus swaps in the exact value (the draft).
        value={draft ?? formatDayCell(value, format)}
        onFocus={(e) => {
          setDraft(seedEditValue(value));
          e.target.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          commit(e.target.value);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          const input = e.currentTarget;
          const len = input.value.length;
          // A whole-field selection counts as being at either edge, so the first horizontal
          // arrow jumps to the neighbour instead of only collapsing the selection.
          const allSelected = input.selectionStart === 0 && input.selectionEnd === len;
          const atStart = allSelected || (input.selectionStart === 0 && input.selectionEnd === 0);
          const atEnd = allSelected || (input.selectionStart === len && input.selectionEnd === len);

          if (e.key === "Escape") {
            setDraft(null);
            input.blur();
          } else if (e.key === "Enter" || e.key === "ArrowDown") {
            if (navRow !== undefined) {
              e.preventDefault();
              focusCell(navRow + 1, day);
            } else {
              input.blur();
            }
          } else if (e.key === "ArrowUp" && navRow !== undefined) {
            e.preventDefault();
            focusCell(navRow - 1, day);
          } else if (e.key === "ArrowLeft" && atStart && navRow !== undefined) {
            e.preventDefault();
            focusCell(navRow, day - 1);
          } else if (e.key === "ArrowRight" && atEnd && navRow !== undefined) {
            e.preventDefault();
            focusCell(navRow, day + 1);
          }
        }}
        className={cn(
          "w-full min-w-[70px] bg-transparent px-2 py-1.5 text-right text-[11.5px] tabular-nums outline-none",
          "focus:bg-brand-soft focus:ring-1 focus:ring-inset focus:ring-brand",
          value === null || value === 0 ? "text-zero" : "text-ink",
        )}
      />
    </td>
  );
}
