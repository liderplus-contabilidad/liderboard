"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/format";
import {
  PERSONNEL_LEGACY_COST_ROWS,
  type PersonnelLegacyAmounts,
  type PersonnelLegacyRowId,
} from "@/lib/personnel-cost/legacy";
import { PersonnelCostCaptureGrid } from "./personnel-cost-capture-grid";
import { usePersonnelCostData } from "./personnel-cost-data-provider";

/**
 * **What a TYPED exercise looks like in Datos** — the four lines of the old sheet, written and read in
 * the same table.
 *
 * It is not a card beside the comparativo: it is what the tab shows INSTEAD of it while such a year is
 * open. The two tables answer the same question at two resolutions —twenty-one accounts against four
 * lines— and side by side the reader would spend the page working out which of them to believe.
 *
 * That it is written where it is read is also why this is not a drawer, the way Ingresos writes its
 * three external figures: there the capture is an ASIDE to a card of percentages, and here it IS the
 * reading. A drawer would have laid this table over the page that was asking for it.
 *
 * WHICH year it writes is not its own decision: the strip of exercises over the whole module
 * (`personnel-cost-year-tabs.tsx`) opens one. The delete does live here, though — it acts on the year
 * the reader is already looking at, and a bin per tab would turn the strip into a minefield.
 */
export function PersonnelCostCapture() {
  const {
    captureYear,
    captureSeries,
    captureRevenue,
    removeCaptureYear,
    typedMonthsIn,
    saveLegacy,
    saveLegacyBlock,
  } = usePersonnelCostData();

  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);

  const commit = useCallback(
    (monthIndex: number, row: PersonnelLegacyRowId, value: number | null) => {
      // The month is written WHOLE: `db.ts` stores a month and not a cell, so the other three lines
      // travel with it unchanged. Sending only the edited one would blank the three beside it.
      const amounts = Object.fromEntries(
        PERSONNEL_LEGACY_COST_ROWS.map((entry) => [entry.id, captureSeries[entry.id][monthIndex]]),
      ) as Record<PersonnelLegacyRowId, number | null>;
      amounts[row] = value;
      void saveLegacy(monthIndex, amounts);
    },
    [captureSeries, saveLegacy],
  );

  const pasteMonths = useCallback(
    (months: readonly { monthIndex: number; amounts: PersonnelLegacyAmounts }[]) => {
      void saveLegacyBlock(months);
    },
    [saveLegacyBlock],
  );

  // The COST of the year, and «Ventas» is deliberately not in it: the line is a divisor, not a fifth
  // concept, so summing it here would inflate the very figure the percentage beside it divides.
  const total = useMemo(() => {
    let sum = 0;
    for (const row of PERSONNEL_LEGACY_COST_ROWS) {
      for (const value of captureSeries[row.id]) {
        sum += value ?? 0;
      }
    }
    return sum;
  }, [captureSeries]);

  const typed = typedMonthsIn(captureYear);

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-[13px] border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-[11px]">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">
            Registrar datos · <span className="font-mono tabular-nums">{captureYear}</span>
          </h3>
          <p className="mt-0.5 truncate text-[11.5px] text-muted">
            {typed} {typed === 1 ? "mes escrito" : "meses escritos"} ·{" "}
            <span className="font-mono tabular-nums">{formatCurrency(total, { cents: true })}</span>
          </p>
        </div>
        {/* El borrado actúa sobre el año ABIERTO y por eso vive aquí: es el que el lector ya está
            mirando, y una papelera por pestaña convertiría la tira de arriba en un campo de minas. */}
        {typed > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 size={14} />}
            onClick={() => setPendingRemoval(captureYear)}
          >
            Borrar {captureYear}
          </Button>
        )}
      </header>

      <div className="flex flex-col gap-4 px-[18px] py-4">
        <p className="text-[12.5px] leading-[1.5] text-muted">
          Los ejercicios anteriores a MicroPlus no salen del estado de resultados: se escriben aquí,
          con las cuatro líneas que llevaba la hoja. Puedes teclearlos o pegar un bloque copiado del
          Excel — una fila por concepto, una columna por mes. Las <strong>ventas</strong> de la
          última fila no se escriben aquí: salen del estado de resultados donde lo hay y de
          «Reportería de ingresos» donde no, y sin ellas el «% vs ventas» queda en «–».
        </p>

        <PersonnelCostCaptureGrid
          series={captureSeries}
          revenue={captureRevenue}
          onCommit={commit}
          onPasteMonths={pasteMonths}
        />
      </div>

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={`Borrar el ejercicio ${pendingRemoval ?? ""}`}
        description="Se borran los doce meses de las cuatro líneas. No se puede deshacer."
        confirmLabel="Borrar"
        variant="destructive"
        busy={removing}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval === null) {
            return;
          }
          setRemoving(true);
          void removeCaptureYear(pendingRemoval).finally(() => {
            setRemoving(false);
            setPendingRemoval(null);
          });
        }}
      />
    </section>
  );
}
