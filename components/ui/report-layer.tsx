"use client";

import { Printer, X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { EntityLogo } from "@/lib/logos";

/**
 * The shared mechanism every printable report in the app mounts on — today PyG's Informe PDF,
 * Sueldos por Áreas' and Ventas por servicio's. It owns the portal over `document.body`, the
 * full-screen layer `@media print` keys off (the `.report-layer` class, not an id: with more than
 * one report an id ties the print rule to one of them and the others print the whole app behind
 * them), Escape-to-close, the printed-file title, and the bar with «Guardar PDF» / «Cerrar».
 *
 * It knows NOTHING about what it prints: no import from `profit-loss/`, `payroll/` or `sales/`.
 * What each report needs beyond the shared bar — PyG's «Detalle» level picker, a note about how many
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

/**
 * LA BANDA DE UN INFORME — el mismo membrete que encabeza los Excel, en papel: el logo del cliente
 * pegado al borde izquierdo, el bloque de título CENTRADO y el logo del centro pegado al borde
 * derecho de lo que encabeza.
 *
 * Vive aquí y no en `profit-loss/` porque la usan los dos informes y los tres sitios de uno de
 * ellos —la portada, cada estado y el análisis vertical—, y tres versiones de «dónde va el logo»
 * acabarían poniéndolo en tres sitios distintos. No sabe nada de lo que encabeza: el título entra
 * como `children` y el cromado, como `className`, que es lo que deja a la portada ir sin relleno y
 * a una tabla llevarlo.
 *
 * **Centra de verdad**: las dos columnas de los logos son `1fr` iguales, así que el título cae en
 * el eje de la tabla aunque los logos midan distinto — con un `ml-auto` se habría centrado en lo
 * que sobra, que es otra cosa.
 */
export function ReportBand({
  leftLogo,
  rightLogo,
  logoHeight = 22,
  className,
  children,
}: {
  /** El del CLIENTE, a la izquierda. */
  leftLogo?: EntityLogo | undefined;
  /** El del CENTRO que se encabeza, a la derecha. El Consolidado no tiene. */
  rightLogo?: EntityLogo | undefined;
  /** El alto del logo, en px. El de una tabla es el de su cabecera y ni uno más: un membrete que
   *  engorda la banda le quita al estado las filas que la página tenía justas. */
  logoHeight?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <header className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-3", className)}>
      <span className="flex justify-start">
        <BandLogo logo={leftLogo} height={logoHeight} />
      </span>
      <span className="flex min-w-0 flex-col items-center justify-center">{children}</span>
      <span className="flex justify-end">
        <BandLogo logo={rightLogo} height={logoHeight} />
      </span>
    </header>
  );
}

/**
 * Un logo de la banda, o nada. El ancho lo pone la proporción del propio logo (`w-auto` con el alto
 * fijo), que es el mismo `contain` que `fitLogoBox` aplica en el Excel y en el PDF del comprobante
 * — aquí lo resuelve el navegador porque hay caja donde resolverlo.
 *
 * El `alt` va VACÍO: el nombre del cliente está en el título de al lado y el del centro, en su
 * rótulo, así que un texto alternativo lo repetiría en voz alta.
 */
function BandLogo({ logo, height }: { logo: EntityLogo | undefined; height: number }) {
  if (!logo) {
    return null;
  }
  return (
    // Sin `next/image`: la fuente es un data URL de IndexedDB, no un asset con ruta.
    // oxlint-disable-next-line next/no-img-element
    <img
      src={logo.dataUrl}
      alt=""
      width={logo.width}
      height={logo.height}
      style={{ height }}
      className="w-auto max-w-[180px] shrink-0 object-contain"
    />
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
