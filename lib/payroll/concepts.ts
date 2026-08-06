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
 * El orden de esta lista es el de PANTALLA: los `calculado` agrupados arriba, porque en la tabla
 * son las filas grises que no se editan. **No es el del comprobante impreso**, que ordena por
 * columna del libro y por eso pone `I-07 Fondo de reserva` (columna `U`) en duodécimo lugar,
 * detrás de `COMISION VARIABLE`, y no en séptimo. Esa diferencia no obliga a declarar una segunda
 * lista: `lib/payroll/payslip/` ordena por el campo `column`, que ya está aquí.
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
  /** Rótulo en español, el de la PANTALLA: minúsculas, tildes normalizadas. */
  label: string;
  /**
   * Rótulo VERBATIM del comprobante `INDIVIDUAL`, el que se imprime en el PDF — mayúsculas,
   * puntuación y erratas del contador incluidas (`DESCUENTO TIEMPO PACIAL`,
   * `COMISION FIJA POR VTAS.`). Son los rótulos contra los que él coteja papel y pantalla.
   *
   * Es OBLIGATORIO y vive aquí en vez de en un mapa `code → rótulo` aparte por la misma razón
   * por la que existe este catálogo: un mapa suelto se queda corto cuando alguien añade un
   * concepto, y ningún test de cifras lo delata porque las cifras siguen sumando igual. Como
   * campo, el compilador rechaza el concepto incompleto.
   *
   * Dos se apartan del literal de la celda, a propósito:
   * - `CONTRIBUCION SOLIDARIA` va sin el salto de línea que la celda trae dentro (`AG2`): una
   *   fila de dos líneas rompería el paso fijo de las otras veinticinco.
   * - La columna `Q` se imprime `SEGURO PRIVADO`. El libro se contradice —su copia izquierda lo
   *   lee de la cabecera de esa columna y la derecha dice `GERENCIA DE TURNO` escrito a mano—, y
   *   manda la cabecera, que es de donde sale el dato.
   */
  payslipLabel: string;
}

export type IncomeConcept = ConceptBase & {
  /**
   * El `(*)` que el comprobante escribe en la columna `Cantidad`, y que su nota al pie explica:
   * «No aporta IESS ni es Ingreso Gravado».
   *
   * Son exactamente los dos ingresos que `grossIncome` suma y que NINGUNA base toca — el fondo de
   * reserva pagado y el bono—, según `lib/payroll/engine/bases.ts`. Se declara aquí en vez de
   * derivarse en tiempo de ejecución para no meter una llamada al motor en la capa que solo tiene
   * que producir un asterisco, y `concepts.test.ts` lo ata al motor con una afirmación ejecutable:
   * sumar 1 al campo de un concepto marcado no puede mover `contributoryBase`.
   */
  notContributory?: true;
} & (
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
    payslipLabel: "SUELDO UNIFICADO",
    kind: "calculado",
    field: "unifiedSalary",
  },
  {
    code: "I-02",
    column: "J",
    label: "Horas extras 50%",
    payslipLabel: "VALOR GANADO EXTRAS 50%",
    kind: "calculado",
    field: "overtimePay50",
    hoursField: "overtimeHours50",
    hoursColumn: "G",
  },
  {
    code: "I-03",
    column: "K",
    label: "Horas extras 100%",
    payslipLabel: "VALOR GANADO EXTRAS 100%",
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
    payslipLabel: "VALOR GANADO EXTRAS 25%",
    kind: "calculado",
    field: "overtimePay25",
    hoursField: "overtimeHours25",
    hoursColumn: "I",
  },
  {
    code: "I-05",
    column: "N",
    label: "Décimo cuarto mensualizado",
    payslipLabel: "DECIMO IV SUELDO-MENSUAL",
    kind: "calculado",
    field: "fourteenthMonthly",
  },
  {
    code: "I-06",
    column: "O",
    label: "Décimo tercero mensualizado",
    payslipLabel: "DECIMO III SUELDO-MENSUAL",
    kind: "calculado",
    field: "thirteenthMonthly",
  },
  {
    code: "I-07",
    column: "U",
    label: "Fondo de reserva",
    payslipLabel: "FONDO DE RESERVA",
    notContributory: true,
    kind: "calculado",
    field: "reserveFundPaid",
  },
  {
    code: "I-08",
    column: "P",
    label: "Vacaciones mensualizadas",
    payslipLabel: "VACACIONES - MENSUAL",
    kind: "capturado",
    field: "vacationPay",
  },
  {
    code: "I-09",
    column: "Q",
    label: "Seguro privado",
    payslipLabel: "SEGURO PRIVADO",
    kind: "capturado",
    field: "privateInsurance",
  },
  {
    code: "I-10",
    column: "R",
    label: "Viáticos / vivienda",
    payslipLabel: "VIATICOS/VIVIENDA",
    kind: "capturado",
    field: "allowances",
  },
  {
    code: "I-11",
    column: "S",
    label: "Comisión fija por ventas",
    payslipLabel: "COMISION FIJA POR VTAS.",
    kind: "capturado",
    field: "fixedCommission",
  },
  {
    code: "I-12",
    column: "T",
    label: "Comisión variable",
    payslipLabel: "COMISION VARIABLE",
    kind: "capturado",
    field: "variableCommission",
  },
  {
    code: "I-13",
    column: "V",
    label: "Bono de cumplimiento",
    payslipLabel: "BONO CUMPLIMIENTO",
    notContributory: true,
    kind: "capturado",
    field: "bonus",
  },
];

