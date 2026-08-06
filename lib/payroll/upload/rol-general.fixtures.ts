/**
 * Synthetic `GENERAL` sheet fixtures, mirroring the STRUCTURE verified against `.context/
 * ROL_DE_PAGOS_03-2026_CULTURA_MANOR_OK (1).xls` (see this change's task): a desynced VLOOKUP
 * index row at the very top (row 1), the rótulos split across two rows (row 2 for `M`–`BH`, row 3
 * for `A`–`L`), area headers carrying only a name, an ordinal written `"1-"` on one employee, a
 * `SUBTOTAL` row per area and one `SUMAN` row closing the nómina, and an asientos contables row
 * BELOW `SUMAN` that reuses the same "code in col A, description in col B" shape an employee row
 * has — the reason `SUMAN` has to be a real boundary and not just another row to skip. Invented
 * data at compact column indices (not the real file's actual letters); tests must never depend on
 * the git-ignored real workbook.
 *
 * Tres rasgos del libro real que parecen decorado y son TRAMPAS, reproducidos verbatim porque son
 * justo lo que un lector por rótulo tiene que sobrevivir:
 *  - la fila 2 lleva DOS rótulos agrupadores sobre las columnas de horas extras —`" No. HORAS
 *    EXTRAS"` sobre `G`–`I` y `"VALOR DE HORAS EXTRAS"` sobre `J`–`L`—, y el primero está por
 *    ENCIMA del `"No. "` de la fila 3 que nombra el ordinal;
 *  - tres rótulos de egreso (`PRESTAMOS EMPRESARIALES`, `ALMUERZOS`, `CONTRIBUCION SOLIDARIA`) se
 *    repiten más abajo como descripciones del bloque de asientos contables, igual que ya pasaba
 *    con `LIQUIDO A RECIBIR` y `PAGADO`;
 *  - dos rótulos llegan con espacio sobrante (`"OTROS "`) o partidos en dos líneas
 *    (`"CONTRIBUCION \nSOLIDARIA"`), que es lo que `compactLabel` existe para absorber.
 */
import * as XLSX from "xlsx";
import type { Cell as FixtureCell } from "@/lib/excel/workbook";

/** Column indices — named the way the report itself labels them, so a test reads like the sheet.
 * El comentario de cada una es su LETRA en el libro; que aquí no coincidan es deliberado, y es lo
 * que demuestra que el parser localiza por rótulo y nunca por coordenada. */
const COL = {
  ordinal: 0, // A · No.
  employee: 1, // B · EMPLEADO (also holds B1's company and B2's period, and every área's name)
  role: 2, // C · CARGO (also where SUBTOTAL/SUMAN write their own marker)
  baseSalary: 3, // D · SUELDO BASE
  days: 4, // E · DIAS
  gross: 5, // W · TOTAL INGRESO
  deductions: 6, // AO · TOTAL EGRESOS
  net: 7, // AP · LIQUIDO A RECIBIR
  cost: 8, // AY · COSTO TOTAL
  contractType: 9, // BB · TC
  idCard: 10, // BD · CÉDULA
  hireDate: 11, // BC · FECHA INGRESO
  sectorCode: 12, // BF · CODIGO SECTORIAL
  paid: 13, // BZ · PAGADO
  overtimeHours50: 14, // G · HORAS EXTRAS 50% (cantidad)
  overtimeHours100: 15, // H · HORAS EXTRAS 100% (cantidad)
  overtimeHours25: 16, // I · HORAS EXTRAS 15% (cantidad, así rotulada)
  overtimePay50: 17, // J · VALOR GANADO EXTRAS 50%
  overtimePay100: 18, // K · VALOR GANADO EXTRAS 100%
  overtimePay25: 19, // L · VALOR GANADO EXTRAS 25%
  overtimeTotal: 20, // M · TOTAL HORAS EXTRAS
  vacationPay: 21, // P · VACACIONES - MENSUAL
  privateInsurance: 22, // Q · SEGURO PRIVADO
  allowances: 23, // R · VIATICOS/VIVIENDA
  fixedCommission: 24, // S · COMISION FIJA POR VTAS.
  variableCommission: 25, // T · COMISION VARIABLE
  bonus: 26, // V · BONO CUMPLIMIENTO
  iessLoans: 27, // Y · PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS
  unpaidLeave: 28, // Z · LICENCIA SIN SUELDO
  salaryAdvance: 29, // AA · ANTICIPO SUELDO
  companyLoans: 30, // AB · PRESTAMOS EMPRESARIALES
  incomeTax: 31, // AC · IMPUESTO RENTA
  meals: 32, // AD · ALMUERZOS
  fines: 33, // AE · MULTAS
  inHouseConsumption: 34, // AF · CONSUMO LOCALES EMPLEADO
  solidarityContribution: 35, // AG · CONTRIBUCION SOLIDARIA
  otherDeductions: 36, // AH · OTROS
  partTimeDeduction: 37, // AI · DESCUENTO TIEMPO PACIAL (sic)
  medicalLeaveDeduction: 38, // AN · Descuento PERMISO MEDICO
  thirteenthProvision: 39, // AS · XIII
  fourteenthProvision: 40, // AT · XIV
  accumulatesReserveFund: 41, // AZ · AC FR
  hasReserveFund: 42, // BA · FR
} as const;

