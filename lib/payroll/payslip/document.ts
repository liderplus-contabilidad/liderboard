/**
 * DE LA FICHA DE UN EMPLEADO AL COMPROBANTE, sin tocar `pdf-lib`.
 *
 * Reproduce la hoja `INDIVIDUAL` del libro del contador (`Print_Area = A1:P49`), que es el papel
 * que el empleado firma cada mes. Tres decisiones sostienen la fidelidad y conviene tenerlas
 * juntas, porque las tres son al revés de lo que hace la PANTALLA de detalle:
 *
 * 1. **Se imprimen las 26 filas siempre**, con `-` donde no hay importe. `visibleIncomeConcepts`
 *    esconde en pantalla los capturados en cero para que la tabla no parezca un formulario a medio
 *    llenar; el comprobante hace lo contrario porque es un formulario de POSICIÓN FIJA — quien lo
 *    revisa busca el anticipo en la cuarta fila de egresos, y dos empleados del mismo mes se leen
 *    en paralelo.
 * 2. **El orden es el de COLUMNAS del libro**, no el del catálogo. `concepts.ts` agrupa los
 *    calculados arriba (una decisión de la tabla, donde son las filas grises que no se editan) y
 *    por eso pone el fondo de reserva séptimo; el papel lo pone duodécimo, porque su columna `U`
 *    va detrás de la `T`. No hace falta declarar una segunda lista: se ordena por el campo
 *    `column` que el catálogo ya trae.
 * 3. **No se imprimen las cuatro filas de egreso SIN RÓTULO** del Excel (columnas `AJ`–`AM`).
 *    Siempre valen cero, `concepts.ts` las excluye a propósito (§11.4: sin nombre no entran al
 *    catálogo), e imprimirlas obligaría a este archivo a declarar filas que ninguna otra parte de
 *    la app conoce.
 *
 * Nada de esto se persiste: el comprobante se arma en el momento de la descarga desde la ficha, lo
 * capturado y lo que deriva el motor. Una copia guardada quedaría obsoleta en cuanto alguien
 * corrigiera los días trabajados, y el papel diría una cosa y la pantalla otra.
 */
import { MONTHS_FULL_ES } from "@/lib/date";
import {
  DEDUCTION_CONCEPTS,
  INCOME_CONCEPTS,
  type DeductionConcept,
  type IncomeConcept,
  deductionAmount,
  incomeAmount,
} from "../concepts";
import type { PayrollEmployeeComputation } from "../engine/types";
import type { PayrollEmployeeLine, PayrollMonthlyCapture } from "../types";
import { formatQuantity, formatRowAmount, formatTotal } from "./format";
import type { PayslipDocument, PayslipRow } from "./types";

/**
 * Ordena dos columnas de Excel: primero por longitud, luego alfabéticamente. Sin la longitud, un
 * orden alfabético a secas pondría `AA` antes que `Z` y el bloque de egresos saldría al revés.
 */
export function compareExcelColumns(a: string, b: string): number {
  return a.length - b.length || a.localeCompare(b);
}

/** Los ingresos del catálogo en el orden del papel. */
export function payslipIncomeConcepts(): IncomeConcept[] {
  return [...INCOME_CONCEPTS].sort((a, b) => compareExcelColumns(a.column, b.column));
}

/** Los egresos del catálogo en el orden del papel. */
export function payslipDeductionConcepts(): DeductionConcept[] {
  return [...DEDUCTION_CONCEPTS].sort((a, b) => compareExcelColumns(a.column, b.column));
}

/**
 * La columna `Cantidad` de una fila de ingreso. Solo cinco de las trece la usan:
 * - las tres de horas extras, con las horas TRABAJADAS — no las aprobadas. El recorte de Gerencia
 *   (`approvedOvertime`) mueve lo que SUMA, no lo que se muestra, igual que en pantalla;
 * - el fondo de reserva y el bono, con el literal `(*)` que la nota al pie explica.
 */
function incomeQuantity(concept: IncomeConcept, capture: PayrollMonthlyCapture): string | null {
  if (concept.notContributory) {
    return "(*)";
  }
  if (concept.kind === "calculado" && concept.hoursField) {
    return formatQuantity(capture[concept.hoursField]);
  }
  return null;
}

/** Un número sin formato de celda, como lo escribe el `&` de Excel al concatenarlo: `0`, `45.67`.
 *  Se redondea a centavos para no arrastrar el ruido de coma flotante del motor. */
function plainNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** El mes tal como lo escribe el comprobante: `MARZO 2026`. */
export function payslipMonthLabel(year: number, monthIndex: number): string {
  return `${MONTHS_FULL_ES[monthIndex].toUpperCase()} ${year}`;
}

export function buildPayslipDocument({
  line,
  computed,
  capture,
  year,
  monthIndex,
  clientName,
  position,
}: {
  line: PayrollEmployeeLine;
  computed: PayrollEmployeeComputation;
  capture: PayrollMonthlyCapture;
  year: number;
  monthIndex: number;
  /** El nombre que el usuario le dio al cliente. El comprobante del contador imprime aquí la razón
   *  social que declara `GENERAL!B1`, pero la app no la guarda todavía. */
  clientName: string;
  /** La posición del empleado en la nómina, 1…N. Es lo que el libro llama `Codigo:` — su columna
   *  `A` es un contador por orden que salta las cabeceras de área, no un identificador estable. */
  position: number;
}): PayslipDocument {
  const incomes: PayslipRow[] = payslipIncomeConcepts().map((concept) => ({
    code: concept.code,
    label: concept.payslipLabel,
    quantity: incomeQuantity(concept, capture),
    value: formatRowAmount(incomeAmount(concept, computed, capture)),
  }));

  const deductions: PayslipRow[] = payslipDeductionConcepts().map((concept) => ({
    code: concept.code,
    label: concept.payslipLabel,
    quantity: null,
    value: formatRowAmount(deductionAmount(concept, computed, capture)),
  }));

  return {
    company: clientName,
    title: "ROL DE PAGOS",
    period: `MES: ${payslipMonthLabel(year, monthIndex)}`,
    codeLine: `Codigo: ${position}`,
    daysLine: `Dias Trabajados: ${line.days}`,
    // `G7` del libro es `"FR="&VLOOKUP(…,21,…)`, y la columna 21 de su rango es `U`: el IMPORTE
    // del fondo de reserva pagado, no el flag `hasReserveFund` de la ficha. Va SIN el formato
    // contable de las filas —un cero sale `FR=0`, no `FR=-`— porque el `&` de Excel convierte el
    // número crudo y se salta el formato de la celda.
    reserveFundLine: `FR=${plainNumber(computed.reserveFundPaid)}`,
    employeeName: line.name,
    role: line.role,
    incomes,
    deductions,
    totalIncome: formatTotal(computed.grossIncome),
    totalDeductions: formatTotal(computed.totalDeductions),
    netPay: formatTotal(computed.netPay),
    idCardLine: `C.C. ${line.idCard}`,
  };
}

/** La nota al pie que explica el `(*)`. Verbatim de `B43`. */
export const PAYSLIP_FOOTNOTE = "(*) No aporta IESS ni es Ingreso Gravado";

/** La declaración que el empleado acepta al firmar. Verbatim de `B44`. */
export const PAYSLIP_DECLARATION =
  "Declaro y acepto que los valores de remuneraciones, horas extras y descuentos son correctos y " +
  "que recibo del valor que consta en LIQUIDO A RECIBIR a mi entera satisfacción.";

export const PAYSLIP_SIGNATURE_CAPTION = "Firma del Trabajador";
