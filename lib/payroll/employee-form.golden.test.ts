/**
 * Tests the form's integration with the computation engine, verifying that the manually captured data
 * and the computed data match the expected figures (§12).
 *
 * This file exercises the conversion form → `toEmployeeLine` → `toEngineInput` → engine, including
 * overtime and deductions applied afterwards. Cases such as MORALES' combine both inputs.
 */
import { describe, expect, it } from "vitest";
import { emptyEmployeeForm, toEmployeeLine, type EmployeeFormValues } from "./employee-form";
import { emptyCapture, toEngineInput } from "./employee-input";
import { computeEmployeePayroll } from "./engine/compute";
import { DEFAULT_PAYROLL_PARAMETERS } from "./engine/parameters";
import type { CapturedDeductions } from "./engine/types";
import type { PayrollEmployeeLine, PayrollMonthlyCapture } from "./types";

type CapturedHours = Pick<
  PayrollMonthlyCapture,
  "overtimeHours50" | "overtimeHours100" | "overtimeHours25"
>;

interface GoldenCase {
  name: string;
  form: Partial<EmployeeFormValues>;
  /** What is typed in LATER on the record; the creation form does not ask for it. */
  hours?: Partial<CapturedHours>;
  /** `M` · the approved amount. It is also typed on the record, next to the hours it trims: the
   *  creation form came out of asking for it precisely because it does not capture those hours. */
  approvedOvertime?: number | null;
  deductions?: Partial<CapturedDeductions>;
  /** Absent in the cases that do not compare the five totals but one loose derivation. */
  expected?: {
    grossIncome: number;
    iessEmployee: number;
    totalDeductions: number;
    netPay: number;
    employerCost: number;
  };
}

/**
 * The overtime of MORALES, SANDOVAL COLIMBA and ACOSTA is SWITCHED OFF in the file
 * (`approvedOvertime: 0`, §6's `*0`) and the other three do not need switching off because they have
 * none. VEGA comes in with no hours: their 140 «at 15 %» are cancelled by the file itself in column
 * `L`, which is §11.2's typo and not something the app models.
 */
const GOLDEN: GoldenCase[] = [
  {
    name: "MORALES MENA SILVIA JIMENA",
    form: { baseSalary: 487.21 },
    approvedOvertime: 0,
    hours: { overtimeHours50: 5.5 },
    deductions: { iessLoans: 64.25 },
    expected: {
      grossIncome: 567.98,
      iessEmployee: 46.04,
      totalDeductions: 110.28999999999999,
      netPay: 457.69000000000005,
      employerCost: 649.15,
    },
  },
  {
    name: "VEGA GARCIA MARIANA DE JESUS",
    form: { baseSalary: 482.04 },
    expected: {
      grossIncome: 562.38,
      iessEmployee: 45.55,
      totalDeductions: 45.55,
      netPay: 516.83,
      employerCost: 642.71,
    },
  },
  {
    name: "SANDOVAL COLIMBA PEDRO MANUEL",
    form: { baseSalary: 488.66 },
    approvedOvertime: 0,
    hours: { overtimeHours50: 26 },
    expected: {
      grossIncome: 569.5500000000001,
      iessEmployee: 46.18,
      totalDeductions: 46.18,
      netPay: 523.3700000000001,
      employerCost: 650.95,
    },
  },
  {
    name: "ACOSTA MARIA PASTORA",
    form: { baseSalary: 486.25 },
    approvedOvertime: 0,
    hours: { overtimeHours50: 13 },
    expected: {
      grossIncome: 566.9399999999999,
      iessEmployee: 45.95,
      totalDeductions: 45.95,
      netPay: 520.9899999999999,
      employerCost: 647.9499999999999,
    },
  },
  {
    name: "SANDOVAL ACOSTA LUIS FERNANDO",
    form: { baseSalary: 487.21 },
    expected: {
      grossIncome: 567.98,
      iessEmployee: 46.04,
      totalDeductions: 46.04,
      netPay: 521.94,
      employerCost: 649.15,
    },
  },
  {
    name: "SORIA CHALA MISHELL FERNANDA",
    form: { baseSalary: 487.21 },
    deductions: { salaryAdvance: 200 },
    expected: {
      grossIncome: 567.98,
      iessEmployee: 46.04,
      totalDeductions: 246.04,
      netPay: 321.94000000000005,
      employerCost: 649.15,
    },
  },
];