/** Row indices of the fixed preamble, so mutations below can target them by name. */
const ROW = {
  garbage: 0, // fila 1: desynced VLOOKUP index list, plus B1's company
  labelsM_BH: 1, // fila 2: B2's period text, plus the M–BH rótulos
  labelsA_L: 2, // fila 3: the A–L rótulos
} as const;

/** Places cells at their column indices, leaving every gap in between as `null` — same helper
 * `microplus.fixtures.ts` uses. */
function row(cells: [number, FixtureCell][]): FixtureCell[] {
  const line: FixtureCell[] = [];
  for (const [col, value] of cells) {
    while (line.length < col) {
      line.push(null);
    }
    line[col] = value;
  }
  return line;
}

/** Lo que el rol CAPTURA del mes de un empleado, tal como el libro lo escribe. Aparte de la ficha
 * porque es justo lo que cambia entre los tres casos de abajo: cada uno ejercita una combinación
 * distinta del interruptor de `M` y de las dos banderas del fondo de reserva. */
interface EmployeeCapture {
  overtimeHours50: number;
  overtimeHours100: number;
  overtimeHours25: number;
  overtimePay50: number;
  overtimePay100: number;
  overtimePay25: number;
  overtimeTotal: number;
  vacationPay: number;
  privateInsurance: number;
  allowances: number;
  fixedCommission: number;
  variableCommission: number;
  bonus: number;
  iessLoans: number;
  unpaidLeave: number;
  salaryAdvance: number;
  companyLoans: number;
  incomeTax: number;
  meals: number;
  fines: number;
  inHouseConsumption: number;
  solidarityContribution: number;
  otherDeductions: number;
  partTimeDeduction: number;
  medicalLeaveDeduction: number;
  thirteenthProvision: number;
  fourteenthProvision: number;
  accumulatesReserveFund: FixtureCell;
  hasReserveFund: FixtureCell;
}

/** El mes en blanco: sin horas, sin ingresos capturados, sin descuentos y sin fondo de reserva —
 * el punto de partida sobre el que cada empleado escribe solo lo que su caso ejercita. */
