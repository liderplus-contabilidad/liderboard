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
 * - what an unparseable hire date becomes (`null`, not a guess);
 * - qué cuenta como un «sí» en `FR`/`AC FR`, y cómo se RECUPERAN los dos interruptores que el
 *   libro escribe como un `*0` al final de una fórmula (`M` y las provisiones `AS`/`AT`).
 *
 * NADA aquí se recalcula: `TOTAL INGRESO`, `TOTAL EGRESOS`, `LIQUIDO A RECIBIR`, `COSTO TOTAL` y
 * `PAGADO` se leen VERBATIM. El rol trae más de mil fórmulas propias — reproducir el aporte IESS o
 * el cálculo del décimo aquí crearía una segunda definición que puede separarse de la del
 * contador al centavo, y la pantalla y el Excel dirían cifras distintas sin que nada lo delate.
 * Por eso los interruptores se DEDUCEN de los valores en vez de leerse de las fórmulas: SheetJS
 * las trae, pero una app que interprete fórmulas de Excel es exactamente la segunda definición
 * que este módulo existe para no tener.
 */
import { sameToTheCentavo } from "@/lib/payroll/amounts";
import type { ParsedPayrollEmployeeLine, PayrollMonthlyCapture } from "@/lib/payroll/types";
import { readGrid, readWorkbook, type Cell } from "@/lib/excel/workbook";
import { PayrollParseError } from "./errors";
import {
  excelSerialToISODate,
  locateColumns,
  missingColumnLabels,
  parsePeriodText,
  readEmployeeRows,
  type RolGeneralEmployeeRow,
} from "./rol-general-grid";
import type { ParsedPayrollWorkbook } from "./types";

const GENERAL_SHEET = "GENERAL";
const CONTRACT_TYPES = new Set(["CT", "TP"]);
const DEFAULT_CONTRACT_TYPE = "CT";
/** Lo que `FR` y `AC FR` escriben cuando la respuesta es que sí. */
const YES = "S";

function cellText(cell: Cell): string {
  if (typeof cell === "string") {
    return cell.trim();
  }
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return String(cell);
  }
  return "";
}

/**
 * `FR` y `AC FR` valen lo que el libro pregunta de ellas: `IF(FR="S", …, 0)`. Solo una `S` enciende
 * la bandera; el vacío, una `N` y cualquier basura caen todos en el `else` de esa misma fórmula, así
 * que ninguno de los tres merece un aviso — no son un dato ilegible sino la rama por defecto. Se
 * compara sin distinguir mayúsculas porque el `=` de Excel tampoco distingue, y un archivo con una
 * `s` minúscula cobra fondo de reserva en la hoja del contador.
 */
function readsAsYes(raw: string): boolean {
  return raw.trim().toUpperCase() === YES;
}

/**
 * El importe de horas extras que se reconoció este mes (§6), recuperado SIN leer una sola fórmula:
 * si `M` no es la suma de `J+K+L`, la diferencia es el recorte que el contador aplicó a mano y `M`
 * ES el importe reconocido; si coinciden, no hubo recorte y la entrada del motor va `null`, que
 * significa «todo lo trabajado».
 *
 * Se compara al CENTAVO, con la misma regla que la conciliación: el libro escribe `M = J+K+L` sin
 * redondear, y `J`, `K` y `L` sí vienen redondeados, así que la suma llega con el ruido de coma
 * flotante de §9 (`96.25999999999999` contra el `96.26` guardado). Con `!==` ese ruido inventaría
 * un recorte que nadie hizo, y las horas extras entrarían al motor recortadas a sí mismas.
 *
 * Sin columna `M` no hay nada que deducir y devuelve `null`: un `0` afirmaría que no se reconoció
 * ninguna hora, que es justo lo que un libro sin esa columna no dice.
 */
function deduceApprovedOvertime(row: RolGeneralEmployeeRow): number | null {
  if (row.overtimeTotal === null) {
    return null;
  }
  const worked = row.overtimePay50 + row.overtimePay100 + row.overtimePay25;
  return sameToTheCentavo(row.overtimeTotal, worked) ? null : row.overtimeTotal;
}

/**
 * Lo capturado del mes de un empleado. Las dos provisiones de décimos se deducen igual que `M` y
 * por el mismo motivo: el libro las apaga con un `*0`, así que un importe distinto de cero es la
 * única huella que queda de que ese mes SÍ provisiona. En el archivo real están en cero las seis
 * veces, que es lo coherente con mensualizarlos ya en `N` y `O`.
 */
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
    provisionsThirteenth: row.thirteenthProvisionRaw !== 0,
    provisionsFourteenth: row.fourteenthProvisionRaw !== 0,
    // `BZ` viaja también a la captura, no solo a `figures`: es un valor TECLEADO, y la pantalla
    // lo deja corregir. `figures.paid` conserva lo que este archivo declaró, para el contraste.
    paid: row.paid,
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
      hasReserveFund: readsAsYes(row.hasReserveFundRaw),
      accumulatesReserveFund: readsAsYes(row.accumulatesReserveFundRaw),
      days: row.days,
      capture: toCapture(row),
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
