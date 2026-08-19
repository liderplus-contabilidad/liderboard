"use client";

import { HelpCircle } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import type { ChartGuide } from "@/lib/charts/types";

/** El ancho del panel. Fijo: un ancho elástico haría que dos tarjetas vecinas midieran distinto. */
const PANEL_WIDTH = 320;
/** El aire contra el borde de la ventana, y la separación entre el botón y el panel. */
const MARGIN = 12;
const GAP = 8;

/**
 * El ⓘ de la cabecera de una tarjeta: para qué sirve, qué controles la mueven y cómo se lee.
 *
 * Va en la cabecera y no bajo el subtítulo porque son cinco tarjetas en una pantalla: una guía
 * permanente multiplicada por cinco empuja las gráficas fuera del primer golpe de vista, que es
 * justo lo que cualquiera de ellas viene a enseñar.
 *
 * **El panel se dibuja en un PORTAL sobre el `<body>`, y ese es su detalle importante.** La tarjeta
 * es un `<section>` con `overflow-hidden` —lo necesita para que la tabla no se salga de sus
 * esquinas redondeadas—, así que un panel posicionado dentro de ella se RECORTA contra su borde:
 * las guías largas perdían las últimas líneas y las de las tarjetas bajas se cortaban por el lado.
 * Fuera del `<section>` no hay nada que lo recorte, y a cambio hay que colocarlo a mano contra el
 * botón, que es lo que hace `place()`.
 *
 * No se apoya en `InfoTip` por lo mismo: aquel vive en las barras, donde nada recorta, y es un
 * tooltip oscuro de una frase. Esto es un panel de tres bloques y se lee mejor en claro, con el
 * mismo fondo y el mismo borde que las tarjetas de las que habla.
 */
export function ChartGuideTip({ title, guide }: { title: string; guide: ChartGuide }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [box, setBox] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  // Un respiro antes de cerrar: el panel está en un portal, así que salir del botón hacia él pasa
  // por fuera de los dos y sin esta espera se cerraría justo cuando se va a leer.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  /**
   * Colgado del botón por su borde derecho, y debajo salvo que no quepa. Lo que garantiza que
   * nada se corte no es el volteo sino el `maxHeight`: se le da el hueco REAL que queda hasta el
   * borde de la ventana y el panel hace scroll dentro de sí mismo si su texto no cabe.
   */
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    // Solo se voltea si arriba hay bastante MÁS sitio: abajo es donde el lector lo espera.
    const measured = panelRef.current?.scrollHeight ?? 0;
    const flip = below < Math.min(measured, 220) && above > below;
    const left = Math.max(
      MARGIN,
      Math.min(rect.right - PANEL_WIDTH, window.innerWidth - MARGIN - PANEL_WIDTH),
    );
    setBox({
      top: flip ? Math.max(MARGIN, rect.top - GAP - Math.min(measured, above)) : rect.bottom + GAP,
      left,
      maxHeight: Math.max(160, flip ? above : below),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Una segunda pasada con el panel ya medido: la primera lo coloca sin saber cuánto ocupa.
    const frame = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Para qué sirve «${title}»`}
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
        onFocus={() => setOpen(true)}
        className={cn(
          "flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[9px] border transition-colors",
          open
            ? "border-brand bg-brand-soft text-brand"
            : "border-border bg-surface text-muted hover:bg-canvas hover:text-brand",
        )}
      >
        <HelpCircle size={15} />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              width: PANEL_WIDTH,
              top: box?.top ?? -9999,
              left: box?.left ?? -9999,
              maxHeight: box?.maxHeight,
            }}
            className="fixed z-50 overflow-y-auto overscroll-contain rounded-[13px] border border-border bg-surface p-[15px] shadow-[0_18px_44px_rgba(15,23,42,0.18)]"
          >
            <Block label="Para qué sirve">
              <p className="text-[12.5px] leading-[1.45] text-ink">{guide.purpose}</p>
            </Block>

            {guide.actions.length > 0 && (
              <Block label="Qué puedes hacer" className="mt-3.5">
                <ul className="space-y-1.5">
                  {guide.actions.map((action) => (
                    <li key={action.control} className="flex gap-2">
                      <span
                        aria-hidden
                        className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full bg-brand/60"
                      />
                      {/* El rótulo del control y lo que hace, en dos tintas y en una sola línea
                          que fluye: en dos columnas el nombre largo se truncaría, y truncar
                          justo el nombre que hay que ir a buscar es lo peor que puede pasar. */}
                      <p className="text-[12px] leading-[1.45] text-muted">
                        <span className="font-semibold text-ink">{action.control}</span>{" "}
                        {action.effect}
                      </p>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {guide.reading && (
              <p className="mt-3.5 rounded-[9px] bg-surface-muted px-2.5 py-2 text-[11.5px] leading-[1.45] text-ink-soft">
                {guide.reading}
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function Block({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-faint">
        {label}
      </p>
      {children}
    </div>
  );
}