/** The creation as `db.ts` writes it: the form's record, with the owner stamped on. */
function registered(entry: GoldenCase): PayrollEmployeeLine {
  const line: PayrollEmployeeLine = {
    ...toEmployeeLine({
      ...emptyEmployeeForm(),
      name: entry.name,
      idCard: "1002030405",
      role: "Camarera",
      area: "HOSPEDAJE",
      ...entry.form,
    }),
    id: "line-1",
    periodId: "period-1",
  };

  if (!entry.hours && !entry.deductions && entry.approvedOvertime === undefined) {
    return line;
  }
  // What the record does on typing some hours or a deduction: it starts from whatever capture exists,
  // or from an empty one, and writes the touched field over it (`patchCapture`).
  const capture = line.capture ?? emptyCapture();
  return {
    ...line,
    capture: {
      ...capture,
      ...entry.hours,
      ...(entry.approvedOvertime === undefined ? {} : { approvedOvertime: entry.approvedOvertime }),
      deductions: { ...capture.deductions, ...entry.deductions },
    },
  };
}

function compute(entry: GoldenCase) {
  return computeEmployeePayroll(toEngineInput(registered(entry)), DEFAULT_PAYROLL_PARAMETERS);
}

describe("los seis de MARZO 2026, dados de alta por el formulario", () => {
  for (const entry of GOLDEN) {
    it(`${entry.name} cuadra al centavo`, () => {
      const computed = compute(entry);
      expect({
        grossIncome: computed.grossIncome,
        iessEmployee: computed.iessEmployee,
        totalDeductions: computed.totalDeductions,
        netPay: computed.netPay,
        employerCost: computed.employerCost,
      }).toEqual(entry.expected);
    });
  }
});

describe("las derivaciones que el pie del modal promete que «se generan solas»", () => {
  const morales = GOLDEN[0];

  it("el sueldo unificado con 30 días es el sueldo base", () => {
    expect(compute(morales).unifiedSalary).toBe(487.21);
  });

  it("el décimo cuarto mensualizado es 40.17 en los seis: sale del SBU, no del sueldo", () => {
    for (const entry of GOLDEN) {
      expect(compute(entry).fourteenthMonthly).toBe(40.17);
    }
  });

  it("el décimo tercero mensualizado es el sueldo base entre doce", () => {
    // 487.21 / 12 = 40.6008… → ROUND → 40.60
    expect(compute(morales).thirteenthMonthly).toBe(40.6);
  });
});

describe("bajar los días trabajados a 15", () => {
  // The hourly rate comes out of the BASE salary (`D/30/8`), not the unified one: someone who worked
  // half a month is paid their overtime at the full rate (§4). It is the trap a manual creation could
  // give away, because it is the only place where someone types days other than 30.
  const base: GoldenCase = {
    name: "Media jornada",
    form: { baseSalary: 487.21 },
    approvedOvertime: null,
    hours: { overtimeHours50: 5.5 },
  };

  it("parte el sueldo unificado a la mitad", () => {
    expect(compute({ ...base, form: { ...base.form, days: 15 } }).unifiedSalary).toBe(243.61);
    expect(compute(base).unifiedSalary).toBe(487.21);
  });

  it("NO cambia el valor de la hora extra", () => {
    const full = compute(base).overtimePay50;
    expect(compute({ ...base, form: { ...base.form, days: 15 } }).overtimePay50).toBe(full);
    expect(full).toBe(16.75);
  });
});
