/**
 * La pantalla de detalle de un período: derivaciones puras sobre su nómina guardada. Como
 * `PayrollRosterSummary` ya hace para «Empleados»/«Áreas», nada de esto se persiste junto al
 * período — un total guardado aparte podría quedar desactualizado y entonces la tarjeta de KPIs
 * diría una cosa y la tabla de abajo otra.
 */
import { matchesSearch } from "@/lib/workspaces";
import { sameToTheCentavo } from "./amounts";
import type { PayrollEmployeeFigures, PayrollEmployeeLine } from "./types";

/**
 * Conciliado: el archivo declaró lo pagado (`figures.paid`) y coincide con el líquido
 * (`figures.net`). Con diferencia: lo declaró y NO coincide. Sin conciliar: no hay `figures`
 * todavía, o las hay pero `paid` es `null` — ninguna de las otras dos, y la etiqueta no debe
 * fingir que sí.
 */
export type EmployeeReconciliationStatus = "conciliado" | "diferencia" | "sin-conciliar";

export function employeeReconciliationStatus(
  line: Pick<PayrollEmployeeLine, "figures">,
): EmployeeReconciliationStatus {
  const figures = line.figures;
  if (!figures || figures.paid === null) {
    return "sin-conciliar";
  }
  return sameToTheCentavo(figures.paid, figures.net) ? "conciliado" : "diferencia";
}

export interface PayrollReconciliationCounts {
  reconciled: number;
  withDifference: number;
}

/**
 * El desglose de la tarjeta «Empleados»: cuántos de la nómina están conciliados y cuántos con
 * diferencia. El resto (sin `figures`, o con `paid === null`) no entra en ninguno de los dos
 * conteos — contarlo en cualquiera sería una etiqueta mintiendo por omisión.
 */
export function computeReconciliationCounts(
  lines: readonly PayrollEmployeeLine[],
): PayrollReconciliationCounts {
  let reconciled = 0;
  let withDifference = 0;
  for (const line of lines) {
    const status = employeeReconciliationStatus(line);
    if (status === "conciliado") {
      reconciled += 1;
    } else if (status === "diferencia") {
      withDifference += 1;
    }
  }
  return { reconciled, withDifference };
}

export interface PayrollPeriodFinancials {
  gross: number;
  deductions: number;
  net: number;
  cost: number;
}

/**
 * Los cuatro totales de la tarjeta de KPIs, SIEMPRE sumados de la nómina guardada. `undefined`
 * cuando NINGÚN empleado tiene `figures` todavía — el período no recibió su archivo, y eso no es
 * lo mismo que una nómina con cifras en cero.
 */
export function computePeriodFinancials(
  // Solo `figures`, no la línea entera: así la previa de una carga puede totalizar lo que el
  // archivo trae ANTES de que exista en la base y tenga `id`/`periodId`, con la misma definición
  // de «los cuatro totales» que después leerá la tarjeta de KPIs.
  lines: readonly Pick<PayrollEmployeeLine, "figures">[],
): PayrollPeriodFinancials | undefined {
  const withFigures = lines
    .map((line) => line.figures)
    .filter((figures): figures is PayrollEmployeeFigures => figures !== undefined);

  if (withFigures.length === 0) {
    return undefined;
  }

  return withFigures.reduce<PayrollPeriodFinancials>(
    (totals, figures) => ({
      gross: totals.gross + figures.gross,
      deductions: totals.deductions + figures.deductions,
      net: totals.net + figures.net,
      cost: totals.cost + figures.cost,
    }),
    { gross: 0, deductions: 0, net: 0, cost: 0 },
  );
}

/** El buscador de la tabla de empleados: compara el nombre, ignorando mayúsculas y acentos — la
 *  misma regla que ya usan el selector de clientes y el buscador de períodos. */
export function matchesEmployeeSearch(
  line: Pick<PayrollEmployeeLine, "name">,
  query: string,
): boolean {
  return matchesSearch(line.name, query);
}
