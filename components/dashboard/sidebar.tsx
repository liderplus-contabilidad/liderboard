"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { MODULES } from "@/lib/modules";

export function DashboardSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const Icon = module.icon;

          return (
            <Link
              key={module.slug}
              href={href}
              title={collapsed ? module.label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-sm transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-brand-soft font-semibold text-brand"
                  : "font-medium text-muted hover:bg-canvas",
              )}
            >
              {active && (
                <span className="absolute inset-y-2 left-0 w-[3px] rounded-[3px] bg-brand" />
              )}
              <Icon size={18} strokeWidth={1.9} className="shrink-0" />
              <span className={cn("flex-1", collapsed && "sr-only")}>{module.label}</span>
            </Link>
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
