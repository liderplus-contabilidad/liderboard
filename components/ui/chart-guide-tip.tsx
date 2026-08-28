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

/** The panel's width. Fixed: an elastic width would make two neighbouring cards measure
 *  differently. */
const PANEL_WIDTH = 320;
/** The breathing room against the window's edge, and the gap between the button and the panel. */
const MARGIN = 12;
const GAP = 8;

/**
 * A card header's ⓘ: what it is for, which controls move it and how it is read.
 *
 * It goes in the header and not under the subtitle because there are five cards on one screen: a
 * permanent guide multiplied by five pushes the charts out of the first glance, which is exactly what
 * any of them is there to show.
 *
 * **The panel is drawn in a PORTAL over the `<body>`, and that is its important detail.** The card is
 * a `<section>` with `overflow-hidden` —it needs it so the table does not spill out of its rounded
 * corners—, so a panel positioned inside it is CLIPPED against its edge: long guides lost their last
 * lines and those of short cards were cut off at the side. Outside the `<section>` there is nothing
 * to clip it, and in exchange it has to be placed by hand against the button, which is what `place()`
 * does.
 *
 * It does not lean on `InfoTip` for the same reason: that one lives in the bars, where nothing clips,
 * and it is a dark one-sentence tooltip. This is a three-block panel and reads better in light, with
 * the same fill and the same border as the cards it talks about.
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
  // A breath before closing: the panel is in a portal, so moving from the button to it passes outside
  // both, and without this wait it would close just as it is about to be read.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  /**
   * Hung off the button by its right edge, and below it unless it does not fit. What guarantees
   * nothing gets cut off is not the flip but the `maxHeight`: it is given the REAL room left down to
   * the window's edge and the panel scrolls inside itself if its text does not fit.
   */
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    // It only flips if there is considerably MORE room above: below is where the reader expects it.
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
    // A second pass with the panel already measured: the first one places it without knowing how much
    // room it takes.
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
                      {/* The control's label and what it does, in two inks and on a single flowing
                          line: in two columns the long name would be truncated, and truncating
                          exactly the name you have to go and look for is the worst that can
                          happen. */}
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
