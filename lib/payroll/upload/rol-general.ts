/**
 * Reads the rol de pagos' `GENERAL` sheet into a `ParsedPayrollWorkbook`. What this module OWNS,
 * on top of `rol-general-grid.ts`'s "where things sit" (mirroring the split PyG's
 * `microplus.ts`/`microplus-grid.ts` and `dingoo.ts`/`dingoo-grid.ts` draw):
 * - the sheet: always `GENERAL`, never the first sheet — the workbook also carries `OTROS`,
 *   `ANTICIPO`, `INDIVIDUAL`, `H.E.`, `ASIENTOS`, `REPORTE HORAS EXTRAS` and `IESS`, none of them
 *   nómina;
 * - the period: `GENERAL!B2`'s own declared text ("MARZO 2026"), never the file name — the
 *   opposite of PyG's monthly-by-centers format, which has no such line and leans on the name;
 * - what counts as a valid `contractType` (`"CT" | "TP"`) and what a bad one defaults to;
 * - what an unparseable hire date becomes (`null`, not a guess).
 *
 * NADA aquí se recalcula: `TOTAL INGRESO`, `TOTAL EGRESOS`, `LIQUIDO A RECIBIR`, `COSTO TOTAL` y
 * `PAGADO` se leen VERBATIM. El rol trae más de mil fórmulas propias — reproducir el aporte IESS o
 * el cálculo del décimo aquí crearía una segunda definición que puede separarse de la del
 * contador al centavo, y la pantalla y el Excel dirían cifras distintas sin que nada lo delate.
 */
import type { ParsedPayrollEmployeeLine } from "@/lib/payroll/types";
import { readGrid, readWorkbook, type Cell } from "@/lib/excel/workbook";
import { PayrollParseError } from "./errors";
import {
  excelSerialToISODate,
  locateColumns,
  missingColumnLabels,
  parsePeriodText,
  readEmployeeRows,
} from "./rol-general-grid";
import type { ParsedPayrollWorkbook } from "./types";

const GENERAL_SHEET = "GENERAL";
const CONTRACT_TYPES = new Set(["CT", "TP"]);
const DEFAULT_CONTRACT_TYPE = "CT";

function cellText(cell: Cell): string {
  if (typeof cell === "string") {
    return cell.trim();
  }
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return String(cell);
  }
  return "";
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

  const company = cellText(grid[0]?.[1] ?? null);
  const period = parsePeriodText(grid[1]?.[1] ?? null);
  if (!period) {
    throw new PayrollParseError("invalid-period");
  }

  const columns = locateColumns(grid);
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
      days: row.days,
      figures: {
        gross: row.gross,
        deductions: row.deductions,
        net: row.net,
        cost: row.cost,
        paid: row.paid,
      },
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
