"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { OccupancyHotelActions } from "@/components/occupancy/occupancy-hotel-actions";
import { PayrollClientActions } from "@/components/payroll/payroll-client-actions";
import { PygClientActions } from "@/components/profit-loss/pyg-client-actions";
import { DEFAULT_MODULE, findModuleBySlug } from "@/lib/modules";

export function DashboardHeader() {
  const pathname = usePathname();
  const slug = pathname.split("/").filter(Boolean)[0];
  const current = findModuleBySlug(slug) ?? DEFAULT_MODULE;
  const isPyg = current.slug === "profit-loss";
  const isOccupancy = current.slug === "occupancy";
  const isPayroll = current.slug === "payroll";

  return (
    <header className="flex items-center gap-5 border-b border-border bg-surface px-7 py-4">
      <div className="min-w-0">
        <div className="mb-0.5 flex items-center gap-2 text-[11.5px] font-medium text-faint">
          <span>Módulos</span>
          <ChevronRight size={13} className="shrink-0" />
          <span className="truncate text-muted">{current.title}</span>
        </div>
        <h1 className="truncate text-xl font-bold tracking-tight text-brand">{current.title}</h1>
      </div>

      {/* Cada módulo monta su propio selector sobre el mismo bloque: PyG lista sus clientes,
          Ocupaciones sus hoteles, Rol de Pagos los suyos. Las tres listas son distintas —cada una
          con su base—; lo único que comparten es este control y las reglas de un nombre. */}
      {isPyg && (
        <div className="ml-auto min-w-0">
          <PygClientActions />
        </div>
      )}
      {isOccupancy && (
        <div className="ml-auto min-w-0">
          <OccupancyHotelActions />
        </div>
      )}
      {isPayroll && (
        <div className="ml-auto min-w-0">
          <PayrollClientActions />
        </div>
      )}
    </header>
  );
}
