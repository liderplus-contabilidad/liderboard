"use client";

import { ChevronRight, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { memo, useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { MODULES, type DashboardModule } from "@/lib/modules";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/shadcn/collapsible";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/shadcn/hover-card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/shadcn/sidebar";
import { useBackups } from "./backup-provider";

/**
 * Under this width the sidebar starts COLLAPSED. It is Tailwind's `2xl`: on the office laptops
 * (1366 · 1440 · 1512 px) the open rail takes a fifth of the screen, Cuentas por Pagar's header
 * —five tabs and three controls— wraps to a second line beside it, and every grid loses the width
 * of two columns. The user's own toggle wins after that: this only decides how the app OPENS.
 */
const COLLAPSED_BELOW_PX = 1536;
const SIDEBAR_ICON_STROKE = 1.5;

export function DashboardSidebar() {
  const pathname = usePathname();
  const { open: openBackups } = useBackups();
  const [collapsed, setCollapsed] = useState(false);
  // Read once, after mount: the server cannot know the window, so the rail renders open and snaps
  // shut on a laptop in the first client frame — the same snap the toggle does, never a transition.
  useEffect(() => {
    if (window.innerWidth < COLLAPSED_BELOW_PX) {
      setCollapsed(true);
    }
  }, []);
  const toggleCollapsed = useCallback(() => setCollapsed((value) => !value), []);
  // Ctrl/⌘ + B, the shortcut the collapse button's tooltip announces.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "b" &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCollapsed]);
  // Only explicitly opened groups are stored: every module starts folded, including new ones.
  const [expandedModules, setExpandedModules] = useState<ReadonlySet<string>>(() => new Set());

  const toggleFold = useCallback((slug: string) => {
    setExpandedModules((current) => {
      const next = new Set(current);
      if (!next.delete(slug)) {
        next.add(slug);
      }
      return next;
    });
  }, []);

  return (
    <Sidebar collapsed={collapsed} onToggle={toggleCollapsed}>
      <SidebarHeader>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-brand text-base font-bold tracking-tight text-white">
          L+
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight motion-safe:animate-sidebar-in">
            <div className="text-base font-bold tracking-tight text-brand">LiderPlus</div>
            <div className="text-[11px] font-medium text-faint">Firma contable</div>
          </div>
        )}
        <SidebarTrigger />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroupLabel>Módulos</SidebarGroupLabel>
        <SidebarMenu>
          {MODULES.map((module) => (
            <ModuleEntry
              key={module.slug}
              module={module}
              pathname={pathname}
              expanded={expandedModules.has(module.slug)}
              onToggleFold={toggleFold}
            />
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenuButton
          tooltip="Respaldos"
          onClick={(event) => openBackups(event.currentTarget)}
        >
          <Settings size={18} strokeWidth={SIDEBAR_ICON_STROKE} />
          <SidebarLabel>Respaldos</SidebarLabel>
        </SidebarMenuButton>
        {!collapsed && (
          <div className="px-3 pt-2.5 text-[10.5px] text-faintest motion-safe:animate-sidebar-in">
            © {new Date().getFullYear()} LiderPlus · v0.1
          </div>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function isAt(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One module of the registry, in the one of three shapes its case calls for: a plain entry, a
 * group that folds (expanded sidebar) or a group that opens a card beside the rail (collapsed).
 */
const ModuleEntry = memo(function ModuleEntry({
  module,
  pathname,
  expanded,
  onToggleFold,
}: {
  module: DashboardModule;
  pathname: string;
  expanded: boolean;
  onToggleFold: (slug: string) => void;
}) {
  const { collapsed } = useSidebar();
  const Icon = module.icon;
  const href = `/${module.slug}`;
  const children = module.children ?? [];
  const insideChild = children.some((child) => isAt(pathname, `${href}/${child.slug}`));
  // The parent does NOT light up with its child: they are two different destinations, and
  // marking both would suggest the open page is the parent's. It is NAMED instead (`within`).
  const active = isAt(pathname, href) && !insideChild;
  const icon = <Icon size={18} strokeWidth={SIDEBAR_ICON_STROKE} />;

  if (children.length === 0) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton href={href} active={active} tooltip={module.label}>
          {icon}
          <SidebarLabel>{module.label}</SidebarLabel>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  if (collapsed) {
    return (
      <SidebarMenuItem>
        <CollapsedGroup module={module} pathname={pathname} />
      </SidebarMenuItem>
    );
  }

  // Keep the current destination visible, even on a direct load of a subpage.
  const open = insideChild || expanded;
  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={() => onToggleFold(module.slug)}>
        <SidebarMenuButton href={href} active={active} within={insideChild} hasAction>
          {icon}
          <SidebarLabel>{module.label}</SidebarLabel>
        </SidebarMenuButton>
        <CollapsibleTrigger
          // A group opened by force —because its child is the open page— shows the chevron
          // expanded and inert, rather than hiding it: the entry does not change shape depending
          // on where you are standing.
          disabled={insideChild}
          render={
            <SidebarMenuAction
              aria-label={
                open
                  ? `Ocultar subpáginas de ${module.label}`
                  : `Mostrar subpáginas de ${module.label}`
              }
              className={active ? "text-brand" : undefined}
            />
          }
        >
          <ChevronRight
            size={14}
            strokeWidth={SIDEBAR_ICON_STROKE}
            className={cn("transition-transform duration-200", open && "rotate-90")}
          />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <SidebarMenuSub>
            {children.map((child) => {
              const childHref = `${href}/${child.slug}`;
              return (
                <SidebarMenuSubItem key={child.slug}>
                  <SidebarMenuSubButton href={childHref} active={isAt(pathname, childHref)}>
                    <child.icon size={16} strokeWidth={SIDEBAR_ICON_STROKE} />
                    <SidebarLabel>{child.label}</SidebarLabel>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsiblePanel>
      </Collapsible>
    </SidebarMenuItem>
  );
});

/**
 * A group on the collapsed rail. The icon is still the LINK to the module —one click, as for any
 * other entry— and hovering or focusing it opens a card with the module and its pages, so a
 * subpage is reachable without opening the sidebar first. On the rail the icon lights up for the
 * module AND for its pages: there the children have no row of their own to carry the mark.
 */
function CollapsedGroup({ module, pathname }: { module: DashboardModule; pathname: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const Icon = module.icon;
  const href = `/${module.slug}`;
  const children = module.children ?? [];
  const insideChild = children.some((child) => isAt(pathname, `${href}/${child.slug}`));

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger
        delay={120}
        closeDelay={150}
        render={<SidebarMenuButton href={href} active={isAt(pathname, href)} onClick={close} />}
      >
        <Icon size={18} strokeWidth={SIDEBAR_ICON_STROKE} />
        <span className="sr-only">{module.label}</span>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" alignOffset={-6} className="w-[236px]">
        <SidebarMenuSubButton
          href={href}
          active={isAt(pathname, href) && !insideChild}
          rule={false}
          onClick={close}
        >
          <Icon size={16} strokeWidth={SIDEBAR_ICON_STROKE} />
          <span className="min-w-0 flex-1 truncate font-semibold">{module.label}</span>
        </SidebarMenuSubButton>
        <ul className="mt-1 flex flex-col gap-0.5 border-t border-border-soft pt-1">
          {children.map((child) => {
            const childHref = `${href}/${child.slug}`;
            return (
              <li key={child.slug}>
                <SidebarMenuSubButton
                  href={childHref}
                  active={isAt(pathname, childHref)}
                  rule={false}
                  onClick={close}
                >
                  <child.icon size={16} strokeWidth={SIDEBAR_ICON_STROKE} />
                  <span className="min-w-0 flex-1 truncate">{child.label}</span>
                </SidebarMenuSubButton>
              </li>
            );
          })}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}