const NO_CAPTURE: EmployeeCapture = {
  overtimeHours50: 0,
  overtimeHours100: 0,
  overtimeHours25: 0,
  overtimePay50: 0,
  overtimePay100: 0,
  overtimePay25: 0,
  overtimeTotal: 0,
  vacationPay: 0,
  privateInsurance: 0,
  allowances: 0,
  fixedCommission: 0,
  variableCommission: 0,
  bonus: 0,
  iessLoans: 0,
  unpaidLeave: 0,
  salaryAdvance: 0,
  companyLoans: 0,
  incomeTax: 0,
  meals: 0,
  fines: 0,
  inHouseConsumption: 0,
  solidarityContribution: 0,
  otherDeductions: 0,
  partTimeDeduction: 0,
  medicalLeaveDeduction: 0,
  thirteenthProvision: 0,
  fourteenthProvision: 0,
  accumulatesReserveFund: "N",
  hasReserveFund: "N",
};

/** One EMPLEADO row: ordinal (tolerates the file's own `"1-"`), name, and every ficha/figure
 * column at its usual index. */
function employee(
  fields: {
    ordinal: FixtureCell;
    name: string;
    role: string;
    baseSalary: number;
    days: number;
    gross: number;
    deductions: number;
    net: number;
    cost: number;
    contractType: FixtureCell;
    idCard: FixtureCell;
    hireDate: FixtureCell;
    sectorCode: FixtureCell;
    paid: FixtureCell;
  } & EmployeeCapture,
): FixtureCell[] {
  return row([
    [COL.ordinal, fields.ordinal],
    [COL.employee, fields.name],
    [COL.role, fields.role],
    [COL.baseSalary, fields.baseSalary],
    [COL.days, fields.days],
    [COL.gross, fields.gross],
    [COL.deductions, fields.deductions],
    [COL.net, fields.net],
    [COL.cost, fields.cost],
    [COL.contractType, fields.contractType],
    [COL.idCard, fields.idCard],
    [COL.hireDate, fields.hireDate],
    [COL.sectorCode, fields.sectorCode],
    [COL.paid, fields.paid],
    [COL.overtimeHours50, fields.overtimeHours50],
    [COL.overtimeHours100, fields.overtimeHours100],
    [COL.overtimeHours25, fields.overtimeHours25],
    [COL.overtimePay50, fields.overtimePay50],
    [COL.overtimePay100, fields.overtimePay100],
    [COL.overtimePay25, fields.overtimePay25],
    [COL.overtimeTotal, fields.overtimeTotal],
    [COL.vacationPay, fields.vacationPay],
    [COL.privateInsurance, fields.privateInsurance],
    [COL.allowances, fields.allowances],
    [COL.fixedCommission, fields.fixedCommission],
    [COL.variableCommission, fields.variableCommission],
    [COL.bonus, fields.bonus],
    [COL.iessLoans, fields.iessLoans],
    [COL.unpaidLeave, fields.unpaidLeave],
    [COL.salaryAdvance, fields.salaryAdvance],
    [COL.companyLoans, fields.companyLoans],
    [COL.incomeTax, fields.incomeTax],
    [COL.meals, fields.meals],
    [COL.fines, fields.fines],
    [COL.inHouseConsumption, fields.inHouseConsumption],
    [COL.solidarityContribution, fields.solidarityContribution],
    [COL.otherDeductions, fields.otherDeductions],
    [COL.partTimeDeduction, fields.partTimeDeduction],
    [COL.medicalLeaveDeduction, fields.medicalLeaveDeduction],
    [COL.thirteenthProvision, fields.thirteenthProvision],
    [COL.fourteenthProvision, fields.fourteenthProvision],
    [COL.accumulatesReserveFund, fields.accumulatesReserveFund],
    [COL.hasReserveFund, fields.hasReserveFund],
  ]);
}

/** An área header: only the name column is filled — no ordinal. */
function area(name: string): FixtureCell[] {
  return row([[COL.employee, name]]);
}

