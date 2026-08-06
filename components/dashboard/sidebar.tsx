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
  // Se guarda lo PLEGADO y no lo desplegado: un módulo nuevo con hijos nace visible sin tener que
  // sembrarlo en este estado, que es la regla que hace descubribles a los subitems.
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
          // El padre NO se enciende con su hijo: son dos destinos distintos, y marcar los dos haría
          // pensar que la página abierta es la del padre.
          const active =
            (pathname === href || pathname.startsWith(`${href}/`)) &&
            !childHrefs.some((childHref) => pathname === childHref);
          const insideChild = childHrefs.some(
            (childHref) => pathname === childHref || pathname.startsWith(`${childHref}/`),
          );
          // Dos casos ignoran lo plegado, y por el mismo motivo: un hijo escondido sin control a la
          // vista es un destino inalcanzable. Colapsada la barra no hay dónde poner el chevron, y
          // plegar el padre de la página ABIERTA la borraría del menú justo cuando estás en ella.
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
                        // Un padre plegado a la fuerza —porque su hijo es la página abierta— enseña
                        // el chevron desplegado y sin acción, en vez de esconderlo: la entrada no
                        // cambia de forma según dónde estés parado.
                        onToggle: insideChild ? undefined : () => toggleFold(module.slug),
                        label: module.label,
                      }
                    : undefined
                }
              />
              {/* Los hijos se rinden por defecto, no solo dentro de su padre: un subitem que aparece
                  únicamente al entrar en él no se puede descubrir. Plegarlos es del usuario. */}
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
 * El chevron que pliega los hijos de un módulo. Es HERMANO del enlace y no va dentro, porque un
 * botón dentro de un `<a>` no es HTML válido y plegar no puede navegar.
 */
interface NavDisclosure {
  expanded: boolean;
  /** Ausente cuando el estado está forzado y el control no tiene nada que hacer. */
  onToggle?: () => void;
  label: string;
}

/**
 * Una entrada de la navegación — módulo o subitem, que se rinden igual salvo por la sangría.
 *
 * `nested` solo aplica EXPANDIDA: a 72 px la sangría no se distingue y lo que hace falta es que el
 * destino siga siendo alcanzable, así que colapsada un hijo se rinde como cualquier otra entrada,
 * con su icono y su `title`.
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
