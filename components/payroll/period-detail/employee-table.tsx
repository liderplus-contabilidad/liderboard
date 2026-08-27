"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";
import { DataGrid } from "@/components/data-table/data-grid";
import { HeadCell } from "@/components/data-table/grid-cells";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { pluralize } from "@/lib/format";
import type { PayrollEmployeeLine, PayrollPeriod } from "@/lib/payroll/types";
import { type EmployeeRowData, EmployeeRow } from "./employee-row";
import { EmployeeFormModal } from "../employee-form-modal";

interface EmployeeTableProps {
  /** The período a new employee lands in — it is also what the modal names in its subtitle. */
  period: PayrollPeriod;
  /** The período's whole nómina, UNFILTERED — it decides between the «has no employees» empty state
   *  and the «no employee matches what you are searching» one, and it is what the creation modal
   *  reads to reject a duplicate. */
  lines: readonly PayrollEmployeeLine[];
  /** `lines` with their rol computed, after the search box — what the table paints. */
  visibleRows: readonly EmployeeRowData[];
  search: string;
  onSearchChange: (value: string) => void;
}

export function EmployeeTable({
  period,
  lines,
  visibleRows,
  search,
  onSearchChange,
}: EmployeeTableProps) {
  const [registering, setRegistering] = useState(false);

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
          {pluralize(visibleRows.length, "empleado")}
        </span>
        <Button
          variant="secondary"
          size="sm"
          icon={<UserPlus size={14} />}
          onClick={() => setRegistering(true)}
        >
          Registrar empleado
        </Button>
      </div>

      {lines.length === 0 ? (
        <EmptyState className="py-14">
          Este período todavía no tiene empleados. Agrégalos uno por uno o copia la nómina del mes
          anterior.
        </EmptyState>
      ) : visibleRows.length === 0 ? (
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
            {visibleRows.map((row) => (
              <EmployeeRow key={row.line.id} line={row.line} computed={row.computed} />
            ))}
          </tbody>
        </DataGrid>
      )}

      {registering && (
        <EmployeeFormModal period={period} lines={lines} onClose={() => setRegistering(false)} />
      )}
    </div>
  );
}
