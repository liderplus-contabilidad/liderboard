"use client";

import { ChevronDown } from "lucide-react";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The button the panel anchors to — measured in viewport coordinates, see `PositionedPanel`. */
  triggerRef: RefObject<HTMLButtonElement | null>;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdownContext(component: string): DropdownContextValue {
  const context = useContext(DropdownContext);
  if (!context) {
    throw new Error(`<${component}> must be rendered inside <Dropdown>.`);
  }
  return context;
}

/**
 * Exposes the root's open state and trigger ref for a CUSTOM trigger — anything that isn't
 * `DropdownTrigger`'s own filter-button look, e.g. a primary `Button` like «+ Nuevo período».
 * `DropdownPanel` still owns the positioning; the custom trigger only needs to toggle `open` and
 * hand its own element to `triggerRef` (`<Button ref={triggerRef} .../>`).
 */
export function useDropdown(): DropdownContextValue {
  return useDropdownContext("useDropdown");
}

/** Root: owns the open/closed state and positions its children. */
export function Dropdown({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <DropdownContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className={cn("relative", className)}>{children}</div>
    </DropdownContext.Provider>
  );
}

/** The filter button: icon + label + chevron, with an `active` (has-selection) state. */
export function DropdownTrigger({
  icon,
  active = false,
  children,
}: {
  icon?: ReactNode;
  active?: boolean;
  children: ReactNode;
}) {
  const { open, setOpen, triggerRef } = useDropdownContext("DropdownTrigger");
  const highlighted = active || open;

  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(
        "inline-flex h-[34px] items-center gap-2 rounded-[9px] border px-3 text-[12.5px] font-semibold transition-colors",
        highlighted
          ? "border-brand bg-brand-soft text-brand"
          : "border-border bg-surface text-muted hover:bg-canvas",
      )}
    >
      {icon}
      {children}
      <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
    </button>
  );
}

/** Air between the trigger and the panel, and the minimum left against a viewport edge. */
const PANEL_GAP = 8;
const VIEWPORT_MARGIN = 12;

/** The popover card. Renders a full-screen backdrop that closes on click. */
export function DropdownPanel(props: {
  align?: "left" | "right";
  width?: number;
  children: ReactNode;
}) {
  const { open } = useDropdownContext("DropdownPanel");
  // The early return lives here, before `PositionedPanel`'s hooks: a closed dropdown must not
  // run a layout effect on the server render.
  return open ? <PositionedPanel {...props} /> : null;
}

/**
 * `fixed` and measured against the trigger's viewport rect rather than `absolute` inside it,
 * because a trigger in a card header sits inside an `overflow-hidden` shell (every `ChartCard`
 * is one) and an absolutely positioned panel is clipped by it. It also flips above and clamps
 * to the viewport, so a control low on the page still opens whole.
 */
function PositionedPanel({
  align = "left",
  width,
  children,
}: {
  align?: "left" | "right";
  width?: number;
  children: ReactNode;
}) {
  const { setOpen, triggerRef } = useDropdownContext("DropdownPanel");
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) {
        return;
      }
      const anchor = trigger.getBoundingClientRect();
      const { offsetWidth: panelWidth, offsetHeight: panelHeight } = panel;

      const wanted = align === "right" ? anchor.right - panelWidth : anchor.left;
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(wanted, window.innerWidth - panelWidth - VIEWPORT_MARGIN),
      );

      const below = anchor.bottom + PANEL_GAP;
      const above = anchor.top - PANEL_GAP - panelHeight;
      const fitsBelow = below + panelHeight <= window.innerHeight - VIEWPORT_MARGIN;
      const top =
        fitsBelow || above < VIEWPORT_MARGIN
          ? Math.max(
              VIEWPORT_MARGIN,
              Math.min(below, window.innerHeight - panelHeight - VIEWPORT_MARGIN),
            )
          : above;

      setPosition({ top, left });
    };

    place();
    // Capture, so a scroll inside any container (a table, the tab body) moves the panel with
    // its trigger and not just a scroll of the window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    // A panel that shrinks — searching in the account tree, folding a branch — has to be placed
    // again, or the one that opened upwards keeps the top of its taller self.
    const observer = new ResizeObserver(place);
    if (panelRef.current) {
      observer.observe(panelRef.current);
    }
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      observer.disconnect();
    };
  }, [align, triggerRef]);

  // Escape closes from anywhere in the panel; a click outside already does via the backdrop
  // button below. Only bound while open — `PositionedPanel` unmounts on close, so this never
  // lingers on an invisible panel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar menú"
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-20 cursor-default"
      />
      <div
        ref={panelRef}
        role="menu"
        style={{
          width,
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          // The first paint happens before the measurement lands; showing it at 0,0 would flash.
          visibility: position ? "visible" : "hidden",
        }}
        className="fixed z-30 rounded-xl border border-border bg-surface p-3 shadow-[0_14px_36px_rgba(15,23,42,0.16)]"
      >
        {children}
      </div>
    </>
  );
}

/** A selectable checkbox row: box + optional monospace code + name. */
export function DropdownOption({
  selected,
  onToggle,
  code,
  children,
}: {
  selected: boolean;
  onToggle: () => void;
  code?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-[9px] rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
        selected ? "bg-brand-soft font-medium text-brand" : "text-ink hover:bg-canvas",
      )}
    >
      <Checkbox checked={selected} size={17} />
      {code && <span className="font-mono text-[11px] text-faint">{code}</span>}
      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{children}</span>
    </button>
  );
}

/** Footer slot separated by a hairline — e.g. "Quitar selección" / "Listo". */
export function DropdownFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1.5 flex items-center justify-between border-t border-border-soft pt-[9px]">
      {children}
    </div>
  );
}

export function DropdownDone({ children = "Listo" }: { children?: ReactNode }) {
  const { setOpen } = useDropdownContext("DropdownDone");

  return (
    <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
      {children}
    </Button>
  );
}
