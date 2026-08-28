/**
 * Reads the rol de pagos' `GENERAL` sheet into a `ParsedPayrollWorkbook`. What this module OWNS,
 * on top of `rol-general-grid.ts`'s "where things sit" (mirroring the split PyG's
 * `microplus.ts`/`microplus-grid.ts` and `dingoo.ts`/`dingoo-grid.ts` draw):
 * - the sheet: always `GENERAL`, never the first sheet — the workbook also carries `OTROS`,
 *   `ANTICIPO`, `INDIVIDUAL`, `H.E.`, `ASIENTOS`, `REPORTE HORAS EXTRAS` and `IESS`, none of them
 *   nómina;
 * - the period: the sheet's own declared text ("MARZO 2026"), located by its SHAPE among the
 *   preamble rows (`findPeriod`) and never by the file name — the opposite of PyG's
 *   monthly-by-centers format, which has no such line and leans on the name;
 * - what counts as a valid `contractType` (`"CT" | "TP"`) and what a bad one defaults to;
 * - what an unparseable hire date becomes (`null`, not a guess);
 * - what counts as a «yes» in `FR`/`AC FR`, and how the two switches the book writes as a `*0` at
 *   the end of a formula (`M` and the `AS`/`AT` provisions) are RECOVERED.
 *
 * NOTHING here is recomputed: `TOTAL INGRESO`, `TOTAL EGRESOS`, `LIQUIDO A RECIBIR`, `COSTO TOTAL`
 * and `PAGADO` are read VERBATIM. The rol brings over a thousand formulas of its own — reproducing
 * the IESS contribution or the décimo computation here would create a second definition that can
 * drift from the accountant's by a cent, and the screen and the Excel would say different figures
 * with nothing giving it away. That is why the switches are DEDUCED from the values instead of being
 * read off the formulas: SheetJS brings them, but an app that interprets Excel formulas is exactly
 * the second definition this module exists not to have.
 */
import { sameToTheCentavo } from "@/lib/payroll/amounts";
import type { ParsedPayrollEmployeeLine, PayrollMonthlyCapture } from "@/lib/payroll/types";
import { readGrid, readWorkbook } from "@/lib/excel/workbook";
import { PayrollParseError } from "./errors";
import {
  excelSerialToISODate,
  findCompany,
  findPeriod,
  locateColumns,
  missingColumnLabels,
  readEmployeeRows,
  type RolGeneralEmployeeRow,
} from "./rol-general-grid";
import type { ParsedPayrollWorkbook } from "./types";

const GENERAL_SHEET = "GENERAL";
const CONTRACT_TYPES = new Set(["CT", "TP"]);
const DEFAULT_CONTRACT_TYPE = "CT";
/** What `FR` and `AC FR` write when the answer is yes. */
const YES = "S";

/**
 * `FR` and `AC FR` are worth what the book asks of them: `IF(FR="S", …, 0)`. Only an `S` switches the
 * flag on; a blank, an `N` and any junk all fall into that same formula's `else`, so none of the three
 * deserves a warning — they are not an unreadable datum but the default branch. It is compared
 * ignoring case because Excel's `=` does not distinguish it either, and a file with a lower-case `s`
 * receives a reserve fund on the accountant's sheet.
 */
function readsAsYes(raw: string): boolean {
  return raw.trim().toUpperCase() === YES;
}

/**
 * The overtime amount that was recognised this month (§6), recovered WITHOUT reading a single
 * formula: if `M` is not the sum of `J+K+L`, the difference is the trim the accountant applied by
 * hand and `M` IS the recognised amount; if they match, there was no trim and the engine's input goes
 * `null`, which means «everything worked».
 *
 * It is compared to the CENT, with the same rule as the reconciliation: the book writes `M = J+K+L`
 * unrounded, and `J`, `K` and `L` do arrive rounded, so the sum comes with §9's floating-point noise
 * (`96.25999999999999` against the stored `96.26`). With `!==` that noise would invent a trim nobody
 * made, and the overtime would enter the engine trimmed to itself.
 *
 * With no `M` column there is nothing to deduce and it returns `null`: a `0` would claim no hour was
 * recognised, which is exactly what a book without that column does not say.
 */
function deduceApprovedOvertime(row: RolGeneralEmployeeRow): number | null {
  if (row.overtimeTotal === null) {
    return null;
  }
  const worked = row.overtimePay50 + row.overtimePay100 + row.overtimePay25;
  return sameToTheCentavo(row.overtimeTotal, worked) ? null : row.overtimeTotal;
}

/** What is captured of an employee's month. The two décimo provisions are NOT here: they belong to
 *  the record (see `toProvisions`). */
