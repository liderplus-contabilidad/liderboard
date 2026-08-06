"use client";

import { UserPlus } from "lucide-react";
import { DataGrid } from "@/components/data-table/data-grid";
import { HeadCell } from "@/components/data-table/grid-cells";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { pluralize } from "@/lib/format";
import type { PayrollEmployeeLine } from "@/lib/payroll/types";
import { EmployeeRow } from "./employee-row";

/** Capturar un empleado a mano no está en esta ronda: el botón se apaga con el motivo en su
 *  propio tooltip — misma convención que ya usan los iconos de `PayrollPeriodRow`. */
const REGISTER_DISABLED_REASON = "Registrar un empleado a mano no está disponible todavía";

interface EmployeeTableProps {
  /** La nómina completa del período, SIN filtrar — decide entre el vacío «no tiene empleados» y
   *  el de «ningún empleado coincide con lo que buscas». */
  lines: readonly PayrollEmployeeLine[];
  /** `lines` después del buscador — lo que la tabla pinta. */
  visibleLines: readonly PayrollEmployeeLine[];
  search: string;
  onSearchChange: (value: string) => void;
}

export function EmployeeTable({ lines, visibleLines, search, onSearchChange }: EmployeeTableProps) {
  return (
    <div className="overflow-hidden rounded-[13px] border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-surface-header px-[18px] py-3">
        <SearchInput
          size="sm"
          value={search}
          onChange={onSearchChange}
          placeholder="Buscar empleado…"
          className="min-w-[220px] flex-1"
        />
        <span className="text-[11.5px] font-medium text-faint">
          {pluralize(visibleLines.length, "empleado")}
        </span>
        <Button
          variant="secondary"
          size="sm"
          icon={<UserPlus size={14} />}
          disabled
          title={REGISTER_DISABLED_REASON}
        >
          Registrar empleado
        </Button>
      </div>

      {lines.length === 0 ? (
        <EmptyState className="py-14">
          Este período todavía no tiene empleados. Agrégalos uno por uno o copia la nómina del mes
          anterior.
        </EmptyState>
      ) : visibleLines.length === 0 ? (
        <EmptyState className="py-14">Ningún empleado coincide con lo que buscas.</EmptyState>
      ) : (
        <DataGrid minWidth={760}>
          <thead>
            <tr>
              <HeadCell width={220}>Nombre</HeadCell>
              <HeadCell width={130}>Cédula</HeadCell>
              <HeadCell align="right" width={130}>
                Ingresos
              </HeadCell>
              <HeadCell align="right" width={130}>
                Deducciones
              </HeadCell>
              <HeadCell align="right" width={150}>
                Líquido a recibir
              </HeadCell>
              <HeadCell width={130}>Estado</HeadCell>
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((line) => (
              <EmployeeRow key={line.id} line={line} />
            ))}
          </tbody>
        </DataGrid>
      )}
    </div>
  );
}
