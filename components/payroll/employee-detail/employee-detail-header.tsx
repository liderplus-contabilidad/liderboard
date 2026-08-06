import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { periodLongLabel } from "@/lib/payroll/periods";

/** Ninguna de las dos existe todavía: quitar un empleado de la nómina y el generador de PDF son
 *  trabajo de otra ronda. Se apagan con su motivo en el tooltip, la misma convención que
 *  `PeriodHeader` — la píldora de `DisabledReasonPill` es para cuando lo que falta es el paso
 *  anterior de todo el módulo y hay que verlo sin apuntar; aquí lo que falta es una función. */
const DELETE_DISABLED_REASON = "Quitar un empleado de la nómina no está disponible todavía";
const DOWNLOAD_DISABLED_REASON = "Todavía no genera el rol individual en PDF";

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
}

/**
 * El encabezado del detalle de un empleado: la vuelta al período, el título con su nombre y, a la
 * derecha, las flechas que recorren la nómina más las dos acciones que todavía no existen.
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

          <span title={DELETE_DISABLED_REASON}>
            <Button variant="danger" size="toolbar" disabled icon={<Trash2 size={15} />}>
              Eliminar empleado
            </Button>
          </span>
          <span title={DOWNLOAD_DISABLED_REASON}>
            <Button variant="secondary" size="toolbar" disabled icon={<FileText size={15} />}>
              Descargar rol (PDF)
            </Button>
          </span>
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
