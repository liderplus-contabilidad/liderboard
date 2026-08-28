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
  /** The PDF's suggested name — it becomes `document.title` while the layer is open and is restored
   *  on closing, including when it is closed without printing. */
  fileName: string;
  onClose: () => void;
  /** The report's own controls, ahead of «Guardar PDF» — PyG's «Detalle» comes in through here. */
  controls?: ReactNode;
  /** A short note under the bar, right-aligned — how many tables or sheets the report carries. */
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

/** The sheet a section is drawn on: A4 portrait, or landscape at its real width (1123 px) — never
 *  content overflowing the portrait one, which on screen would read as a table escaping the
 *  paper. */
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
 * A REPORT'S BAND — the same letterhead that heads the Excel files, on paper: the client's logo stuck
 * to the left edge, the title block CENTRED and the center's logo stuck to the right edge of what it
 * heads.
 *
 * It lives here and not in `profit-loss/` because both reports use it and all three places of one of
 * them —the cover, each statement and the vertical analysis—, and three versions of «where the logo
 * goes» would end up putting it in three different places. It knows nothing about what it heads: the
 * title comes in as `children` and the chrome as `className`, which is what lets the cover go with no
 * padding and a table carry it.
 *
 * **It centres for real**: the two logo columns are equal `1fr`s, so the title falls on the table's
 * axis even if the logos measure differently — with an `ml-auto` it would have been centred in what
 * is left over, which is another thing.
 */
export function ReportBand({
  leftLogo,
  rightLogo,
  logoHeight = 22,
  className,
  children,
}: {
  /** The CLIENT's, on the left. */
  leftLogo?: EntityLogo | undefined;
  /** The one of the CENTER being headed, on the right. The Consolidado has none. */
  rightLogo?: EntityLogo | undefined;
  /** The logo's height, in px. A table's is that of its header and not a pixel more: a letterhead
   *  that fattens the band takes from the statement the rows the page had just enough of. */
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
 * One logo of the band, or nothing. The width is set by the logo's own proportion (`w-auto` with a
 * fixed height), which is the same `contain` `fitLogoBox` applies in the Excel and in the payslip PDF
 * — here the browser resolves it because there is a box in which to resolve it.
 *
 * The `alt` is EMPTY: the client's name is in the title next to it and the center's is in its label,
 * so alternative text would repeat it out loud.
 */
function BandLogo({ logo, height }: { logo: EntityLogo | undefined; height: number }) {
  if (!logo) {
    return null;
  }
  return (
    // No `next/image`: the source is a data URL from IndexedDB, not an asset with a path.
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
