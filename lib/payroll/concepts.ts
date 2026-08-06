/**
 * EL CATÁLOGO DE CONCEPTOS DEL ROL — declarado UNA sola vez.
 *
 * Cada entrada amarra tres cosas que tienen que decir lo mismo o el rol deja de cuadrar con el
 * Excel del contador: el **código** con el que la pantalla lo nombra (`I-01`, `E-04`), la
 * **columna** de la hoja `GENERAL` de la que sale, y el **campo** del motor o de la captura que
 * lo lleva. Nada de eso puede vivir suelto en un componente: un rótulo distinto en dos pantallas
 * o una columna mal atribuida en el parser son errores que ningún test de cifras detecta, porque
 * las cifras siguen sumando igual.
 *
 * El orden es el del libro y el del comprobante `INDIVIDUAL`, que son el mismo. La pantalla de
 * detalle lo recorre tal cual, así que la fila 3 de la tabla es la fila 3 del rol impreso.
 *
 * `calculado` = lo deriva `lib/payroll/engine/`; `capturado` = lo teclea quien captura el mes.
 * En la pantalla los calculados van en gris y no se editan, que es lo que el diseño llama «los
 * valores en gris se calculan solos».
 *
 * Fuera de este catálogo quedan, a propósito, dos columnas del libro:
 * - `M` (TOTAL HORAS EXTRAS) no es un concepto sino el TOTAL de I-02…I-04, y es donde vive el
 *   importe aprobado (`approvedOvertime`); la pantalla lo muestra como el recorte de esas tres
 *   filas, no como una fila propia.
 * - `AJ`–`AM`, cuatro columnas de egreso SIN RÓTULO que el libro incluye en su `SUM(X:AN)` y
 *   que siempre valen cero. Sin nombre no pueden entrar aquí — es la pregunta abierta §11.4.
 */
import type { CapturedDeductions, PayrollEmployeeComputation } from "./engine/types";
import type { PayrollMonthlyCapture } from "./types";

/** Los campos de `PayrollMonthlyCapture` que son un importe de ingreso tecleado. */
export type CapturedIncomeField =
  | "vacationPay"
  | "privateInsurance"
  | "allowances"
  | "fixedCommission"
  | "variableCommission"
  | "bonus";

/** Los campos de `PayrollEmployeeComputation` que son un importe de ingreso derivado. */
export type ComputedIncomeField =
  | "unifiedSalary"
  | "overtimePay50"
  | "overtimePay100"
  | "overtimePay25"
  | "fourteenthMonthly"
  | "thirteenthMonthly"
  | "reserveFundPaid";

/** Las cantidades de horas, que solo tienen tres conceptos. */
export type OvertimeHoursField = "overtimeHours50" | "overtimeHours100" | "overtimeHours25";

interface ConceptBase {
  /** Como lo nombra la pantalla. No es un id de base de datos: no se persiste. */
  code: string;
  /** Columna de la hoja `GENERAL`. Es la trazabilidad al archivo del contador. */
  column: string;
  /** Rótulo en español, el del comprobante del contador. */
  label: string;
}

export type IncomeConcept = ConceptBase &
  (
    | {
        kind: "calculado";
        field: ComputedIncomeField;
        /** Las tres clases de hora extra declaran de qué cantidad salen; el resto, no. */
        hoursField?: OvertimeHoursField;
        hoursColumn?: string;
      }
    | { kind: "capturado"; field: CapturedIncomeField }
  );

export type DeductionConcept = ConceptBase &
  (
    | { kind: "calculado"; field: "iessEmployee" }
    | { kind: "capturado"; field: keyof CapturedDeductions }
  );

