import { memo } from "react";
import { GridRow } from "@/components/data-table/data-grid";
import { Cell } from "@/components/data-table/grid-cells";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import type { JournalLine } from "@/lib/payroll/journal";

interface JournalEntryRowProps {
  line: JournalLine;
}

/**
 * El importe de una fila: con `$` y centavos, la misma moneda que el resto de la app —el contador
 * coteja esta tabla contra su hoja y contra las otras pantallas, y dos dialectos del dólar se leen
 * como dos clases de cifra.
 *
 * `formatCurrencyOrDash` NO sirve aquí: pinta el cero como ausencia, y en el asiento un `0` dice
 * «esa columna no se movió» mientras que `null` dice «no se sabe» — la distinción que sostiene el
 * interruptor «Ocultar ceros», que esconde los primeros y conserva los segundos.
 */
function amount(value: number | null): string {
  return value === null ? "—" : formatCurrency(value, { cents: true });
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
        {line.side === "debe" ? amount(line.amount) : null}
      </Cell>
      <Cell numeric tone={tone} className="font-mono">
        {line.side === "haber" ? amount(line.amount) : null}
      </Cell>
    </GridRow>
  );
}

// El asiento entero puede repintarse con cada toggle de «Ocultar ceros» — memoizada con key
// estable (`line.id`), igual que `EmployeeRow`.
export const JournalEntryRow = memo(JournalEntryRowComponent);