/** Los 13 egresos, en el orden del libro. El primero es el único derivado. */
export const DEDUCTION_CONCEPTS: readonly DeductionConcept[] = [
  {
    code: "E-01",
    column: "X",
    label: "Aportes al IESS",
    payslipLabel: "APORTES AL IESS",
    kind: "calculado",
    field: "iessEmployee",
  },
  {
    code: "E-02",
    column: "Y",
    label: "Préstamos quirografarios e hipotecarios",
    payslipLabel: "PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS",
    kind: "capturado",
    field: "iessLoans",
  },
  {
    code: "E-03",
    column: "Z",
    label: "Licencia sin sueldo",
    payslipLabel: "LICENCIA SIN SUELDO",
    kind: "capturado",
    field: "unpaidLeave",
  },
  {
    code: "E-04",
    column: "AA",
    label: "Anticipo de sueldo",
    payslipLabel: "ANTICIPO SUELDO",
    kind: "capturado",
    field: "salaryAdvance",
  },
  {
    code: "E-05",
    column: "AB",
    label: "Préstamos empresariales",
    payslipLabel: "PRESTAMOS EMPRESARIALES",
    kind: "capturado",
    field: "companyLoans",
  },
  {
    code: "E-06",
    column: "AC",
    label: "Impuesto a la renta",
    payslipLabel: "IMPUESTO RENTA",
    kind: "capturado",
    field: "incomeTax",
  },
  {
    code: "E-07",
    column: "AD",
    label: "Almuerzos",
    payslipLabel: "ALMUERZOS",
    kind: "capturado",
    field: "meals",
  },
  {
    code: "E-08",
    column: "AE",
    label: "Multas",
    payslipLabel: "MULTAS",
    kind: "capturado",
    field: "fines",
  },
  {
    code: "E-09",
    column: "AF",
    label: "Consumo en locales",
    payslipLabel: "CONSUMO LOCALES EMPLEADO",
    kind: "capturado",
    field: "inHouseConsumption",
  },
  {
    // La celda `AG2` trae un salto de línea dentro («CONTRIBUCION \nSOLIDARIA»). Se normaliza a
    // una sola línea: una fila de dos rompería el paso fijo de las otras veinticinco.
    code: "E-10",
    column: "AG",
    label: "Contribución solidaria",
    payslipLabel: "CONTRIBUCION SOLIDARIA",
    kind: "capturado",
    field: "solidarityContribution",
  },
  {
    code: "E-11",
    column: "AH",
    label: "Otros",
    payslipLabel: "OTROS",
    kind: "capturado",
    field: "otherDeductions",
  },
  {
    code: "E-12",
    column: "AI",
    label: "Descuento tiempo parcial",
    // «PACIAL», sic — así lo escribe el libro, y es el rótulo contra el que el contador coteja.
    payslipLabel: "DESCUENTO TIEMPO PACIAL",
    kind: "capturado",
    field: "partTimeDeduction",
  },
  {
    code: "E-13",
    column: "AN",
    label: "Descuento permiso médico",
    payslipLabel: "Descuento PERMISO MEDICO",
    kind: "capturado",
    field: "medicalLeaveDeduction",
  },
];

/**
 * La CANTIDAD que un concepto de ingreso captura, si captura alguna.
 *
 * Solo las tres clases de hora extra: son los únicos conceptos del catálogo que derivan su VALOR
 * (`J`, `K`, `L` los calcula el motor) y a la vez capturan su CANTIDAD (`G`, `H`, `I` las teclea
 * quien arma el rol). Esa doble naturaleza es la que decide qué filas se ven y cuáles se pueden
 * elegir, así que tiene un nombre en vez de repetirse como `"hoursField" in concept`.
 */
