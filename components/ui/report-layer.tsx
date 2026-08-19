"use client";

import { Printer, X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The shared mechanism every printable report in the app mounts on — today PyG's Informe PDF and
 * Sueldos por Áreas'. It owns the portal over `document.body`, the full-screen layer `@media
 * print` keys off (the `.report-layer` class, not an id: with two reports an id ties the print
 * rule to one of them and the other prints the whole app behind it), Escape-to-close, the
 * printed-file title, and the bar with «Guardar PDF» / «Cerrar».
 *
 * It knows NOTHING about what it prints: no import from `profit-loss/` or `payroll/`. What each
 * report needs beyond the shared bar — PyG's «Detalle» level picker, a note about how many
 * sheets a report produced — arrives as `controls`/`note` from the caller, which is what lets a
 * second report reuse this file without editing it.
 *
 * Not a modal: `<section>`, not `<dialog>` or `role="dialog"` — it does not trap focus or make the
 * rest of the page inert, and announcing itself as modal without behaving like one would be worse
 * than not announcing it at all.
 */
export interface ReportLayerProps {
  /** Nombre sugerido del PDF — se convierte en `document.title` mientras la capa está abierta y
   *  se restaura al cerrarse, también cuando se cierra sin haber impreso. */
  fileName: string;
  onClose: () => void;
  /** Controles propios del informe, delante de «Guardar PDF» — el «Detalle» de PyG entra por aquí. */
  controls?: ReactNode;
  /** Una nota breve bajo la barra, alineada a la derecha — cuántas tablas u hojas trae el informe. */
  note?: ReactNode;
  children: ReactNode;
}

export function ReportLayer({ fileName, onClose, controls, note, children }: ReportLayerProps) {
  useEscapeToClose(onClose);
  usePrintTitle(fileName);

  return createPortal(
    <section
      aria-label="Vista previa del informe"
      className="report-layer fixed inset-0 z-50 overflow-auto bg-canvas"
    >
      <header className="print-hide sticky top-0 z-10 flex items-center justify-between gap-6 border-b border-border bg-surface px-7 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Vista previa del informe</p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            En el diálogo de impresión, elige <strong className="font-semibold">Destino</strong> →{" "}
            <strong className="font-semibold">Guardar como PDF</strong>.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-2.5">
            {controls}
            <Button size="toolbar" icon={<Printer size={14} />} onClick={() => window.print()}>
              Guardar PDF
            </Button>
            <Button size="toolbar" variant="secondary" icon={<X size={14} />} onClick={onClose}>
              Cerrar
            </Button>
          </div>
          {note}
        </div>
      </header>

      {children}
    </section>,
    document.body,
  );
}

/** La hoja sobre la que se dibuja una sección: A4 vertical, o apaisada a su ancho real (1123 px) —
 *  nunca contenido desbordando la vertical, que en pantalla se leería como una tabla escapándose
 *  del papel. */
export function ReportSheet({ children, landscape }: { children: ReactNode; landscape?: boolean }) {
  return (
    <div
      className={cn("report-sheet mx-auto my-6 max-w-full", landscape ? "w-[1123px]" : "w-[794px]")}
    >
      <article
        className={cn(
          "report-page flex flex-col gap-9 rounded-[13px] bg-surface px-[53px] py-[53px] shadow-[0_10px_30px_rgba(15,23,42,0.08)] print:rounded-none print:shadow-none",
          landscape && "report-page-landscape",
        )}
      >
        {children}
      </article>
    </div>
  );
}

/** Escape closes, like every other layer in the app. */
function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/**
 * The browser takes the suggested filename from `document.title`, so the title becomes the
 * report's name while the layer is open and goes back to the app's on the way out — restored in
 * the cleanup rather than on `afterprint`, so closing without printing restores it too.
 */
function usePrintTitle(title: string) {
  const original = useRef<string>("");
  useEffect(() => {
    original.current = document.title;
    document.title = title;
    return () => {
      document.title = original.current;
    };
  }, [title]);
}
