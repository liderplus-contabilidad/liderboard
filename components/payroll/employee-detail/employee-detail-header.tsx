import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { periodLongLabel } from "@/lib/payroll/periods";

/** The same height and radius as the período control of the sibling header: the arrows on this
 *  screen and the ones there are the same gesture and cannot measure differently. */
const BOX_CLASS = "h-[38px] rounded-[9px] border border-border bg-surface transition-colors";

export interface EmployeeNavTarget {
  /** Where the arrow leads. It arrives as an already built `href` and not as an id because this
   *  screen does not decide its own route — whoever wires it is who knows which segment it lives
   *  under. */
  href: string;
  /** The neighbour's name, which is what the arrow announces on hover. */
  name: string;
}

interface EmployeeDetailHeaderProps {
  /** Where «← Volver al período» goes back to. */
  backHref: string;
  /** The período that link names: «Volver al período MARZO 2026». */
  year: number;
  monthIndex: number;
  employeeName: string;
  /** The employee's place within the nómina, for the «3 de 12» that goes with the arrows. `index`
   *  is 1-based, as it reads. The reconciliation status does NOT go here: it belongs to the employee
   *  and lives in the header of their card (`EmployeeDetailCard`), next to their order number. */
  position?: { index: number; total: number };
  prev: EmployeeNavTarget | null;
  next: EmployeeNavTarget | null;
  /** Downloads THIS employee's payslip, one page long. */
  onDownloadPayslip: () => void;
  /** While `pdf-lib` loads and the PDF is assembled. */
  downloading: boolean;
  /** Opens the employee dialog in edit mode. */
  onEdit: () => void;
  /** Requests the employee's removal. The confirmation is put up by whoever receives this, not by
   *  this header. */
  onDelete: () => void;
}

/**
 * The header of an employee's detail: the way back to the período, the title with their name and, on
 * the right, the arrows that walk the nómina plus the three actions on them.
 *
 * «Eliminar empleado» goes LAST, at the edge, and not between the two benign ones: it is the only
 * destructive action of the row and with three buttons in a run a stray click has somewhere to land.
 *
 * The arrows are the control that makes this screen useful: reviewing a nómina is going employee by
 * employee, and going back to the list in between costs two clicks per person. There is no dropdown
 * in the middle —unlike the período selector— because jumping to a distant employee is already
 * solved by the período table's search box.
 */
export function EmployeeDetailHeader({
  backHref,
  year,
  monthIndex,
  employeeName,
  position,
  prev,
  next,
  onDownloadPayslip,
  downloading,
  onEdit,
  onDelete,
}: EmployeeDetailHeaderProps) {
  return (
    <div className="mb-5">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink transition-colors hover:text-brand"
      >
        <ArrowLeft size={16} />
        Volver al período {periodLongLabel(year, monthIndex)}
      </Link>

      <div className="mt-3.5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-bold tracking-[-0.2px] text-ink">
            Detalle de nómina: {employeeName}
          </h1>
          {position && (
            <p className="mt-2 text-[13px] text-faint">
              Empleado {position.index} de {position.total}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <EmployeeNavArrow direction="prev" target={prev} />
            <EmployeeNavArrow direction="next" target={next} />
          </div>

          <Button variant="secondary" size="toolbar" icon={<Pencil size={15} />} onClick={onEdit}>
            Editar ficha
          </Button>
          <Button
            variant="secondary"
            size="toolbar"
            disabled={downloading}
            icon={<FileText size={15} />}
            onClick={onDownloadPayslip}
          >
            {downloading ? "Generando…" : "Descargar rol (PDF)"}
          </Button>
          <Button variant="danger" size="toolbar" icon={<Trash2 size={15} />} onClick={onDelete}>
            Eliminar empleado
          </Button>
        </div>
      </div>
    </div>
  );
}

/** An arrow to the neighbouring employee: a real `Link` when it exists, or the same box switched off
 *  —with no `href`, so it is neither a keyboard focus stop nor a screen-reader stop— when that side
 *  has run out. */
function EmployeeNavArrow({
  direction,
  target,
}: {
  direction: "prev" | "next";
  target: EmployeeNavTarget | null;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const shape = cn(BOX_CLASS, "flex w-[38px] items-center justify-center");

  if (!target) {
    return (
      <span aria-hidden className={cn(shape, "text-faintest opacity-60")}>
        <Icon size={16} />
      </span>
    );
  }

  // The neighbour's name goes in the label, not just «previous»/«next»: knowing who you skip to is
  // what avoids the checking click.
  const label = `${direction === "prev" ? "Empleado anterior" : "Empleado siguiente"}: ${target.name}`;

  return (
    <Link
      href={target.href}
      title={label}
      aria-label={label}
      className={cn(shape, "text-muted hover:border-brand hover:text-brand")}
    >
      <Icon size={16} />
    </Link>
  );
}
