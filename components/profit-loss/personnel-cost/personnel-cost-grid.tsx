"use client";

import { memo, useCallback } from "react";
import { NumericInput } from "@/components/ui/numeric-input";
import { cn } from "@/lib/cn";
import { formatCurrencyOrDash, formatPercentOrDash } from "@/lib/format";
import { PERSONNEL_GROUPS } from "@/lib/personnel-cost/accounts";
import type { PersonnelGrid, PersonnelGridCell, PersonnelGridRow } from "@/lib/personnel-cost/grid";

/**
 * The comparativo, drawn from `buildPersonnelGrid`'s data and deciding nothing of its own: which rows
 * exist, which cells write and where each percentage sits are all answered in `lib/personnel-cost/`,
 * which is what lets those answers be tested against the firm's real workbook.
 *
 * **The nómina de la familia is captured HERE, in the row that shows it.** It is one figure per month
 * and the table already puts every month in front of the reader, so a drawer for it would be a second
 * surface for the same twelve cells — and it would put the number being typed away from the row that
 * changes when you type it. The gesture is Datos' and Ocupaciones': it commits on leaving the cell,
 * with no «Guardar» button, because a save button here would be a second truth about whether what is
 * on screen is what is stored.
 *
 * A cell writes only where its month has an estado de resultados behind it: capturing against a month
 * PyG never loaded would be a figure with nothing to be carved out of.
 */

/**
 * Two sticky columns, not three: the ACCOUNT rides under the concept instead of taking a column of
 * its own.
 *
 * It is a column that never needs to be read across —nobody scans a list of codes— and as its own it
 * cost a hundred pixels of the width the months are competing for. Under the label it is exactly what
 * `ChartTableRow.sublabel` already is elsewhere in the app: what identifies the row WITHOUT being its
 * name, in the one place there is room for both.
 */
const GROUP_WIDTH = 108;
const CONCEPT_WIDTH = 330;

interface PersonnelCostGridProps {
  grid: PersonnelGrid;
  /** Commits one month of the captured row. `null` clears it. */
  onCapture: (year: number, monthIndex: number, amount: number | null) => void;
}

