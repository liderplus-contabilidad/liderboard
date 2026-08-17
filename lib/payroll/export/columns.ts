/**
 * EL LAYOUT DE LA HOJA `GENERAL` — declarado una sola vez, y espejo exacto del lector.
 *
 * `upload/rol-general-grid.ts` dice DÓNDE ESTÁ cada columna en el archivo del contador; este archivo
 * dice DÓNDE SE ESCRIBE y DE DÓNDE SALE su valor. Son las dos mitades de la misma frontera, y el
 * riesgo real de esta descarga no es equivocar una cifra —el motor ya está probado contra el libro—
 * sino que las dos mitades se SEPAREN: añadir una columna al parser y no aquí (o al revés) no lo
 * delata ninguna suma, porque las sumas siguen cuadrando sin ella. Por eso `columns.test.ts` las
 * cruza: todo rótulo que `LABEL_SPECS` busca existe aquí con la MISMA letra.
 *
 * **La letra es el contrato.** El contador coteja pantalla contra hoja columna por columna, así que
 * una columna cuyo dato la app no guarda —`AJ`–`AM`, `AQ`, `BE`— se declara igual y sale vacía, en
 * vez de omitirse: omitirla correría a todas las de su derecha y su `AY` dejaría de ser `AY`.
 *
 * **Los rótulos van en DOS filas**, como en el libro: la primera rotula `M`–`CA` (y lleva además los
 * dos agrupadores sobre las horas extras), la segunda rotula `A`–`L`. No es una floritura: el lector
 * localiza cada rótulo por su texto ENTERO, y el agrupador `" No. HORAS EXTRAS"` empieza igual que
 * el `"No. "` que nombra el ordinal — reproducir las dos filas es lo que mantiene ese archivo
 * leyéndose como se lee hoy.
 *
 * La hoja termina en `CA`. El libro sigue con un bloque `CC`–`CF` que REPITE `PAGADO` y
 * `DIFERENCIA X PAGAR`: es el área de trabajo del contador —el propio parser lo esquiva con su regla
 * de «primera coincidencia»—, y copiarlo escribiría dos veces la misma cifra sin que la segunda
 * signifique nada. La fila de índices de búsqueda que el original lleva encima tampoco se reproduce:
 * allí está DESINCRONIZADA (falta `AR`, así que todo índice desde `AS` nombra la columna de al lado),
 * y copiar un índice roto es peor que no copiarlo.
 */
import type { PayrollEmployeeComputation } from "../engine/types";
import type { ParsedPayrollEmployeeLine, PayrollMonthlyCapture } from "../types";

/** Lo que una celda de esta hoja puede llevar. `Date` solo la fecha de ingreso; `null` es la celda
 *  en blanco, que NO es lo mismo que un cero (ver `PAGADO`). */
export type RolExportCell = string | number | Date | null;

/**
 * Cómo se formatea la celda. `money` y `hours` se separan aunque hoy compartan máscara porque no son
 * la misma magnitud: 5,5 son horas y 487,21 son dólares, y el día que el formato del dinero cambie
 * (un símbolo, un color para el negativo) las horas no deben irse con él.
 */
export type RolCellFormat = "text" | "money" | "hours" | "integer" | "date";

/** Todo lo que una fila de empleado necesita para llenarse. El `computed` viene de
 *  `computeLinePayroll`, que es la única composición ficha + captura → motor de la app. */
export interface RolRowContext {
  line: ParsedPayrollEmployeeLine;
  capture: PayrollMonthlyCapture;
  computed: PayrollEmployeeComputation;
  /** La suma de los conceptos extra que el período declara, para este empleado. */
  extras: number;
  /** Su número de orden en la hoja, corrido a lo largo de todas las áreas. */
  ordinal: number;
}

