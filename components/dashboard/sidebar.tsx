"use client";

import { ChevronDown, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { MODULES } from "@/lib/modules";

export function DashboardSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // What is stored is what is COLLAPSED and not what is expanded: a new module with children is born
  // visible without having to be seeded into this state, which is the rule that makes subitems
  // discoverable.
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());

  const toggleFold = useCallback((slug: string) => {
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(slug)) {
        next.add(slug);
      }
      return next;
    });
  }, []);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out",
        collapsed ? "w-[72px]" : "w-[264px]",
      )}
    >
      <div
        className={cn(
          "flex px-5 pb-5 pt-6",
          collapsed ? "flex-col items-center gap-3 px-0" : "items-center gap-3",
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-brand text-base font-bold tracking-tight text-white">
          L+
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="text-base font-bold tracking-tight text-brand">LiderPlus</div>
            <div className="text-[11px] font-medium text-faint">Firma contable</div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          aria-expanded={!collapsed}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-canvas hover:text-brand",
            !collapsed && "ml-auto",
          )}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className={cn("flex flex-col gap-1", collapsed ? "px-3" : "px-4")}>
        <div
          className={cn(
            "px-2 pb-2 pt-3 text-[10.5px] font-semibold tracking-[1px] text-faint",
            collapsed && "sr-only",
          )}
        >
          MÓDULOS
        </div>

        {MODULES.map((module) => {
          const href = `/${module.slug}`;
          const children = module.children ?? [];
          const childHrefs = children.map((child) => `${href}/${child.slug}`);
          // The parent does NOT light up with its child: they are two different destinations, and
          // marking both would suggest the open page is the parent's.
          const active =
            (pathname === href || pathname.startsWith(`${href}/`)) &&
            !childHrefs.some((childHref) => pathname === childHref);
          const insideChild = childHrefs.some(
            (childHref) => pathname === childHref || pathname.startsWith(`${childHref}/`),
          );
          // Two cases ignore what is collapsed, and for the same reason: a hidden child with no
          // control in sight is an unreachable destination. Collapsed, the bar has nowhere to put
          // the chevron, and collapsing the parent of the OPEN page would erase it from the menu
          // right when you are on it.
          const expanded = collapsed || insideChild || !folded.has(module.slug);

          return (
            <div key={module.slug} className="contents">
              <NavItem
                href={href}
                label={module.label}
                icon={module.icon}
                active={active}
                collapsed={collapsed}
                disclosure={
                  children.length > 0 && !collapsed
                    ? {
                        expanded,
                        // A parent collapsed by force —because its child is the open page— shows the
                        // chevron expanded and inert, rather than hiding it: the entry does not
                        // change shape depending on where you are standing.
                        onToggle: insideChild ? undefined : () => toggleFold(module.slug),
                        label: module.label,
                      }
                    : undefined
                }
              />
              {/* The children render by default, not only inside their parent: a subitem that shows
                  up only once you enter it cannot be discovered. Collapsing them is the user's. */}
              {expanded &&
                children.map((child, index) => {
                  const childHref = childHrefs[index];
                  return (
                    <NavItem
                      key={child.slug}
                      href={childHref}
                      label={child.label}
                      icon={child.icon}
                      active={pathname === childHref || pathname.startsWith(`${childHref}/`)}
                      collapsed={collapsed}
                      nested
                    />
                  );
                })}
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="mt-auto p-4">
          <div className="text-center text-[10.5px] text-faintest">
            © {new Date().getFullYear()} LiderPlus · v0.1
          </div>
        </div>
      )}
    </aside>
  );
}

/**
 * The chevron that collapses a module's children. It is a SIBLING of the link and not inside it,
 * because a button inside an `<a>` is not valid HTML and collapsing cannot navigate.
 */
interface NavDisclosure {
  expanded: boolean;
  /** Absent when the state is forced and the control has nothing to do. */
  onToggle?: () => void;
  label: string;
}

/**
 * A navigation entry — module or subitem, which render alike except for the indent.
 *
 * `nested` only applies EXPANDED: at 72 px the indent cannot be told apart and what matters is that
 * the destination stays reachable, so collapsed a child renders like any other entry, with its icon
 * and its `title`.
 */
function NavItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  nested = false,
  disclosure,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  nested?: boolean;
  disclosure?: NavDisclosure;
}) {
  return (
    <div className="relative">
      <Link
        href={href}
        title={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-sm transition-colors",
          collapsed && "justify-center px-0",
          nested && !collapsed && "ml-4 border-l border-border-soft py-2 pl-4",
          disclosure && "pr-10",
          active
            ? "bg-brand-soft font-semibold text-brand"
            : "font-medium text-muted hover:bg-canvas",
        )}
      >
        {active && !nested && (
          <span className="absolute inset-y-2 left-0 w-[3px] rounded-[3px] bg-brand" />
        )}
        <Icon size={nested ? 16 : 18} strokeWidth={1.9} className="shrink-0" />
        <span className={cn("flex-1", collapsed && "sr-only")}>{label}</span>
      </Link>
      {disclosure && (
        <button
          type="button"
          onClick={disclosure.onToggle}
          disabled={!disclosure.onToggle}
          aria-expanded={disclosure.expanded}
          aria-label={
            disclosure.expanded
              ? `Ocultar subpáginas de ${disclosure.label}`
              : `Mostrar subpáginas de ${disclosure.label}`
          }
          className={cn(
            "absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md transition-colors",
            active ? "text-brand" : "text-faint",
            disclosure.onToggle ? "hover:bg-canvas hover:text-brand" : "cursor-default opacity-60",
          )}
        >
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cn(
              "transition-transform duration-150",
              !disclosure.expanded && "-rotate-90",
            )}
          />
        </button>
      )}
    </div>
  );
}