const PREAMBLE = (company: string, period: string): FixtureCell[][] => [
  // fila 1 — a VLOOKUP index list gone stale (col 7 and col 13 deliberately alias the real
  // TOTAL/PAGADO columns with numbers that must never leak into a parsed figure), plus B1.
  row([
    [COL.employee, company],
    [COL.net, 999999],
    [COL.paid, 888888],
  ]),
  // fila 2 — B2's period, los dos rótulos AGRUPADORES de las horas extras, y los rótulos M–BH.
  row([
    [COL.employee, period],
    [COL.gross, "TOTAL INGRESO"],
    [COL.deductions, "TOTAL EGRESOS"],
    [COL.net, "LIQUIDO A RECIBIR"],
    [COL.cost, "COSTO TOTAL"],
    [COL.contractType, "TC"],
    [COL.idCard, "CÉDULA"],
    [COL.hireDate, "FECHA INGRESO"],
    [COL.sectorCode, "CODIGO \nSECTORIAL"],
    [COL.paid, "PAGADO"],
    // Agrupador sobre G–I. Va ANTES que el "No. " de la fila 3 y empieza igual que él: si
    // `compactLabel` no distinguiera la etiqueta entera, el ordinal se leería de aquí.
    [COL.overtimeHours50, " No. HORAS EXTRAS"],
    // Agrupador sobre J–L, hermano del anterior.
    [COL.overtimePay50, "VALOR DE HORAS EXTRAS"],
    [COL.overtimeTotal, "TOTAL HORAS EXTRAS"],
    [COL.vacationPay, "VACACIONES - MENSUAL"],
    [COL.privateInsurance, "SEGURO PRIVADO"],
    [COL.allowances, "VIATICOS/VIVIENDA"],
    [COL.fixedCommission, "COMISION FIJA POR VTAS."],
    [COL.variableCommission, "COMISION VARIABLE"],
    [COL.bonus, "BONO CUMPLIMIENTO"],
    [COL.iessLoans, "PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS"],
    [COL.unpaidLeave, "LICENCIA SIN SUELDO"],
    [COL.salaryAdvance, "ANTICIPO SUELDO"],
    [COL.companyLoans, "PRESTAMOS EMPRESARIALES"],
    [COL.incomeTax, "IMPUESTO RENTA"],
    [COL.meals, "ALMUERZOS"],
    [COL.fines, "MULTAS"],
    [COL.inHouseConsumption, "CONSUMO LOCALES EMPLEADO"],
    [COL.solidarityContribution, "CONTRIBUCION \nSOLIDARIA"], // partido en dos líneas, como el libro
    [COL.otherDeductions, "OTROS "], // con el espacio sobrante que el libro escribe
    [COL.partTimeDeduction, "DESCUENTO TIEMPO PACIAL"], // sic
    [COL.medicalLeaveDeduction, "Descuento PERMISO MEDICO"],
    [COL.thirteenthProvision, "XIII"],
    [COL.fourteenthProvision, "XIV"],
    [COL.accumulatesReserveFund, "AC FR"],
    [COL.hasReserveFund, "FR"],
  ]),
  // fila 3 — the A–L rótulos.
  row([
    [COL.ordinal, "No. "],
    [COL.employee, "EMPLEADO"],
    [COL.role, "CARGO"],
    [COL.baseSalary, "SUELDO BASE"],
    [COL.days, "DIAS"],
    [COL.overtimeHours50, "HORAS EXTRAS 50%"],
    [COL.overtimeHours100, "HORAS EXTRAS 100%"],
    [COL.overtimeHours25, "HORAS EXTRAS 15%"], // sic: la cantidad se rotula 15 % y su valor 25 %
    [COL.overtimePay50, "VALOR GANADO EXTRAS 50%"],
    [COL.overtimePay100, "VALOR GANADO EXTRAS 100%"],
    [COL.overtimePay25, "VALOR GANADO EXTRAS 25%"],
  ]),
  [],
];

const SUBTOTAL_ROW: FixtureCell[] = row([[COL.role, "SUBTOTAL"]]);
const SUMAN_ROW: FixtureCell[] = row([[COL.role, "SUMAN"]]);

/** The asientos contables trap: an account code in col A and a description in col B, the same
 * ordinal+name shape an employee row has. Only appears AFTER `SUMAN`, where it must be ignored. */
