"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useContext,
  useMemo,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "@/lib/cn";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

/**
 * shadcn/base Sidebar, adapted to LiderPlus tokens and cut down to what a desktop-only shell uses:
 * no mobile sheet, no cookie, and —the one deliberate departure— NO width transition.
 *
 * The width SNAPS, on purpose: animating it re-lays out the whole page on every frame — with Datos
 * open that is thirty thousand nodes, twelve times — and each chart on screen relayouts its SVG
 * along with it. On the office laptops a 200 ms transition cost a full second. What moves instead
 * is the CONTENT (`SidebarLabel` fades in on opacity + transform, which the compositor runs alone),
 * so opening reads as smooth and the page is laid out exactly once.
 */
const ICON_STROKE = 1.5;

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

export function useSidebar(): SidebarState {
  const state = useContext(SidebarContext);
  if (!state) {
    throw new Error("useSidebar must be used inside <Sidebar>");
  }
  return state;
}

const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

export function Sidebar({
  collapsed,
  onToggle,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const state = useMemo(() => ({ collapsed, toggle: onToggle }), [collapsed, onToggle]);
  return (
    <SidebarContext.Provider value={state}>
      {/* One provider for the rail: the first label waits, moving on to the next one is instant. */}
      <TooltipProvider delay={120} closeDelay={0}>
        <aside
          data-slot="sidebar"
          data-state={collapsed ? "collapsed" : "expanded"}
          className={cn(
            "relative flex shrink-0 flex-col border-r border-border bg-surface",
            collapsed ? "w-[72px]" : "w-[264px]",
          )}
        >
          {children}
        </aside>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

export function SidebarHeader({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div
      data-slot="sidebar-header"
      className={cn(
        "flex shrink-0 items-center",
        // 64 px tall with the mark 14 px from the top in BOTH states: it lines up with the page
        // header beside it and the mark does not jump when the rail opens.
        collapsed ? "flex-col gap-2 pb-1 pt-3.5" : "h-16 gap-3 pl-[18px] pr-3",
      )}
    >
      {children}
    </div>
  );
}

export function SidebarContent({ children }: { children: ReactNode }) {
  return (
    <nav
      data-slot="sidebar-content"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 pb-3"
    >
      {children}
    </nav>
  );
}

export function SidebarFooter({ children }: { children: ReactNode }) {
  return (
    <div data-slot="sidebar-footer" className="shrink-0 border-t border-border-soft p-3">
      {children}
    </div>
  );
}

/** Expanded it names the group; on the rail there is no room for a word, so it is a hairline. */
export function SidebarGroupLabel({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  if (collapsed) {
    return (
      <div className="py-2.5">
        <div className="mx-auto h-px w-6 bg-border" />
        <span className="sr-only">{children}</span>
      </div>
    );
  }
  return (
    <div
      data-slot="sidebar-group-label"
      className="px-3 pb-2 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint"
    >
      {children}
    </div>
  );
}

export function SidebarMenu({ children }: { children: ReactNode }) {
  return (
    <ul data-slot="sidebar-menu" className="flex flex-col gap-1">
      {children}
    </ul>
  );
}

export function SidebarMenuItem({ children }: { children: ReactNode }) {
  return (
    <li data-slot="sidebar-menu-item" className="relative">
      {children}
    </li>
  );
}

/**
 * The text of an entry. Collapsed it stays in the accessibility tree and leaves the screen; expanded
 * it fades in, which is the whole of the «opening» animation (see the note at the top).
 */
export function SidebarLabel({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <span
      className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate motion-safe:animate-sidebar-in"}
    >
      {children}
    </span>
  );
}

type EntryProps = {
  /** With an `href` the entry is a link; without one, a button. */
  href?: string;
  className?: string;
  /** Optional: a trigger that `render`s the entry supplies them itself. */
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">;

/** Link or button, same props either way — which is also what lets a trigger `render` it. */
function Entry({ href, className, children, ref, ...props }: EntryProps) {
  if (href !== undefined) {
    return (
      <Link
        href={href}
        ref={ref as Ref<HTMLAnchorElement>}
        className={className}
        {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      ref={ref as Ref<HTMLButtonElement>}
      className={className}
      {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}

type SidebarMenuButtonProps = EntryProps & {
  /** This entry IS the open page. */
  active?: boolean;
  /** The open page hangs off this entry: it is named, not marked. */
  within?: boolean;
  /** Shown beside the icon while the sidebar is collapsed; ignored expanded, where the label is. */
  tooltip?: string;
  /** Leaves room on the right for a `SidebarMenuAction`. */
  hasAction?: boolean;
};

export function SidebarMenuButton({
  active = false,
  within = false,
  tooltip,
  hasAction = false,
  children,
  ...props
}: SidebarMenuButtonProps) {
  const { collapsed } = useSidebar();
  const entry = (
    <Entry
      data-slot="sidebar-menu-button"
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-10 w-full items-center rounded-[9px] text-left text-sm transition-colors [&>svg]:shrink-0",
        FOCUS_RING,
        collapsed ? "justify-center" : hasAction ? "gap-3 pl-3 pr-10" : "gap-3 px-3",
        active
          ? "bg-brand-soft font-semibold text-brand"
          : within
            ? "font-semibold text-ink hover:bg-canvas"
            : "font-medium text-muted hover:bg-canvas hover:text-ink",
      )}
      {...props}
    >
      {active && (
        <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-brand" aria-hidden />
      )}
      {children}
    </Entry>
  );
  if (!collapsed || !tooltip) {
    return entry;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={entry} />
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The control at the right of an entry — a group's chevron. It is a SIBLING of the link and never
 * inside it: a button inside an `<a>` is not valid HTML, and folding a group cannot navigate.
 */
export function SidebarMenuAction({
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & { className?: string }) {
  return (
    <button
      type="button"
      data-slot="sidebar-menu-action"
      className={cn(
        "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-faint transition-colors enabled:hover:bg-border-soft enabled:hover:text-brand disabled:cursor-default disabled:opacity-50",
        FOCUS_RING,
        className,
      )}
      {...props}
    />
  );
}

/**
 * A group's pages. The rule hangs from the CENTRE of the parent's icon (12 px padding + half of an
 * 18 px icon), so the eye reads «these belong to that» before reading a word.
 */
export function SidebarMenuSub({ children }: { children: ReactNode }) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      className="ml-[21px] mt-1 flex flex-col gap-0.5 border-l border-border pl-3"
    >
      {children}
    </ul>
  );
}

export function SidebarMenuSubItem({ children }: { children: ReactNode }) {
  return <li data-slot="sidebar-menu-sub-item">{children}</li>;
}

/**
 * A page inside a group. `rule` paints the open page's stretch of the group's rule in brand; it is
 * off where there is no rule to paint over (the collapsed rail's card).
 */
export function SidebarMenuSubButton({
  active = false,
  rule = true,
  children,
  ...props
}: EntryProps & { active?: boolean; rule?: boolean }) {
  return (
    <Entry
      data-slot="sidebar-menu-sub-button"
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[13px] transition-colors [&>svg]:shrink-0",
        FOCUS_RING,
        active
          ? "bg-brand-soft font-semibold text-brand"
          : "font-medium text-muted hover:bg-canvas hover:text-ink",
      )}
      {...props}
    >
      {active && rule && (
        <span
          className="absolute inset-y-2 -left-[13.5px] w-[2px] rounded-full bg-brand"
          aria-hidden
        />
      )}
      {children}
    </Entry>
  );
}

const TOGGLE_SHORTCUT_LABEL = "Ctrl B";

/** The collapse button. Its tooltip names the action AND the shortcut the shell listens for. */
export function SidebarTrigger() {
  const { collapsed, toggle } = useSidebar();
  const label = collapsed ? "Expandir menú" : "Contraer menú";
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-slot="sidebar-trigger"
            onClick={toggle}
            aria-label={label}
            aria-expanded={!collapsed}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-faint transition-colors hover:bg-canvas hover:text-brand",
              FOCUS_RING,
              !collapsed && "ml-auto",
            )}
          />
        }
      >
        <Icon size={18} strokeWidth={ICON_STROKE} />
      </TooltipTrigger>
      <TooltipContent side={collapsed ? "right" : "bottom"}>
        {label}
        <kbd className="rounded-[5px] border border-border bg-surface-muted px-1.5 py-px font-mono text-[10.5px] text-muted">
          {TOGGLE_SHORTCUT_LABEL}
        </kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The sidebar's own edge as a second, larger target for the same toggle. Out of the tab order —the
 * trigger is the keyboard's way in— and it only draws itself under the pointer.
 */
export function SidebarRail() {
  const { collapsed, toggle } = useSidebar();
  const label = collapsed ? "Expandir menú" : "Contraer menú";
  return (
    <button
      type="button"
      data-slot="sidebar-rail"
      tabIndex={-1}
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "absolute inset-y-0 -right-px w-2 after:absolute after:inset-y-0 after:right-0 after:w-[2px] after:bg-brand/0 after:transition-colors hover:after:bg-brand/30",
        collapsed ? "cursor-e-resize" : "cursor-w-resize",
      )}
    />
  );
}
