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

/** La descarga necesita una nómina: sin empleados no hay comprobante que emitir. */
const EMPTY_ROSTER_REASON = "El período todavía no tiene empleados";

/** La caja de una flecha y la del selector comparten alto y radio: las tres piezas forman un solo
 *  control de período, y una de otro tamaño lo partiría en dos. */
const BOX_CLASS = "h-[38px] rounded-[9px] border border-border bg-surface transition-colors";

interface PeriodHeaderProps {
  period: PayrollPeriod;
  /** Todos los períodos del cliente — el desplegable salta a cualquiera, no solo a los vecinos. */
  periods: readonly PayrollPeriod[];
  prev: PayrollPeriod | null;
  next: PayrollPeriod | null;
  employeeCount: number;
  financials: PayrollPeriodFinancials | undefined;
  onDelete: () => void;
  /** Baja los comprobantes de toda la nómina: un PDF por empleado, en un .zip. */
  onDownloadPayslips: () => void;
  /** Mientras `pdf-lib` se carga y se arma un PDF por empleado. Con nóminas de treinta empleados eso son unas
   *  décimas: sin el aviso, el botón parece no haber respondido y se pulsa otra vez. */
  downloading: boolean;
}

/**
 * El encabezado de la pantalla: la vuelta al historial, el control de período —flechas a los
 * vecinos con un desplegable en medio que salta a cualquiera— y la sublínea que resume el mes.
 *
 * Las flechas y el desplegable son el MISMO control partido en tres: moverse de mes en mes es lo
 * que se hace revisando una nómina, y saltar a un mes lejano es lo que se hace al volver a ella
 * semanas después. Con solo el desplegable, avanzar un mes cuesta dos clics; con solo las flechas,
 * ir de enero a diciembre cuesta once.
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
          {/* El motivo va en tooltip, no en píldora: la píldora es la convención de `ExcelActions`
              para el botón de CARGA, donde lo que falta es el paso anterior de todo el módulo y hay
              que verlo sin apuntar. Aquí lo que falta es la nómina de este período, y decirlo a
              gritos junto al título le robaría el sitio al período.
              Va aquí y no dentro de `PayrollExcelActions` porque ese primitivo rinde «Cargar
              Excel · Descargar Excel · ⓘ» y su forma se deriva de cuántas descargas de EXCEL
              recibe: un PDF dentro lo obligaría a dejar de hablar de Excel en los tres módulos. */}
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

/** Una flecha a un período vecino: `Link` real cuando existe, o la misma caja apagada (sin `href`,
 *  para que no sea foco de teclado ni de lector de pantalla) cuando ese lado se acabó. */
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

/** Trigger propio en vez de `DropdownTrigger`: aquel es el botón de un FILTRO (se pinta en `brand`
 *  al tener selección), y aquí no hay selección que señalar — siempre hay un período abierto. */
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

  // Navega por `router` y cierra a mano en vez de rendir `Link`s: al cambiar de período esta
  // pantalla se re-rinde en el mismo sitio del árbol, así que el desplegable sobreviviría abierto
  // sobre el mes nuevo.
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