const ASIENTO_ROW: FixtureCell[] = row([
  [COL.ordinal, "621001"],
  [COL.employee, "Sueldos Administracion"],
  [COL.role, 2918.58],
]);

/** El otro lado de la misma trampa: el bloque de asientos REPITE como descripción tres rótulos de
 * egreso que la cabecera ya usó (`AB`, `AD`, `AG` en el libro real). Como `findLabel` se queda con
 * la PRIMERA coincidencia y la cabecera va arriba, estas no pueden desplazarla. */
const ASIENTO_LABEL_ECHO_ROWS: FixtureCell[][] = [
  row([
    [COL.ordinal, "621005"],
    [COL.employee, "PRESTAMOS EMPRESARIALES"],
  ]),
  row([
    [COL.ordinal, "621006"],
    [COL.employee, "ALMUERZOS"],
  ]),
  row([
    [COL.ordinal, "621007"],
    [COL.employee, "CONTRIBUCION SOLIDARIA"],
  ]),
];

/** The real file's own dummy row: an ordinal with NO name — must not read as an employee. */
const EMPTY_ORDINAL_ROW: FixtureCell[] = row([[COL.ordinal, 1]]);

/**
 * Recorte a CERO: 9,5 horas valoradas en 27,00 y un `M` en cero — el `*0` que el libro escribe a
 * mano (fila 15 del archivo real). Cada concepto capturado trae un valor DISTINTO (11–16 los
 * ingresos, 41–53 los egresos, sin repetir ninguno de los que ya usan sueldo, días o totales), así
 * que una atribución cruzada entre dos columnas cambia la cifra y el test la caza.
 */
const EMPLEADO_UNO = employee({
  ...NO_CAPTURE,
  ordinal: "1-", // tolerates the real file's dash, same as `A15`
  name: "MORALES PEREZ ANA LUCIA",
  role: "CAMARERA DE PISOS",
  baseSalary: 500,
  days: 30,
  gross: 600,
  deductions: 50,
  net: 550,
  cost: 650,
  contractType: "CT",
  idCard: 1714097084, // a cédula stored as a NUMBER, like the real file's row 15
  hireDate: 45937, // 2025-10-07
  sectorCode: "1608551004134",
  paid: 550,
  overtimeHours50: 5.5,
  overtimeHours100: 2.5,
  overtimeHours25: 1.5,
  overtimePay50: 16.75,
  overtimePay100: 9.5,
  overtimePay25: 0.75, // J+K+L = 27
  overtimeTotal: 0, // ≠ 27 ⇒ approvedOvertime = 0
  vacationPay: 11,
  privateInsurance: 12,
  allowances: 13,
  fixedCommission: 14,
  variableCommission: 15,
  bonus: 16,
  iessLoans: 41,
  unpaidLeave: 42,
  salaryAdvance: 43,
  companyLoans: 44,
  incomeTax: 45,
  meals: 46,
  fines: 47,
  inHouseConsumption: 48,
  solidarityContribution: 49,
  otherDeductions: 51,
  partTimeDeduction: 52,
  medicalLeaveDeduction: 53,
  accumulatesReserveFund: "S", // como la fila 15 real: acumula, y por eso NO cobra
  hasReserveFund: "N",
});

/** Sin recorte: `M` coincide con `J+K+L` (ambos en cero, como la fila 16 real, cuyas 140 horas
 * quedaron valoradas en cero por la errata de `L`) ⇒ `approvedOvertime` es `null`. Enciende SOLO
 * la provisión del décimo tercero, para que las dos banderas de `AS`/`AT` se deduzcan por separado. */
