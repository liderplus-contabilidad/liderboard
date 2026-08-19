/**
 * DE LA FICHA DE UN EMPLEADO AL COMPROBANTE, sin tocar `pdf-lib`.
 *
 * Reproduce la hoja `INDIVIDUAL` del libro del contador (`Print_Area = A1:P49`), que es el papel
 * que el empleado firma cada mes. Tres decisiones sostienen la fidelidad y conviene tenerlas
 * juntas, porque las tres son al revés de lo que hace la PANTALLA de detalle:
 *
 * 1. **Solo se imprimen las filas CON importe.** El papel se imprimía entero, las 26 filas con `-`
 *    donde no había nada, porque un formulario de posición fija se revisa buscando cada concepto
 *    donde siempre está. La firma pidió lo contrario: que el comprobante liste lo que este mes se
 *    pagó y se descontó, y nada más. No es la regla de la PANTALLA, que es otra y sigue siendo
 *    otra: `visibleIncomeConcepts` esconde lo que se TECLEA en cero y conserva siempre lo que la
 *    app deriva —esa tabla es donde se captura, y una fila que se va se lleva consigo el sitio
 *    donde escribirla—; aquí no se captura nada, así que se juzga el IMPORTE, venga del motor o
 *    de la captura.
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
import { letterheadLines, type CompanyProfile } from "@/lib/company-profile";
import type { EntityLogo } from "@/lib/logos";
import {
  DEDUCTION_CONCEPTS,
  INCOME_CONCEPTS,
  type DeductionConcept,
  type IncomeConcept,
  deductionAmount,
  incomeAmount,
} from "../concepts";
import { sameToTheCentavo } from "../amounts";
import type { PayrollEmployeeComputation } from "../engine/types";
import type { PayrollEmployeeLine, PayrollExtraConcept, PayrollMonthlyCapture } from "../types";
import { formatPayslipAmount, formatQuantity } from "./format";
import type { PayslipDocument, PayslipRow } from "./types";

/** La marca de la columna `Cantidad` que la nota al pie explica. */
export const NOT_CONTRIBUTORY_MARK = "(*)";

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
    return NOT_CONTRIBUTORY_MARK;
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

/**
 * La fila de un concepto, o NINGUNA si no tiene importe — la regla 1 de la cabecera, escrita en un
 * solo sitio para los dos bloques.
 *
 * El cero se juzga al CENTAVO y con `sameToTheCentavo`, que es la única definición de «el mismo
 * importe» del módulo: el motor no redondea sus totales y arrastra ruido de coma flotante, así que
 * un `1e-14` no es una cifra que declarar y su fila no tiene por qué ocupar un renglón.
 */
function rowFor(
  concept: IncomeConcept | DeductionConcept,
  amount: number,
  quantity: string | null,
): PayslipRow[] {
  if (sameToTheCentavo(amount, 0)) {
    return [];
  }
  return [
    {
      code: concept.code,
      label: concept.payslipLabel,
      quantity,
      value: formatPayslipAmount(amount),
    },
  ];
}

/**
 * Las filas de los conceptos que el PERÍODO declara, con el rótulo que el usuario les puso.
 *
 * El `code` va vacío: los `I-01`…`I-13` del catálogo son posiciones del libro que el contador
 * reconoce, y numerar estos con la misma gramática afirmaría que también salen de su hoja. El
 * rótulo se imprime en MAYÚSCULAS, que es la convención de todos los `payslipLabel`.
 *
 * Los NO aportables llevan el `(*)`, la misma marca que `U` y `V`, porque su nota al pie —«No
 * aporta IESS ni es Ingreso Gravado»— es literalmente lo que su clase significa.
 */
function extraIncomeRows(
  concepts: readonly PayrollExtraConcept[] | undefined,
  capture: PayrollMonthlyCapture,
): PayslipRow[] {
  return (concepts ?? []).flatMap((concept) => {
    const amount = capture.extraAmounts?.[concept.id] ?? 0;
    if (sameToTheCentavo(amount, 0)) {
      return [];
    }
    return [
      {
        code: "",
        label: concept.label.toUpperCase(),
        quantity: concept.kind === "noAportable" ? NOT_CONTRIBUTORY_MARK : null,
        value: formatPayslipAmount(amount),
      },
    ];
  });
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
  clientLogo,
  clientCompany,
  position,
  extraConcepts,
}: {
  line: PayrollEmployeeLine;
  computed: PayrollEmployeeComputation;
  capture: PayrollMonthlyCapture;
  year: number;
  monthIndex: number;
  /** El nombre que el usuario le dio al cliente. La razón social que el contador imprime aquí va
   *  DEBAJO, en `companyLines`: son dos cosas distintas —«Delicmar» y `DELICMAR S.A.S.`— y el papel
   *  las escribe las dos. */
  clientName: string;
  /** El logo del cliente, si subió uno. Encabeza el comprobante junto al nombre. */
  clientLogo?: EntityLogo;
  /** Los datos de la empresa que el cliente declaró. Sin ellos el encabezado queda como estaba. */
  clientCompany?: CompanyProfile;
  /** La posición del empleado en la nómina, 1…N. Es lo que el libro llama `Codigo:` — su columna
   *  `A` es un contador por orden que salta las cabeceras de área, no un identificador estable. */
  position: number;
  /** Los conceptos de ingreso que el PERÍODO declara además de los del catálogo. */
  extraConcepts?: readonly PayrollExtraConcept[];
}): PayslipDocument {
  const incomes: PayslipRow[] = [
    ...payslipIncomeConcepts().flatMap((concept) =>
      rowFor(concept, incomeAmount(concept, computed, capture), incomeQuantity(concept, capture)),
    ),
    // Los conceptos extra van DETRÁS del catálogo y no intercalados: el orden del papel es el de
    // COLUMNAS del libro, y estos no tienen ninguna — no hay sitio donde meterlos que signifique
    // algo. Detrás, además, deja intacta la posición de las trece filas que el contador conoce.
    ...extraIncomeRows(extraConcepts, capture),
  ];

  const deductions: PayslipRow[] = payslipDeductionConcepts().flatMap((concept) =>
    rowFor(concept, deductionAmount(concept, computed, capture), null),
  );

  return {
    company: clientName,
    ...(clientLogo ? { logo: clientLogo } : {}),
    companyLines: letterheadLines(clientCompany),
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
    // La nota solo sale si queda en la hoja alguna marca que explicar: las dos filas que la llevan
    // son las que más veces valen cero, y un pie que aclara un `(*)` que no está en el papel manda
    // a buscar algo que no existe.
    footnote: incomes.some((row) => row.quantity === NOT_CONTRIBUTORY_MARK)
      ? PAYSLIP_FOOTNOTE
      : null,
    totalIncome: formatPayslipAmount(computed.grossIncome),
    totalDeductions: formatPayslipAmount(computed.totalDeductions),
    netPay: formatPayslipAmount(computed.netPay),
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
