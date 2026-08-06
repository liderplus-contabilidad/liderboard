"use client";

import { Copy, Plus, SquarePlus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownPanel, useDropdown } from "@/components/ui/dropdown";
import { Select } from "@/components/ui/select";
import { MONTHS_FULL_ES } from "@/lib/date";
import { periodLongLabel, proposeNextPeriod, sourceForCopy } from "@/lib/payroll/periods";
import type { PayrollPeriod } from "@/lib/payroll/types";
import { usePayrollData } from "./payroll-data-provider";

/**
 * Años que ofrece el formulario: los que el cliente ya tiene, más un margen alrededor del
 * propuesto — así un backfill de un año anterior sigue estando a un clic, y no hay que escribir
 * un año a mano para volver atrás.
 */
function yearOptions(existingYears: readonly number[], proposedYear: number): number[] {
  const margin = [proposedYear - 2, proposedYear - 1, proposedYear, proposedYear + 1];
  return [...new Set([...existingYears, ...margin])].sort((a, b) => a - b);
}

export interface NewPeriodFormProps {
  /**
   * Cuando llega, la fuente de «Copiar nómina» es ESTE período — no el resuelto contra el
   * destino elegido. Es lo que separa el disparador del encabezado (resuelve la fuente contra el
   * destino, con `sourceForCopy`) del menú «⋯» de una fila (la fija de antemano): comparten el
   * formulario, no la fuente.
   */
  fixedSource?: PayrollPeriod;
  /** Llamado tras crear el período, para que quien lo aloja (el popover del encabezado o el de
   *  una fila) se cierre. */
  onDone: () => void;
}

/**
 * El formulario de «Nuevo período», compartido por sus dos puertas — el popover del encabezado y
 * el menú «⋯» de una fila —, igual que `useEntityNaming` lo hace para el nombre del cliente. Un
 * mecanismo por debajo, dos maneras de resolver la fuente.
 */
export function NewPeriodForm({ fixedSource, onDone }: NewPeriodFormProps) {
  const { periods, years, rosterByPeriod, createPeriod, periodClash } = usePayrollData();

  // `today` entra aquí, en el componente — nunca dentro de `lib/payroll/` — para que
  // `proposeNextPeriod` siga siendo determinista y testeable.
  const proposed = useMemo(() => proposeNextPeriod(periods, new Date()), [periods]);
  const [year, setYear] = useState(proposed.year);
  const [monthIndex, setMonthIndex] = useState(proposed.monthIndex);
  const [busy, setBusy] = useState<"copy" | "blank" | null>(null);

  // La fuente se recalcula en cada cambio de mes/año: sin esto, rellenar un mes hacia atrás (el
  // cliente ya tiene junio y se registra abril) copiaría del período equivocado.
  const resolvedSource = useMemo(
    () => fixedSource ?? sourceForCopy(periods, year, monthIndex),
    [fixedSource, periods, year, monthIndex],
  );
  const sourceHasRoster = resolvedSource
    ? (rosterByPeriod.get(resolvedSource.id)?.employees ?? 0) > 0
    : false;
  // El botón de copiar NO se renderiza (no aparece deshabilitado) cuando la fuente no existe o no
  // tiene nómina — copiar cero empleados prometiendo «se traen empleados, cargos y sueldos base»
  // sería mentir. Misma regla que «Segmentar gastos» en PyG, que desaparece en vez de apagarse.
  const showCopyButton = resolvedSource !== null && sourceHasRoster;

  const clash = periodClash(year, monthIndex);
  // Con el destino ocupado, las DOS salidas se apagan — no solo una — porque ninguna de las dos
  // tiene a dónde escribir.
  const disabled = clash !== null || busy !== null;

  const availableYears = useMemo(() => yearOptions(years, year), [years, year]);

  const runCreate = useCallback(
    async (kind: "copy" | "blank") => {
      setBusy(kind);
      try {
        await createPeriod(year, monthIndex, kind === "copy" ? resolvedSource?.id : undefined);
        onDone();
      } finally {
        setBusy(null);
      }
    },
    [createPeriod, year, monthIndex, resolvedSource, onDone],
  );

  return (
    <div className="w-full">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
        Nuevo período
      </span>

      <div className="mt-2 flex gap-2">
        <span className="min-w-0 flex-1">
          <Select
            aria-label="Mes del período"
            value={String(monthIndex)}
            onChange={(event) => setMonthIndex(Number(event.target.value))}
            options={MONTHS_FULL_ES.map((name, index) => ({ value: String(index), label: name }))}
          />
        </span>
        <span className="w-[92px] shrink-0">
          <Select
            aria-label="Año del período"
            value={String(year)}
            onChange={(event) => setYear(Number(event.target.value))}
            options={availableYears.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </span>
      </div>

      {clash && (
        <p className="mt-2 text-[11.5px] text-negative">Ya existe {clash} en este cliente.</p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {resolvedSource !== null && sourceHasRoster && (
          <Button
            icon={<Copy size={15} />}
            disabled={disabled}
            onClick={() => void runCreate("copy")}
            className="w-full"
          >
            {busy === "copy"
              ? "Copiando…"
              : `Copiar nómina de ${periodLongLabel(resolvedSource.year, resolvedSource.monthIndex)}`}
          </Button>
        )}
        <Button
          variant="secondary"
          icon={<SquarePlus size={15} />}
          disabled={disabled}
          onClick={() => void runCreate("blank")}
          className="w-full"
        >
          {busy === "blank" ? "Creando…" : "Crear"}
        </Button>
      </div>

      {/* Solo se rinde cuando el botón de copiar está presente: sin él, explicaría una acción
          que no está en pantalla. */}
      {showCopyButton && (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-faint">
          Al copiar se traen empleados, cargos y sueldos base del período anterior; los valores del
          mes se recalculan.
        </p>
      )}
    </div>
  );
}

/** El disparador «+ Nuevo período»: un `Button` normal que también hace de ancla del popover, vía
 *  `useDropdown()` — la ruta que `DropdownTrigger` no cubre porque su look es el de un filtro, no
 *  el de una acción primaria. */
function NewPeriodTrigger() {
  const { open, setOpen, triggerRef } = useDropdown();
  return (
    <Button
      ref={triggerRef}
      icon={<Plus size={15} />}
      size="toolbar"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      Nuevo período
    </Button>
  );
}

/** Cierra el popover del encabezado tras crear el período — vive dentro de `<Dropdown>` para
 *  poder llamar a `setOpen(false)`. */
function NewPeriodPanelContent() {
  const { setOpen } = useDropdown();
  return <NewPeriodForm onDone={() => setOpen(false)} />;
}

/**
 * «+ Nuevo período»: el mismo disparador para el encabezado de la tarjeta y para el vacío. Un
 * popover anclado bajo el botón — sin scrim, el historial detrás sigue legible — en vez del
 * diálogo centrado de antes; se cierra con Escape o con un clic fuera (ambos ya resueltos por
 * `Dropdown`/`DropdownPanel`).
 */
export function NewPeriodButton() {
  return (
    <Dropdown>
      <NewPeriodTrigger />
      <DropdownPanel align="right" width={320}>
        <NewPeriodPanelContent />
      </DropdownPanel>
    </Dropdown>
  );
}