/** Los 13 ingresos, en el orden del libro. */
export const INCOME_CONCEPTS: readonly IncomeConcept[] = [
  {
    code: "I-01",
    column: "F",
    label: "Sueldo unificado",
    kind: "calculado",
    field: "unifiedSalary",
  },
  {
    code: "I-02",
    column: "J",
    label: "Horas extras 50%",
    kind: "calculado",
    field: "overtimePay50",
    hoursField: "overtimeHours50",
    hoursColumn: "G",
  },
  {
    code: "I-03",
    column: "K",
    label: "Horas extras 100%",
    kind: "calculado",
    field: "overtimePay100",
    hoursField: "overtimeHours100",
    hoursColumn: "H",
  },
  {
    // El libro rotula la CANTIDAD «HORAS EXTRAS 15%» y su VALOR «VALOR GANADO EXTRAS 25%», y
    // una fila usa 0,15 donde las otras usan 0,25. Aquí se escribe 25 % porque es lo que dice
    // la columna del valor, que es la que produce el importe — pendiente de §11.2.
    code: "I-04",
    column: "L",
    label: "Horas extras 25%",
    kind: "calculado",
    field: "overtimePay25",
    hoursField: "overtimeHours25",
    hoursColumn: "I",
  },
  {
    code: "I-05",
    column: "N",
    label: "Décimo cuarto mensualizado",
    kind: "calculado",
    field: "fourteenthMonthly",
  },
  {
    code: "I-06",
    column: "O",
    label: "Décimo tercero mensualizado",
    kind: "calculado",
    field: "thirteenthMonthly",
  },
  {
    code: "I-07",
    column: "U",
    label: "Fondo de reserva",
    kind: "calculado",
    field: "reserveFundPaid",
  },
  {
    code: "I-08",
    column: "P",
    label: "Vacaciones mensualizadas",
    kind: "capturado",
    field: "vacationPay",
  },
  {
    code: "I-09",
    column: "Q",
    label: "Seguro privado",
    kind: "capturado",
    field: "privateInsurance",
  },
  {
    code: "I-10",
    column: "R",
    label: "Viáticos / vivienda",
    kind: "capturado",
    field: "allowances",
  },
  {
    code: "I-11",
    column: "S",
    label: "Comisión fija por ventas",
    kind: "capturado",
    field: "fixedCommission",
  },
  {
    code: "I-12",
    column: "T",
    label: "Comisión variable",
    kind: "capturado",
    field: "variableCommission",
  },
  { code: "I-13", column: "V", label: "Bono de cumplimiento", kind: "capturado", field: "bonus" },
];

/** Los 13 egresos, en el orden del libro. El primero es el único derivado. */
export const DEDUCTION_CONCEPTS: readonly DeductionConcept[] = [
  { code: "E-01", column: "X", label: "Aportes al IESS", kind: "calculado", field: "iessEmployee" },
  {
    code: "E-02",
    column: "Y",
    label: "Préstamos quirografarios e hipotecarios",
    kind: "capturado",
    field: "iessLoans",
  },
  {
    code: "E-03",
    column: "Z",
    label: "Licencia sin sueldo",
    kind: "capturado",
    field: "unpaidLeave",
  },
  {
    code: "E-04",
    column: "AA",
    label: "Anticipo de sueldo",
    kind: "capturado",
    field: "salaryAdvance",
  },
  {
    code: "E-05",
    column: "AB",
    label: "Préstamos empresariales",
    kind: "capturado",
    field: "companyLoans",
  },
  {
    code: "E-06",
    column: "AC",
    label: "Impuesto a la renta",
    kind: "capturado",
    field: "incomeTax",
  },
  { code: "E-07", column: "AD", label: "Almuerzos", kind: "capturado", field: "meals" },
  { code: "E-08", column: "AE", label: "Multas", kind: "capturado", field: "fines" },
  {
    code: "E-09",
    column: "AF",
    label: "Consumo en locales",
    kind: "capturado",
    field: "inHouseConsumption",
  },
  {
    code: "E-10",
    column: "AG",
    label: "Contribución solidaria",
    kind: "capturado",
    field: "solidarityContribution",
  },
  { code: "E-11", column: "AH", label: "Otros", kind: "capturado", field: "otherDeductions" },
  {
    code: "E-12",
    column: "AI",
    label: "Descuento tiempo parcial",
    kind: "capturado",
    field: "partTimeDeduction",
  },
  {
    code: "E-13",
    column: "AN",
    label: "Descuento permiso médico",
    kind: "capturado",
    field: "medicalLeaveDeduction",
  },
];

