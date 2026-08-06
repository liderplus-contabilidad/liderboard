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
 */
import * as XLSX from "xlsx";
import type { Cell as FixtureCell } from "@/lib/excel/workbook";

/** Column indices — named the way the report itself labels them, so a test reads like the sheet. */
const COL = {
  ordinal: 0, // No.
  employee: 1, // EMPLEADO (also holds B1's company and B2's period, and every área's name)
  role: 2, // CARGO (also where SUBTOTAL/SUMAN write their own marker)
  baseSalary: 3, // SUELDO BASE
  days: 4, // DIAS
  gross: 5, // TOTAL INGRESO
  deductions: 6, // TOTAL EGRESOS
  net: 7, // LIQUIDO A RECIBIR
  cost: 8, // COSTO TOTAL
  contractType: 9, // TC
  idCard: 10, // CÉDULA
  hireDate: 11, // FECHA INGRESO
  sectorCode: 12, // CODIGO SECTORIAL
  paid: 13, // PAGADO
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

/** One EMPLEADO row: ordinal (tolerates the file's own `"1-"`), name, and every ficha/figure
 * column at its usual index. */
function employee(fields: {
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
}): FixtureCell[] {
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
  // fila 2 — B2's period, plus the M–BH rótulos.
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
  ]),
  // fila 3 — the A–L rótulos.
  row([
    [COL.ordinal, "No. "],
    [COL.employee, "EMPLEADO"],
    [COL.role, "CARGO"],
    [COL.baseSalary, "SUELDO BASE"],
    [COL.days, "DIAS"],
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

/** The real file's own dummy row: an ordinal with NO name — must not read as an employee. */
const EMPTY_ORDINAL_ROW: FixtureCell[] = row([[COL.ordinal, 1]]);

const EMPLEADO_UNO = employee({
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
});

const EMPLEADO_DOS = employee({
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
});

const EMPLEADO_TRES = employee({
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
});

/** A well-formed rol de pagos: 3 empleados across HOSPEDAJE/COCINA, ADMINISTRACION declared but
 * with only its dummy row (no real empleado under it, like the real file), and an asientos
 * contables row after SUMAN that must not surface as a 4th empleado. No warnings expected. */
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
];

/** Same shape, `PAGADO` column entirely absent — the real workbook can legitimately not carry it. */
export const ROL_GENERAL_NO_PAGADO_AOA: FixtureCell[][] = ROL_GENERAL_AOA.map((line, i) =>
  i === ROW.labelsM_BH ? line.map((cell, c) => (c === COL.paid ? null : cell)) : line,
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