export function capturedHoursField(concept: IncomeConcept): OvertimeHoursField | null {
  return concept.kind === "calculado" ? (concept.hoursField ?? null) : null;
}

/** Si algo de este concepto se TECLEA — y por tanto si puede añadirse, elegirse en un desplegable
 *  y desaparecer cuando está vacío. Lo contrario es lo que la app deriva sola. */
function isChoosable(concept: IncomeConcept | DeductionConcept): boolean {
  return concept.kind === "capturado" || capturedHoursField(concept as IncomeConcept) !== null;
}

/**
 * QUÉ CONCEPTOS SE VEN — la regla que hace legible la tabla del rol.
 *
 * Un concepto se juzga por LO QUE SE TECLEA de él: aparece si eso no está en cero, o si alguien lo
 * añadió a mano. Lo que la app deriva sola está SIEMPRE, porque su fila es informativa aunque
 * valga cero (un fondo de reserva en raya dice que este empleado no lo cobra, y eso hay que poder
 * leerlo).
 *
 * **Las horas extras se juzgan por las HORAS, no por su valor.** Son `calculado` —el motor deriva
 * `J`, `K` y `L`—, pero lo que alguien escribe son las horas, y sin horas el valor es cero por
 * construcción: la fila solo puede estar en raya. Meterlas en la rama de «derivado ⇒ siempre
 * visible» ponía tres filas vacías en la tabla de todo empleado sin horas extras, que es
 * exactamente lo que esta regla existe para evitar. Ojo con el caso que las mantiene vivas: unas
 * horas recortadas por Gerencia (`approvedOvertime: 0`, el `*0` del libro) valen cero y SIGUEN
 * viéndose, porque las horas se trabajaron y el comprobante del contador las imprime (§10).
 *
 * Sin esta regla la tabla listaría los 26 conceptos del libro, dieciocho de ellos en raya, y un
 * rol normal —sueldo, décimos y aporte— se leería como un formulario a medio llenar. El
 * comprobante del contador tampoco los imprime todos: imprime los que tienen algo que decir.
 *
 * `added` son los códigos que el usuario añadió con «Agregar ingreso»/«Agregar deducción». Hacen
 * falta aparte del importe porque un concepto recién añadido vale cero todavía: sin recordarlo,
 * la fila desaparecería en el instante en que se creó.
 *
 * EL ORDEN son dos tramos. Lo que se ve por su propia cifra va en el orden del CATÁLOGO —el del
 * libro y el del comprobante impreso—, que es lo que deja leer dos empleados del mismo mes en
 * paralelo. Lo que alguien acaba de AÑADIR va al final, en el orden en que lo añadió, porque el
 * botón que lo crea está al pie de la tabla: colar la fila nueva en su sitio del catálogo la hace
 * aparecer lejos de donde se pulsó, a veces fuera de la vista. No hay contradicción entre las dos
 * mitades porque `added` solo vive mientras la pantalla está abierta — al recargar, una fila con
 * cifra vuelve sola a su sitio del libro, así que nada de lo GUARDADO se reordena.
 */

/**
 * Los dos tramos del orden. `typedOf` devuelve lo tecleado de cada concepto, o `null` cuando la
 * app lo deriva entero (y entonces la fila está siempre).
 */
function orderedVisible<T extends { code: string }>(
  catalogue: readonly T[],
  typedOf: (concept: T) => number | null,
  added: ReadonlySet<string>,
): T[] {
  const byCode = new Map(catalogue.map((concept) => [concept.code, concept]));
  const own = catalogue.filter((concept) => {
    if (added.has(concept.code)) {
      return false; // va en el segundo tramo, para no salir dos veces
    }
    const typed = typedOf(concept);
    return typed === null || typed !== 0;
  });
  // Un `Set` conserva el orden de inserción, que aquí ES el orden de adición. Los códigos de la
  // otra tabla —ingresos y egresos comparten un solo `added`— no están en este catálogo y caen.
  const appended = [...added]
    .map((code) => byCode.get(code))
    .filter((concept): concept is T => concept !== undefined);
  return [...own, ...appended];
}

/** Lo tecleado de un ingreso: su importe si se captura, sus horas si es una hora extra, y `null`
 *  cuando la app lo deriva entero. */
function typedIncome(concept: IncomeConcept, capture: PayrollMonthlyCapture): number | null {
  if (concept.kind === "capturado") {
    return capture[concept.field];
  }
  const hours = capturedHoursField(concept);
  return hours === null ? null : capture[hours];
}

