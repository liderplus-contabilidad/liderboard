import { memo } from "react";
import { GridRow } from "@/components/data-table/data-grid";
import { Cell } from "@/components/data-table/grid-cells";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import type { JournalLine } from "@/lib/payroll/journal";

interface JournalEntryRowProps {
  line: JournalLine;
}

/**
 * Una fila del asiento: código · cuenta · debe · haber. El nombre se envuelve en un `<span>`
 * propio (en vez de pasarle peso/color a `Cell` por `className`) porque `Cell` ya trae
 * `font-normal` puesto de fábrica — competir por la misma propiedad en el mismo `<td>` queda a
 * merced del orden con que Tailwind emite las reglas, y un `<span>` hijo no tiene ese problema.
 */
function JournalEntryRowComponent({ line }: JournalEntryRowProps) {
  const isHaber = line.side === "haber";
  const tone = line.amount === null ? "muted" : "default";

  return (
    <GridRow>
      <Cell>
        <span className="font-mono text-faint">{line.code ?? "—"}</span>
      </Cell>
      <Cell>
        <span className={cn("text-ink", isHaber ? "ml-6 font-normal" : "font-semibold")}>
          {line.name}
        </span>
      </Cell>
      <Cell numeric tone={tone} className="font-mono">
        {line.side === "debe" ? (line.amount === null ? "—" : formatAmount(line.amount)) : null}
      </Cell>
      <Cell numeric tone={tone} className="font-mono">
        {line.side === "haber" ? (line.amount === null ? "—" : formatAmount(line.amount)) : null}
      </Cell>
    </GridRow>
  );
}

// El asiento entero puede repintarse con cada toggle de «Ocultar ceros» — memoizada con key
// estable (`line.id`), igual que `EmployeeRow`.
export const JournalEntryRow = memo(JournalEntryRowComponent);
