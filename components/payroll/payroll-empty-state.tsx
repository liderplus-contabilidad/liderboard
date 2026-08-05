"use client";

import { Building2, CalendarPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { CreatePayrollClientButton } from "./payroll-client-actions";
import { usePayrollData } from "./payroll-data-provider";
import { NewPeriodButton } from "./new-period-dialog";

/**
 * El vacío de Rol de Pagos, en sus dos formas — como en PyG, solo una se resuelve dentro de este
 * módulo:
 *
 * - **Sin clientes**: no falta un período, falta el paso anterior. La única salida es crear el
 *   primero; el texto dice qué se gana al hacerlo (cada cliente guarda SU historial de nómina).
 * - **Con cliente y sin períodos**: la salida es «+ Nuevo período» — la misma acción que ya vive
 *   en el encabezado de la tarjeta, repetida aquí porque este vacío ocupa el sitio de la tabla
 *   cuando no hay ninguna fila que rendir.
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