export interface RolExportColumn {
  /** Su letra en la hoja. ES el contrato con el libro del contador. */
  letter: string;
  /** En cuál de las dos filas de rótulos va el suyo, o `null` cuando el libro no le da ninguno
   *  (`AJ`–`AM`, las cuatro columnas de egreso que su `SUM(X:AN)` incluye y nadie nombró). */
  labelRow: 1 | 2 | null;
  /** Verbatim del libro, erratas incluidas (`DESCUENTO TIEMPO PACIAL`, el espacio final de
   *  `OTROS `): son los rótulos que el lector busca y contra los que el contador coteja. */
  label: string | null;
  format: RolCellFormat;
  /** Si las filas `SUBTOTAL` y `SUMAN` la totalizan. Las de identidad no, y `DIAS` tampoco —el
   *  libro no la suma, y sumar días de personas distintas no significa nada. */
  totalled: boolean;
  /** Ancho de la columna, en caracteres de Excel. */
  width: number;
  /** El valor de esta columna para un empleado. `null` = celda en blanco. */
  read: (ctx: RolRowContext) => RolExportCell;
}

/** Lo que `FR`/`AC FR` escriben. El lector solo enciende la bandera con una `S`. */
const yesNo = (value: boolean): string => (value ? "S" : "N");

/**
 * La fecha de ingreso como `Date` de MEDIANOCHE LOCAL, no UTC.
 *
 * No es indiferente: exceljs convierte un `Date` a serial restándole el desfase horario local, así
 * que una medianoche UTC en Ecuador (UTC−5) aterriza a las 19:00 del día ANTERIOR y el serial baja
 * un día entero. Con medianoche local la resta cae clavada en el serial correcto, y
 * `excelSerialToISODate` —que lee en UTC— devuelve la misma fecha que entró. Lo prueba el test de
 * ida y vuelta, que es el único sitio donde esto se puede ver.
 */