export function visibleIncomeConcepts(
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): IncomeConcept[] {
  return orderedVisible(INCOME_CONCEPTS, (concept) => typedIncome(concept, capture), added);
}

export function visibleDeductionConcepts(
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): DeductionConcept[] {
  return orderedVisible(
    DEDUCTION_CONCEPTS,
    (concept) => (concept.kind === "capturado" ? capture.deductions[concept.field] : null),
    added,
  );
}

/**
 * Los que «Agregar ingreso» puede ofrecer: todo lo que se teclea y todavía no se ve. Lo que la app
 * deriva sola nunca entra — no se añade un sueldo unificado.
 *
 * Las horas extras SÍ entran, y no es un detalle: son las únicas filas que pueden esconderse
 * llevándose consigo el único sitio donde se teclean sus horas. Sin esta puerta, ocultarlas al
 * estar vacías las volvería inalcanzables — sin fila no hay dónde escribir las horas, y sin horas
 * la fila no vuelve.
 */
export function addableIncomeConcepts(
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): IncomeConcept[] {
  const visible = new Set(visibleIncomeConcepts(capture, added).map((c) => c.code));
  return INCOME_CONCEPTS.filter((c) => isChoosable(c) && !visible.has(c.code));
}

/** El gemelo para egresos. Aquí no hay conceptos con cantidad, así que es solo lo capturado. */
export function addableDeductionConcepts(
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): DeductionConcept[] {
  const visible = new Set(visibleDeductionConcepts(capture, added).map((c) => c.code));
  return DEDUCTION_CONCEPTS.filter((c) => isChoosable(c) && !visible.has(c.code));
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

  const self = catalogue.find((c) => c.code === code && isChoosable(c));
  const free = catalogue.filter((c) => isChoosable(c) && !taken.has(c.code));
  return self ? [self, ...free] : free;
}

/**
 * Lo que hay que escribir en la captura para que una fila de INGRESO cambie de concepto, o `null`
 * si el cambio no procede (alguno de los dos lo deriva la app sola).
 *
 * El origen SIEMPRE se vacía —si no, la cifra contaría dos veces— y lo tecleado se lleva a la
 * fila nueva **solo cuando las dos hablan la misma unidad**:
 *
 *   - dos filas capturadas mueven el IMPORTE: quien teclea 120 y se da cuenta de que era «Comisión
 *     fija» y no «Viáticos» espera corregir la fila, no volver a escribirla;
 *   - dos filas de horas extras mueven las HORAS, que es lo tecleado ahí: 5,5 horas mal
 *     clasificadas al 50 % son 5,5 horas al 100 %;
 *   - cruzando de familia no se lleva NADA, porque 200 dólares de anticipo no son 200 horas y
 *     cualquier conversión sería inventada. En la práctica no se pierde nada: el desplegable solo
 *     ofrece conceptos LIBRES, y una fila con cifra ya está puesta.
 */
export function incomeSwapPatch(
  origin: IncomeConcept,
  target: IncomeConcept,
  capture: PayrollMonthlyCapture,
): Partial<PayrollMonthlyCapture> | null {
  if (!isChoosable(origin) || !isChoosable(target)) {
    return null;
  }
  const originHours = capturedHoursField(origin);
  const targetHours = capturedHoursField(target);

  if (originHours !== null) {
    return targetHours !== null
      ? { [originHours]: 0, [targetHours]: capture[originHours] }
      : { [originHours]: 0 };
  }
  const originField = (origin as Extract<IncomeConcept, { kind: "capturado" }>).field;
  if (targetHours !== null) {
    return { [originField]: 0 };
  }
  const targetField = (target as Extract<IncomeConcept, { kind: "capturado" }>).field;
  return { [originField]: 0, [targetField]: capture[originField] };
}

/** El gemelo para EGRESOS, que no tienen cantidad: siempre mueve el importe, dentro del objeto
 *  anidado `deductions`. `null` cuando alguno de los dos es el aporte al IESS, que deriva el motor. */
export function deductionSwapPatch(
  origin: DeductionConcept,
  target: DeductionConcept,
  capture: PayrollMonthlyCapture,
): Partial<PayrollMonthlyCapture> | null {
  if (origin.kind !== "capturado" || target.kind !== "capturado") {
    return null;
  }
  return {
    deductions: {
      ...capture.deductions,
      [origin.field]: 0,
      [target.field]: capture.deductions[origin.field],
    },
  };
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
