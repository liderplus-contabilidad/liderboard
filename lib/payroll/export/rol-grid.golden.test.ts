/**
 * EL CONTRASTE CONTRA EL LIBRO REAL — la única evidencia externa de que esta descarga acierta.
 *
 * `GOLDEN_MARCH_2026` son los seis empleados del rol de marzo de 2026 de HOTEL BOUTIQUE CULTURA
 * MANOR, transcritos del `.xls`: lo que el archivo declara como entrada y lo que sus propias
 * fórmulas calculan. `engine/golden.test.ts` ya exige que el motor reproduzca esas veinte columnas
 * al bit; lo que este test añade es la COSTURA — que cada una aterrice en la LETRA que el contador
 * va a mirar. Un motor exacto escribiendo el aporte patronal en la columna de al lado sigue dando
 * un archivo que no cuadra con el suyo, y ninguna suma lo delata.
 *
 * Por eso el mapa de abajo se escribe a mano en vez de derivarse del catálogo: es la afirmación, no
 * una consecuencia de lo afirmado.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_PAYROLL_PARAMETERS } from "../engine/parameters";
import type { PayrollEmployeeComputation, PayrollEmployeeInput } from "../engine/types";
import { GOLDEN_MARCH_2026 } from "../engine/golden.fixtures";
import type { ParsedPayrollEmployeeLine } from "../types";
import { columnIndexOf } from "./columns";
import { buildRolGrid, type RolExportRow } from "./rol-grid";

/** La entrada del motor, vuelta ficha + captura. Es el camino inverso de `toEngineInput`, y existe
 *  solo aquí: el fixture habla el vocabulario del motor y la descarga el del almacenamiento. */
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
      provisionsThirteenth: input.flags.provisionsThirteenth,
      provisionsFourteenth: input.flags.provisionsFourteenth,
      paid: input.paid,
    },
  };
}

/** Qué columna de la hoja lleva cada cifra derivada. Es el mapa que el contador coteja. */
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
  extraConcepts: [],
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
    // Las cifras del `SUMAN` real: sueldo base 2.918,58 · total ingreso 3.402,81 · egresos 540,05 ·
    // líquido 2.862,76 · costo total 3.889,06 · pagado 2.904,47 · diferencia −41,71.
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