const EMPLEADO_DOS = employee({
  ...NO_CAPTURE,
  ordinal: 2,
  name: "VEGA TORRES MARIA JOSE",
  role: "AUXILIAR DE SERVICIOS",
  baseSalary: 480,
  days: 30,
  gross: 580,
  deductions: 40,
  net: 540,
  cost: 620,
  contractType: "CT",
  idCard: "1202738207",
  hireDate: 45937,
  sectorCode: "1920000000041",
  paid: 540,
  overtimeHours25: 140,
  overtimeTotal: 0, // = J+K+L ⇒ approvedOvertime = null
  thirteenthProvision: 40.6,
  hasReserveFund: "S", // tiene derecho y NO acumula: la rama que sí paga `U`
});

/** Recorte PARCIAL: 91,91 trabajados y 50 reconocidos — ni todo ni nada, que es lo que el modelo
 * de importe (y no de booleano ni de porcentaje) existe para poder decir. */
const EMPLEADO_TRES = employee({
  ...NO_CAPTURE,
  ordinal: 3,
  name: "SANDOVAL RUIZ PEDRO JOSE",
  role: "COCINERO",
  baseSalary: 488.66,
  days: 30,
  gross: 570,
  deductions: 46,
  net: 524,
  cost: 651,
  contractType: "TP", // exercises the OTHER valid contract type
  idCard: "1001303237",
  hireDate: 46082, // 2026-03-01
  sectorCode: "1608551004051",
  paid: 524,
  overtimeHours50: 26,
  overtimeHours100: 2,
  overtimePay50: 79.41,
  overtimePay100: 12.5, // J+K+L = 91.91
  overtimeTotal: 50, // ≠ 91.91 ⇒ approvedOvertime = 50
  fourteenthProvision: 20.5,
  accumulatesReserveFund: "s", // minúscula: el `=` de Excel no distingue mayúsculas
  hasReserveFund: "S",
});

/** A well-formed rol de pagos: 3 empleados across HOSPEDAJE/COCINA, ADMINISTRACION declared but
 * with only its dummy row (no real empleado under it, like the real file), and an asientos
 * contables block after SUMAN that must not surface as more empleados nor steal a rótulo. No
 * warnings expected. */
export const ROL_GENERAL_AOA: FixtureCell[][] = [
  ...PREAMBLE("HOTEL BOUTIQUE FICTICIO", "MARZO 2026"),
  area("ADMINISTRACION"),
  EMPTY_ORDINAL_ROW,
  SUBTOTAL_ROW,
  area("HOSPEDAJE"),
  EMPLEADO_UNO,
  EMPLEADO_DOS,
  SUBTOTAL_ROW,
  area("COCINA"),
  EMPLEADO_TRES,
  SUBTOTAL_ROW,
  SUMAN_ROW,
  [],
  ASIENTO_ROW,
  ...ASIENTO_LABEL_ECHO_ROWS,
];

/** Borra un rótulo de la fila donde vive, dejando la columna de datos intacta: así es como el
 * libro puede legítimamente no declarar una columna, y el aviso agrupado tiene que nombrarla. */
function withoutLabel(aoa: FixtureCell[][], labelRow: number, col: number): FixtureCell[][] {
  return aoa.map((line, i) =>
    i === labelRow ? line.map((cell, c) => (c === col ? null : cell)) : line,
  );
}

/** Same shape, `PAGADO` column entirely absent — the real workbook can legitimately not carry it. */
export const ROL_GENERAL_NO_PAGADO_AOA: FixtureCell[][] = withoutLabel(
  ROL_GENERAL_AOA,
  ROW.labelsM_BH,
  COL.paid,
);

/** Sin el rótulo de `M`: no hay forma de saber cuánto se reconoció, así que no se puede deducir
 * recorte alguno — y la carga tiene que seguir, con la columna nombrada en el aviso agrupado. */
export const ROL_GENERAL_NO_TOTAL_HORAS_EXTRAS_AOA: FixtureCell[][] = withoutLabel(
  ROL_GENERAL_AOA,
  ROW.labelsM_BH,
  COL.overtimeTotal,
);

