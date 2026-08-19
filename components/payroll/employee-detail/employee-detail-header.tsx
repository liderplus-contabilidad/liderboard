import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { periodLongLabel } from "@/lib/payroll/periods";

/** El mismo alto y radio que el control de período del encabezado hermano: las flechas de esta
 *  pantalla y las de aquella son el mismo gesto y no pueden medir distinto. */
const BOX_CLASS = "h-[38px] rounded-[9px] border border-border bg-surface transition-colors";

export interface EmployeeNavTarget {
  /** Adónde lleva la flecha. Llega como `href` ya armado y no como un id porque esta pantalla no
   *  decide su propia ruta — quien la cablea es quien sabe bajo qué segmento vive. */
  href: string;
  /** El nombre del vecino, que es lo que la flecha anuncia al pasar por encima. */
  name: string;
}

interface EmployeeDetailHeaderProps {
  /** Adónde vuelve «← Volver al período». */
  backHref: string;
  /** El período que ese enlace nombra: «Volver al período MARZO 2026». */
  year: number;
  monthIndex: number;
  employeeName: string;
  /** El sitio del empleado dentro de la nómina, para el «3 de 12» que acompaña a las flechas.
   *  `index` es 1-based, como se lee. El estado de conciliación NO va aquí: es del empleado y vive
   *  en la cabecera de su tarjeta (`EmployeeDetailCard`), junto a su número de orden. */
  position?: { index: number; total: number };
  prev: EmployeeNavTarget | null;
  next: EmployeeNavTarget | null;
  /** Baja el comprobante de ESTE empleado, de una página. */
  onDownloadPayslip: () => void;
  /** Mientras `pdf-lib` se carga y el PDF se arma. */
  downloading: boolean;
  /** Abre el diálogo de ficha en modo edición. */
  onEdit: () => void;
  /** Pide la baja del empleado. La confirmación la pone quien recibe esto, no este encabezado. */
  onDelete: () => void;
}

/**
 * El encabezado del detalle de un empleado: la vuelta al período, el título con su nombre y, a la
 * derecha, las flechas que recorren la nómina más las tres acciones sobre él.
 *
 * «Eliminar empleado» va la ÚLTIMA, en el borde, y no entre las dos benignas: es la única
 * destructiva de la fila y con tres botones seguidos un clic desviado tiene adónde caer.
 *
 * Las flechas son el control que hace útil esta pantalla: revisar una nómina es pasar empleado por
 * empleado, y volver al listado entre uno y otro cuesta dos clics por persona. No hay desplegable
 * en medio —a diferencia del selector de período— porque el salto a un empleado lejano ya lo
 * resuelve el buscador de la tabla del período.
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

/** Una flecha al empleado vecino: `Link` real cuando existe, o la misma caja apagada —sin `href`,
 *  para que no sea foco de teclado ni parada de lector de pantalla— cuando ese lado se acabó. */
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

  // El nombre del vecino va en el rótulo, no solo «anterior»/«siguiente»: saber a quién se salta
  // es lo que evita el clic de comprobación.
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
