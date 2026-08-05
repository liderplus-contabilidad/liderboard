"use client";

import { CalendarPlus, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { MONTHS_FULL_ES } from "@/lib/date";
import { proposeNextPeriod } from "@/lib/payroll/periods";
import { usePayrollData } from "./payroll-data-provider";

/**
 * Años que ofrece el diálogo: los que el cliente ya tiene, más un margen alrededor del propuesto
 * — así un backfill de un año anterior sigue estando a un clic, y no hay que escribir un año a
 * mano para volver atrás.
 */
function yearOptions(existingYears: readonly number[], proposedYear: number): number[] {
  const margin = [proposedYear - 2, proposedYear - 1, proposedYear, proposedYear + 1];
  return [...new Set([...existingYears, ...margin])].sort((a, b) => a - b);
}

/**
 * Estado y validación del diálogo «Nuevo período», compartido por sus dos disparadores — el botón
 * del encabezado de la tarjeta y el del vacío «sin períodos» —, igual que `useEntityNaming` lo
 * hace para el nombre del cliente.
 */
function useNewPeriodDialog() {
  const { periods, years, createPeriod, periodClash } = usePayrollData();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(0);
  const [monthIndex, setMonthIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openDialog = useCallback(() => {
    // `today` llega aquí, en el componente — nunca dentro de la capa pura — para que
    // `proposeNextPeriod` siga siendo determinista y testeable.
    const proposed = proposeNextPeriod(periods, new Date());
    setYear(proposed.year);
    setMonthIndex(proposed.monthIndex);
    setError(null);
    setOpen(true);
  }, [periods]);

  const availableYears = useMemo(
    () => yearOptions(years, year || new Date().getFullYear()),
    [years, year],
  );

  const submit = useCallback(async () => {
    const clash = periodClash(year, monthIndex);
    if (clash) {
      setError(`Ya existe ${clash} en este cliente.`);
      return;
    }
    setBusy(true);
    try {
      await createPeriod(year, monthIndex);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }, [year, monthIndex, periodClash, createPeriod]);

  const dialog = open ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="w-full max-w-[380px] rounded-[13px] border border-border bg-surface p-5 shadow-[0_24px_60px_rgba(15,23,42,0.24)]"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft">
            <CalendarPlus size={17} className="text-brand" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">Nuevo período</h2>
            <p className="mt-0.5 text-[12.5px] text-faint">
              Se crea vacío; los datos se cargan después.
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <span className="w-[96px] shrink-0">
            <Select
              label="Año"
              aria-label="Año del período"
              value={String(year)}
              onChange={(event) => {
                setYear(Number(event.target.value));
                setError(null);
              }}
              options={availableYears.map((y) => ({ value: String(y), label: String(y) }))}
            />
          </span>
          <span className="min-w-0 flex-1">
            <Select
              label="Mes"
              aria-label="Mes del período"
              value={String(monthIndex)}
              onChange={(event) => {
                setMonthIndex(Number(event.target.value));
                setError(null);
              }}
              options={MONTHS_FULL_ES.map((name, index) => ({ value: String(index), label: name }))}
            />
          </span>
        </div>

        {error && <p className="mt-2.5 text-[11.5px] text-negative">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            Crear período
          </Button>
        </div>
      </form>
    </div>
  ) : null;

  return { openDialog, dialog };
}

/** «+ Nuevo período»: el mismo disparador para el encabezado de la tarjeta y para el vacío. */
export function NewPeriodButton() {
  const { openDialog, dialog } = useNewPeriodDialog();
  return (
    <>
      <Button icon={<Plus size={15} />} size="toolbar" onClick={openDialog}>
        Nuevo período
      </Button>
      {dialog}
    </>
  );
}
