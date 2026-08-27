"use client";

import { Building2, CalendarPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { CreatePayrollClientButton } from "./payroll-client-actions";
import { NewPeriodButton } from "./new-period-popover";
import { usePayrollData } from "./payroll-data-provider";

/**
 * Rol de Pagos' empty state, in its two forms — as in PyG, only one of them is resolved inside this
 * module:
 *
 * - **No clients**: no período is missing, the previous step is. The only exit is creating the
 *   first one; the copy says what is gained by doing it (each client holds ITS OWN payroll history).
 * - **A client with no períodos**: the exit is «+ Nuevo período» — the same action that already
 *   lives in the card's header, repeated here because this empty state takes the table's place when
 *   there is no row to render.
 */
export function PayrollEmptyState() {
  const { activeClientId } = usePayrollData();

  if (activeClientId === null) {
    return (
      <div className="flex flex-col items-center gap-4 px-7 py-16">
        <EmptyState icon={<Building2 size={22} />} className="py-0">
          <span className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-[15px] font-bold tracking-[-0.2px] text-ink">
              Todavía no hay clientes
            </span>
            <span className="max-w-[420px]">
              Cada cliente guarda su propio historial de nómina. Crea el primero y después registra
              su período.
            </span>
          </span>
        </EmptyState>
        <CreatePayrollClientButton />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 px-7 py-16">
      <EmptyState icon={<CalendarPlus size={22} />} className="py-0">
        <span className="flex flex-col items-center gap-1.5 text-center">
          <span className="text-[15px] font-bold tracking-[-0.2px] text-ink">
            Todavía no hay períodos
          </span>
          <span className="max-w-[420px]">
            Registra el primer período de nómina de este cliente.
          </span>
        </span>
      </EmptyState>
      <NewPeriodButton />
    </div>
  );
}