export function PersonnelCostGrid({ grid, onCapture }: PersonnelCostGridProps) {
  return (
    <div className="overflow-x-auto rounded-[13px] border border-border bg-surface">
      <table className="w-full border-collapse">
        <thead>
          {/* The band exists only when there is more than one block: with a single exercise it would
              repeat what the toolbar and every subtitle already say. It is drawn from `grid.blocks`
              and not from the columns' years, because the consolidado is a block with no year — the
              divide-by-count shortcut left it with an empty heading. */}
          {grid.blocks.length > 1 && (
            <tr>
              <th
                colSpan={2}
                style={{ left: 0 }}
                // z-20 and never higher: `Dropdown`'s panel is a `fixed z-30`, and the table comes
                // AFTER the toolbar in the DOM — at the same level this cell painted OVER the open
                // year list and swallowed a whole option. It is the ceiling `grid-cells.tsx` already
                // holds for a sticky head cell.
                className="sticky z-20 border-b border-r border-border bg-surface-header px-3.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.6px] text-faintest"
              >
                Ejercicio
              </th>
              {grid.blocks.map((block) => (
                <th
                  key={block.key}
                  colSpan={block.span}
                  className={cn(
                    "border-b border-l border-border bg-surface-header px-3.5 py-2 text-center text-[12px] font-semibold text-brand",
                    // The exercises are figures and take the mono face the app gives every code and
                    // amount; «Consolidado» is a word and does not.
                    block.year === null
                      ? "uppercase tracking-[0.5px] text-[10.5px]"
                      : "font-mono tabular-nums",
                  )}
                >
                  {block.label}
                </th>
              ))}
            </tr>
          )}
          <tr>
            <HeadCell sticky width={GROUP_WIDTH} offset={0}>
              Grupo
            </HeadCell>
            <HeadCell sticky bordered width={CONCEPT_WIDTH} offset={GROUP_WIDTH}>
              Concepto
            </HeadCell>
            {grid.columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "border-b border-border bg-surface-header px-3.5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.4px] tabular-nums",
                  column.kind === "share" ? "bg-surface-calc text-brand" : "text-faint",
                  column.startsBlock && "border-l border-border",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <GridRow key={row.key} row={row} onCapture={onCapture} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeadCell({
  children,
  width,
  offset,
  sticky,
  bordered,
}: {
  children?: React.ReactNode;
  width: number;
  offset: number;
  sticky?: boolean;
  bordered?: boolean;
}) {
  return (
    <th
      style={{ minWidth: width, width, left: sticky ? offset : undefined }}
      className={cn(
        "border-b border-border bg-surface-header px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-faint",
        sticky && "sticky z-20",
        bordered && "border-r border-border",
      )}
    >
      {children}
    </th>
  );
}

/** Each level of the reading gets its own weight; the total closes the table in `brand`. */
const ROW_TONE: Record<PersonnelGridRow["kind"], string> = {
  concept: "",
  group: "bg-surface-calc font-semibold text-brand",
  section: "bg-surface-calc-strong font-semibold text-brand",
  grand: "bg-brand font-semibold text-white",
};

const STICKY_TONE: Record<PersonnelGridRow["kind"], string> = {
  concept: "bg-surface",
  group: "bg-surface-calc",
  section: "bg-surface-calc-strong",
  grand: "bg-brand",
};

const GridRow = memo(function GridRow({
  row,
  onCapture,
}: {
  row: PersonnelGridRow;
  onCapture: PersonnelCostGridProps["onCapture"];
}) {
  const groupLabel = PERSONNEL_GROUPS.find((group) => group.id === row.group)?.label;

  return (
    <tr className={cn("border-b border-border-soft", ROW_TONE[row.kind])}>
      {/* The band opens on the first row of its group and spans down to its subtotal, which is the
          workbook's own column A. A row that does not open one renders NOTHING, not an empty cell:
          the `rowspan` above already occupies the slot. */}
      {row.groupSpan > 0 && (
        <th
          scope="rowgroup"
          rowSpan={row.groupSpan}
          style={{ left: 0 }}
          className="sticky z-10 border-b border-r border-border bg-surface-header px-3.5 pt-3 align-top text-left text-[10.5px] font-semibold uppercase leading-tight tracking-[0.6px] text-faint"
        >
          {groupLabel}
        </th>
      )}
      {/* A computed row has no band above it, so its label takes BOTH slots: merging them is what
          keeps «Externos · subtotal honorarios médicos» on one line, and it leaves no empty cell for a
          screen reader to walk through. */}
      <td
        colSpan={row.kind === "concept" ? 1 : 2}
        style={{ left: row.kind === "concept" ? GROUP_WIDTH : 0 }}
        className={cn(
          "sticky z-10 border-b border-r border-border-soft border-r-border px-3.5 py-2 text-left text-[12.5px]",
          STICKY_TONE[row.kind],
        )}
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn(row.missing && "text-muted")}>{row.label}</span>
          {row.hint && <span className="text-[11px] font-normal text-faint">{row.hint}</span>}
          {/* A row whose account is not in the plan is NOT a row of zeros, and saying so is the only
              way the reader can tell «no existe» from «no movió». */}
          {row.missing && (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10.5px] font-semibold text-warning">
              Sin cuenta en el plan
            </span>
          )}
        </span>
        {row.kind === "concept" && (
          <span className="mt-0.5 block font-mono text-[11px] font-normal text-faint">
            {row.code ?? "Sin cuenta"}
          </span>
        )}
      </td>

      {row.cells.map((cell) => (
        <GridCell key={cell.key} cell={cell} kind={row.kind} onCapture={onCapture} />
      ))}
    </tr>
  );
});

function GridCell({
  cell,
  kind,
  onCapture,
}: {
  cell: PersonnelGridCell;
  kind: PersonnelGridRow["kind"];
  onCapture: PersonnelCostGridProps["onCapture"];
}) {
  const edit = cell.edit;
  const commit = useCallback(
    (value: number | null) => {
      if (edit) {
        onCapture(edit.year, edit.monthIndex, value);
      }
    },
    [edit, onCapture],
  );

  if (edit) {
    return (
      <td className="border-b border-l border-border-soft border-l-border-faint bg-marked/50 p-0">
        <NumericInput
          value={cell.value}
          onCommit={commit}
          format="currency"
          nullable
          ariaLabel={`Nómina de familia · mes ${edit.monthIndex + 1} de ${edit.year}`}
          className="w-full border border-transparent px-2.5 py-2 text-[12.5px] focus:border-brand focus:bg-surface"
        />
      </td>
    );
  }

  const text =
    cell.kind === "share" ? formatPercentOrDash(cell.value) : formatCurrencyOrDash(cell.value);

  return (
    <td
      className={cn(
        "border-b border-border-soft px-3.5 py-2 text-right text-[12.5px] tabular-nums",
        cell.kind === "share" && kind !== "grand" && "bg-surface-calc",
        kind === "grand"
          ? "text-white"
          : cell.kind === "total"
            ? "font-semibold text-brand"
            : cell.value === null || cell.value === 0
              ? "text-zero"
              : "text-ink",
      )}
    >
      {text}
    </td>
  );
}