function toCapture(row: RolGeneralEmployeeRow): PayrollMonthlyCapture {
  return {
    overtimeHours50: row.overtimeHours50,
    overtimeHours100: row.overtimeHours100,
    overtimeHours25: row.overtimeHours25,
    approvedOvertime: deduceApprovedOvertime(row),
    vacationPay: row.vacationPay,
    privateInsurance: row.privateInsurance,
    allowances: row.allowances,
    fixedCommission: row.fixedCommission,
    variableCommission: row.variableCommission,
    bonus: row.bonus,
    deductions: {
      iessLoans: row.iessLoans,
      unpaidLeave: row.unpaidLeave,
      salaryAdvance: row.salaryAdvance,
      companyLoans: row.companyLoans,
      incomeTax: row.incomeTax,
      meals: row.meals,
      fines: row.fines,
      inHouseConsumption: row.inHouseConsumption,
      solidarityContribution: row.solidarityContribution,
      otherDeductions: row.otherDeductions,
      partTimeDeduction: row.partTimeDeduction,
      medicalLeaveDeduction: row.medicalLeaveDeduction,
    },
    // `BZ` comes in as one more captured value: it is a TYPED value, and the screen lets it be
    // corrected.
    paid: row.paid,
  };
}

/**
 * The two décimo provision flags, which go to the RECORD and not to the capture because they are a
 * choice of the employee (see `PayrollEmployeeLine`). That they live on the record does not prevent
 * reading them from each file: a período stores its own record, so March's file declares March's.
 *
 * They are deduced just like `M` and for the same reason: the book switches them off with a `*0`, so
 * an amount other than zero is the only trace left that the month DOES provision. In the real file
 * they are zero all six times, which is consistent with already taking them monthly in `N` and `O`.
 */
function toProvisions(
  row: RolGeneralEmployeeRow,
): Pick<ParsedPayrollEmployeeLine, "provisionsThirteenth" | "provisionsFourteenth"> {
  return {
    provisionsThirteenth: row.thirteenthProvisionRaw !== 0,
    provisionsFourteenth: row.fourteenthProvisionRaw !== 0,
  };
}

export function parseRolGeneral(buffer: ArrayBuffer): ParsedPayrollWorkbook {
  const workbook = readWorkbook(buffer);
  if (!workbook) {
    throw new PayrollParseError("invalid-file");
  }
  if (!workbook.Sheets[GENERAL_SHEET]) {
    throw new PayrollParseError("general-sheet-missing");
  }
  const grid = readGrid(workbook, GENERAL_SHEET);
  if (!grid) {
    throw new PayrollParseError("invalid-file");
  }

  const columns = locateColumns(grid);
  // By its PLACE in the preamble, not by `B1`: the rol this app generates opens with the logo's band
  // and, under the name, with the letterhead's lines.
  const company = findCompany(grid, columns.headerRow);
  // By its SHAPE, not by its cell: the rol this app generates carries a letterhead, and a few logo
  // rows above the preamble moved the fixed `B2` that used to be read.
  const period = findPeriod(grid, columns.headerRow);
  if (!period) {
    throw new PayrollParseError("invalid-period");
  }

  const { rows, warnings: rowWarnings } = readEmployeeRows(grid, columns);
  if (rows.length === 0) {
    throw new PayrollParseError("no-employees");
  }

  let badContractTypeCount = 0;
  let badHireDateCount = 0;
  const lines: ParsedPayrollEmployeeLine[] = rows.map((row) => {
    const validContractType = CONTRACT_TYPES.has(row.contractTypeRaw);
    if (!validContractType) {
      badContractTypeCount++;
    }
    const hireDate = excelSerialToISODate(row.hireDateRaw);
    if (row.hireDateRaw !== null && hireDate === null) {
      badHireDateCount++;
    }
    return {
      name: row.name,
      role: row.role,
      area: row.area,
      baseSalary: row.baseSalary,
      contractType: validContractType
        ? (row.contractTypeRaw as "CT" | "TP")
        : DEFAULT_CONTRACT_TYPE,
      idCard: row.idCard,
      hireDate,
      sectorCode: row.sectorCode,
      hasReserveFund: readsAsYes(row.hasReserveFundRaw),
      accumulatesReserveFund: readsAsYes(row.accumulatesReserveFundRaw),
      ...toProvisions(row),
      days: row.days,
      capture: toCapture(row),
    };
  });

  const warnings = [...rowWarnings];
  const missing = missingColumnLabels(columns);
  if (missing.length > 0) {
    warnings.push(`No se encontraron las columnas: ${missing.join(", ")}.`);
  }
  if (badContractTypeCount > 0) {
    warnings.push(
      badContractTypeCount === 1
        ? `1 empleado trae un tipo de contrato distinto de CT/TP; se asume CT.`
        : `${badContractTypeCount} empleados traen un tipo de contrato distinto de CT/TP; se asume CT.`,
    );
  }
  if (badHireDateCount > 0) {
    warnings.push(
      badHireDateCount === 1
        ? `1 empleado trae una fecha de ingreso ilegible; queda sin fecha.`
        : `${badHireDateCount} empleados traen una fecha de ingreso ilegible; quedan sin fecha.`,
    );
  }

  return { company, year: period.year, monthIndex: period.monthIndex, lines, warnings };
}