/**
 * QUÉ CONCEPTOS SE VEN — la regla que hace legible la tabla del rol.
 *
 * Un `calculado` está SIEMPRE: la app lo deriva sola y su fila es informativa aunque valga cero
 * (un fondo de reserva en raya dice que este empleado no lo cobra, y eso hay que poder leerlo).
 * Un `capturado`, en cambio, solo aparece si trae importe o si alguien lo añadió a mano.
 *
 * Sin esta regla la tabla listaría los 26 conceptos del libro, dieciocho de ellos en raya, y un
 * rol normal —sueldo, décimos y aporte— se leería como un formulario a medio llenar. El
 * comprobante del contador tampoco los imprime todos: imprime los que tienen algo que decir.
 *
 * `added` son los códigos que el usuario añadió con «Agregar ingreso»/«Agregar deducción». Hacen
 * falta aparte del importe porque un concepto recién añadido vale cero todavía: sin recordarlo,
 * la fila desaparecería en el instante en que se creó.
 *
 * El orden es siempre el del catálogo —el del libro—, no el de adición: dos empleados del mismo
 * mes tienen que poder leerse en paralelo.
 */
function isVisible(
  concept: { kind: string; code: string },
  amount: number,
  added: ReadonlySet<string>,
) {
  return concept.kind === "calculado" || amount !== 0 || added.has(concept.code);
}

export function visibleIncomeConcepts(
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): IncomeConcept[] {
  return INCOME_CONCEPTS.filter((concept) =>
    isVisible(concept, concept.kind === "capturado" ? capture[concept.field] : 0, added),
  );
}

export function visibleDeductionConcepts(
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): DeductionConcept[] {
  return DEDUCTION_CONCEPTS.filter((concept) =>
    isVisible(concept, concept.kind === "capturado" ? capture.deductions[concept.field] : 0, added),
  );
}

/** Los que «Agregar ingreso» puede ofrecer: capturados que todavía no se ven. Un `calculado`
 *  nunca entra — no se añade lo que la app deriva sola. */
export function addableIncomeConcepts(
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): IncomeConcept[] {
  const visible = new Set(visibleIncomeConcepts(capture, added).map((c) => c.code));
  return INCOME_CONCEPTS.filter((c) => c.kind === "capturado" && !visible.has(c.code));
}

/** El gemelo para egresos. */
export function addableDeductionConcepts(
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): DeductionConcept[] {
  const visible = new Set(visibleDeductionConcepts(capture, added).map((c) => c.code));
  return DEDUCTION_CONCEPTS.filter((c) => c.kind === "capturado" && !visible.has(c.code));
}

/**
 * Lo que ofrece el desplegable de una fila CAPTURADA: ella misma más los conceptos libres.
 *
 * Es lo que convierte «Agregar ingreso» en una elección de verdad en vez de una fila impuesta:
 * la fila nace con un concepto y se cambia ahí mismo. El propio concepto encabeza la lista
 * porque es el valor seleccionado — sin él, el desplegable arrancaría mostrando otro y parecería
 * que la fila ya cambió sola.
 *
 * Los que ya están puestos no se ofrecen: dos filas no pueden ser el mismo concepto, porque
 * ambas escribirían el mismo campo de la captura y la segunda pisaría a la primera.
 */
export function swapOptionsFor<T extends IncomeConcept | DeductionConcept>(
  code: string,
  catalogue: readonly T[],
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): T[] {
  const isIncome = catalogue === (INCOME_CONCEPTS as readonly unknown[]);
  const visible = isIncome
    ? visibleIncomeConcepts(capture, added)
    : visibleDeductionConcepts(capture, added);
  const taken = new Set(visible.map((c) => c.code));

  const self = catalogue.find((c) => c.code === code && c.kind === "capturado");
  const free = catalogue.filter((c) => c.kind === "capturado" && !taken.has(c.code));
  return self ? [self, ...free] : free;
}

/** El importe de un concepto de ingreso, venga del motor o de la captura. */
export function incomeAmount(
  concept: IncomeConcept,
  computed: PayrollEmployeeComputation,
  capture: PayrollMonthlyCapture,
): number {
  return concept.kind === "calculado" ? computed[concept.field] : capture[concept.field];
}

/** El importe de un concepto de egreso, venga del motor o de la captura. */
export function deductionAmount(
  concept: DeductionConcept,
  computed: PayrollEmployeeComputation,
  capture: PayrollMonthlyCapture,
): number {
  return concept.kind === "calculado" ? computed.iessEmployee : capture.deductions[concept.field];
}