function hireDateCell(iso: string | null): RolExportCell {
  if (!iso) {
    return null;
  }
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

/** Atajo para las columnas que salen del motor. */
const computed =
  (field: keyof PayrollEmployeeComputation) =>
  (ctx: RolRowContext): RolExportCell =>
    ctx.computed[field];

/** Atajo para los egresos capturados, que viven en el objeto anidado `deductions`. */
const deduction =
  (field: keyof PayrollMonthlyCapture["deductions"]) =>
  (ctx: RolRowContext): RolExportCell =>
    ctx.capture.deductions[field];

/** Una columna del libro cuyo dato la app no guarda: conserva su letra y su rótulo, y va vacía. */
function empty(
  letter: string,
  label: string | null,
  width = 12,
  labelRow: 1 | 2 | null = label === null ? null : 1,
): RolExportColumn {
  return { letter, labelRow, label, format: "text", totalled: false, width, read: () => null };
}

const MONEY = { format: "money" as const, totalled: true, width: 12 };
const HOURS = { format: "hours" as const, totalled: true, width: 10 };

/**
 * Las columnas de la hoja, de `A` a `CA`, en el orden del libro.
 *
 * `labelRow: 2` son las que el libro rotula en su fila de abajo (`A`–`L`); `labelRow: 1`, las de
 * arriba (`M`–`CA`). Los dos agrupadores de horas extras no son columnas y viven aparte, en
 * `OVERTIME_GROUP_LABELS`.
 */
export const ROL_EXPORT_COLUMNS: readonly RolExportColumn[] = [
  {
    letter: "A",
    labelRow: 2,
    label: "No. ",
    format: "integer",
    totalled: false,
    width: 6,
    read: (ctx) => ctx.ordinal,
  },
  {
    letter: "B",
    labelRow: 2,
    label: "EMPLEADO",
    format: "text",
    totalled: false,
    width: 32,
    read: (ctx) => ctx.line.name,
  },
  {
    letter: "C",
    labelRow: 2,
    label: "CARGO",
    format: "text",
    totalled: false,
    width: 30,
    read: (ctx) => ctx.line.role,
  },
  {
    letter: "D",
    labelRow: 2,
    label: "SUELDO BASE",
    ...MONEY,
    read: (ctx) => ctx.line.baseSalary,
  },
  {
    letter: "E",
    labelRow: 2,
    label: "DIAS",
    format: "integer",
    // El libro no la suma, y con razón: los días de seis personas no son un número de días.
    totalled: false,
    width: 7,
    read: (ctx) => ctx.line.days,
  },
  {
    letter: "F",
    labelRow: 2,
    label: "SUELDO UNIFICADO",
    ...MONEY,
    read: computed("unifiedSalary"),
  },
  {
    letter: "G",
    labelRow: 2,
    label: "HORAS EXTRAS 50%",
    ...HOURS,
    read: (ctx) => ctx.capture.overtimeHours50,
  },
  {
    letter: "H",
    labelRow: 2,
    label: "HORAS EXTRAS 100%",
    ...HOURS,
    read: (ctx) => ctx.capture.overtimeHours100,
  },
  {
    // «15 %», sic: el libro rotula así la CANTIDAD y «25 %» su valor (`L`). Se escribe como está
    // escrito, porque es el texto que el lector busca.
    letter: "I",
    labelRow: 2,
    label: "HORAS EXTRAS 15%",
    ...HOURS,
    read: (ctx) => ctx.capture.overtimeHours25,
  },
  {
    letter: "J",
    labelRow: 2,
    label: "VALOR GANADO EXTRAS 50%",
    ...MONEY,
    read: computed("overtimePay50"),
  },
  {
    letter: "K",
    labelRow: 2,
    label: "VALOR GANADO EXTRAS 100%",
    ...MONEY,
    read: computed("overtimePay100"),
  },
  {
    letter: "L",
    labelRow: 2,
    label: "VALOR GANADO EXTRAS 25%",
    ...MONEY,
    read: computed("overtimePay25"),
  },
  {
    // `M` es el importe RECONOCIDO, no la suma de `J+K+L`: de su diferencia con ellos es de donde el
    // lector deduce el recorte que Gerencia aplicó, así que escribir la suma borraría ese dato.
    letter: "M",
    labelRow: 1,
    label: "TOTAL HORAS EXTRAS",
    ...MONEY,
    read: computed("overtimeTotal"),
  },
  {
    letter: "N",
    labelRow: 1,
    label: "DECIMO IV MENSUAL",
    ...MONEY,
    read: computed("fourteenthMonthly"),
  },
  {
    letter: "O",
    labelRow: 1,
    label: "DECIMO III MENSUAL",
    ...MONEY,
    read: computed("thirteenthMonthly"),
  },
  {
    letter: "P",
    labelRow: 1,
    label: "VACACIONES - MENSUAL",
    ...MONEY,
    read: (ctx) => ctx.capture.vacationPay,
  },
  {
    letter: "Q",
    labelRow: 1,
    label: "SEGURO PRIVADO",
    ...MONEY,
    read: (ctx) => ctx.capture.privateInsurance,
  },
  {
    letter: "R",
    labelRow: 1,
    label: "VIATICOS/VIVIENDA",
    ...MONEY,
    read: (ctx) => ctx.capture.allowances,
  },
  {
    letter: "S",
    labelRow: 1,
    label: "COMISION FIJA POR VTAS.",
    ...MONEY,
    read: (ctx) => ctx.capture.fixedCommission,
  },
  {
    letter: "T",
    labelRow: 1,
    label: "COMISION VARIABLE",
    ...MONEY,
    read: (ctx) => ctx.capture.variableCommission,
  },
  {
    letter: "U",
    labelRow: 1,
    label: "FONDO DE RESERVA",
    ...MONEY,
    read: computed("reserveFundPaid"),
  },
  {
    letter: "V",
    labelRow: 1,
    label: "BONO CUMPLIMIENTO",
    ...MONEY,
    read: (ctx) => ctx.capture.bonus,
  },
  {
    letter: "W",
    labelRow: 1,
    label: "TOTAL INGRESO",
    ...MONEY,
    read: computed("grossIncome"),
  },
  {
    letter: "X",
    labelRow: 1,
    label: "APORTES AL IESS",
    ...MONEY,
    read: computed("iessEmployee"),
  },
  {
    letter: "Y",
    labelRow: 1,
    label: "PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS",
    ...MONEY,
    read: deduction("iessLoans"),
  },
  {
    letter: "Z",
    labelRow: 1,
    label: "LICENCIA SIN SUELDO",
    ...MONEY,
    read: deduction("unpaidLeave"),
  },
  {
    letter: "AA",
    labelRow: 1,
    label: "ANTICIPO SUELDO",
    ...MONEY,
    read: deduction("salaryAdvance"),
  },
  {
    letter: "AB",
    labelRow: 1,
    label: "PRESTAMOS EMPRESARIALES",
    ...MONEY,
    read: deduction("companyLoans"),
  },
  {
    letter: "AC",
    labelRow: 1,
    label: "IMPUESTO RENTA",
    ...MONEY,
    read: deduction("incomeTax"),
  },
  { letter: "AD", labelRow: 1, label: "ALMUERZOS", ...MONEY, read: deduction("meals") },
  { letter: "AE", labelRow: 1, label: "MULTAS", ...MONEY, read: deduction("fines") },
  {
    letter: "AF",
    labelRow: 1,
    label: "CONSUMO LOCALES EMPLEADO",
    ...MONEY,
    read: deduction("inHouseConsumption"),
  },
  {
    // El libro parte este rótulo en dos líneas dentro de la celda; se escribe en una sola, que es
    // como `compactLabel` lo lee de todas formas.
    letter: "AG",
    labelRow: 1,
    label: "CONTRIBUCION SOLIDARIA",
    ...MONEY,
    read: deduction("solidarityContribution"),
  },
  {
    // El espacio final es del libro y se conserva: el lector normaliza, pero quien compare los dos
    // archivos celda a celda vería una diferencia que no existe.
    letter: "AH",
    labelRow: 1,
    label: "OTROS ",
    ...MONEY,
    read: deduction("otherDeductions"),
  },
  {
    // «PACIAL», sic.
    letter: "AI",
    labelRow: 1,
    label: "DESCUENTO TIEMPO PACIAL",
    ...MONEY,
    read: deduction("partTimeDeduction"),
  },
  // `AJ`–`AM`: cuatro columnas de egreso que el `SUM(X:AN)` del libro incluye y que nadie rotuló.
  // Sin nombre no hay concepto que capturar, así que se reservan vacías para conservar las letras.
  empty("AJ", null, 6),
  empty("AK", null, 6),
  empty("AL", null, 6),
  empty("AM", null, 6),
  {
    letter: "AN",
    labelRow: 1,
    label: "Descuento PERMISO MEDICO",
    ...MONEY,
    read: deduction("medicalLeaveDeduction"),
  },
  {
    letter: "AO",
    labelRow: 1,
    label: "TOTAL EGRESOS",
    ...MONEY,
    read: computed("totalDeductions"),
  },
  {
    letter: "AP",
    labelRow: 1,
    label: "LIQUIDO A RECIBIR",
    ...MONEY,
    read: computed("netPay"),
  },
  empty("AQ", "CTAS. POR COBRAR", 14),
  // `AR` está en blanco en el original —es el hueco que desincroniza su fila de índices— y se
  // conserva para que `AS` siga siendo `AS`.
  empty("AR", null, 4),
  { letter: "AS", labelRow: 1, label: "XIII", ...MONEY, read: computed("thirteenthProvision") },
  { letter: "AT", labelRow: 1, label: "XIV", ...MONEY, read: computed("fourteenthProvision") },
  { letter: "AU", labelRow: 1, label: "PATRONAL", ...MONEY, read: computed("iessEmployer") },
  { letter: "AV", labelRow: 1, label: "VACACION", ...MONEY, read: computed("vacationProvision") },
  {
    letter: "AW",
    labelRow: 1,
    label: "ACUMULA FONDO RESERVA",
    ...MONEY,
    read: computed("reserveFundAccrued"),
  },
  { letter: "AX", labelRow: 1, label: "PROVISION", ...MONEY, read: computed("totalProvision") },
  { letter: "AY", labelRow: 1, label: "COSTO TOTAL", ...MONEY, read: computed("employerCost") },
  {
    letter: "AZ",
    labelRow: 1,
    label: "AC FR",
    format: "text",
    totalled: false,
    width: 7,
    read: (ctx) => yesNo(ctx.line.accumulatesReserveFund),
  },
  {
    letter: "BA",
    labelRow: 1,
    label: "FR",
    format: "text",
    totalled: false,
    width: 6,
    read: (ctx) => yesNo(ctx.line.hasReserveFund),
  },
  {
    letter: "BB",
    labelRow: 1,
    label: "TC",
    format: "text",
    totalled: false,
    width: 6,
    read: (ctx) => ctx.line.contractType,
  },
  {
    letter: "BC",
    labelRow: 1,
    label: "FECHA INGRESO",
    format: "date",
    totalled: false,
    width: 14,
    read: (ctx) => hireDateCell(ctx.line.hireDate),
  },
  {
    // Como TEXTO, igual que el código sectorial: una cédula que empiece por cero deja de ser esa
    // cédula en cuanto Excel la trata como número.
    letter: "BD",
    labelRow: 1,
    label: "CÉDULA",
    format: "text",
    totalled: false,
    width: 14,
    read: (ctx) => ctx.line.idCard,
  },
  empty("BE", "NÚMERO DE CUENTA", 18),
  {
    letter: "BF",
    labelRow: 1,
    label: "CODIGO SECTORIAL",
    format: "text",
    totalled: false,
    width: 18,
    read: (ctx) => ctx.line.sectorCode,
  },
  {
    // El bloque que el contador se lleva al banco: nombre y líquido. SÍ se llena, porque las dos
    // cifras las tiene la app — la regla de dejar en blanco es para lo que no tenemos, no para lo
    // que se repite.
    letter: "BG",
    labelRow: 1,
    label: "NÓMINA",
    format: "text",
    totalled: false,
    width: 32,
    read: (ctx) => ctx.line.name,
  },
  {
    // Segundo `LIQUIDO A RECIBIR` de la hoja. El lector se queda con el primero (`AP`) por su regla
    // de «primera coincidencia», que es justo lo que hace que este repetido no estorbe.
    letter: "BH",
    labelRow: 1,
    label: "LIQUIDO A RECIBIR",
    ...MONEY,
    read: computed("netPay"),
  },
  {
    // `null` cuando nadie declaró lo pagado, y eso NO es cero: sin él el empleado no está ni
    // conciliado ni con diferencia. Por eso el lector tuvo que aprender a leer la celda vacía.
    letter: "BZ",
    labelRow: 1,
    label: "PAGADO",
    ...MONEY,
    read: (ctx) => ctx.capture.paid,
  },
  {
    letter: "CA",
    labelRow: 1,
    label: "DIFERENCIA X PAGAR",
    ...MONEY,
    read: computed("difference"),
  },
];

/**
 * La columna que esta app AÑADE al libro: la suma de los conceptos de ingreso que el período declara
 * por su cuenta y que el libro de Cultura Manor no tiene.
 *
 * Va al final y no en su sitio conceptual (tras `V BONO CUMPLIMIENTO`) porque insertarla ahí
 * desplazaría `W`, `X`, `AO`, `AP`… una letra por concepto, y la coincidencia de letras es lo que
 * hace cotejable el archivo. Agregada y no una columna por concepto por lo mismo: el ancho de la
 * hoja dejaría de ser fijo. Sin ella, `W TOTAL INGRESO` traería dólares que ninguna columna explica.
 */
export const EXTRA_INCOME_COLUMN: RolExportColumn = {
  letter: "CB",
  labelRow: 1,
  label: "OTROS INGRESOS",
  ...MONEY,
  width: 14,
  read: (ctx) => ctx.extras,
};

/**
 * Los dos rótulos AGRUPADORES que el libro pone sobre las horas extras, en su fila de arriba. No son
 * columnas —no llevan valor— pero se reproducen porque son parte de la cabecera que el contador
 * reconoce, y porque el primero es la trampa que obliga al lector a comparar por el rótulo ENTERO.
 */
export const OVERTIME_GROUP_LABELS: readonly { letter: string; label: string }[] = [
  { letter: "G", label: " No. HORAS EXTRAS" },
  { letter: "J", label: "VALOR DE HORAS EXTRAS" },
];

/** `"A"` → 0, `"AA"` → 26. La aritmética de columnas de Excel, en un solo sitio. */
export function columnIndexOf(letter: string): number {
  let index = 0;
  for (const char of letter.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

/** Cuántas columnas ocupa la hoja, contando los huecos. */
export function sheetWidth(columns: readonly RolExportColumn[]): number {
  return columns.reduce((max, column) => Math.max(max, columnIndexOf(column.letter) + 1), 0);
}
