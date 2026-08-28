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
 * Years the form offers: the ones the client already has, plus a margin around the proposed one — so
 * backfilling an earlier year is still one click away, and no year has to be typed by hand to go
 * back.
 */
function yearOptions(existingYears: readonly number[], proposedYear: number): number[] {
  const margin = [proposedYear - 2, proposedYear - 1, proposedYear, proposedYear + 1];
  return [...new Set([...existingYears, ...margin])].sort((a, b) => a - b);
}

export interface NewPeriodFormProps {
  /**
   * When it arrives, the source of «Copiar nómina» is THIS período — not the one resolved against the
   * chosen destination. It is what separates the header's trigger (which resolves the source against
   * the destination, with `sourceForCopy`) from a row's «⋯» menu (which fixes it beforehand): they
   * share the form, not the source.
   */
  fixedSource?: PayrollPeriod;
  /** Called after creating the período, so whoever hosts it (the header's popover or a row's) can
   *  close. */
  onDone: () => void;
}

/**
 * The «Nuevo período» form, shared by its two doors — the header's popover and a row's «⋯» menu —,
 * just as `useEntityNaming` does for the client's name. One mechanism underneath, two ways of
 * resolving the source.
 */
export function NewPeriodForm({ fixedSource, onDone }: NewPeriodFormProps) {
  const { periods, years, rosterByPeriod, createPeriod, periodClash } = usePayrollData();

  // `today` enters here, in the component — never inside `lib/payroll/` — so `proposeNextPeriod` stays
  // deterministic and testable.
  const proposed = useMemo(() => proposeNextPeriod(periods, new Date()), [periods]);
  const [year, setYear] = useState(proposed.year);
  const [monthIndex, setMonthIndex] = useState(proposed.monthIndex);
  const [busy, setBusy] = useState<"copy" | "blank" | null>(null);

  // The source is recomputed on every month/year change: without this, backfilling a month (the client
  // already has June and April is registered) would copy from the wrong período.
  const resolvedSource = useMemo(
    () => fixedSource ?? sourceForCopy(periods, year, monthIndex),
    [fixedSource, periods, year, monthIndex],
  );
  const sourceHasRoster = resolvedSource
    ? (rosterByPeriod.get(resolvedSource.id)?.employees ?? 0) > 0
    : false;
  // The copy button is NOT rendered (it does not appear disabled) when the source does not exist or has
  // no nómina — copying zero employees while promising «se traen empleados, cargos y sueldos base»
  // would be a lie. Same rule as «Segmentar gastos» in PyG, which disappears instead of switching off.
  const showCopyButton = resolvedSource !== null && sourceHasRoster;

  const clash = periodClash(year, monthIndex);
  // With the destination taken, BOTH exits switch off — not just one — because neither has anywhere to
  // write.
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

      {/* Rendered only when the copy button is present: without it, it would explain an action that is
          not on screen. */}
      {showCopyButton && (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-faint">
          Al copiar se traen empleados, cargos y sueldos base del período anterior; los valores del
          mes se recalculan.
        </p>
      )}
    </div>
  );
}

/** The «+ Nuevo período» trigger: an ordinary `Button` that also acts as the popover's anchor, via
 *  `useDropdown()` — the route `DropdownTrigger` does not cover because its look is that of a filter,
 *  not of a primary action. */
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

/** Closes the header's popover after creating the período — it lives inside `<Dropdown>` so it can
 *  call `setOpen(false)`. */
function NewPeriodPanelContent() {
  const { setOpen } = useDropdown();
  return <NewPeriodForm onDone={() => setOpen(false)} />;
}

/**
 * «+ Nuevo período»: the same trigger for the card's header and for the empty state. A popover
 * anchored under the button — no scrim, the history behind stays readable — instead of the centred
 * dialog it used to be; it closes with Escape or a click outside (both already handled by
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
