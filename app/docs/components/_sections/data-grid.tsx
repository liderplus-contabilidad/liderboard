"use client";

import { useState } from "react";
import { DataGrid, GridRow } from "@/components/data-table/data-grid";
import { EditableCell } from "@/components/data-table/editable-cell";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { Demo, DocSection } from "./section";

const MONTHS = ["Ene", "Feb", "Mar", "Abr"];

const money = (value: number) => formatCurrency(value, { cents: true });

interface PygRow {
  concept: string;
  values: number[];
  subtotal?: boolean;
}

const PYG_ROWS: PygRow[] = [
  { concept: "Ingresos por ventas", values: [12000, 13500, 11800, 14200] },
  { concept: "Otros ingresos", values: [420, 0, 380, 510] },
  { concept: "Costo de ventas", values: [-7000, -7600, -6900, -8100] },
  { concept: "Utilidad bruta", values: [5420, 5900, 5280, 6610], subtotal: true },
  { concept: "Gastos operativos", values: [-3200, -3100, -3300, -3000] },
  { concept: "Utilidad neta", values: [2220, 2800, 1980, 3610], subtotal: true },
];

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

interface Employee {
  name: string;
  cargo: string;
  months: string[];
}

const INITIAL_EMPLOYEES: Employee[] = [
  {
    name: "Bayas Castro Rolando",
    cargo: "Contador general",
    months: ["869.56", "565.22", "565.22"],
  },
  {
    name: "Santamaría Garzón Verónica",
    cargo: "Auxiliar contable",
    months: ["250", "250", "437.5"],
  },
];

const toNumber = (value: string) => {
  const parsed = Number.parseFloat(value.replace(/[$,\s]/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
};

export function DataGridSection() {
  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);

  const setCell = (rowIndex: number, monthIndex: number, value: string) => {
    setEmployees((current) =>
      current.map((employee, index) =>
        index === rowIndex
          ? {
              ...employee,
              months: employee.months.map((month, position) =>
                position === monthIndex ? value : month,
              ),
            }
          : employee,
      ),
    );
  };

  return (
    <DocSection
      id="data-grid"
      title="Grilla y celdas"
      description="Grilla con columnas fijas (Concepto a la izquierda, Total a la derecha), celdas numéricas que colorean por signo, filas de subtotal y celdas editables con total en vivo."
    >
      <Demo label="Grilla PyG — columnas fijas y tono por signo" className="block">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">Estado de resultados</span>
          <Badge variant="mono">Datos de ejemplo</Badge>
        </div>
        <DataGrid minWidth={720}>
          <thead>
            <tr>
              <HeadCell sticky="left" width={200}>
                Concepto
              </HeadCell>
              {MONTHS.map((month) => (
                <HeadCell key={month} align="right" width={96}>
                  {month}
                </HeadCell>
              ))}
              <HeadCell sticky="right" align="right" width={120}>
                Total
              </HeadCell>
            </tr>
          </thead>
          <tbody>
            {PYG_ROWS.map((row) => (
              <GridRow key={row.concept} muted={row.subtotal}>
                <Cell sticky="left" strong={row.subtotal}>
                  {row.concept}
                </Cell>
                {row.values.map((value, index) => (
                  <Cell key={MONTHS[index]} numeric tone="auto" value={value} strong={row.subtotal}>
                    {value === 0 ? "–" : money(value)}
                  </Cell>
                ))}
                <Cell sticky="right" numeric strong value={sum(row.values)}>
                  {money(sum(row.values))}
                </Cell>
              </GridRow>
            ))}
          </tbody>
        </DataGrid>
      </Demo>

      <Demo label="Grilla editable — Sueldos (total en vivo)" className="block">
        <DataGrid minWidth={640}>
          <thead>
            <tr>
              <HeadCell width={220}>Empleado</HeadCell>
              <HeadCell width={180}>Cargo</HeadCell>
              {MONTHS.slice(0, 3).map((month) => (
                <HeadCell key={month} align="right" width={96}>
                  {month}
                </HeadCell>
              ))}
              <HeadCell align="right" width={110}>
                Total
              </HeadCell>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee, rowIndex) => {
              const total = employee.months.reduce((acc, month) => acc + toNumber(month), 0);
              return (
                <GridRow key={employee.name}>
                  <Cell className="uppercase">{employee.name}</Cell>
                  <Cell tone="muted" className="uppercase">
                    {employee.cargo}
                  </Cell>
                  {employee.months.map((month, monthIndex) => (
                    <EditableCell
                      key={MONTHS[monthIndex]}
                      value={month}
                      ariaLabel={`${employee.name} — ${MONTHS[monthIndex]}`}
                      onChange={(value) => setCell(rowIndex, monthIndex, value)}
                    />
                  ))}
                  <Cell numeric strong value={total}>
                    {money(total)}
                  </Cell>
                </GridRow>
              );
            })}
          </tbody>
        </DataGrid>
      </Demo>
    </DocSection>
  );
}
