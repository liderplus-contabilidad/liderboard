"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/** What the cell hosting a `CellNote` must carry: the corner is placed against it, and the empty
 *  corner shows while the pointer is over the CELL, not only over the corner. */
export const NOTE_HOST = "relative group/note";

const PANEL_WIDTH = 260;
const MARGIN = 12;
const GAP = 4;

type Mode = "read" | "edit";

/**
 * An Excel comment on a cell: the corner is marked when the cell has a note, and the note opens over
 * the cell — to READ on hover, to EDIT on click. A cell without a note shows its corner only while
 * the pointer is over the cell, which is where one adds it. Leaving the field (a click outside,
 * Escape, Tab) saves, and saving an empty note removes it: the caller receives the text and decides
 * nothing about blanks (`applyNotes` does).
 *
 * The panel is drawn in a PORTAL over the `<body>` and placed by hand against the corner, as
 * `ChartGuideTip` is: the grids that host notes scroll inside their own box, and a panel positioned
 * in the cell would be clipped by it.
 */
export function CellNote({
  note,
  label,
  onChange,
}: {
  /** The saved note; empty or undefined when the cell has none. */
  note: string | undefined;
  /** What the cell is, for the corner's accessible name («Saldo de PRODUBANCO»). */
  label: string;
  onChange: (text: string) => void;
}) {
  const saved = note ?? "";
  const hasNote = saved.length > 0;
  const [mode, setMode] = useState<Mode | null>(null);
  const [draft, setDraft] = useState(saved);
  const panelId = useId();
  const cornerRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  // Reading closes a breath after the pointer leaves, so it can travel from the corner to the panel.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(
      () => setMode((current) => (current === "read" ? null : current)),
      160,
    );
  }, [cancelClose]);
  useEffect(() => cancelClose, [cancelClose]);

  const openEditor = () => {
    cancelClose();
    setDraft(saved);
    setMode("edit");
  };
  const commit = () => {
    if (draft.trim() !== saved) {
      onChange(draft);
    }
    setMode(null);
  };

  /** Hung from the corner: below it and ending at its right edge, inside the window. */
  const place = useCallback(() => {
    const corner = cornerRef.current;
    if (!corner) return;
    const rect = corner.getBoundingClientRect();
    const measured = panelRef.current?.offsetHeight ?? 0;
    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    const top =
      below < measured && rect.top - GAP - measured > MARGIN
        ? rect.top - GAP - measured
        : rect.bottom + GAP;
    const left = Math.max(
      MARGIN,
      Math.min(rect.right - PANEL_WIDTH, window.innerWidth - MARGIN - PANEL_WIDTH),
    );
    setBox({ top, left });
  }, []);

  // The editor opens on a CLICK, so the focus follows the user's own gesture into the field.
  useEffect(() => {
    if (mode === "edit") fieldRef.current?.focus();
  }, [mode]);

  useLayoutEffect(() => {
    if (!mode) return;
    place();
    const frame = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [mode, place]);

  return (
    <>
      <button
        ref={cornerRef}
        type="button"
        aria-label={hasNote ? `Ver nota de ${label}` : `Agregar nota a ${label}`}
        aria-expanded={mode !== null}
        aria-controls={mode ? panelId : undefined}
        onClick={(event) => {
          // The cell's own click (a row that opens, a field that focuses) is not the note's.
          event.stopPropagation();
          if (mode === "edit") return;
          openEditor();
        }}
        onMouseEnter={() => {
          if (!hasNote || mode === "edit") return;
          cancelClose();
          setMode("read");
        }}
        onMouseLeave={scheduleClose}
        className={cn(
          "absolute right-0 top-0 z-[1] size-[10px] cursor-pointer outline-none [clip-path:polygon(0_0,100%_0,100%_100%)]",
          hasNote
            ? "bg-warning"
            : "bg-faint opacity-0 transition-opacity focus-visible:opacity-100 group-hover/note:opacity-100",
        )}
      />

      {mode &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role={mode === "edit" ? "dialog" : "tooltip"}
            aria-label={`Nota de ${label}`}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{ width: PANEL_WIDTH, top: box?.top ?? -9999, left: box?.left ?? -9999 }}
            className="fixed z-50 rounded-[9px] border border-warning/50 bg-marked p-2 shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-faint">
              Nota · {label}
            </p>
            {mode === "edit" ? (
              <textarea
                ref={fieldRef}
                value={draft}
                rows={4}
                placeholder="Escribe una nota"
                aria-label={`Nota de ${label}`}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.currentTarget.blur();
                  }
                }}
                className="block w-full resize-y rounded-[6px] border border-border bg-surface px-2 py-1.5 text-[12.5px] leading-[1.4] text-ink outline-none placeholder:text-faint focus:border-brand"
              />
            ) : (
              <button
                type="button"
                onClick={openEditor}
                className="block w-full whitespace-pre-wrap text-left text-[12.5px] leading-[1.4] text-ink"
              >
                {saved}
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
