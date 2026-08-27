/**
 * THE CONTRAST AGAINST THE REAL BOOK — the only external evidence that this download is right.
 *
 * `GOLDEN_MARCH_2026` is the six employees of HOTEL BOUTIQUE CULTURA MANOR's March 2026 rol,
 * transcribed from the `.xls`: what the file declares as input and what its own formulas compute.
 * `engine/golden.test.ts` already requires the engine to reproduce those twenty columns to the bit;
 * what this test adds is the SEAM — that each one lands in the LETTER the accountant is going to look
 * at. An exact engine writing the employer contribution in the column next to it still gives a file
 * that does not square with theirs, and no sum gives it away.
 *
 * That is why the map below is written by hand instead of derived from the catalogue: it is the
 * assertion, not a consequence of what is asserted.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_PAYROLL_PARAMETERS } from "../engine/parameters";
import type { PayrollEmployeeComputation, PayrollEmployeeInput } from "../engine/types";
import { GOLDEN_MARCH_2026 } from "../engine/golden.fixtures";
import type { ParsedPayrollEmployeeLine } from "../types";
import { columnIndexOf } from "./columns";
import { buildRolGrid, type RolExportRow } from "./rol-grid";

/** The engine's input, turned back into a record + capture. It is the inverse path of
 *  `toEngineInput`, and it exists only here: the fixture speaks the engine's vocabulary and the
 *  download the storage's. */
function toLine(name: string, input: PayrollEmployeeInput): ParsedPayrollEmployeeLine {
  return {
    name,
    role: "CARGO",
    area: "HOSPEDAJE",
    baseSalary: input.baseSalary,
    contractType: input.contractType,
    idCard: "1714097084",
    hireDate: "2025-10-01",
    sectorCode: "1608551004134",
    hasReserveFund: input.hasReserveFund,
    accumulatesReserveFund: input.accumulatesReserveFund,
    // The two provisions belong to the RECORD, not to the capture: the engine reads them from here.
    provisionsThirteenth: input.flags.provisionsThirteenth,
    provisionsFourteenth: input.flags.provisionsFourteenth,
    days: input.days,
    capture: {
      overtimeHours50: input.overtimeHours50,
      overtimeHours100: input.overtimeHours100,
      overtimeHours25: input.overtimeHours25,
      approvedOvertime: input.approvedOvertime,
      vacationPay: input.vacationPay,
      privateInsurance: input.privateInsurance,
      allowances: input.allowances,
      fixedCommission: input.fixedCommission,
      variableCommission: input.variableCommission,
      bonus: input.bonus,
      deductions: input.deductions,
      paid: input.paid,
    },
  };
}

/** Which column of the sheet carries each derived figure. It is the map the accountant checks. */
const DERIVED: readonly [string, keyof PayrollEmployeeComputation][] = [
  ["F", "unifiedSalary"],
  ["J", "overtimePay50"],
  ["K", "overtimePay100"],
  ["L", "overtimePay25"],
  ["M", "overtimeTotal"],
  ["N", "fourteenthMonthly"],
  ["O", "thirteenthMonthly"],
  ["U", "reserveFundPaid"],
  ["W", "grossIncome"],
  ["X", "iessEmployee"],
  ["AO", "totalDeductions"],
  ["AP", "netPay"],
  ["AS", "thirteenthProvision"],
  ["AT", "fourteenthProvision"],
  ["AU", "iessEmployer"],
  ["AV", "vacationProvision"],
  ["AW", "reserveFundAccrued"],
  ["AX", "totalProvision"],
  ["AY", "employerCost"],
  ["CA", "difference"],
];

const grid = buildRolGrid({
  clientName: "HOTEL BOUTIQUE CULTURA MANOR",
  year: 2026,
  monthIndex: 2,
  lines: GOLDEN_MARCH_2026.map((golden) => toLine(golden.name, golden.input)),
  parameters: DEFAULT_PAYROLL_PARAMETERS,
});
const employees = grid.rows.filter((row) => row.kind === "employee");
const at = (row: RolExportRow, letter: string) => row.cells[columnIndexOf(letter)];

describe("marzo de 2026, contra la hoja GENERAL del archivo", () => {
  it("escribe una fila por empleado, en el orden del libro", () => {
    expect(employees).toHaveLength(GOLDEN_MARCH_2026.length);
    expect(employees.map((row) => at(row, "B"))).toEqual(
      GOLDEN_MARCH_2026.map((golden) => golden.name),
    );
  });

  for (const [index, golden] of GOLDEN_MARCH_2026.entries()) {
    describe(`${golden.name} (fila ${golden.row})`, () => {
      const row = employees[index];

      it("las veinte columnas derivadas caen en su letra, al bit", () => {
        for (const [letter, field] of DERIVED) {
          expect(at(row, letter), `${letter} · ${field}`).toBe(golden.expected[field]);
        }
      });

      it("lo capturado sale tal como el archivo lo trae", () => {
        expect(at(row, "D")).toBe(golden.input.baseSalary);
        expect(at(row, "E")).toBe(golden.input.days);
        expect(at(row, "G")).toBe(golden.input.overtimeHours50);
        expect(at(row, "H")).toBe(golden.input.overtimeHours100);
        expect(at(row, "I")).toBe(golden.input.overtimeHours25);
        expect(at(row, "Y")).toBe(golden.input.deductions.iessLoans);
        expect(at(row, "AA")).toBe(golden.input.deductions.salaryAdvance);
        expect(at(row, "BZ")).toBe(golden.input.paid);
        expect(at(row, "AZ")).toBe(golden.input.accumulatesReserveFund ? "S" : "N");
        expect(at(row, "BA")).toBe(golden.input.hasReserveFund ? "S" : "N");
        expect(at(row, "BB")).toBe(golden.input.contractType);
      });
    });
  }

  it("SUMAN cuadra con la fila 39 del archivo", () => {
    // The real `SUMAN` figures: base salary 2,918.58 · total income 3,402.81 · deductions 540.05 ·
    // net pay 2,862.76 · total cost 3,889.06 · paid 2,904.47 · difference −41.71.
    const suman = grid.rows.at(-1)!;
    expect(at(suman, "D") as number).toBeCloseTo(2918.58, 2);
    expect(at(suman, "W") as number).toBeCloseTo(3402.81, 2);
    expect(at(suman, "AO") as number).toBeCloseTo(540.05, 2);
    expect(at(suman, "AP") as number).toBeCloseTo(2862.76, 2);
    expect(at(suman, "AY") as number).toBeCloseTo(3889.06, 2);
    expect(at(suman, "BZ") as number).toBeCloseTo(2904.47, 2);
    expect(at(suman, "CA") as number).toBeCloseTo(-41.71, 2);
  });
});
