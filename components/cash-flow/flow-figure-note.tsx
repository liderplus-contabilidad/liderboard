"use client";

import { createContext, useContext } from "react";
import { StatTile } from "@/components/ui/stat-tile";
import { Cell } from "@/components/data-table/grid-cells";
import type { ComponentProps } from "react";
import { CellNote, NOTE_HOST } from "@/components/ui/cell-note";
import { figureNoteKey } from "@/lib/cash-flow/cell-notes";
import { cn } from "@/lib/cn";

export const FlowNotesContext = createContext<{
  notes: Readonly<Record<string, string>>;
  onNote: (key: string, text: string) => void;
}>({ notes: {}, onNote: () => {} });

export function FlowFigureNote({
  section,
  row,
  column,
  label,
}: {
  section: string;
  row: string;
  column: string;
  label?: string;
}) {
  const { notes, onNote } = useContext(FlowNotesContext);
  const key = figureNoteKey(section, row, column);
  return (
    <CellNote
      note={notes[key]}
      label={label ?? `${column} de ${row}`}
      onChange={(text) => onNote(key, text)}
    />
  );
}

export function FlowFigureCell({
  section,
  row,
  column,
  label,
  children,
  className,
  ...props
}: ComponentProps<typeof Cell> & {
  section: string;
  row: string;
  column: string;
  label?: string;
}) {
  return (
    <Cell {...props} className={cn(NOTE_HOST, className)}>
      <FlowFigureNote section={section} row={row} column={column} label={label} />
      {children}
    </Cell>
  );
}

export function FlowFigureTile({
  section,
  row,
  column,
  ...props
}: ComponentProps<typeof StatTile> & {
  section: string;
  row: string;
  column: string;
}) {
  return (
    <div className={cn(NOTE_HOST, "flex-1")}>
      <FlowFigureNote
        section={section}
        row={row}
        column={column}
        label={typeof props.label === "string" ? props.label : column}
      />
      <StatTile {...props} />
    </div>
  );
}