/** Sin el rótulo de `AA` (ANTICIPO SUELDO): una columna de concepto que falta no rompe la carga. */
export const ROL_GENERAL_NO_ANTICIPO_AOA: FixtureCell[][] = withoutLabel(
  ROL_GENERAL_AOA,
  ROW.labelsM_BH,
  COL.salaryAdvance,
);

/** No área header appears before the sole empleado row — the file's own first section could, in
 * principle, start directly with a name and no heading above it. */
export const ROL_GENERAL_NO_AREA_AOA: FixtureCell[][] = [
  ...PREAMBLE("HOTEL BOUTIQUE FICTICIO", "MARZO 2026"),
  EMPLEADO_UNO,
  SUBTOTAL_ROW,
  SUMAN_ROW,
];

/** One empleado's `TC` is neither `CT` nor `TP`. */
export const ROL_GENERAL_BAD_CONTRACT_TYPE_AOA: FixtureCell[][] = ROL_GENERAL_AOA.map((line) =>
  line[COL.employee] === EMPLEADO_UNO[COL.employee]
    ? line.map((cell, c) => (c === COL.contractType ? "XX" : cell))
    : line,
);

/** One empleado's `FECHA INGRESO` isn't a number at all. */
export const ROL_GENERAL_BAD_HIRE_DATE_AOA: FixtureCell[][] = ROL_GENERAL_AOA.map((line) =>
  line[COL.employee] === EMPLEADO_UNO[COL.employee]
    ? line.map((cell, c) => (c === COL.hireDate ? "sin fecha" : cell))
    : line,
);

/** `FR` en blanco y `AC FR` con algo que NO es `"S"` — el libro compara `="S"` y todo lo demás cae
 * en el `else`, así que las dos banderas se apagan y nada avisa. */
export const ROL_GENERAL_ODD_RESERVE_FUND_AOA: FixtureCell[][] = ROL_GENERAL_AOA.map((line) =>
  line[COL.employee] === EMPLEADO_TRES[COL.employee]
    ? line.map((cell, c) => {
        if (c === COL.hasReserveFund) {
          return "";
        }
        return c === COL.accumulatesReserveFund ? "SI" : cell;
      })
    : line,
);

/**
 * `M` = 96,26 contra un `J+K+L` que en coma flotante da 96,25999999999999. El libro escribe
 * `M = J+K+L`, así que esto NO es un recorte: es la misma cifra con el ruido que ya obliga a
 * `sameToTheCentavo` en la conciliación (§9 del documento de fórmulas).
 */
export const ROL_GENERAL_OVERTIME_FLOAT_NOISE_AOA: FixtureCell[][] = ROL_GENERAL_AOA.map((line) =>
  line[COL.employee] === EMPLEADO_UNO[COL.employee]
    ? line.map((cell, c) => {
        if (c === COL.overtimePay50) return 16.75;
        if (c === COL.overtimePay100) return 79.41;
        if (c === COL.overtimePay25) return 0.1;
        return c === COL.overtimeTotal ? 96.26 : cell;
      })
    : line,
);

/** `B2` doesn't parse as a period at all. */
export const ROL_GENERAL_BAD_PERIOD_AOA: FixtureCell[][] = ROL_GENERAL_AOA.map((line, i) =>
  i === ROW.labelsM_BH ? line.map((cell, c) => (c === COL.employee ? "SIN PERIODO" : cell)) : line,
);

/** Every área header present, but not one row carries both an ordinal AND a name. */
export const ROL_GENERAL_NO_EMPLOYEES_AOA: FixtureCell[][] = [
  ...PREAMBLE("HOTEL BOUTIQUE FICTICIO", "MARZO 2026"),
  area("ADMINISTRACION"),
  EMPTY_ORDINAL_ROW,
  SUBTOTAL_ROW,
  SUMAN_ROW,
];

/** The sample's own sheet name: `GENERAL`. A different `sheetName` builds a workbook that never
 * carries it, for the "hoja GENERAL ausente" case. */
export function aoaToXlsxBuffer(aoa: FixtureCell[][], sheetName = "GENERAL"): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
