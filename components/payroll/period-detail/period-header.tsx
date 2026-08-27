"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dropdown, DropdownPanel, useDropdown } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { PayrollPeriodFinancials } from "@/lib/payroll/period-detail";
import { PAYSLIP_ZIP_LABEL } from "@/lib/payroll/payslip/download";
import { periodLongLabel, sortPeriodsDesc } from "@/lib/payroll/periods";
import type { PayrollPeriod } from "@/lib/payroll/types";

/** The download needs a nómina: with no employees there is no payslip to issue. */
const EMPTY_ROSTER_REASON = "El período todavía no tiene empleados";

/** An arrow's box and the selector's share height and radius: the three pieces form a single período
 *  control, and one of a different size would split it in two. */
const BOX_CLASS = "h-[38px] rounded-[9px] border border-border bg-surface transition-colors";

interface PeriodHeaderProps {
  period: PayrollPeriod;
  /** Every período of the client — the dropdown jumps to any of them, not just the neighbours. */
  periods: readonly PayrollPeriod[];
  prev: PayrollPeriod | null;
  next: PayrollPeriod | null;
  employeeCount: number;
  financials: PayrollPeriodFinancials | undefined;
  onDelete: () => void;
  /** Downloads the payslips of the whole nómina: one PDF per employee, in a .zip. */
  onDownloadPayslips: () => void;
  /** While `pdf-lib` loads and one PDF per employee is assembled. With nóminas of thirty employees
   *  that is a few tenths of a second: without the notice, the button looks unresponsive and gets
   *  pressed again. */
  downloading: boolean;
}

/**
 * The screen's header: the way back to the history, the período control —arrows to the neighbours
 * with a dropdown in between that jumps to any of them— and the subline summarising the month.
 *
 * The arrows and the dropdown are the SAME control split in three: moving month by month is what one
 * does while reviewing a nómina, and jumping to a distant month is what one does on coming back to it
 * weeks later. With only the dropdown, advancing one month costs two clicks; with only the arrows,
 * going from January to December costs eleven.
 */
export function PeriodHeader({
  period,
  periods,
  prev,
  next,
  employeeCount,
  financials,
  onDelete,
  onDownloadPayslips,
  downloading,
}: PeriodHeaderProps) {
  const empty = employeeCount === 0;
  return (
    <div className="mb-5">
      <Link
        href="/payroll"
        className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink transition-colors hover:text-brand"
      >
        <ArrowLeft size={16} />
        Volver al historial
      </Link>

      <div className="mt-3.5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-bold tracking-[-0.2px] text-ink">Periodo</h1>
            <PeriodNavArrow direction="prev" target={prev} />
            <PeriodPicker period={period} periods={periods} />
            <PeriodNavArrow direction="next" target={next} />
          </div>
          <p className="mt-2 text-[13px] text-faint">
            {formatNumber(employeeCount)} {employeeCount === 1 ? "empleado" : "empleados"} · líquido{" "}
            {financials ? formatCurrency(financials.net, { cents: true }) : "—"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <Button variant="danger" size="toolbar" icon={<Trash2 size={15} />} onClick={onDelete}>
            Eliminar período
          </Button>
          {/* The reason goes in a tooltip, not in a pill: the pill is `ExcelActions`' convention for
              the UPLOAD button, where what is missing is the previous step of the whole module and it
              has to be seen without pointing. Here what is missing is this período's nómina, and
              shouting it next to the title would steal the período's place.
              It goes here and not inside `PayrollExcelActions` because that primitive renders «Cargar
              Excel · Descargar Excel · ⓘ» and its shape is derived from how many EXCEL downloads it
              receives: a PDF inside would force it to stop speaking of Excel in all three modules. */}
          <span title={empty ? EMPTY_ROSTER_REASON : undefined}>
            <Button
              variant="secondary"
              size="toolbar"
              disabled={empty || downloading}
              icon={<FileText size={15} />}
              onClick={onDownloadPayslips}
            >
              {downloading ? "Generando…" : PAYSLIP_ZIP_LABEL}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

/** An arrow to a neighbouring período: a real `Link` when it exists, or the same box switched off
 *  (with no `href`, so it is neither a keyboard nor a screen-reader stop) when that side has run
 *  out. */
function PeriodNavArrow({
  direction,
  target,
}: {
  direction: "prev" | "next";
  target: PayrollPeriod | null;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const label = direction === "prev" ? "Período anterior" : "Período siguiente";
  const shape = cn(BOX_CLASS, "flex w-[38px] items-center justify-center");

  if (!target) {
    return (
      <span aria-hidden className={cn(shape, "text-faintest opacity-60")}>
        <Icon size={16} />
      </span>
    );
  }

  return (
    <Link
      href={`/payroll/${target.id}`}
      title={label}
      aria-label={label}
      className={cn(shape, "text-muted hover:border-brand hover:text-brand")}
    >
      <Icon size={16} />
    </Link>
  );
}

const PICKER_WIDTH = 208;

function PeriodPicker({
  period,
  periods,
}: {
  period: PayrollPeriod;
  periods: readonly PayrollPeriod[];
}) {
  return (
    <Dropdown>
      <PeriodPickerTrigger period={period} />
      <DropdownPanel width={PICKER_WIDTH}>
        <PeriodPickerList period={period} periods={periods} />
      </DropdownPanel>
    </Dropdown>
  );
}

/** A trigger of its own instead of `DropdownTrigger`: that one is a FILTER's button (it paints in
 *  `brand` when it has a selection), and here there is no selection to point at — there is always an
 *  open período. */
function PeriodPickerTrigger({ period }: { period: PayrollPeriod }) {
  const { open, setOpen, triggerRef } = useDropdown();

  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(
        BOX_CLASS,
        "flex min-w-[164px] items-center justify-center gap-2 px-3.5 text-[13.5px] font-bold uppercase tracking-[0.2px] text-ink",
        open ? "border-brand" : "hover:border-brand",
      )}
    >
      {periodLongLabel(period.year, period.monthIndex)}
      <ChevronDown
        size={14}
        className={cn("text-faint transition-transform", open && "rotate-180")}
      />
    </button>
  );
}

function PeriodPickerList({
  period,
  periods,
}: {
  period: PayrollPeriod;
  periods: readonly PayrollPeriod[];
}) {
  const router = useRouter();
  const { setOpen } = useDropdown();

  // It navigates through `router` and closes by hand instead of rendering `Link`s: on switching
  // período this screen re-renders in the same place of the tree, so the dropdown would survive open
  // over the new month.
  const go = (target: PayrollPeriod) => {
    setOpen(false);
    if (target.id !== period.id) {
      router.push(`/payroll/${target.id}`);
    }
  };

  return (
    <div role="menu" className="-mx-1 max-h-[320px] overflow-auto">
      {sortPeriodsDesc(periods).map((option) => {
        const active = option.id === period.id;

        return (
          <button
            key={option.id}
            type="button"
            role="menuitem"
            onClick={() => go(option)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
              active ? "bg-brand-soft font-semibold text-brand" : "text-ink hover:bg-canvas",
            )}
          >
            {periodLongLabel(option.year, option.monthIndex)}
            {active && <Check size={14} />}
          </button>
        );
      })}
    </div>
  );
}
