/**
 * La pantalla de detalle de un período: derivaciones puras sobre su nómina guardada. Como
 * `PayrollRosterSummary` ya hace para «Empleados»/«Áreas», nada de esto se persiste junto al
 * período — un total guardado aparte podría quedar desactualizado y entonces la tarjeta de KPIs
 * diría una cosa y la tabla de abajo otra.
 */
import { matchesSearch } from "@/lib/workspaces";
import type { PayrollEmployeeComputation } from "./engine/types";
import type { PayrollEmployeeLine } from "./types";

/**
 * Conciliado: se declaró lo pagado y coincide con el líquido que CALCULA el motor. Con
 * diferencia: se declaró y no coincide. Sin conciliar: nadie declaró lo pagado todavía —
 * ninguna de las otras dos, y la etiqueta no debe fingir que sí.
 *
 * Se clasifica el `difference` que el motor ya produjo (`CA = AP − BZ`) en vez de volver a
 * restar: el motor es el único sitio donde se decide qué es «cuadrar», incluido el colapso del
 * ruido sub-centavo, y una segunda resta aquí podía separarse de la suya — y se separaba, porque
 * esto comparaba lo que dijo el archivo mientras el motor comparaba lo tecleado.
 */
export type EmployeeReconciliationStatus = "conciliado" | "diferencia" | "sin-conciliar";

export function reconciliationStatusOf(
  difference: PayrollEmployeeComputation["difference"],
): EmployeeReconciliationStatus {
  if (difference === null) {
    return "sin-conciliar";
  }
  return difference === 0 ? "conciliado" : "diferencia";
}

/**
 * Cómo se rinde cada estado de conciliación: el tono del `Badge` y su rótulo.
 *
 * Vive junto a `reconciliationStatusOf` y no en un componente porque lo leen DOS pantallas
 * —la fila de la nómina y la cabecera del detalle— y un rótulo que discrepe entre ellas haría
 * dudar de la cifra, no del rótulo. Las variantes son nombres de token, no React, así que la capa
 * pura puede nombrarlas sin arrastrar la de presentación.
 */
export const RECONCILIATION_BADGE: Record<
  EmployeeReconciliationStatus,
  { variant: "positive" | "warning" | "outline"; label: string }
> = {
  conciliado: { variant: "positive", label: "Conciliado" },
  diferencia: { variant: "warning", label: "Con diferencia" },
  "sin-conciliar": { variant: "outline", label: "Sin conciliar" },
};

export interface PayrollReconciliationCounts {
  reconciled: number;
  withDifference: number;
}

/**
 * El desglose de la tarjeta «Empleados»: cuántos de la nómina están conciliados y cuántos con
 * diferencia. El resto (sin `PAGADO` declarado) no entra en ninguno de los dos conteos —
 * contarlo en cualquiera sería una etiqueta mintiendo por omisión.
 */
export function computeReconciliationCounts(
  computations: readonly PayrollEmployeeComputation[],
): PayrollReconciliationCounts {
  let reconciled = 0;
  let withDifference = 0;
  for (const computation of computations) {
    const status = reconciliationStatusOf(computation.difference);
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
 * Los cuatro totales de la tarjeta de KPIs, SIEMPRE sumados del rol que el motor calcula para
 * cada línea. `undefined` solo con la nómina VACÍA: un período sin empleados no tiene totales,
 * y eso no es lo mismo que una nómina con cifras en cero.
 *
 * Antes el corte era «ningún empleado trae `figures`», o sea «no llegó el archivo». Ya no existe
 * ese estado: el motor deriva el rol completo de la ficha —el sueldo unificado sale del sueldo
 * base y los días, y lo no capturado vale cero de verdad (ver `toEngineInput`)—, así que una
 * nómina recién copiada del mes anterior enseña sus cuatro KPIs desde el primer render, que es
 * el caso de uso principal del módulo.
 *
 * Recibe cómputos y no líneas para que la previa de una carga pueda totalizar lo que el archivo
 * trae ANTES de que exista en la base y tenga `id`/`periodId`, con la misma definición de «los
 * cuatro totales» que después leerá la tarjeta de KPIs.
 */
export function computePeriodFinancials(
  computations: readonly PayrollEmployeeComputation[],
): PayrollPeriodFinancials | undefined {
  if (computations.length === 0) {
    return undefined;
  }

  return computations.reduce<PayrollPeriodFinancials>(
    (totals, computation) => ({
      gross: totals.gross + computation.grossIncome,
      deductions: totals.deductions + computation.totalDeductions,
      net: totals.net + computation.netPay,
      cost: totals.cost + computation.employerCost,
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
